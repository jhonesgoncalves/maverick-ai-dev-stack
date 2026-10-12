import { join, sep } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { loadConfig } from '../core/config.js';
import { getTask, listTasks } from '../core/tasks.js';
import { lockHolder, loopStatus, readState, requestStop, verifyLoop } from '../loop/engine.js';
import { LOOP_ID, loopIds } from '../loop/model.js';

// Lens reads loops from their state files, like the CLI, so a loop started in a terminal shows
// up live here and the Stop button works on it: stopping writes the same request file
// `maverick loop stop` writes, which the running loop polls. Lens never runs a loop itself.

const MAX_LOOPS = 100, MAX_ITERATIONS = 200;
const TASK = /^[a-z0-9][a-z0-9-]{1,80}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

function summary(task, state, live) {
  const last = state.iterations.at(-1);
  return {
    task, id: state.loopId, status: state.status, reason: state.reason, live: Boolean(live), mode: state.mode, flow: state.flow?.name,
    iteration: state.iterations.length, accepted: state.spent?.accepted || 0, maxIterations: state.budgets?.maxIterations ?? null,
    subtask: state.inFlight?.scope && state.inFlight.scope !== 'goal' ? state.inFlight.scope : last?.subtask?.id || null,
    score: state.checkpoint?.score ? { passed: state.checkpoint.score.passed, blocking: state.checkpoint.score.blocking, failing: state.checkpoint.score.failingCount, subtasksDone: state.checkpoint.score.subtasksDone, subtasksTotal: state.checkpoint.score.subtasksTotal } : null,
    spent: state.spent, budgets: state.budgets, providers: [...new Set(state.iterations.map(item => item.provider))], rung: state.escalation?.rung || null,
    startedAt: state.createdAt, updatedAt: state.updatedAt, endedAt: state.endedAt
  };
}

export function createLoopHub({ cwd, broadcast, onEnd = () => {} }) {
  const seen = new Map(), timers = new Map();
  const taskDir = async task => {
    if (!TASK.test(String(task || ''))) throw fail(400, 'A valid task id is required.');
    return (await getTask(cwd, task)).dir;
  };
  const loopId = id => { if (!LOOP_ID.test(String(id || ''))) throw fail(400, 'A valid loop id is required.'); return id; };

  return {
    /** Every loop of every task, newest activity first. */
    async list() {
      const config = await loadConfig(cwd), loops = [];
      for (const { task } of await listTasks(cwd, config).catch(() => [])) {
        const dir = join(cwd, config.taskRoot, task), holder = await lockHolder(dir);
        for (const id of (await loopIds(dir)).slice(0, 10)) {
          const state = await readState(dir, id).catch(() => null);
          if (state) loops.push(summary(task, state, holder?.loopId === id && state.status === 'running'));
        }
      }
      return { loops: loops.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_LOOPS) };
    },
    async detail(task, id) {
      const dir = await taskDir(task), info = await loopStatus(dir, loopId(id));
      if (!info) throw fail(404, 'Loop not found.');
      const { state } = info;
      return { task, live: Boolean(info.running), stopPending: info.stopPending, forecast: info.forecast, next: info.next, summary: summary(task, state, info.running), state: { ...state, iterations: state.iterations.slice(-MAX_ITERATIONS).map(item => ({ ...item, findings: (item.findings || []).slice(0, 50) })) } };
    },
    async ledger(task, id) { return verifyLoop(cwd, await taskDir(task), loopId(id)); },
    async stop(task, id, reason) {
      const dir = await taskDir(task), state = await readState(dir, loopId(id));
      if (!state) throw fail(404, 'Loop not found.');
      const holder = await lockHolder(dir);
      if (state.status !== 'running' || holder?.loopId !== id) throw fail(409, 'This loop is not running.');
      await requestStop(dir, { loopId: id, reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : undefined, by: 'Lens' });
      return { requested: true, live: true };
    },
    /** A file under a task's loops/ changed: tell the page, and on a terminal transition refresh the project. */
    onFileChange(name) {
      const parts = String(name).split(/[\\/]/), at = parts.lastIndexOf('loops');
      if (at < 1 || !LOOP_ID.test(parts[at + 1] || '') || parts[at + 2] !== 'state.json') return;
      const task = parts[at - 1], id = parts[at + 1], key = `${task}${sep}${id}`;
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(async () => {
        timers.delete(key);
        const dir = await taskDir(task).catch(() => null), state = dir && await readState(dir, id).catch(() => null);
        if (!state) return;
        const before = seen.get(key);
        seen.set(key, state.status);
        broadcast('loop', { task, id, status: state.status, iteration: state.iterations.length, phase: state.inFlight?.phase || null });
        if (before === 'running' && state.status !== 'running') { broadcast('loop-end', { task, id, status: state.status }); onEnd(); }
      }, 200));
    },
    close() { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); }
  };
}
