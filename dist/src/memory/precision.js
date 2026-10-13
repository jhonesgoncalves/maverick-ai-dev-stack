import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { listTasks, taskMeta, writeTaskMeta } from '../core/tasks.js';
import { readLedger } from '../loop/ledger.js';
import { loopIds, loopPaths } from '../loop/model.js';
import { listArenas } from '../arena/arena.js';

// Grounding precision: how good were the files `maverick new` suggested? What grounding pointed
// at when the task was created is kept in the task's TASK.json; what the task really changed comes from
// its loops (the files of every accepted iteration). Precision says how much of the suggestion was
// used, recall how much of the change was suggested. Tasks built without a loop are not measured.

/** Keeps what grounding suggested for a task in its TASK.json, the first time only: later runs see the task's own files. */
export async function recordGrounding(taskDir, ground) {
  const meta = await taskMeta(taskDir);
  if (meta.grounding) return false;
  await writeTaskMeta(taskDir, { ...meta, grounding: { at: new Date().toISOString(), relevant: (ground.relevant || []).map(item => item.path), tests: ground.tests || [] } });
  return true;
}

/** Files a task's loops changed and kept: its own loops, its lanes, and the arena winners. */
export async function changedByLoops(taskDir) {
  const winners = new Set();
  for (const record of await listArenas(taskDir)) if (record.decision) { const winner = record.competitors.find(item => item.id === record.decision.winner); if (winner?.loopId) winners.add(winner.loopId); }
  const files = new Set();
  for (const id of await loopIds(taskDir)) {
    const state = await readFile(loopPaths(taskDir, id).state, 'utf8').then(JSON.parse).catch(() => null);
    if (!state || state.fork || (state.arena && !winners.has(id))) continue;
    for (const entry of await readLedger(loopPaths(taskDir, id).ledger).catch(() => [])) if (entry.type === 'iteration-end' && entry.data?.decision === 'accepted') for (const path of entry.data.paths || []) files.add(path);
  }
  return files;
}

const ratio = (hits, total) => (total ? Number((hits / total).toFixed(3)) : null);

/** Precision and recall of one task's grounding, or why it cannot be measured. */
export async function groundingPrecision(taskDir) {
  const suggestion = (await taskMeta(taskDir)).grounding;
  if (!suggestion) return { measured: false, reason: 'no grounding was recorded when the task was created' };
  const changed = await changedByLoops(taskDir);
  if (!changed.size) return { measured: false, reason: 'no loop kept a change yet', suggested: suggestion.relevant.length };
  // Tests count when grounding named them: they were suggested too.
  const suggested = new Set([...suggestion.relevant, ...suggestion.tests]);
  const hits = [...suggested].filter(path => changed.has(path));
  return { measured: true, suggested: suggested.size, changed: changed.size, hits: hits.length, precision: ratio(hits.length, suggested.size), recall: ratio(hits.length, changed.size), unused: [...suggested].filter(path => !changed.has(path)), missed: [...changed].filter(path => !suggested.has(path)) };
}

/** Every task's precision and the totals over measured tasks (micro averages). */
export async function groundingReport(cwd) {
  const config = await loadConfig(cwd), tasks = [];
  for (const { task } of await listTasks(cwd, config)) tasks.push({ task, ...await groundingPrecision(join(cwd, config.taskRoot, task)) });
  const measured = tasks.filter(item => item.measured), sum = key => measured.reduce((total, item) => total + item[key], 0);
  return { tasks, measured: measured.length, precision: ratio(sum('hits'), sum('suggested')), recall: ratio(sum('hits'), sum('changed')) };
}

