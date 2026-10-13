import { join, sep } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { loadConfig } from '../core/config.js';
import { getTask, listTasks } from '../core/tasks.js';
import { lockHolders, loopStatus, readState, requestStop, verifyLoop } from '../loop/engine.js';
import { LOOP_ID, loopIds, loopPaths } from '../loop/model.js';
import { readLedger } from '../loop/ledger.js';
import { replayRecorded } from '../loop/replay.js';
import { listWorkGraphs } from '../loop/workgraph.js';
import { listArenas } from '../arena/arena.js';

// Lens reads loops from their state files, like the CLI, so a loop started in a terminal shows
// up live here and the Stop button works on it: stopping writes the same request file
// `maverick loop stop` writes, which the running loop polls. Lens never runs a loop itself.

const MAX_LOOPS = 100, MAX_ITERATIONS = 200;
const TASK = /^[a-z0-9][a-z0-9-]{1,80}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

function summary(task, state, live) {
  const last = state.iterations.at(-1);
  return {
    task, id: state.loopId, lane: state.lane || null, kind: state.arena ? `arena ${state.arena.competitor}` : state.fork ? `fork of #${state.fork.from?.iteration}` : state.lane ? `lane ${state.lane}` : null, status: state.status, reason: state.reason, live: Boolean(live), mode: state.mode, flow: state.flow?.name,
    iteration: state.iterations.length, accepted: state.spent?.accepted || 0, maxIterations: state.budgets?.maxIterations ?? null,
    subtask: state.inFlight?.scope && state.inFlight.scope !== 'goal' ? state.inFlight.scope : last?.subtask?.id || null,
    score: state.checkpoint?.score ? { passed: state.checkpoint.score.passed, blocking: state.checkpoint.score.blocking, failing: state.checkpoint.score.failingCount, subtasksDone: state.checkpoint.score.subtasksDone, subtasksTotal: state.checkpoint.score.subtasksTotal } : null,
    spent: state.spent, budgets: state.budgets, providers: [...new Set(state.iterations.map(item => item.provider))], rung: state.escalation?.rung || null,
    holdout: state.sealed ? { sealId: state.sealed.sealId, feedback: state.sealed.feedback, queries: state.sealed.queries, final: state.status === 'running' ? null : state.sealed.final && { passed: state.sealed.final.passed, total: state.sealed.final.total, OI: state.sealed.final.OI } } : null,
    tainted: state.checkpoint?.tainted || null, quarantined: (state.quarantine || []).reduce((sum, item) => sum + (item.count ?? item.notes?.length ?? 0), 0),
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
      const config = await loadConfig(cwd), loops = [], graphs = [], arenas = [];
      for (const { task } of await listTasks(cwd, config).catch(() => [])) {
        const dir = join(cwd, config.taskRoot, task), holders = await lockHolders(dir);
        // Work graphs (parallel lanes and their fan-ins) and arenas (one subtask, several providers) of the task.
        for (const record of (await listWorkGraphs(dir)).slice(0, 10)) graphs.push({ task, id: record.id, outcome: record.outcome, reason: record.reason, branch: record.branch, startedAt: record.startedAt, metrics: record.metrics, waves: record.waves.map(wave => ({ n: wave.n, lanes: wave.lanes.map(lane => ({ name: lane.name, subtasks: lane.subtasks, outcome: lane.outcome || null, merged: lane.merged ?? null, loopId: lane.loopId || null })), predicted: wave.predicted.map(item => ({ a: item.a, b: item.b, kinds: item.reasons.map(reason => reason.kind) })), real: wave.real.map(item => ({ kind: item.kind, lane: item.lane || null, subtasks: item.subtasks || [], files: item.files || [], predicted: item.predicted })) })) });
        for (const record of (await listArenas(dir)).slice(0, 10)) arenas.push({ task, id: record.id, subtask: record.subtask, createdAt: record.createdAt, ranking: record.ranking, decision: record.decision, competitors: record.competitors.map(item => ({ id: item.id, provider: item.provider, outcome: item.evidence?.outcome, oracle: item.evidence?.oracle, judge: item.evidence?.judge?.status || null, diff: item.evidence?.diff?.lines ?? null, loopId: item.loopId })) });
        for (const id of (await loopIds(dir)).slice(0, 10)) {
          const state = await readState(dir, id).catch(() => null);
          if (state) loops.push(summary(task, state, holders.some(holder => holder.loopId === id) && state.status === 'running'));
        }
      }
      return { loops: loops.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_LOOPS), graphs: graphs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 20), arenas: arenas.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20) };
    },
    async detail(task, id) {
      const dir = await taskDir(task), info = await loopStatus(dir, loopId(id));
      if (!info) throw fail(404, 'Loop not found.');
      const { state } = info;
      const decisions = (await readLedger(loopPaths(dir, id).ledger)).filter(entry => entry.type === 'decision').slice(-50).map(({ data }) => ({ id: data.id, n: data.n, rubric: data.rubric, version: data.version, tier: data.tier, answer: data.answer, probability: data.probability, threshold: data.threshold, advisory: data.advisory, needsHuman: data.needsHuman, calibration: data.calibration, eligible: data.eligible }));
      return { task, live: Boolean(info.running), stopPending: info.stopPending, forecast: info.forecast, next: info.next, decisions, summary: summary(task, state, info.running), state: { ...state, iterations: state.iterations.slice(-MAX_ITERATIONS).map(item => ({ ...item, findings: (item.findings || []).slice(0, 50) })) } };
    },
    async ledger(task, id) { return verifyLoop(cwd, await taskDir(task), loopId(id)); },
    /** The flight recorder: the recorded loop through the policy functions under other settings. Read-only. */
    async replay(task, id, set = []) {
      await taskDir(task);
      try { return await replayRecorded(cwd, task, { loop: loopId(id), set: set.slice(0, 20).map(String) }); } catch (error) { throw error.status ? error : fail(400, error.message); }
    },
    async stop(task, id, reason) {
      const dir = await taskDir(task), state = await readState(dir, loopId(id));
      if (!state) throw fail(404, 'Loop not found.');
      const holders = await lockHolders(dir);
      if (state.status !== 'running' || !holders.some(holder => holder.loopId === id)) throw fail(409, 'This loop is not running.');
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
