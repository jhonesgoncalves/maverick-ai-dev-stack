import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedWorktree } from '../arena/arena.js';
import { parseFrontmatter, renderFrontmatter } from '../capabilities/model.js';
import { homePath } from '../core/home.js';
import { pathReferences } from '../core/quality.js';
import { getTask } from '../core/tasks.js';
import { pretty, sectionBody } from '../core/util.js';
import { evaluateGate } from '../flows/engine.js';
import { DECIDED_APART, findFlow } from '../flows/model.js';
import { buildGraph, impactOf } from '../intel/graph.js';
import { changeCoupling, readHistory } from '../intel/history.js';
import { sealedSettings, sealReadiness } from '../sealed/model.js';
import { querySeal } from '../sealed/seal.js';
import { detectStack } from '../core/stack.js';
import { harnessWrite, loadGraph, refreshManifest, withGraphLock } from '../subtasks/graph.js';
import { lockHolders, runLoop } from './engine.js';
import { commitTree, git, inPlace, repoInfo } from './git.js';
import { newLoopId } from './model.js';
import { allBlockingPass, compare, scoreOf } from './ratchet.js';

// The work graph: a task's subtasks built in parallel where the code allows it. For every pair
// of ready subtasks Maverick predicts a collision from three signals (files both declare, files
// one changes that the other's files import within two hops, files history says change together).
// Subtasks that may collide share a lane and run in series; the others run in parallel lanes, each
// a loop in its own worktree. The lanes meet in an integration worktree (the fan-in), where the
// branches merge and the whole oracle runs. A merge conflict or a regression there is a real
// collision: it is recorded next to the prediction, and its subtasks run again on the merged code.

export const WORKGRAPH_SCHEMA = 'maverick.workgraph/v1';
const HOPS = 2;

const declaredFiles = item => pathReferences(sectionBody(item.body, 'Files'), { includeNew: true });

/**
 * Predicted collisions between subtasks: `[{ a, b, reasons: [{ kind, files }] }]`. `graph` is
 * the import graph (optional), `coupling` the change-coupling pairs (optional).
 */
export function predictCollisions(items, { graph = null, coupling = [] } = {}) {
  const files = new Map(items.map(item => [item.id, new Set(declaredFiles(item))]));
  // What a subtask may affect: its files and, through the import graph, what imports them within two hops.
  const reach = new Map(items.map(item => [item.id, new Set([...files.get(item.id)].flatMap(file => (graph?.out?.has(file) ? impactOf(graph, file, HOPS).dependents.map(entry => entry.id) : [])))]));
  const coupled = new Map();
  for (const pair of coupling) { coupled.set(`${pair.a}\0${pair.b}`, pair); coupled.set(`${pair.b}\0${pair.a}`, pair); }
  const collisions = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i].id, b = items[j].id, reasons = [];
    const shared = [...files.get(a)].filter(file => files.get(b).has(file));
    if (shared.length) reasons.push({ kind: 'files', files: shared });
    const impact = [...[...files.get(a)].filter(file => reach.get(b).has(file)), ...[...files.get(b)].filter(file => reach.get(a).has(file))];
    if (impact.length) reasons.push({ kind: 'impact', files: [...new Set(impact)] });
    const history = [...files.get(a)].flatMap(x => [...files.get(b)].filter(y => coupled.has(`${x}\0${y}`)).map(y => `${x} ↔ ${y}`));
    if (history.length) reasons.push({ kind: 'coupling', files: history });
    if (reasons.length) collisions.push({ a, b, reasons });
  }
  return collisions;
}

/** Lanes: subtasks that may collide end up together (in id order), at most `maxLanes` lanes. */
export function planLanes(items, collisions, { maxLanes = 4 } = {}) {
  const parent = new Map(items.map(item => [item.id, item.id]));
  const find = id => (parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id)));
  for (const { a, b } of collisions) parent.set(find(a), find(b));
  const groups = new Map();
  for (const item of items) { const root = find(item.id); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(item.id); }
  let lanes = [...groups.values()].map(ids => ids.sort()).sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]));
  // Too many lanes: the smallest join the shortest, which keeps the serial work balanced.
  while (lanes.length > Math.max(1, maxLanes)) {
    const smallest = lanes.pop(), shortest = lanes.reduce((min, lane) => (lane.length < min.length ? lane : min), lanes[0]);
    shortest.push(...smallest); shortest.sort();
  }
  return lanes.map((subtasks, index) => ({ id: `l${index + 1}`, subtasks }));
}

/** What `loop graph --plan` shows: the ready subtasks, their predicted collisions and the lanes. */
export async function planWorkGraph(cwd, task, { maxLanes = 4 } = {}) {
  const { dir: taskDir } = await getTask(cwd, task);
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  const ready = graph.items.filter(item => item.status !== 'done' && item.dependsOn.every(dep => graph.items.find(entry => entry.id === dep)?.status === 'done'));
  const signals = await codeSignals(cwd);
  const collisions = predictCollisions(ready, signals);
  return { task, ready: ready.map(item => ({ id: item.id, title: item.title, files: declaredFiles(item) })), waiting: graph.items.filter(item => item.status !== 'done' && !ready.includes(item)).map(item => item.id), collisions, lanes: planLanes(ready, collisions, { maxLanes }), signals: { graph: Boolean(signals.graph), coupling: signals.coupling.length } };
}

async function codeSignals(cwd) {
  const info = await repoInfo(cwd), prefix = info.prefix ? `${info.prefix}/` : '';
  const graph = await buildGraph(cwd).catch(() => null);
  // History paths are relative to the repository root; the graph's to the project.
  const commits = (await readHistory(cwd)).map(commit => ({ ...commit, files: commit.files.filter(file => file.startsWith(prefix)).map(file => file.slice(prefix.length)) }));
  return { graph, coupling: changeCoupling(commits, { minShared: 2, minDegree: 0.5 }) };
}

/** Subtasks whose work did not merge go back to pending, boxes unticked: they run again on the merged code. */
async function reopen(taskDir, task, ids) {
  const graph = await loadGraph(taskDir);
  for (const item of graph.items.filter(entry => ids.includes(entry.id))) {
    const path = join(taskDir, 'subtasks', item.file), { data, body } = parseFrontmatter(await readFile(path, 'utf8'));
    await withGraphLock(taskDir, () => harnessWrite(taskDir, path, renderFrontmatter({ ...data, status: 'pending' }, body.replace(/^(\s*[-*] )\[[xX]\]/gm, '$1[ ]'))));
  }
  if (ids.length) await refreshManifest(taskDir, task);
}

/**
 * Runs the work graph of a task to the end or to a human: waves of parallel lanes, each wave
 * merged and checked at the fan-in. The merged work is left on its own branch.
 */
export async function runWorkGraph({ cwd, task, options = {}, emit = () => {} }) {
  const { dir: taskDir, config } = await getTask(cwd, task);
  if ((await lockHolders(taskDir)).length) throw new Error(`a loop is running for ${task}; stop it first`);
  const info = await repoInfo(cwd);
  if (!info.repo || !info.head) throw new Error('the work graph needs a git repository with a commit');
  const flow = await findFlow(cwd, typeof options.flow === 'string' ? options.flow : config.loop?.flow || 'loop');
  const oracle = flow.gates.filter(gate => !DECIDED_APART.includes(gate.type));
  const maxLanes = Number(options.maxLanes) > 0 ? Math.floor(Number(options.maxLanes)) : 4;
  const id = newLoopId(), started = Date.now(), stack = await detectStack(cwd);
  // The integration worktree starts from a snapshot of your working copy and collects every lane.
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-graph-'));
  let base;
  try {
    const tree = await inPlace({ cwd, task, indexFile: join(scratch, 'index'), inflight: scratch }).snapshot();
    base = { tree, commit: await commitTree(cwd, tree, info.head, `maverick graph ${task} ${id}: base\n`) };
  } finally { await rm(scratch, { recursive: true, force: true }); }
  const branch = `maverick/graph/${task}-${id}`, location = homePath(cwd, 'graphs', task, id);
  const added = await git(cwd, ['worktree', 'add', '-q', '-b', branch, location, base.commit]);
  if (!added.ok) throw new Error(`could not create the integration worktree: ${added.stderr.trim()}`);
  const integration = join(location, info.prefix || '');
  const record = { schema: WORKGRAPH_SCHEMA, id, task, branch, worktree: location, base, startedAt: new Date(started).toISOString(), endedAt: null, outcome: 'running', reason: null, waves: [], metrics: null };
  const recordPath = join(taskDir, 'graphs', `${id}.json`);
  await mkdir(join(taskDir, 'graphs'), { recursive: true });
  const save = () => writeFile(recordPath, pretty(record));
  await save();
  const signals = await codeSignals(cwd);
  const budget = Object.fromEntries(['maxIterations', 'maxMinutes', 'maxCost', 'maxTokens', 'provider', 'model', 'effort', 'feedback', 'judge'].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
  let previous = null;

  /** The whole oracle on the integration worktree, with the task as it is now. */
  const measure = async () => {
    const copy = await seedWorktree(cwd, integration, taskDir);
    const invoke = async argv => (await import('../cli.js')).main(argv, integration);
    const context = { cwd: integration, task, taskDir: copy, invoke, flow: flow.name, against: base.commit, timeoutMs: (config.loop?.gateTimeoutMinutes || 20) * 60000 };
    const results = [];
    for (const gate of oracle) results.push(await evaluateGate(context, gate, {}, results));
    return scoreOf({ results, graph: await loadGraph(taskDir) });
  };
  const end = async (outcome, reason) => {
    record.outcome = outcome; record.reason = reason; record.endedAt = new Date().toISOString();
    const lanes = record.waves.flatMap(wave => wave.lanes);
    const sequential = lanes.reduce((sum, lane) => sum + (lane.durationMs || 0), 0), wall = Date.now() - started;
    record.metrics = {
      wallMs: wall, sequentialMs: sequential, speedup: wall ? Number((sequential / wall).toFixed(2)) : null,
      lanes: lanes.length, predicted: record.waves.reduce((sum, wave) => sum + wave.predicted.length, 0), real: record.waves.reduce((sum, wave) => sum + wave.real.length, 0),
      missed: record.waves.reduce((sum, wave) => sum + wave.real.filter(item => !item.predicted).length, 0)
    };
    await save();
    emit({ type: 'graph-end', record });
    return record;
  };

  for (let wave = 1; ; wave++) {
    const graph = await loadGraph(taskDir);
    if (graph.problems.length) return end('needs-human', `the subtask graph has problems: ${graph.problems.join('; ')}`);
    const open = graph.items.filter(item => item.status !== 'done');
    if (!open.length) break;
    const ready = open.filter(item => item.dependsOn.every(dep => graph.items.find(entry => entry.id === dep)?.status === 'done'));
    if (!ready.length) return end('needs-human', `the remaining subtasks are blocked: ${open.map(item => item.id).join(', ')}`);
    if (wave > graph.items.length * 2) return end('needs-human', 'the same subtasks kept colliding at the fan-in; run them with maverick loop run');
    const predicted = predictCollisions(ready, signals), lanes = planLanes(ready, predicted, { maxLanes });
    const head = (await git(integration, ['rev-parse', 'HEAD'])).stdout.trim();
    const entry = { n: wave, head, predicted, lanes: lanes.map(lane => ({ ...lane, name: `${id.slice(-4)}-w${wave}-${lane.id}` })), real: [], score: null };
    record.waves.push(entry);
    await save();
    emit({ type: 'wave-start', wave: entry });
    // The lanes of a wave run at once, each a loop in its own worktree from the integration head.
    await Promise.all(entry.lanes.map(async lane => {
      const startedAt = Date.now();
      try {
        const result = await runLoop({ cwd, task, options: { ...budget, lane: lane.name, only: lane.subtasks, startPoint: head, new: true }, emit: event => emit({ ...event, lane: lane.name }) });
        Object.assign(lane, { loopId: result.state.loopId, outcome: result.outcome, reason: result.reason, branch: result.state.worktree?.branch, worktree: result.state.worktree?.path });
      } catch (error) { Object.assign(lane, { outcome: 'error', reason: error.message }); }
      lane.durationMs = Date.now() - startedAt;
    }));
    await save();
    const failed = entry.lanes.filter(lane => lane.outcome !== 'done');
    if (failed.length) return end('needs-human', `lane ${failed.map(lane => `${lane.name} (${lane.outcome}${lane.reason ? `: ${lane.reason}` : ''})`).join(', ')} did not finish; read its LOOP-<lane>.md, then run the work graph again`);
    // The fan-in: each lane's branch merges into the integration branch; a conflict is a real collision.
    const merged = [];
    for (const lane of entry.lanes) {
      const result = await git(integration, ['-c', 'user.name=Maverick Graph', '-c', 'user.email=graph@maverick.invalid', 'merge', '--no-ff', '--no-edit', '-m', `maverick graph ${task}: lane ${lane.name} (${lane.subtasks.join(', ')})`, lane.branch]);
      if (result.ok) { merged.push(lane); lane.merged = true; continue; }
      const files = (await git(integration, ['diff', '--name-only', '--diff-filter=U'])).stdout.split('\n').filter(Boolean);
      await git(integration, ['merge', '--abort']);
      const against = merged.filter(other => other.subtasks.some(a => lane.subtasks.some(b => predicted.some(pair => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a)))));
      entry.real.push({ kind: 'merge-conflict', lane: lane.name, subtasks: lane.subtasks, with: merged.map(other => other.name), files, predicted: against.length > 0 });
      lane.merged = false;
      await reopen(taskDir, task, lane.subtasks);
    }
    const score = await measure();
    entry.score = { passed: score.passed, blocking: score.blocking, failingCount: score.failingCount };
    // A regression at the fan-in is a collision the merge could not see: the lanes broke each other.
    const comparison = previous ? compare(previous, score) : { regressions: [] };
    if (comparison.regressions.length) {
      entry.real.push({ kind: 'regression', lanes: merged.map(lane => lane.name), detail: comparison.regressions.map(item => item.detail), predicted: false });
      await save();
      return end('needs-human', `the merged lanes broke the oracle at the fan-in (${comparison.regressions.map(item => item.detail).join('; ')}); the merged work is on ${branch}`);
    }
    previous = score;
    // Merged lanes leave no worktree or branch behind: the merge commit and their checkpoint refs keep the history.
    for (const lane of entry.lanes.filter(item => item.merged && item.worktree)) { await git(cwd, ['worktree', 'remove', '--force', lane.worktree]); await git(cwd, ['branch', '-D', '-q', lane.branch]); }
    await save();
    emit({ type: 'wave-end', wave: entry });
  }
  if (!allBlockingPass(previous || await measure())) return end('needs-human', `every subtask is done, but blocking gates fail on the merged work (${branch})`);
  // The holdout decides the whole change once, on the merged tree, never inside a lane.
  const readiness = await sealReadiness(taskDir, sealedSettings(config)).catch(() => ({ state: 'missing' }));
  if (readiness.state === 'ready') {
    const tree = (await git(integration, ['rev-parse', 'HEAD^{tree}'])).stdout.trim();
    const metrics = await querySeal({ cwd, task, taskDir, config, stack, tree, scope: `graph ${id}` }).then(result => result.metrics).catch(error => ({ error: error.message }));
    record.holdout = metrics.error ? { error: metrics.error } : { passed: metrics.passed, total: metrics.total };
    if (metrics.error) return end('needs-human', `the sealed tests could not run: ${metrics.error}`);
    if (metrics.total && metrics.S < sealedSettings(config).threshold) return end('holdout-gap', 'every visible check passes on the merged work, the sealed tests do not reach their threshold');
  }
  return end('done', `every subtask is done and every blocking gate passes on the merged work, in ${record.waves.length} wave(s); merge ${branch} to keep it`);
}

/** Every work-graph run of a task, newest first. */
export async function listWorkGraphs(taskDir) {
  const names = (await readdir(join(taskDir, 'graphs')).catch(() => [])).filter(name => name.endsWith('.json')).sort().reverse();
  const records = [];
  for (const name of names) { const record = await readFile(join(taskDir, 'graphs', name), 'utf8').then(JSON.parse).catch(() => null); if (record) records.push(record); }
  return records;
}
