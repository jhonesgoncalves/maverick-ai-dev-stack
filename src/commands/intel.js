import { buildGraph, directoryGraph, toMermaid } from '../intel/graph.js';
import { churn, rankHotspots } from '../intel/hotspots.js';
import { brand, output } from '../core/util.js';
import { buildDevtools } from '../intel/devtools.js';

const since = options => (typeof options.since === 'string' ? options.since : '6 months ago');

async function graphCommand(cwd, options = {}) {
  const graph = await buildGraph(cwd);
  const depth = Number(options.depth) || 2;
  if (options.format === 'mermaid') return output(toMermaid(graph, depth));
  if (options.format === 'dot') return output(`digraph maverick {\n  rankdir=LR;\n${directoryGraph(graph, depth).map(link => `  "${link.from}" -> "${link.to}" [label=${link.weight}];`).join('\n')}\n}`);
  const production = graph.nodes.filter(node => !node.test);
  const languages = Object.entries(graph.nodes.reduce((counts, node) => ({ ...counts, [node.language]: (counts[node.language] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const topFanIn = [...production].sort((a, b) => b.fanIn - a.fanIn).slice(0, 8).filter(node => node.fanIn);
  const unstableHubs = production.filter(node => node.fanIn >= 3 && node.instability >= 0.7).sort((a, b) => b.fanIn - a.fanIn).slice(0, 8);
  const summary = { files: graph.nodes.length, tests: graph.nodes.length - production.length, edges: graph.edges.length, dynamicEdges: graph.edges.filter(edge => edge.dynamic).length, languages: Object.fromEntries(languages), health: graph.health, cycles: graph.cycles, hubs: graph.hubs, topFanIn: topFanIn.map(({ id, fanIn, fanOut }) => ({ id, fanIn, fanOut })), unstableDependencies: unstableHubs.map(({ id, fanIn, fanOut, instability }) => ({ id, fanIn, fanOut, instability })), truncated: graph.truncated };
  if (options.json) return output(JSON.stringify(summary, null, 2));
  const lines = [`${brand()} / GRAPH`, '', `Files: ${summary.files} (${summary.tests} test) · local import edges: ${summary.edges}${summary.dynamicEdges ? ` (${summary.dynamicEdges} lazy)` : ''}`, `Languages: ${languages.map(([name, count]) => `${name} ${count}`).join(', ') || 'none detected'}`, `Health: ${graph.health.score}/100 = ${graph.health.formula}`];
  lines.push('', `Import cycles: ${graph.cycles.length}`, ...graph.cycles.slice(0, 5).map(cycle => `  ${cycle.join(' ⇄ ')}`));
  if (graph.hubs.length) lines.push('', 'Hubs (high fan-in and fan-out):', ...graph.hubs.slice(0, 8).map(id => `  ${id}`));
  if (topFanIn.length) lines.push('', 'Most depended on:', ...topFanIn.map(node => `  ${String(node.fanIn).padStart(3)} ← ${node.id}`));
  if (unstableHubs.length) lines.push('', 'Widely used but unstable (depends on many others):', ...unstableHubs.map(node => `  ${node.id} (fan-in ${node.fanIn}, instability ${node.instability})`));
  if (graph.truncated) lines.push('', 'Note: the scan stopped at 5,000 files.');
  lines.push('', 'Diagram: maverick graph --format mermaid');
  output(lines.join('\n'));
}

async function hotspotsCommand(cwd, options = {}) {
  const [graph, counts] = await Promise.all([buildGraph(cwd), churn(cwd, since(options))]);
  const hotspots = rankHotspots(graph, counts, Number(options.limit) || 15);
  if (options.json) return output(JSON.stringify({ since: since(options), hotspots }, null, 2));
  if (!counts.size) return output('No git history found; hotspots need a Git repository with commits.');
  output(`${brand()} / HOTSPOTS (since ${since(options)})\n\nscore  commits  fan-in  file\n${hotspots.map(item => `${String(item.score).padStart(5)}  ${String(item.commits).padStart(7)}  ${String(item.fanIn).padStart(6)}  ${item.id}`).join('\n') || 'No source files changed in this period.'}\n\nScore = commits × (1 + fan-in) × log10(10 + lines). Prefer the strict workflow (maverick new --strict) for changes here.`);
}

const pad = (value, size) => String(value ?? '—').padEnd(size);
const lpad = (value, size) => String(value ?? '—').padStart(size);

async function routesCommand(cwd, options = {}) {
  const report = await buildDevtools(cwd);
  const q = typeof options.grep === 'string' ? options.grep.toLowerCase() : '';
  const routes = report.routes.items.filter(route => (!options.kind || route.kind === options.kind) && (!options.method || route.method === String(options.method).toUpperCase()) && (!q || `${route.method} ${route.path} ${route.handler || ''} ${route.file}`.toLowerCase().includes(q)));
  if (options.json) return output(JSON.stringify({ total: routes.length, insights: report.routes.insights, routes: routes.map(({ kind, method, path, framework, source, handler, file, line, guards, version, reaches }) => ({ kind, method, path, framework, source, handler, file, line, guards, version, reaches })) }, null, 2));
  const ins = report.routes.insights;
  const lines = [`${brand()} / ROUTES`, '', `${routes.length} entry point(s) · ${Object.entries(ins.byKind).map(([kind, count]) => `${count} ${kind}`).join(' · ') || 'none found'}`, `Frameworks: ${Object.entries(ins.byFramework).map(([name, count]) => `${name} ${count}`).join(', ') || '—'}`, ''];
  for (const route of routes.slice(0, Number(options.limit) || 400)) lines.push(`${pad(route.method, 9)} ${pad(route.path, 44)} ${route.guards?.length ? '🔒 ' : ''}${route.file}:${route.line}${route.handler ? `  ${route.handler}` : ''}`);
  if (ins.duplicates.length) lines.push('', 'Defined twice:', ...ins.duplicates.map(item => `  ${item.method} ${item.path} — ${item.locations.join(', ')}`));
  if (ins.contract.documented) lines.push('', `Contract: ${ins.contract.documented} documented · ${ins.contract.unimplemented.length} not found in code · ${ins.contract.undocumented.length} missing from the contract`);
  if (ins.unguardedWrites.length) lines.push('', `Writes without a route-level guard: ${ins.unguardedWrites.length} (verify they are meant to be public)`);
  lines.push('', 'Filter with --kind http|page|event|job|graphql|rpc, --method POST or --grep users. Explore them in: maverick lens');
  output(lines.join('\n'));
}

async function couplingCommand(cwd, options = {}) {
  const report = await buildDevtools(cwd), arch = report.architecture;
  if (options.json) return output(JSON.stringify({ health: report.health, components: arch.components, links: arch.links, cycles: arch.cycles, sdp: arch.sdp, violations: arch.violations, dsm: arch.dsm }, null, 2));
  const lines = [`${brand()} / COUPLING`, '', `Components: ${arch.components.length}${arch.inferred ? ' (inferred from the folder layout; set architecture.components to choose them)' : ''}`, '', `${pad('component', 38)} ${lpad('files', 5)} ${lpad('Ca', 4)} ${lpad('Ce', 4)} ${lpad('I', 5)} ${lpad('A', 5)} ${lpad('D', 5)}  zone`];
  for (const c of arch.components) lines.push(`${pad(c.id.length > 38 ? `…${c.id.slice(-37)}` : c.id, 38)} ${lpad(c.files, 5)} ${lpad(c.ca, 4)} ${lpad(c.ce, 4)} ${lpad(c.instability, 5)} ${lpad(c.abstractness, 5)} ${lpad(c.distance, 5)}  ${c.zone ? `zone of ${c.zone}` : ''}`);
  lines.push('', 'I = Ce / (Ca + Ce) · A = abstract types / types · D = |A + I − 1| (0 is on the main sequence)');
  if (arch.cycles.length) lines.push('', 'Component cycles:', ...arch.cycles.map(cycle => `  ${cycle.loop.join(' → ')}`));
  if (arch.sdp.length) lines.push('', 'Depends on a less stable component (Stable Dependencies Principle):', ...arch.sdp.slice(0, 10).map(link => `  ${link.from} → ${link.to} (I ${link.fromInstability} → ${link.toInstability}, ${link.weight} imports)`));
  if (arch.rules.length) lines.push('', `Boundary rules: ${arch.rules.length} · violations: ${arch.violations.length}`, ...arch.violations.slice(0, 15).map(item => `  ${item.from} → ${item.to} (${item.rule})`));
  lines.push('', `Health: ${report.health.score}/100 = ${report.health.formula}`, ...report.health.deductions.map(item => `  −${item.points} ${item.rule}: ${item.detail}`));
  output(lines.join('\n'));
}

async function auditCommand(cwd, options = {}) {
  const report = await buildDevtools(cwd);
  const rank = { high: 0, medium: 1, low: 2 }, floor = rank[options.severity] ?? 2;
  const findings = report.findings.filter(item => rank[item.severity] <= floor && (!options.category || item.category === options.category));
  if (options.json) return output(JSON.stringify({ health: report.health, findings }, null, 2));
  const lines = [`${brand()} / AUDIT`, '', `Health ${report.health.score}/100 · ${findings.length} finding(s) · ${['high', 'medium', 'low'].map(level => `${findings.filter(item => item.severity === level).length} ${level}`).join(' · ')}`, ''];
  for (const item of findings) lines.push(`[${item.severity.toUpperCase()}] ${item.title}`, `  ${item.detail}`, ...(item.action ? [`  → ${item.action}`] : []), '');
  lines.push('Turn one into a task from the Lens Findings view, or: maverick new "<fix the finding>" --strict');
  output(lines.join('\n'));
  if (options.failOn && findings.some(item => rank[item.severity] <= (rank[options.failOn] ?? -1))) process.exitCode = 1;
}

async function mcpCommand(cwd) {
  const { serveMcp } = await import('../mcp/server.js');
  process.stderr.write(`maverick mcp: serving read-only project intelligence for ${cwd} over stdio\n`);
  await serveMcp({ cwd });
}

export const intelCommands = [
  { id: 'mcp', description: 'Serve read-only project intelligence to AI agents over MCP (stdio).', aliases: [], usage: 'mcp', run: ({ cwd }) => mcpCommand(cwd) },
  { id: 'graph', description: 'Analyze the import graph: cycles, hubs, coupling, and health.', aliases: [], usage: 'graph [--json] [--format mermaid|dot]', run: ({ cwd, options }) => graphCommand(cwd, options) },
  { id: 'hotspots', description: 'Rank files by change frequency and dependents.', aliases: [], usage: 'hotspots [--since "6 months ago"]', run: ({ cwd, options }) => hotspotsCommand(cwd, options) },
  { id: 'routes', description: 'List entry points in any stack: HTTP routes, pages, GraphQL, gRPC, events and jobs.', aliases: ['endpoints'], usage: 'routes [--kind http] [--method GET] [--grep users] [--json]', run: ({ cwd, options }) => routesCommand(cwd, options) },
  { id: 'coupling', description: 'Component coupling: Ca, Ce, instability, abstractness, distance, cycles and boundary rules.', aliases: ['architecture'], usage: 'coupling [--json]', run: ({ cwd, options }) => couplingCommand(cwd, options) },
  { id: 'audit', description: 'Architecture findings with evidence: cycles, hubs, hotspots, hidden coupling, route and contract issues.', aliases: ['findings'], usage: 'audit [--severity medium] [--fail-on high] [--json]', run: ({ cwd, options }) => auditCommand(cwd, options) }
];
