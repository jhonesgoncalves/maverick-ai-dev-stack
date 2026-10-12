import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homePath } from '../core/home.js';
import { pathReferences } from '../core/quality.js';
import { sectionBody } from '../core/util.js';
import { boundaryViolations, loopOf } from '../intel/architecture.js';
import { buildGraph, HEALTH_RULES, healthFor, withMetrics } from '../intel/graph.js';
import { git } from '../loop/git.js';
import { withExport } from './export.js';

// The architecture ratchet: a change may not make the structure worse. The import graph of the
// tree before the change and of the tree after it are compared, both built from exports so
// they see exactly the same kind of files: a new import cycle, a new import the boundary rules
// in configuration forbid, or a health drop beyond `architecture.maxHealthDrop` fails the
// check. Only what the change introduced counts; what was already there is reported, not blamed.

const CACHE_VERSION = 1;
export const ARCHITECTURE_DEFAULTS = { maxHealthDrop: 5 };

/**
 * The cache lives in Maverick's private directory, keyed by the repository: a tree never
 * changes, so neither does its graph, and an agent working in the repository cannot plant one.
 */
async function cacheDir(cwd) {
  const common = await git(cwd, ['rev-parse', '--git-common-dir']);
  return common.ok ? homePath(resolve(cwd, common.stdout.trim()), 'cache', 'graphs') : null;
}

/** The import graph of a tree, cached by tree id. */
export async function graphOfTree(cwd, tree) {
  const dir = await cacheDir(cwd), path = dir && join(dir, `${tree}.json`);
  let data = path ? await readFile(path, 'utf8').then(JSON.parse).catch(() => null) : null;
  if (data?.v !== CACHE_VERSION) {
    const graph = await withExport(cwd, tree, workdir => buildGraph(workdir), { prefix: 'maverick-graph-' });
    data = { v: CACHE_VERSION, nodes: graph.nodes.map(({ id, language, test, lines }) => ({ id, language, test, lines })), edges: graph.edges, truncated: Boolean(graph.truncated) };
    if (path) { await mkdir(dir, { recursive: true }); await writeFile(path, JSON.stringify(data)); }
  }
  return withMetrics(data.nodes.map(node => ({ ...node })), data.edges, { truncated: data.truncated });
}

/** Import edges a task declares on purpose: lines of TECHSPEC "Architecture" such as `` `src/a.ts` → `src/b.ts` ``. */
export function declaredEdges(techspec = '') {
  const edges = new Set();
  for (const line of sectionBody(techspec, 'Architecture').split('\n').filter(item => /→|->/.test(item))) {
    const paths = pathReferences(line, { includeNew: true });
    for (let index = 0; index + 1 < paths.length; index++) edges.add(`${paths[index]}\0${paths[index + 1]}`);
  }
  return edges;
}

const staticAdjacency = graph => { const out = new Map(graph.nodes.map(node => [node.id, []])); for (const edge of graph.edges) if (!edge.dynamic) out.get(edge.from)?.push(edge.to); return out; };

/**
 * What the change from `base` to `head` did to the structure (pure). Findings: new cycles and
 * boundary violations (block, or warn when TECHSPEC declares every edge involved), a health
 * drop beyond the limit (block), new hub files (warn).
 */
export function compareGraphs(base, head, { rules = [], maxHealthDrop = ARCHITECTURE_DEFAULTS.maxHealthDrop, declared = new Set() } = {}) {
  const findings = [], adjacency = staticAdjacency(head), plannedFiles = new Set();
  const isDeclared = (from, to) => declared.has(`${from}\0${to}`);
  for (const members of head.cycles.filter(cycle => !base.cycles.some(old => cycle.every(file => old.includes(file))))) {
    // Declared only when every import inside the cycle is: one declared loop must not excuse the rest of the component.
    const loop = loopOf(members, adjacency), inner = members.flatMap(from => (adjacency.get(from) || []).filter(to => members.includes(to)).map(to => [from, to]));
    const planned = inner.every(([from, to]) => isDeclared(from, to));
    if (planned) members.forEach(file => plannedFiles.add(file));
    findings.push({ severity: planned ? 'warn' : 'block', kind: 'new-cycle', files: members, message: `a new import cycle: ${loop.join(' → ')}${planned ? ' (declared in TECHSPEC Architecture)' : ''}`, key: `new-cycle:${members.join(',')}` });
  }
  const known = new Set(boundaryViolations(base.edges, rules).map(item => `${item.from}\0${item.to}`));
  for (const item of boundaryViolations(head.edges, rules).filter(entry => !known.has(`${entry.from}\0${entry.to}`))) {
    const planned = isDeclared(item.from, item.to);
    findings.push({ severity: planned ? 'warn' : 'block', kind: 'new-boundary-violation', files: [item.from, item.to], message: `${item.from} imports ${item.to}, which ${item.rule} forbids${item.reason ? ` (${item.reason})` : ''}${planned ? '; declared in TECHSPEC Architecture' : ''}`, key: `new-boundary-violation:${item.from}->${item.to}` });
  }
  // A cycle the task declared costs health, but that cost was decided by a human, so it does not count toward the limit.
  const source = head.nodes.filter(node => !node.test), inCycles = new Set(head.cycles.flat());
  const counted = plannedFiles.size ? healthFor(source.length, [{ ...HEALTH_RULES.cycle, files: source.filter(node => inCycles.has(node.id) && !plannedFiles.has(node.id)).map(node => node.id) }, { ...HEALTH_RULES.hub, files: head.hubs }]).score : head.health.score;
  const drop = base.health.score - counted;
  if (drop > maxHealthDrop) findings.push({ severity: 'block', kind: 'health-drop', files: [], message: `architecture health fell from ${base.health.score} to ${counted}${counted !== head.health.score ? ` (${head.health.score} counting the declared cycles)` : ''}: −${drop}, the limit is ${maxHealthDrop}`, key: 'health-drop' });
  for (const hub of head.hubs.filter(file => !base.hubs.includes(file))) findings.push({ severity: 'warn', kind: 'new-hub', files: [hub], message: `${hub} became a hub: widely imported and importing many files`, key: `new-hub:${hub}` });
  return { ok: !findings.some(item => item.severity === 'block'), findings, base: summary(base), head: summary(head), drop };
}

const summary = graph => ({ files: graph.nodes.filter(node => !node.test).length, edges: graph.edges.length, cycles: graph.cycles.length, hubs: graph.hubs.length, health: graph.health.score, truncated: Boolean(graph.truncated) });

/**
 * Compares the import graphs of two trees of the project, with the task's declared edges and
 * the configured rules. A graph that cannot be built is reported and does not block: the
 * ratchet is on the structure, and a broken analyzer must not hold a loop back forever.
 */
export async function checkArchitecture({ cwd, taskDir, config = {}, base, head }) {
  let before, after;
  try { [before, after] = [await graphOfTree(cwd, base), await graphOfTree(cwd, head)]; } catch (error) {
    const empty = { files: 0, edges: 0, cycles: 0, hubs: 0, health: null, truncated: false };
    return { ok: true, findings: [], base: empty, head: empty, drop: 0, note: `the import graph could not be built (${error.message}); the structure was not compared` };
  }
  const techspec = taskDir ? await readFile(join(taskDir, 'TECHSPEC.md'), 'utf8').catch(() => '') : '';
  const result = compareGraphs(before, after, { rules: config.architecture?.rules || [], maxHealthDrop: config.architecture?.maxHealthDrop ?? ARCHITECTURE_DEFAULTS.maxHealthDrop, declared: declaredEdges(techspec) });
  // Past the file limit the graph is partial, so its comparison is reported but never blocks.
  if (before.truncated || after.truncated) return { ...result, ok: true, findings: result.findings.map(item => ({ ...item, severity: 'warn' })), note: 'the project has more source files than the graph reads; findings are advisory' };
  return result;
}

/** ARCHITECTURE-CHECK.md: what the change did to the import structure. */
export function renderArchitectureReport(task, report, { against } = {}) {
  const icon = { block: '✗', warn: '⚠' };
  return `# Architecture check — ${task}

Generated: ${new Date().toISOString()}
Compared with: ${against || 'the base'}
Result: ${report.ok ? 'the structure did not get worse' : `${report.findings.filter(item => item.severity === 'block').length} blocking finding(s)`}

| | Before | After |
|---|---|---|
| Source files | ${report.base.files} | ${report.head.files} |
| Import cycles | ${report.base.cycles} | ${report.head.cycles} |
| Hub files | ${report.base.hubs} | ${report.head.hubs} |
| Health | ${report.base.health} | ${report.head.health} |

## Findings
${report.findings.map(item => `- ${icon[item.severity]} **${item.kind}**: ${item.message}`).join('\n') || '- None: no new cycle, no new boundary violation, no health drop beyond the limit.'}
${report.note ? `\nNote: ${report.note}\n` : ''}
A planned new dependency belongs in TECHSPEC.md under "## Architecture" (\`a\` → \`b\`, one per line): it is then reported, not blocked. Boundary rules live in \`architecture.rules\`; the health limit in \`architecture.maxHealthDrop\`.
`;
}
