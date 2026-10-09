import { resolve as resolvePath } from 'node:path';
import { loadConfig } from '../core/config.js';
import { languageForPath } from '../core/imports.js';
import { analyzeArchitecture, depths, inferComponents, loopOf } from './architecture.js';
import { TEST_FILE } from './files.js';
import { buildGraph, createResolver, HEALTH_RULES, healthFor, impactOf } from './graph.js';
import { activity, changeCoupling, churnOf, ownership, readHistory } from './history.js';
import { analyzeIntegrations } from './integrations.js';
import { fileMetrics } from './metrics.js';
import { extractRoutes, routeInsights } from './routes.js';

// The Devtools report: one pass over the repository that feeds the Lens Devtools views,
// the `routes`, `coupling` and `audit` commands and the MCP tools. Files are read once;
// every finding carries the files that prove it.

const COMPLEX = 60, LARGE = 800, NESTED = 7;
const ENTRY_NAME = /(^|\/)(index|main|app|server|cli|manage|setup|conftest|__init__|__main__|wsgi|asgi|mod|lib|build|worker|handler|lambda|function|bootstrap|program|startup|config|settings|urls|routes?|router|middleware|instrumentation|global|env|types?|constants?|polyfills?|setupTests|vite-env)\.[^/]+$|\.(config|conf|setup|d)\.[^/]+$|(^|\/)(bin|scripts?|migrations?|seeds?|fixtures?|examples?|samples?|docs?|public|static|stories|storybook|\.storybook|e2e|cypress|playwright|tools?|benchmarks?)\//i;

function findingsFor(report) {
  const findings = [], add = (finding) => findings.push({ id: `${finding.category}-${findings.length}`, ...finding });
  const { graph, architecture: arch, routes, hotspots, cochange, integrations } = report;
  for (const cycle of graph.cycles) add({ category: 'cycles', severity: cycle.members.length > 5 ? 'high' : 'medium', title: `Import cycle of ${cycle.members.length} files`, detail: cycle.loop.join(' → '), files: cycle.members, action: 'Extract the shared part into a module both sides depend on, or invert one dependency behind an interface.' });
  for (const hub of graph.hubs.slice(0, 15)) { const node = report.fileIndex.get(hub); add({ category: 'coupling', severity: 'medium', title: `Hub file ${hub}`, detail: `fan-in ${node?.fanIn}, fan-out ${node?.fanOut}: widely used and depending on many others.`, files: [hub], action: 'Split responsibilities so dependents only import what they use.' }); }
  for (const cycle of arch.cycles) add({ category: 'architecture', severity: 'medium', title: `Components depend on each other: ${cycle.members.join(', ')}`, detail: cycle.loop.join(' → '), files: cycle.members, action: 'Pick a direction; move what the other side needs into a shared component.' });
  for (const violation of arch.violations.slice(0, 40)) add({ category: 'boundaries', severity: 'high', title: `Boundary violation: ${violation.rule}`, detail: `${violation.from} imports ${violation.to}${violation.reason ? ` — ${violation.reason}` : ''}`, files: [violation.from, violation.to], action: 'Depend on an abstraction owned by the inner layer instead.' });
  for (const link of arch.sdp.slice(0, 10)) add({ category: 'architecture', severity: 'low', title: `${link.from} depends on less stable ${link.to}`, detail: `Instability ${link.fromInstability} → ${link.toInstability} (${link.weight} imports). Stable components should not depend on volatile ones.`, files: link.examples.map(example => example.from), action: 'Invert the dependency or move the used part to a more stable component.' });
  for (const component of arch.components.filter(item => item.zone === 'pain' && item.ca >= 2).slice(0, 6)) add({ category: 'architecture', severity: 'low', title: `${component.id} is in the zone of pain`, detail: `Concrete (A ${component.abstractness}) and depended on by ${component.ca} components (I ${component.instability}): hard to change without ripples.`, files: [], component: component.id, action: 'Introduce interfaces at its boundary or reduce its dependents.' });
  for (const hotspot of hotspots.slice(0, 8)) if (hotspot.complexity >= 20) add({ category: 'hotspots', severity: hotspot.score > (hotspots[0]?.score || 0) / 2 ? 'high' : 'medium', title: `Hotspot ${hotspot.id}`, detail: `${hotspot.commits} commits, complexity ${hotspot.complexity}, ${hotspot.fanIn} dependents: where change, complexity and coupling meet.`, files: [hotspot.id], action: 'Prefer the strict workflow here, add tests before refactoring, split along the change axis.' });
  for (const pair of cochange.filter(item => item.hidden).slice(0, 10)) add({ category: 'change-coupling', severity: pair.degree >= 0.7 ? 'medium' : 'low', title: `Hidden coupling: ${pair.a} ⇄ ${pair.b}`, detail: `Changed together in ${pair.shared} commits (degree ${pair.degree}) with no import between them.`, files: [pair.a, pair.b], action: 'Make the dependency explicit or merge the duplicated knowledge.' });
  for (const node of report.files.filter(item => !item.test && item.complexity >= COMPLEX).sort((a, b) => b.complexity - a.complexity).slice(0, 12)) add({ category: 'complexity', severity: node.complexity >= COMPLEX * 2 ? 'medium' : 'low', title: `Complex file ${node.id}`, detail: `${node.complexity} decision points in ${node.loc} lines, nesting ${node.maxNesting}.`, files: [node.id], action: 'Extract functions around the deepest branches; cover them with tests first.' });
  for (const node of report.files.filter(item => !item.test && item.loc >= LARGE).sort((a, b) => b.loc - a.loc).slice(0, 8)) add({ category: 'size', severity: 'low', title: `Large file ${node.id}`, detail: `${node.loc} lines of code.`, files: [node.id], action: 'Split by responsibility.' });
  for (const node of report.files.filter(item => !item.test && item.maxNesting >= NESTED).sort((a, b) => b.maxNesting - a.maxNesting).slice(0, 6)) add({ category: 'complexity', severity: 'low', title: `Deep nesting in ${node.id}`, detail: `Indentation reaches ${node.maxNesting} levels.`, files: [node.id], action: 'Use early returns and extract nested blocks.' });
  for (const duplicate of routes.insights.duplicates) add({ category: 'routes', severity: 'high', title: `Route defined twice: ${duplicate.method} ${duplicate.path}`, detail: duplicate.locations.join(', '), files: duplicate.locations.map(location => location.replace(/:\d+$/, '')), action: 'Keep one definition; the other is shadowed or ambiguous.' });
  for (const route of routes.insights.contract.unimplemented.slice(0, 15)) add({ category: 'contract', severity: 'medium', title: `Documented but not found in code: ${route.method} ${route.path}`, detail: `Declared in ${route.file}:${route.line}.`, files: [route.file], action: 'Implement it or remove it from the contract.' });
  if (routes.insights.contract.undocumented.length) add({ category: 'contract', severity: 'low', title: `${routes.insights.contract.undocumented.length} route(s) missing from the API contract`, detail: routes.insights.contract.undocumented.slice(0, 8).map(route => `${route.method} ${route.path}`).join(', '), files: [...new Set(routes.insights.contract.undocumented.map(route => route.file))], action: 'Document them so clients and reviewers see the real surface.' });
  for (const route of routes.insights.unguardedWrites.slice(0, 10)) add({ category: 'security', severity: 'medium', title: `Write route without a route-level guard: ${route.method} ${route.path}`, detail: `${route.file}:${route.line}. No guard, authorize or security annotation was found on the handler or its controller, and no global guard was detected.`, files: [route.file], action: 'Confirm it is intentionally public, or add the framework guard.' });
  const undocumented = integrations.variables.filter(item => item.documented === false);
  if (undocumented.length) add({ category: 'configuration', severity: 'low', title: `${undocumented.length} environment variable(s) read but missing from ${integrations.exampleFiles.join(', ')}`, detail: undocumented.slice(0, 12).map(item => item.name).join(', '), files: [...new Set(undocumented.flatMap(item => item.files.map(entry => entry.file)))].slice(0, 20), action: 'Add them to the example file so a new developer can run the project.' });
  for (const node of report.unused.slice(0, 15)) add({ category: 'dead-code', severity: 'low', title: `Possibly unused: ${node}`, detail: 'No file imports it statically and it does not look like an entry point.', files: [node], action: 'Check for dynamic or framework-driven loading before deleting.' });
  for (const [component, owners] of Object.entries(report.ownership.groups)) if (owners.busFactor === 1 && owners.commits >= 15 && owners.authors > 1 && owners.ownerShare >= 0.8) add({ category: 'knowledge', severity: 'low', title: `Knowledge concentrated in ${component}`, detail: `${Math.round(owners.ownerShare * 100)}% of ${owners.commits} commits by one person.`, files: [], component, action: 'Pair on the next change here and document the non-obvious parts.' });
  const debtCount = report.files.reduce((sum, node) => sum + node.debt.length, 0);
  if (debtCount) add({ category: 'debt', severity: 'low', title: `${debtCount} TODO/FIXME/HACK marker(s)`, detail: Object.entries(report.files.flatMap(node => node.debt.map(item => item.tag)).reduce((acc, tag) => ({ ...acc, [tag]: (acc[tag] || 0) + 1 }), {})).map(([tag, value]) => `${tag} ${value}`).join(' · '), files: report.files.filter(node => node.debt.length).sort((a, b) => b.debt.length - a.debt.length).slice(0, 10).map(node => node.id), action: 'Turn the important ones into tasks; delete the stale ones.' });
  const rank = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Builds the full Devtools report for `cwd`. */
export async function buildDevtools(cwd, { since = '12 months ago' } = {}) {
  const root = resolvePath(cwd), started = Date.now();
  const config = await loadConfig(root).catch(() => ({}));
  const settings = config.architecture || {};
  const sources = new Map(), graph = await buildGraph(root, { sources });
  const resolve = await createResolver(root, graph.files);
  const [routes, commits] = await Promise.all([extractRoutes(root, { sources: new Map(sources), resolve }), readHistory(root, { since })]);
  // Per-file metrics.
  const churn = churnOf(commits);
  const staticOut = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) if (!edge.dynamic) staticOut.get(edge.from)?.push(edge.to);
  const depth = depths(graph.nodes.map(node => node.id), staticOut);
  for (const node of graph.nodes) Object.assign(node, fileMetrics(sources.get(node.id) || '', node.language), { depth: depth.get(node.id) || 0, commits: churn.get(node.id) || 0 });
  const prefixes = inferComponents(graph.nodes.filter(node => !node.test).map(node => node.id), { patterns: settings.components || [], depth: settings.depth, max: settings.maxComponents });
  const arch = analyzeArchitecture(graph.nodes, graph.edges, { prefixes, rules: settings.rules || [] });
  const history = ownership(commits, file => (graph.out.has(file) ? arch.componentOf(file) : null));
  for (const node of graph.nodes) { const owner = history.files.get(node.id); if (owner) node.owner = { name: owner.owner, share: owner.ownerShare, authors: owner.authors }; node.component = arch.componentOf(node.id); }
  // Health, now including boundary violations when rules are configured.
  const source = graph.nodes.filter(node => !node.test), inCycles = new Set(graph.cycles.flat());
  const health = healthFor(source.length, [
    { ...HEALTH_RULES.cycle, files: source.filter(node => inCycles.has(node.id)).map(node => node.id) },
    { ...HEALTH_RULES.hub, files: graph.hubs },
    { ...HEALTH_RULES.boundary, files: [...new Set(arch.violations.map(item => item.from))] }
  ]);
  // Hotspots: change frequency × dependents × size, with complexity shown alongside.
  const hotspots = source.filter(node => node.commits).map(node => ({ id: node.id, commits: node.commits, fanIn: node.fanIn, lines: node.lines, loc: node.loc, complexity: node.complexity, owner: node.owner?.name, score: Math.round(node.commits * (1 + node.fanIn) * Math.log10(10 + node.lines)) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 40);
  const known = new Set(graph.nodes.map(node => node.id)), linked = new Set(graph.edges.map(edge => `${edge.from}\0${edge.to}`));
  const cochange = changeCoupling(commits, { known }).map(pair => ({ ...pair, hidden: !TEST_FILE.test(pair.a) && !TEST_FILE.test(pair.b) && !linked.has(`${pair.a}\0${pair.b}`) && !linked.has(`${pair.b}\0${pair.a}`), components: [arch.componentOf(pair.a), arch.componentOf(pair.b)] }));
  const integrations = await analyzeIntegrations(root, { sources, languageOf: languageForPath, isTest: file => TEST_FILE.test(file) });
  // Entry points per file, and what each route reaches through imports.
  const routeFiles = new Set(routes.map(route => route.file));
  const usersOf = new Map();
  for (const integration of integrations.integrations) for (const file of integration.files) usersOf.set(file, [...(usersOf.get(file) || []), integration.id]);
  for (const service of integrations.services) for (const file of service.files) usersOf.set(file, [...(usersOf.get(file) || []), service.id]);
  const reachCache = new Map();
  const reaches = file => {
    if (reachCache.has(file)) return reachCache.get(file);
    const seen = new Set([file]), queue = [file], found = new Set();
    while (queue.length && seen.size < 400) { const current = queue.shift(); for (const id of usersOf.get(current) || []) found.add(id); for (const next of graph.out.get(current) || []) if (!seen.has(next)) { seen.add(next); queue.push(next); } }
    const result = { integrations: [...found], files: seen.size - 1 };
    reachCache.set(file, result); return result;
  };
  for (const route of routes) { if (graph.out.has(route.file)) { const reach = reaches(route.file); route.reaches = reach.integrations; route.reachFiles = reach.files; } route.component = graph.out.has(route.file) ? arch.componentOf(route.file) : null; }
  const unused = source.filter(node => node.fanIn === 0 && (graph.incoming.get(node.id) || []).length === 0 && /^(JavaScript|TypeScript|Python|Dart)$/.test(node.language) && !ENTRY_NAME.test(node.id) && !routeFiles.has(node.id) && !/\.d\.ts$/.test(node.id) && !/(^|\/)(models|views|admin|apps|serializers|tasks|signals|forms|commands|management|pages|app|routes)\//.test(node.id)).map(node => node.id).slice(0, 80);
  const fileIndex = new Map(graph.nodes.map(node => [node.id, node]));
  const cycles = graph.cycles.map(members => ({ members, loop: loopOf(members, staticOut) }));
  const routeCount = routes.reduce((map, route) => map.set(route.file, (map.get(route.file) || 0) + 1), new Map());
  const files = graph.nodes.map(node => ({ id: node.id, language: node.language, test: node.test, lines: node.lines, loc: node.loc, complexity: node.complexity, maxNesting: node.maxNesting, fanIn: node.fanIn, fanOut: node.fanOut, instability: node.instability, depth: node.depth, commits: node.commits, component: node.component, owner: node.owner, types: node.types, debt: node.debt, routes: routeCount.get(node.id) || 0, integrations: usersOf.get(node.id) || [] }));
  const report = {
    generatedAt: new Date().toISOString(), durationMs: 0, root,
    summary: {
      files: graph.nodes.length, sourceFiles: source.length, testFiles: graph.nodes.length - source.length, loc: source.reduce((sum, node) => sum + node.loc, 0), edges: graph.edges.length,
      languages: Object.fromEntries(Object.entries(graph.nodes.reduce((acc, node) => ({ ...acc, [node.language]: (acc[node.language] || 0) + (node.loc || 0) }), {})).sort((a, b) => b[1] - a[1])),
      components: arch.components.length, routes: routes.length, integrations: integrations.integrations.length, commits: commits.length, contributors: history.contributors.length, truncated: Boolean(graph.truncated)
    },
    health, files, fileIndex,
    edges: graph.edges.map(edge => [edge.from, edge.to, edge.dynamic ? 1 : 0]),
    graph: { cycles, hubs: graph.hubs },
    architecture: { components: arch.components, links: arch.links, cycles: arch.cycles, sdp: arch.sdp, dsm: arch.dsm, violations: arch.violations, rules: settings.rules || [], inferred: !settings.components?.length },
    routes: { items: routes, insights: routeInsights(routes) },
    hotspots, cochange, integrations,
    ownership: { groups: history.groups, contributors: history.contributors }, activity: activity(commits), unused, since
  };
  report.findings = findingsFor(report);
  report.durationMs = Date.now() - started;
  report.impact = file => impactOf(graph, file);
  return report;
}

/** JSON-safe view of the report (drops the helpers used while building it). */
export function serializeDevtools(report) {
  const copy = { ...report };
  delete copy.fileIndex; delete copy.impact;
  return copy;
}
