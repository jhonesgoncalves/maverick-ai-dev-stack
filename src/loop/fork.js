import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, renderFrontmatter } from '../capabilities/model.js';
import { homePath } from '../core/home.js';
import { getTask } from '../core/tasks.js';
import { seedWorktree } from '../arena/arena.js';
import { loadGraph, refreshManifest } from '../subtasks/graph.js';
import { readState, runLoop } from './engine.js';
import { git, repoInfo } from './git.js';
import { readLedger } from './ledger.js';
import { loopIds, loopPaths, newestTaskLoop, newLoopId } from './model.js';

// Time travel with a fork: a new loop from a checkpoint of a recorded loop, with another provider
// (or model, or effort). It runs in a worktree of its own at the checkpoint's commit, on a copy of
// the task whose subtasks are as they were at that checkpoint, so the original loop, its task and
// your checkout are never touched. The fork's loop joins the task's loops as a record; its result
// stays on `refs/maverick/forks/<task>/<id>` for you to compare.

/** Which subtasks were done when iteration `n` was decided, from the ledger. */
export function doneAt(entries, n) {
  const done = new Set();
  for (const entry of entries) {
    if (entry.type === 'iteration-end' && entry.data?.n > n) break;
    if (entry.type === 'subtask-done') done.add(entry.data.id);
  }
  return done;
}

/** The checkpoint a fork starts from: iteration `n`'s, or the newest kept one before it. */
export function checkpointAt(state, entries, n) {
  if (n === 0) return { n: 0, commit: state.baseCommit, tree: state.baseTree, iteration: 0 };
  const kept = entries.filter(entry => entry.type === 'iteration-end' && entry.data?.n <= n && entry.data.checkpoint?.commit).at(-1);
  if (kept) return { ...kept.data.checkpoint, iteration: kept.data.n };
  return { n: 0, commit: state.baseCommit, tree: state.baseTree, iteration: 0 };
}

export async function forkLoop({ cwd, task, from, loop, options = {}, emit = () => {} }) {
  const { dir: taskDir } = await getTask(cwd, task);
  const loopId = typeof loop === 'string' && loop ? loop : await newestTaskLoop(taskDir);
  if (!loopId) throw new Error(`no loop has run for ${task}`);
  const state = await readState(taskDir, loopId);
  if (!state) throw new Error(`loop ${loopId} has no state`);
  const entries = await readLedger(loopPaths(taskDir, loopId).ledger);
  const n = Number(from);
  if (!Number.isInteger(n) || n < 0 || n > state.iterations.length) throw new Error(`--from must be an iteration of loop ${loopId}: 0 (its baseline) to ${state.iterations.length}`);
  const point = checkpointAt(state, entries, n);
  if (!point.commit || !(await git(cwd, ['cat-file', '-e', `${point.commit}^{commit}`])).ok) throw new Error(`the checkpoint of iteration ${point.iteration} is gone (cleaned and garbage-collected); fork from another iteration`);
  const info = await repoInfo(cwd), id = newLoopId();
  const location = homePath(cwd, 'forks', task, id);
  const added = await git(cwd, ['worktree', 'add', '-q', '--detach', location, point.commit]);
  if (!added.ok) throw new Error(`could not create the fork's worktree: ${added.stderr.trim()}`);
  const workCwd = join(location, info.prefix || ''), copy = await seedWorktree(cwd, workCwd, taskDir);
  // The subtasks as they were at the checkpoint: done if the ledger says so by then, else pending with no box ticked.
  const done = doneAt(entries, point.iteration);
  for (const item of (await loadGraph(copy)).items) {
    const path = join(copy, 'subtasks', item.file), { data, body } = parseFrontmatter(await readFile(path, 'utf8'));
    const finished = done.has(item.id);
    await writeFile(path, renderFrontmatter({ ...data, status: finished ? 'done' : 'pending' }, finished ? body : body.replace(/^(\s*[-*] )\[[xX]\]/gm, '$1[ ]')));
  }
  await refreshManifest(copy, task);
  await rm(join(copy, 'LOOP-NOTES.md'), { force: true });
  const record = { id, from: { loopId, iteration: point.iteration, checkpoint: point.commit }, provider: options.provider || null, model: options.model || null, effort: options.effort || null, location };
  emit({ type: 'fork-start', fork: record });
  let result, error = null;
  try { result = await runLoop({ cwd: workCwd, task, options: { ...options, new: true, fork: { id, from: record.from } }, emit }); } catch (failure) { error = failure; }
  const forkLoopId = result?.state.loopId || (await loopIds(copy))[0] || null;
  const forkState = forkLoopId ? await readState(copy, forkLoopId).catch(() => null) : null;
  if (forkState?.checkpoint?.commit) await git(cwd, ['update-ref', `refs/maverick/forks/${task}/${id}`, forkState.checkpoint.commit]);
  if (forkLoopId) await cp(join(copy, 'loops', forkLoopId), join(taskDir, 'loops', forkLoopId), { recursive: true }).catch(() => {});
  return { ...record, loopId: forkLoopId, outcome: forkState?.status || 'error', reason: forkState?.reason || error?.message || null, spent: forkState?.spent || null, ref: forkState?.checkpoint?.commit ? `refs/maverick/forks/${task}/${id}` : null, original: { outcome: state.status, spent: state.spent } };
}
