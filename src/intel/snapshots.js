import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from '../loop/git.js';

// Graph snapshots: one line per analysis in `.maverick/cache/graph/snapshots.jsonl`, so health is
// a trend, not a single number. A snapshot is taken whenever Maverick already builds the graph
// (graph, coupling, audit); a second one for the same commit and the same numbers is skipped.
// The cache is local and disposable: deleting it loses only the history.

const MAX_LINES = 2000;
export const snapshotsPath = cwd => join(cwd, '.maverick', 'cache', 'graph', 'snapshots.jsonl');

export async function readSnapshots(cwd) {
  const text = await readFile(snapshotsPath(cwd), 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

/** The numbers worth tracking from a graph (`buildGraph`) or a devtools report (`buildDevtools`). */
export function snapshotOf({ graph, report }) {
  if (report) return { kind: 'report', files: report.summary.files, sourceFiles: report.summary.sourceFiles, edges: report.summary.edges, cycles: report.graph.cycles.length, hubs: report.graph.hubs.length, violations: report.architecture.violations.length, health: report.health.score };
  const source = graph.nodes.filter(node => !node.test).length;
  return { kind: 'graph', files: graph.nodes.length, sourceFiles: source, edges: graph.edges.length, cycles: graph.cycles.length, hubs: graph.hubs.length, health: graph.health?.score ?? null };
}

const same = (a, b) => a && ['kind', 'head', 'dirty', 'files', 'edges', 'cycles', 'hubs', 'violations', 'health'].every(key => a[key] === b[key]);

/** Appends a snapshot for the current commit. Best effort: a failure never fails the command that took it. */
export async function recordSnapshot(cwd, source) {
  try {
    const head = await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']);
    const status = await git(cwd, ['status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude).maverick']);
    const entry = { at: new Date().toISOString(), head: head.ok ? head.stdout.trim().slice(0, 12) : null, dirty: status.ok ? Boolean(status.stdout.trim()) : null, ...snapshotOf(source) };
    const previous = await readSnapshots(cwd);
    if (same(previous.at(-1), entry)) return null;
    await mkdir(join(cwd, '.maverick', 'cache', 'graph'), { recursive: true });
    await appendFile(snapshotsPath(cwd), `${JSON.stringify(entry)}\n`);
    if (previous.length + 1 > MAX_LINES) await writeFile(snapshotsPath(cwd), `${[...previous, entry].slice(-MAX_LINES).map(item => JSON.stringify(item)).join('\n')}\n`);
    return entry;
  } catch { return null; }
}

/**
 * Health over time: the first and last snapshot of the window, the change, and the snapshots
 * where health moved, newest last. Snapshots of uncommitted trees are kept but marked.
 */
export function healthTrend(snapshots, { limit = 30 } = {}) {
  // Graph health leaves out boundary rules and a full report counts them: compare like with like.
  const kinds = snapshots.map(item => item.kind || 'graph'), kind = kinds.filter(item => item === 'report').length >= kinds.length / 2 ? 'report' : 'graph';
  const scored = snapshots.filter(item => typeof item.health === 'number' && (item.kind || 'graph') === kind);
  if (!scored.length) return { kind, points: 0, series: [], first: null, last: null, delta: null, cycles: null };
  const first = scored[0], last = scored.at(-1);
  const moves = scored.filter((item, index) => index === 0 || item.health !== scored[index - 1].health || item.cycles !== scored[index - 1].cycles);
  return {
    kind, points: scored.length, first, last, delta: last.health - first.health, cycles: last.cycles - first.cycles,
    worst: scored.reduce((low, item) => (item.health < low.health ? item : low), first),
    series: moves.slice(-limit).map(({ at, head, dirty, health, cycles, hubs, files }) => ({ at, head, dirty, health, cycles, hubs, files }))
  };
}

/** A one-line sparkline of health values, for terminals. */
export function sparkline(values) {
  if (!values.length) return '';
  const bars = '▁▂▃▄▅▆▇█', low = Math.min(...values), high = Math.max(...values);
  return values.map(value => bars[high === low ? 7 : Math.round(((value - low) / (high - low)) * 7)]).join('');
}
