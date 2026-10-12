import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { clearInterval, setInterval } from 'node:timers';
import { sha256 } from '../capabilities/model.js';
import { agentVerdict, startAgentRun } from '../commands/agent.js';
import { lacksGitBaseline } from '../core/project-tools.js';
import { detectStack, selectVerificationCommands } from '../core/stack.js';
import { getTask } from '../core/tasks.js';
import { commandAvailable, exists, pretty, rel } from '../core/util.js';
import { evaluateGate } from '../flows/engine.js';
import { runJudgeGate } from '../flows/judge.js';
import { findFlow, interpolate, judgeGate } from '../flows/model.js';
import { familyOf } from '../runtime/families.js';
import { runHooks } from '../runtime/hooks.js';
import { resolveRun } from '../runtime/policy.js';
import { providersFor, resolveBin } from '../runtime/providers.js';
import { checklist, loadGraph, setStatus } from '../subtasks/graph.js';
import { checkBudget, costWarnings, wouldExceed } from './budget.js';
import { diagnose, nextRung } from './diagnose.js';
import { checkpointRef, git, IntegrityError, inPlace, listCheckpointRefs, readCommit, repoInfo, resolveRef } from './git.js';
import { backupProtected, checkProtected, readBackup, restoreBackup } from './guards.js';
import { auditIntegrity, detectOracleSet } from './integrity.js';
import { openLedger, readLedger, verifyChain } from './ledger.js';
import { LOOP_HUMAN, LOOP_SCHEMA, loopIds, loopPaths, loopSettings, newLoopId, NEXT_STEP } from './model.js';
import { allBlockingPass, compare, isProgress, scoreOf } from './ratchet.js';
import { promptContext, renderEscalation, renderLoopReport, renderNotes } from './report.js';
import { createWorktree } from './worktree.js';

// The loop engine. Each iteration gives one unit of work (the next subtask, or the goal) to an
// agent with a fresh context, then decides it with evidence the harness collects itself: the
// diff, the integrity audit and the oracle gates. What makes nothing worse becomes a
// checkpoint; anything else is rolled back. Budgets, the escalation ladder and a human end
// every loop, and the ledger records every decision before it takes effect.

const now = () => new Date().toISOString();
const str = value => (typeof value === 'string' && value ? value : undefined);
const cap = (items, size) => (items || []).slice(0, size);

/** The loop's own commit message: which loop and iteration, and where in the ledger it was decided. */
const commitMessage = (state, n, label, prev) => `maverick loop ${state.task} #${n}${label ? ` (${label})` : ''}\n\nMaverick-Loop: ${state.loopId}\nMaverick-Iteration: ${n}\nMaverick-Ledger-Prev: ${prev}\n`;

async function saveState(paths, state) {
  state.updatedAt = now();
  await writeFile(`${paths.state}.tmp`, pretty(state));
  await rename(`${paths.state}.tmp`, paths.state);
}

export async function readState(taskDir, loopId) {
  const path = loopPaths(taskDir, loopId).state;
  if (!await exists(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { throw new Error(`${path} is not valid JSON (${error.message}); run maverick loop verify, or start over with --new`); }
}

const alive = holder => {
  if (!holder || holder.host !== hostname()) return Boolean(holder);
  try { process.kill(holder.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

/** A lock file created exclusively; a lock whose process is gone (same host) is taken over. */
async function acquire(path, info) {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { await writeFile(path, pretty(info), { flag: 'wx' }); return path; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
      if (alive(holder)) throw new Error(`a loop is already running for ${holder.task} (pid ${holder.pid}${holder.host !== hostname() ? ` on ${holder.host}` : ''}); stop it with maverick loop stop ${holder.task}`);
      await rm(path, { force: true });
    }
  }
  throw new Error(`could not take the loop lock ${path}`);
}

export async function lockHolder(taskDir) {
  const holder = await readFile(loopPaths(taskDir).taskLock, 'utf8').then(JSON.parse).catch(() => null);
  return alive(holder) ? holder : null;
}

/** Asks a running loop to stop: now (the agent run is aborted) or after the current iteration. */
export async function requestStop(taskDir, { reason, by, mode = 'now', loopId } = {}) {
  const holder = await lockHolder(taskDir);
  if (!holder) throw new Error('no loop is running for this task');
  const id = loopId || holder.loopId, path = loopPaths(taskDir, id).stop;
  await writeFile(path, pretty({ at: now(), by: by || process.env.USER || 'human', reason: reason || null, mode }));
  return { loopId: id, path, holder };
}

/** The loop to show or continue: the given id, or the newest. */
async function pickLoop(taskDir, loopId) {
  if (loopId) return loopId;
  return (await loopIds(taskDir))[0] || null;
}

/** Status of a task's loop for `loop status`, Lens and MCP. */
export async function loopStatus(taskDir, loopId) {
  const id = await pickLoop(taskDir, loopId);
  if (!id) return null;
  const state = await readState(taskDir, id);
  if (!state) return null;
  const holder = await lockHolder(taskDir), paths = loopPaths(taskDir, id);
  const forecast = state.budgets ? wouldExceed(state.budgets, state.spent, state.iterations) : null;
  return { state, running: holder?.loopId === id ? holder : null, stopPending: await exists(paths.stop), forecast, next: NEXT_STEP[state.status] };
}

/**
 * Re-checks a loop's record: the hash chain, that the state points at the ledger's head, and
 * that every checkpoint ref still names the commit and tree the ledger recorded, with the
 * ledger position in its message.
 */
export async function verifyLoop(cwd, taskDir, loopId) {
  const id = await pickLoop(taskDir, loopId);
  if (!id) throw new Error('this task has no loop yet');
  const paths = loopPaths(taskDir, id), entries = await readLedger(paths.ledger), state = await readState(taskDir, id);
  const chain = verifyChain(entries, id), problems = chain.problems.map(item => item.problem), warnings = [];
  if (!entries.length) problems.push('the ledger is empty');
  const hashes = entries.map(entry => entry.hash);
  if (state?.ledgerHead && state.ledgerHead !== chain.head) {
    if (hashes.includes(state.ledgerHead)) warnings.push('the state lags behind the ledger (the loop stopped between two writes); the next run reconciles it');
    else problems.push('the ledger head recorded in the state is missing: entries were removed from the end of the ledger');
  }
  const cleaned = new Set(entries.filter(entry => entry.type === 'clean').flatMap(entry => entry.data.refs || []));
  let checkpoints = 0;
  for (const entry of entries) {
    const point = entry.data?.checkpoint;
    if (!point?.ref) continue;
    checkpoints += 1;
    if (cleaned.has(point.ref)) continue;
    const commit = await resolveRef(cwd, point.ref);
    if (!commit) { problems.push(`missing ref ${point.ref} (entry ${entry.seq})`); continue; }
    if (commit !== point.commit) { problems.push(`ref ${point.ref} does not match the ledger: it points at ${commit.slice(0, 10)}, the ledger recorded ${point.commit.slice(0, 10)}`); continue; }
    const body = await readCommit(cwd, commit);
    if (body?.tree !== point.tree) problems.push(`checkpoint ${point.ref} has tree ${body?.tree?.slice(0, 10)}, the ledger recorded ${point.tree.slice(0, 10)}`);
    const trailer = body?.message.match(/^Maverick-Ledger-Prev: (\w+)$/m)?.[1];
    if (trailer && trailer !== entry.prev) problems.push(`checkpoint ${point.ref} was not created at ledger entry ${entry.seq}`);
  }
  return { loopId: id, ok: !problems.length, entries: entries.length, checkpoints, problems, warnings };
}

/** Removes a loop's checkpoint refs, worktree and scratch files; the ledger and state stay as the audit record. */
export async function cleanLoop(cwd, taskDir, { loopId, deleteBranch = false } = {}) {
  const id = await pickLoop(taskDir, loopId);
  if (!id) throw new Error('this task has no loop yet');
  if (await lockHolder(taskDir)) throw new Error('a loop is running for this task; stop it first');
  const state = await readState(taskDir, id), paths = loopPaths(taskDir, id);
  const refs = (await listCheckpointRefs(cwd, state.task)).map(item => item.ref);
  for (const ref of refs) await git(cwd, ['update-ref', '-d', ref]);
  let worktree = null;
  if (state.worktree) worktree = await createWorktree({ cwd, task: state.task, state, settings: {}, taskDir }).cleanup({ deleteBranch });
  await rm(paths.gitIndex, { force: true }); await rm(paths.inflight, { recursive: true, force: true });
  const ledger = await openLedger(paths.ledger, id);
  await ledger.append('clean', { refs, worktree, branchDeleted: Boolean(deleteBranch && state.worktree) });
  state.ledgerHead = ledger.head;
  await saveState(paths, state);
  return { loopId: id, refs, worktree };
}

/** Which work the next iteration gets: the in-progress or next ready subtask, the goal, or the end. */
async function selectWork(taskDir, state, judgeEnabled) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) return { mode: 'blocked', reason: `the subtask graph has problems: ${graph.problems.join('; ')}` };
  if (!graph.items.length) return { mode: 'goal', graph };
  // A subtask whose last box was ticked before a crash is finished here, unless a judge must decide it.
  if (!judgeEnabled) {
    for (const item of graph.items.filter(entry => entry.status === 'in-progress' && entry.checklist.total && !entry.checklist.open.length)) {
      await setStatus(taskDir, state.task, item.id, 'done').catch(() => {});
    }
  }
  const fresh = judgeEnabled ? graph : await loadGraph(taskDir);
  if (fresh.items.every(item => item.status === 'done')) return { mode: allBlockingPass(state.checkpoint.score) ? 'done' : 'finish', graph: fresh };
  const subtask = fresh.items.find(item => item.status === 'in-progress') || fresh.items.find(item => item.ready);
  if (!subtask) return { mode: 'blocked', reason: `the remaining subtasks are blocked: ${fresh.items.filter(item => item.status !== 'done').map(item => `${item.id} (${item.status})`).join(', ')}` };
  return { mode: 'subtask', subtask, graph: fresh };
}

/**
 * What `loop run` would do, without doing any of it: no lock, state, ref or git object is
 * written. The settings, the oracle, the rotation, the next unit of work and its prompt.
 */
export async function planLoop({ cwd, task, options = {} }) {
  const { dir: taskDir, config } = await getTask(cwd, task);
  const flow = await findFlow(cwd, str(options.flow) || config.loop?.flow || 'loop');
  const settings = loopSettings(config, flow, options), providers = providersFor(config);
  const oracle = flow.gates.filter(gate => gate.type !== 'approval' && gate.type !== 'judge');
  const info = await repoInfo(cwd), problems = [], warnings = [];
  if (!info.repo) problems.push('not a git repository'); else if (!info.head) problems.push('the repository has no commit yet');
  if (info.operation) problems.push(`a git ${info.operation} is in progress`);
  if (!oracle.some(gate => gate.severity === 'block')) problems.push(`flow ${flow.name} has no blocking gate a loop can check`);
  let plan = null;
  try { plan = resolveRun(config, { provider: str(options.provider), model: str(options.model), effort: str(options.effort), permission: str(options.permission), stage: 'build' }, providers); } catch (error) { problems.push(error.message); }
  const rotation = settings.providers.map(id => { try { resolveRun(config, { provider: id, stage: 'build' }, providers); const provider = providers.find(item => item.id === id); return { id, ok: commandAvailable(resolveBin(provider, config, cwd), cwd), family: familyOf({ provider: id }, config).family }; } catch (error) { return { id, ok: false, problem: error.message }; } });
  rotation.filter(item => !item.ok).forEach(item => problems.push(`loop.providers: ${item.id} ${item.problem || 'is not installed'}`));
  if (plan) warnings.push(...costWarnings([plan.provider, ...settings.providers.map(id => providers.find(item => item.id === id))], settings.budgets));
  const state = { task, iterations: [], checkpoint: { score: null }, escalation: {}, humanNotes: [] };
  const work = await selectWorkReadOnly(taskDir);
  let prompt = null;
  if (plan && work.mode !== 'blocked') {
    const extras = promptContext(state, { settings, n: 1, protectedPaths: settings.protectedPaths });
    const instruction = work.subtask ? `Implement subtask ${work.subtask.id}: ${work.subtask.title}.` : `Work toward the goal: ${interpolate(flow.contract.goal, { task })}.`;
    prompt = await startAgentRun(cwd, { slug: task, dir: taskDir, config, subtask: work.subtask, instruction, options: { dryRun: true }, overrides: { provider: plan.provider.id, model: plan.model, effort: plan.effort, permission: plan.permission }, extras, stage: 'build' });
  }
  const current = await pickLoop(taskDir), existing = current ? await readState(taskDir, current) : null;
  return { task, flow: flow.name, oracle: oracle.map(gate => ({ id: gate.id, type: gate.type, severity: gate.severity })), excluded: flow.gates.filter(gate => gate.type === 'approval' || gate.type === 'judge').map(gate => gate.id), settings, rotation, work: { mode: work.mode, subtask: work.subtask ? { id: work.subtask.id, title: work.subtask.title } : null, reason: work.reason }, existing: existing ? { loopId: existing.loopId, status: existing.status } : null, problems, warnings, dryRun: prompt };
}

async function selectWorkReadOnly(taskDir) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) return { mode: 'blocked', reason: graph.problems.join('; ') };
  if (!graph.items.length) return { mode: 'goal' };
  if (graph.items.every(item => item.status === 'done')) return { mode: 'finish' };
  const subtask = graph.items.find(item => item.status === 'in-progress') || graph.items.find(item => item.ready);
  return subtask ? { mode: 'subtask', subtask } : { mode: 'blocked', reason: 'the remaining subtasks are blocked' };
}

/**
 * Runs or resumes the loop of a task until it is done or a human is needed. `emit` receives
 * progress events; printing is the caller's job. Returns the final state and outcome.
 */
export async function runLoop({ cwd, task, options = {}, emit = () => {} }) {
  const { dir: taskDir, config } = await getTask(cwd, task);
  const flow = await findFlow(cwd, str(options.flow) || config.loop?.flow || 'loop');
  const settings = loopSettings(config, flow, options);
  const oracle = flow.gates.filter(gate => gate.type !== 'approval' && gate.type !== 'judge');
  if (!oracle.some(gate => gate.severity === 'block')) throw new Error(`flow ${flow.name} has no blocking gate a loop can check (approval and judge gates are decided separately)`);
  const providers = providersFor(config);
  const info = await repoInfo(cwd);
  // Preflight: everything that would make a checkpoint or a rollback untrustworthy fails closed.
  if (!info.version || info.version[0] < 2 || (info.version[0] === 2 && info.version[1] < 26)) throw new Error('loops need git 2.26 or newer');
  if (!info.repo) throw new Error('loops need a git repository: run git init and commit the project first');
  if (!info.head) throw new Error('the repository has no commit yet; commit the project before starting a loop');
  if (info.operation) throw new Error(`a git ${info.operation} is in progress; finish or abort it first`);
  if (await lacksGitBaseline(cwd)) throw new Error('git tracks no file of this project; commit it before starting a loop');
  if (oracle.some(gate => gate.type === 'check') && !selectVerificationCommands(await detectStack(cwd), config).length) throw new Error('no verification commands detected for the check gate; declare verification.commands in .maverick/config.json');
  const initial = resolveRun(config, { provider: str(options.provider), model: str(options.model), effort: str(options.effort), permission: str(options.permission), stage: 'build' }, providers);
  if (initial.permission === 'read-only') throw new Error('a loop must edit files: its permission cannot be read-only');
  for (const id of settings.providers) {
    resolveRun(config, { provider: id, stage: 'build' }, providers);
    const provider = providers.find(item => item.id === id);
    if (!commandAvailable(resolveBin(provider, config, cwd), cwd)) throw new Error(`loop.providers lists ${id}, but ${resolveBin(provider, config, cwd)} is not installed`);
  }
  const warnings = [...costWarnings([initial.provider, ...settings.providers.map(id => providers.find(item => item.id === id))], settings.budgets)];
  if (initial.permission === 'full') warnings.push('full permission: a rollback restores files but cannot undo commands with side effects outside the repository');
  if (info.prefix) warnings.push(`nested project: checkpoints cover ${info.prefix}/ only`);

  // Open (or continue) the loop under its locks.
  let loopId = await pickLoop(taskDir, str(options.loop)), state = loopId ? await readState(taskDir, loopId) : null;
  const resume = state && !options.new;
  if (resume) {
    if (state.status === 'running' && await lockHolder(taskDir)) throw new Error(`a loop is already running for ${task}; stop it with maverick loop stop ${task}`);
    if (state.status === 'done') throw new Error(`the loop of ${task} is done; review the change, or start another with --new`);
    if (state.status === 'integrity-violation') throw new Error(`the loop of ${task} stopped on an integrity violation (${state.reason}); run maverick loop verify ${task}, then start over with --new`);
    if (LOOP_HUMAN.includes(state.status) && !options.resume) throw new Error(`the loop of ${task} is ${state.status} and waits for a human: read LOOP-ESCALATION.md, then run maverick loop run ${task} --resume --note "<your decision>" (or --new)`);
    if (options.worktree && state.mode !== 'worktree') throw new Error('this loop runs in place; continue it without --worktree, or start a worktree loop with --new');
    const budgets = { ...state.budgets, ...budgetChanges(state.budgets, options) };
    const forecast = wouldExceed(budgets, state.spent, state.iterations);
    const exhausted = checkBudget(budgets, state.spent) || (forecast.stop ? forecast : null);
    if (exhausted) throw new Error(`the budget is exhausted (${exhausted.detail}); raise it with --max-iterations, --max-minutes or --max-cost`);
  } else { loopId = newLoopId(); state = null; }
  const previousStatus = state?.status || null;
  const paths = loopPaths(taskDir, loopId), mode = resume ? state.mode : settings.isolation;
  await mkdir(paths.dir, { recursive: true });
  if (!await exists(join(paths.root, '.gitignore'))) await writeFile(join(paths.root, '.gitignore'), '# Loop state: checkpoints index, locks, in-flight backups and rejected patches.\n*\n!.gitignore\n');
  const lockInfo = { pid: process.pid, host: hostname(), task, loopId, mode, startedAt: now() };
  const locks = [await acquire(paths.taskLock, lockInfo)];
  const stopWatch = { timer: null };
  const controller = { current: null };
  let interrupts = 0;
  const onSigint = () => { interrupts += 1; if (interrupts > 1) process.exit(130); writeFile(paths.stop, pretty({ at: now(), by: 'ctrl-c', mode: 'now' })).catch(() => {}); controller.current?.abort(); };
  process.on('SIGINT', onSigint);
  const ledger = await openLedger(paths.ledger, loopId);
  let isolation;
  const invocationStart = Date.now();
  let activeBase = state?.spent?.activeMs || 0;
  const persist = async () => { state.spent.activeMs = activeBase + (Date.now() - invocationStart); state.ledgerHead = ledger.head; await saveState(paths, state); await writeFile(join(taskDir, 'LOOP.md'), renderLoopReport(state)); };

  const finish = async (outcome, reason, extra = {}) => {
    state.status = outcome; state.reason = reason || null; state.endedAt = now(); state.inFlight = null;
    await ledger.append('stop', { outcome, reason: reason || null, spent: state.spent });
    await persist();
    if (LOOP_HUMAN.includes(outcome)) await writeFile(join(taskDir, 'LOOP-ESCALATION.md'), renderEscalation(state, { reason, ...extra }));
    emit({ type: 'loop-end', outcome, reason, state });
    const after = await runHooks(cwd, config, 'after-loop', { task, loopId, outcome, reason, iterations: state.iterations.length, spent: state.spent, checkpoint: state.checkpoint, mode });
    after.warnings.forEach(message => emit({ type: 'notice', level: 'warn', message }));
    return { state, outcome, reason, next: NEXT_STEP[outcome] };
  };

  try {
    if (mode === 'in-place') locks.push(await acquire(join(info.gitDir, 'maverick-loop.lock'), lockInfo));
    isolation = mode === 'worktree' ? createWorktree({ cwd, task, state: state || {}, settings, info, taskDir }) : inPlace({ cwd, task, indexFile: paths.gitIndex, inflight: paths.inflight });
    const workCwd = () => isolation.workCwd;
    const workTaskDir = () => join(isolation.workCwd, rel(cwd, taskDir));
    const invoke = async argv => (await import('../cli.js')).main(argv, workCwd());
    const stack = await detectStack(cwd);

    /** Runs the oracle gates on the work tree and scores the result. */
    const measure = async (signal, only) => {
      await isolation.sync(taskDir);
      const context = { cwd: workCwd(), task, taskDir: workTaskDir(), invoke, flow: flow.name, against: state.baseCommit, timeoutMs: settings.gateTimeoutMinutes * 60000, signal };
      const results = [];
      for (const gate of oracle) results.push(only && !only.includes(gate.id) ? only.previous.find(item => item.id === gate.id) : await evaluateGate(context, gate, {}, results));
      if (mode === 'worktree') await isolation.collect(taskDir);
      const graph = await loadGraph(taskDir);
      return { results, score: scoreOf({ results, graph }), issues: results.filter(item => item.severity === 'block' && item.status === 'fail').flatMap(item => item.issues.map(issue => `${item.id}: ${issue}`)) };
    };

    if (!resume) {
      await isolation.prepare();
      const oracleSet = await detectOracleSet(cwd, { stack, config, taskDir, settings, gates: oracle });
      const tree = await isolation.snapshot(), number = await nextNumber(cwd, task);
      state = {
        schema: LOOP_SCHEMA, loopId, task, flow: { name: flow.name, source: flow.source, integrity: flow.integrity, gates: oracle.map(gate => gate.id) },
        mode, worktree: isolation.worktree || null, status: 'running', reason: null, createdAt: now(), updatedAt: now(), endedAt: null,
        baseHead: info.head, baseBranch: info.branch, baseCommit: null, configHash: sha256(JSON.stringify({ loop: config.loop || {}, runtime: config.runtime || {} })),
        initialProvider: initial.provider.id, oracle: { digest: oracleSet.digest, counts: oracleSet.counts },
        settings: { integrity: settings.integrity.level, blastRadius: settings.blastRadius, protectedPaths: settings.protectedPaths, escalation: settings.escalation, providers: settings.providers, judge: settings.judge.enabled },
        budgets: settings.budgets, spent: { iterations: 0, accepted: 0, activeMs: 0, costUsd: 0, costUnknown: 0 },
        checkpoint: null, baseline: null, inFlight: null,
        escalation: { scope: null, rungIndex: -1, rung: null, overrides: {}, tried: [initial.provider.id], since: 1, diagnosis: null },
        lastRejection: null, judgeFeedback: null, humanNotes: [], iterations: [], ledgerHead: null
      };
      activeBase = 0;
      const checkpoint = { n: number, ...(mode === 'worktree' ? await isolation.baseline(checkpointRef(task, number)) : await isolation.checkpoint({ ref: checkpointRef(task, number), tree, parent: info.head, message: commitMessage(state, 0, 'baseline', ledger.head) })) };
      state.baseCommit = checkpoint.commit; state.baseTree = checkpoint.tree;
      state.checkpoint = { ...checkpoint, iteration: 0, score: null, issues: [] };
      await ledger.append('loop-start', { task, loopId, mode, flow: state.flow, configHash: state.configHash, baseHead: info.head, baseBranch: info.branch, budgets: state.budgets, providers: [initial.provider.id, ...settings.providers], oracle: state.oracle, checkpoint });
      emit({ type: 'loop-start', state, warnings });
      const baseline = await measure();
      state.checkpoint.score = baseline.score; state.checkpoint.issues = cap(baseline.issues, 30); state.baseline = baseline.score;
      await ledger.append('baseline', { score: summarize(baseline.score) });
      await persist();
      emit({ type: 'baseline', score: baseline.score, issues: baseline.issues });
    } else {
      state.status = 'running'; state.reason = null; state.endedAt = null;
      const changes = budgetChanges(state.budgets, options);
      if (changes) { const before = state.budgets; state.budgets = { ...state.budgets, ...changes }; await ledger.append('budget-change', { before, after: state.budgets }); }
      await isolation.prepare();
      const recovered = await recover();
      const chain = verifyChain(ledger.entries, loopId);
      if (!chain.ok) return await finish('integrity-violation', `the ledger fails verification: ${chain.problems[0].problem}`);
      const ref = await resolveRef(cwd, state.checkpoint.ref);
      if (ref !== state.checkpoint.commit) return await finish('integrity-violation', `checkpoint ${state.checkpoint.ref} was moved or deleted`);
      const human = await adoptHumanChanges();
      if (options.note || options.resume) {
        const note = str(options.note);
        if (note) state.humanNotes.push({ at: now(), by: process.env.USER || 'human', text: note });
        await ledger.append('human-ack', { by: process.env.USER || 'human', note: note || null, after: previousStatus });
        // A human decision resets the escalation of the current scope: the ladder starts again.
        state.escalation = { ...state.escalation, rungIndex: -1, rung: null, diagnosis: null, since: state.iterations.length + 1 };
      }
      const baseline = await measure();
      state.checkpoint.score = baseline.score; state.checkpoint.issues = cap(baseline.issues, 30);
      await ledger.append('resume', { recovered, human, score: summarize(baseline.score) });
      await persist();
      emit({ type: 'resume', recovered, human, score: baseline.score, warnings });
    }

    /** Crash recovery: roll forward a decision the ledger has and the state lacks, then undo any half-finished iteration. */
    async function recover() {
      const last = ledger.entries.at(-1);
      if (last?.type === 'iteration-end' && last.data.checkpoint && last.data.checkpoint.n > state.checkpoint.n) {
        state.checkpoint = { ...last.data.checkpoint, iteration: last.data.n, score: state.checkpoint.score, issues: state.checkpoint.issues };
      }
      for (const { ref, n } of await listCheckpointRefs(cwd, task)) {
        if (n > state.checkpoint.n && !ledger.entries.some(entry => entry.data?.checkpoint?.ref === ref)) await git(cwd, ['update-ref', '-d', ref]);
      }
      const backup = await readBackup(paths.inflight);
      const unfinished = state.inFlight || ledger.entries.at(-1)?.type === 'iteration-start';
      if (!unfinished) return null;
      const rollback = await isolation.rollback(state.checkpoint);
      if (backup) await restoreBackup(backup);
      const n = state.inFlight?.n ?? ledger.entries.at(-1)?.data?.n;
      if (ledger.entries.at(-1)?.type === 'iteration-start') await ledger.append('iteration-end', { n, decision: 'aborted', recovered: true, reasons: ['the loop stopped mid-iteration; its changes were rolled back'] });
      state.inFlight = null;
      emit({ type: 'notice', level: 'warn', message: `recovered from an interrupted iteration ${n}: restored ${rollback.restored.length}, removed ${rollback.deleted.length} file(s)` });
      return { n, restored: rollback.restored, deleted: rollback.deleted };
    }

    /** Edits a human made while the loop was stopped become a checkpoint of their own. */
    async function adoptHumanChanges() {
      const tree = await isolation.snapshot();
      if (tree === state.checkpoint.tree) return null;
      const diff = await isolation.diff(state.checkpoint.tree, tree, { patch: false });
      const n = await nextNumber(cwd, task), label = 'human change';
      const checkpoint = await isolation.checkpoint({ ref: checkpointRef(task, n), tree, parent: state.checkpoint.commit, message: commitMessage(state, n, label, ledger.head) });
      await ledger.append('human-change', { files: diff.files.length, added: diff.added, deleted: diff.deleted, checkpoint: { n, ...checkpoint } });
      state.checkpoint = { ...state.checkpoint, n, ...checkpoint };
      return { files: diff.files.length };
    }

    // The iterations.
    for (;;) {
      const n = state.iterations.length + 1;
      const stop = await readFile(paths.stop, 'utf8').then(JSON.parse).catch(() => null);
      if (stop) { await rm(paths.stop, { force: true }); return await finish('aborted', `stopped by ${stop.by}${stop.reason ? `: ${stop.reason}` : ''}`); }
      const hard = checkBudget(state.budgets, { ...state.spent, activeMs: activeBase + (Date.now() - invocationStart) });
      if (hard) return await finish('budget-exceeded', hard.detail);
      const forecast = wouldExceed(state.budgets, { ...state.spent, activeMs: activeBase + (Date.now() - invocationStart) }, state.iterations);
      if (forecast.stop) return await finish('budget-exceeded', forecast.detail);
      if (mode === 'in-place') {
        const head = await resolveRef(cwd, 'HEAD'), branch = (await git(cwd, ['symbolic-ref', '-q', 'HEAD'])).stdout.trim() || null;
        if (head !== state.baseHead || branch !== state.baseBranch) return await finish('needs-human', `HEAD moved outside the loop (now ${branch || head?.slice(0, 8)}); the checkpoints are based on ${state.baseBranch || state.baseHead.slice(0, 8)}. Return to it, or start over with --new`);
      }
      let work = await selectWork(taskDir, state, settings.judge.enabled);
      if (work.mode === 'blocked') return await finish('needs-human', work.reason);
      if (work.mode === 'done') {
        // The whole change is judged once more before the loop calls it done; the same tree is never judged twice.
        const unchanged = state.judgeFeedback?.scope === 'goal' && state.judgeFeedback.tree === state.checkpoint.tree;
        const verdict = settings.judge.enabled && !unchanged ? await judgeChange({ subtask: null, tree: state.checkpoint.tree, n: n - 1, results: [] }) : null;
        if (verdict?.costUsd) state.spent.costUsd += verdict.costUsd;
        if (verdict?.status === 'pending') return await finish('needs-human', `the judge could not decide: ${verdict.issues.join('; ')}`, { judge: verdict.summary });
        if (verdict?.status === 'fail') state.judgeFeedback = { scope: 'goal', n: n - 1, issues: verdict.issues, tree: state.checkpoint.tree };
        if (verdict?.status === 'fail' || unchanged) work = { mode: 'finish' };
        else return await finish('done', state.iterations.length ? `every subtask is done and every blocking gate passes${settings.judge.enabled ? ', and an independent judge agrees,' : ''} after ${state.iterations.length} iteration(s)` : 'every blocking gate already passes');
      }
      const subtask = work.subtask || null, scope = subtask ? subtask.id : 'goal';
      // Escalation is per unit of work: the next subtask starts again with the configured agent.
      if (state.escalation.scope !== scope) state.escalation = { scope, rungIndex: -1, rung: null, overrides: {}, tried: [initial.provider.id], since: n, diagnosis: null };
      const issues = state.checkpoint.issues || [];
      const stage = issues.length && (!subtask || !subtask.checklist.open.length) ? 'fix' : 'build';
      const overrides = state.escalation.overrides;
      const plan = resolveRun(config, { provider: overrides.provider || str(options.provider), model: 'model' in overrides ? overrides.model : str(options.model), effort: 'effort' in overrides ? overrides.effort : str(options.effort), permission: str(options.permission), subtask, stage }, providers);
      const family = familyOf({ provider: plan.provider.id, model: plan.model }, config).family;
      const before = await runHooks(cwd, config, 'before-loop-iteration', { task, loopId, iteration: n, mode, subtask: subtask ? { id: subtask.id, title: subtask.title } : null, provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, rung: state.escalation.rung, spent: state.spent, budgets: state.budgets });
      if (!before.allowed) return await finish('aborted', before.reason);
      if (subtask?.status === 'pending') await setStatus(taskDir, task, subtask.id, 'in-progress');

      // Record the start first, then back up what the agent must not change: the ledger is part of it.
      state.inFlight = { n, phase: 'agent', startedAt: now(), scope, provider: plan.provider.id, effort: plan.effort || null };
      await ledger.append('iteration-start', { n, scope, provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, rung: state.escalation.rung, checkpoint: state.checkpoint.n });
      await persist();
      await isolation.sync(taskDir);
      const backup = await backupProtected({ cwd, taskDir, loopDir: paths.dir, inflight: paths.inflight, subtask });
      const invariants = await isolation.captureInvariants();
      emit({ type: 'iteration-start', n, subtask, scope, provider: plan.provider.id, model: plan.model, effort: plan.effort, rung: state.escalation.rung });

      const notesText = await readFile(join(taskDir, 'LOOP-NOTES.md'), 'utf8').catch(() => '');
      const extras = promptContext(state, { settings, n, protectedPaths: settings.protectedPaths, notes: notesText, hookAdditions: before.appendPrompt });
      const instruction = work.mode === 'subtask'
        ? `Implement subtask ${subtask.id}: ${subtask.title}. Tick each checklist item in its file as it becomes true. If a test or check is wrong, do not change it: report it in "disputes".`
        : work.mode === 'finish' ? `Every subtask is done, but ${state.judgeFeedback?.scope === 'goal' ? 'the independent judge has not accepted the whole change' : 'blocking gates still fail'}. Fix that without widening scope. Goal: ${interpolate(flow.contract.goal, { task })}`
          : `Work toward the goal: ${interpolate(flow.contract.goal, { task })}. The loop ends when every blocking gate passes and you report done.`;
      const remaining = state.budgets.maxMinutes ? state.budgets.maxMinutes * 60000 - (activeBase + (Date.now() - invocationStart)) : Infinity;
      const timeoutMs = Math.max(60000, Math.min((config.runtime?.timeoutMinutes || 30) * 60000, remaining));
      const signalController = new globalThis.AbortController();
      controller.current = signalController;
      stopWatch.timer = setInterval(() => { readFile(paths.stop, 'utf8').then(JSON.parse).then(request => { if (request.mode !== 'after-iteration') signalController.abort(); }).catch(() => {}); }, settings.stopPollMs);
      stopWatch.timer.unref?.();
      let run, agentError = null;
      const started = Date.now();
      try {
        ({ run } = await startAgentRun(cwd, { slug: task, dir: taskDir, config, subtask, instruction, issues, options: { timeout: options.timeout }, overrides: { provider: plan.provider.id, model: plan.model, effort: plan.effort, permission: plan.permission }, extras, workdir: workCwd(), stage, timeoutMs, signal: signalController.signal, meta: { role: 'maker', loop: loopId, iteration: n }, onEvent: event => emit({ type: 'agent', n, event }) }));
      } catch (error) { agentError = error; }
      finally { clearInterval(stopWatch.timer); stopWatch.timer = null; controller.current = null; }

      // Whatever the agent did, the harness's files and git state come back first. In a worktree, the
      // agent's ticked boxes come back from its mirror of the task; anything else there is reported.
      const harvested = mode === 'worktree' ? await isolation.harvest(taskDir, subtask) : { findings: [] };
      const guarded = await checkProtected(backup);
      guarded.findings.push(...harvested.findings);
      const invariant = await isolation.checkInvariants(invariants);
      if (invariant.fatal.length) {
        await isolation.rollback(state.checkpoint).catch(() => {});
        await restoreBackup(backup);
        await ledger.append('iteration-end', { n, decision: 'aborted', reasons: invariant.fatal });
        state.iterations.push(record({ n, started, subtask, scope, plan, family, decision: 'aborted', reasons: invariant.fatal }));
        return await finish('integrity-violation', invariant.fatal[0]);
      }
      if (agentError || signalController.signal.aborted) {
        const rollback = await isolation.rollback(state.checkpoint);
        await restoreBackup(backup);
        const reason = agentError ? `the agent could not run: ${agentError.message}` : 'stopped during the agent run';
        await ledger.append('iteration-end', { n, decision: 'aborted', reasons: [reason], rollback: { restored: rollback.restored.length, deleted: rollback.deleted.length } });
        state.iterations.push(record({ n, started, subtask, scope, plan, family, decision: 'aborted', reasons: [reason] }));
        state.inFlight = null;
        const stopRequest = await readFile(paths.stop, 'utf8').then(JSON.parse).catch(() => null);
        await rm(paths.stop, { force: true });
        if (agentError) return await finish(/hook/.test(agentError.message) ? 'aborted' : 'needs-human', reason);
        return await finish('aborted', `stopped by ${stopRequest?.by || 'request'}${stopRequest?.reason ? `: ${stopRequest.reason}` : ''}`);
      }

      const status = agentVerdict(run), result = run.result || {};
      const transcriptSha256 = sha256(await readFile(run.transcript).catch(() => ''));
      state.inFlight.phase = 'verify';
      await persist();
      const tree = await isolation.snapshot();
      const diff = await isolation.diff(state.checkpoint.tree, tree);
      emit({ type: 'verify', n, diff: { files: diff.files.length, added: diff.added, deleted: diff.deleted } });
      const audit = await auditIntegrity(cwd, { workCwd: workCwd(), base: state.checkpoint.tree, head: tree, diff, taskDir, subtask, settings, config, stack, gates: oracle, claim: { filesChanged: result.filesChanged || [], disputes: result.disputes || [] } });
      const findings = [...guarded.findings, ...invariant.findings, ...audit.findings].map(item => ({ source: item.source || 'integrity', ...item }));
      const blocking = findings.filter(item => item.severity === 'block');
      let measured = null, comparison = null, judge = null;
      const reasons = blocking.map(item => `${item.kind}: ${item.file ? `${item.file} — ` : ''}${item.message}`);
      if (!blocking.length) {
        measured = await measure();
        comparison = compare(state.checkpoint.score, measured.score, settings.ratchet);
        // A gate that regressed is run once more: a flaky test must not roll back good work.
        const regressed = [...new Set(comparison.regressions.filter(item => item.gate).map(item => item.gate))];
        if (regressed.length && settings.ratchet.recheck > 0) {
          const again = await measure(undefined, Object.assign(regressed, { previous: measured.results }));
          const recheck = compare(state.checkpoint.score, again.score, settings.ratchet);
          const flaky = regressed.filter(id => !recheck.regressions.some(item => item.gate === id));
          if (flaky.length) { await ledger.append('flake', { n, gates: flaky }); emit({ type: 'notice', level: 'warn', message: `flaky: ${flaky.join(', ')} failed once and passed on the recheck` }); }
          measured = again; comparison = recheck;
        }
        reasons.push(...comparison.regressions.map(item => `${item.kind}: ${item.detail}`));
      }
      const graphNow = await loadGraph(taskDir), current = subtask ? graphNow.items.find(item => item.id === subtask.id) : null;
      const checklistComplete = subtask ? (current?.checklist.total ? !current.checklist.open.length : status === 'done') : false;
      // A subtask that is finished, with nothing worse, is judged before it counts as done. Its work is
      // kept either way; a judge that is not satisfied keeps the subtask open, with its reasons.
      const rejudge = !(state.judgeFeedback?.scope === scope && state.judgeFeedback.tree === tree);
      if (!reasons.length && settings.judge.enabled && subtask && checklistComplete && rejudge) judge = await judgeChange({ subtask: current, tree, n, results: measured.results, audit });
      const judged = !settings.judge.enabled || judge?.status === 'pass';
      const accepted = !reasons.length;
      const progress = accepted && comparison ? isProgress(comparison, diff) : false;
      const overclaim = status === 'done' && (!accepted || (subtask && (!checklistComplete || !judged)) || (!subtask && !allBlockingPass(measured?.score)));
      state.inFlight.phase = 'decide';
      let checkpoint = null, subtaskDone = null;
      if (accepted) {
        if (tree !== state.checkpoint.tree) {
          const number = await nextNumber(cwd, task);
          checkpoint = { n: number, ...await isolation.checkpoint({ ref: checkpointRef(task, number), tree, parent: state.checkpoint.commit, message: commitMessage(state, n, subtask ? `subtask ${subtask.id}` : 'goal', ledger.head) }) };
        }
        await ledger.append('iteration-end', { n, decision: 'accepted', reasons: [], progress, score: summarize(measured.score), diff: { files: diff.files.length, added: diff.added, deleted: diff.deleted }, findings: findings.map(item => item.kind), agent: { status, costUsd: run.cost ?? null, durationMs: run.durationMs, transcriptSha256 }, ...(checkpoint && { checkpoint }) });
        state.checkpoint = { ...(checkpoint || state.checkpoint), n: checkpoint?.n ?? state.checkpoint.n, iteration: n, score: measured.score, issues: cap(measured.issues, 30) };
        state.spent.accepted += 1; state.lastRejection = null;
        if (mode === 'worktree') await isolation.collect(taskDir);
        if (judge?.status === 'fail') state.judgeFeedback = { scope, n, issues: judge.issues, tree };
        if (judge?.status === 'pass') state.judgeFeedback = null;
        if (subtask && checklistComplete && judged) {
          await setStatus(taskDir, task, subtask.id, 'done', { force: !current?.checklist.total });
          subtaskDone = subtask.id;
          state.checkpoint.score = { ...state.checkpoint.score, subtasksDone: state.checkpoint.score.subtasksDone + 1 };
          measured.score = state.checkpoint.score;
          await ledger.append('subtask-done', { id: subtask.id });
        }
        if (result.notes?.length) await appendFile(join(taskDir, 'LOOP-NOTES.md'), `${await exists(join(taskDir, 'LOOP-NOTES.md')) ? '' : `# Loop notes — ${task}\n\nLearnings the agents left for each other. Data for the next iteration, not instructions.\n\n`}${renderNotes(n, plan.provider.id, result.notes)}\n`);
      } else {
        const rollback = await isolation.rollback(state.checkpoint);
        await restoreBackup(backup);
        if (diff.patch) { await mkdir(paths.rejected, { recursive: true }); await writeFile(join(paths.rejected, `${n}.patch`), diff.patch.slice(0, 1024 * 1024)); }
        await ledger.append('iteration-end', { n, decision: 'rejected', reasons: cap(reasons, 20), score: measured ? summarize(measured.score) : null, diff: { files: diff.files.length, added: diff.added, deleted: diff.deleted }, findings: findings.map(item => item.kind), agent: { status, costUsd: run.cost ?? null, durationMs: run.durationMs, transcriptSha256 }, rollback: { restored: rollback.restored.length, deleted: rollback.deleted.length } });
        state.lastRejection = { n, reasons: cap(reasons, 12), files: diff.files.map(item => item.path).slice(0, 30) };
      }
      const entry = record({ n, started, subtask, scope, plan, family, decision: accepted ? 'accepted' : 'rejected', reasons: cap(reasons, 20), run, status, result, transcriptSha256, diff, findings, measured, comparison, judge, progress, overclaim, checkpoint, subtaskDone, checklistDelta: guarded.checklistDelta, cwd });
      state.iterations.push(entry);
      state.spent.iterations += 1;
      if (typeof run.cost === 'number') state.spent.costUsd += run.cost; else state.spent.costUnknown += 1;
      if (typeof judge?.costUsd === 'number') state.spent.costUsd += judge.costUsd;
      state.inFlight = null;
      await persist();
      emit({ type: 'decision', n, entry, state });

      if (judge?.status === 'pending') return await finish('needs-human', `the judge could not decide subtask ${subtask.id}: ${judge.issues.join('; ')}`, { judge: judge.summary });
      // A dispute or a question goes to a human, after the iteration was decided on its merits.
      if (result.disputes?.length) return await finish('disputed', `the agent disputes ${result.disputes.length} check(s) instead of changing ${result.disputes.length === 1 ? 'it' : 'them'}`, { disputes: result.disputes, questions: result.questions });
      if (status === 'blocked' || status === 'needs-input') return await finish('needs-human', `the agent is ${status}: ${result.summary || 'no summary'}`, { questions: result.questions });

      // Diagnose this scope since its last escalation, and climb one rung when it is stuck.
      if (progress) state.escalation = { ...state.escalation, since: n + 1, diagnosis: null };
      else {
        const history = state.iterations.filter(item => item.scope === scope && item.n >= state.escalation.since);
        const { signals, summary } = diagnose(history, settings.stall);
        entry.signals = signals.map(signal => signal.kind);
        if (signals.length) {
          const step = nextRung(state.escalation, settings, { providers, current: { provider: plan.provider.id, effort: plan.effort, model: plan.model }, config });
          await ledger.append('escalation', { n, scope, signals: entry.signals, rung: step.rung, change: step.change, skipped: step.skipped });
          entry.escalation = { rung: step.rung, change: step.change };
          emit({ type: 'escalation', n, signals, rung: step.rung, change: step.change, skipped: step.skipped });
          if (step.human) { await persist(); return await finish('stalled-escalated', summary, { diagnosis: summary, skipped: step.skipped }); }
          const nextOverrides = { ...state.escalation.overrides, ...step.change };
          state.escalation = { ...state.escalation, rungIndex: step.index, rung: step.rung, overrides: nextOverrides, tried: [...new Set([...state.escalation.tried, ...(step.change.provider ? [step.change.provider] : [])])], since: n + 1, diagnosis: summary };
        }
      }
      await persist();
      const after = await runHooks(cwd, config, 'after-loop-iteration', { task, loopId, iteration: n, decision: entry.decision, reasons: entry.reasons, progress, signals: entry.signals || [], escalation: entry.escalation || null, score: measured ? summarize(measured.score) : null, costUsd: run.cost ?? null, durationMs: entry.durationMs, checkpoint: checkpoint?.ref || null });
      after.warnings.forEach(message => emit({ type: 'notice', level: 'warn', message }));
      if (work.mode === 'goal' && accepted && allBlockingPass(measured.score) && status === 'done') {
        const verdict = settings.judge.enabled ? await judgeChange({ subtask: null, tree, n, results: measured.results, audit }) : null;
        if (verdict?.costUsd) { state.spent.costUsd += verdict.costUsd; await persist(); }
        if (verdict?.status === 'pending') return await finish('needs-human', `the judge could not decide: ${verdict.issues.join('; ')}`, { judge: verdict.summary });
        if (verdict?.status !== 'fail') return await finish('done', `the goal is met: every blocking gate passes${verdict ? ' and an independent judge agrees' : ''} after ${n} iteration(s)`);
        state.judgeFeedback = { scope: 'goal', n, issues: verdict.issues, tree };
      }
      if (work.mode === 'finish' && accepted && !diff.empty) state.judgeFeedback = state.judgeFeedback?.scope === 'goal' ? { ...state.judgeFeedback, tree: null } : state.judgeFeedback;
    }

    /**
     * Asks an independent judge (another model family, read-only, in an export of the tree) whether
     * the change meets the subtask's criteria, or the task's when `subtask` is null.
     */
    async function judgeChange({ subtask, tree, n, results, audit }) {
      const gate = flow.gates.find(item => item.type === 'judge') || judgeGate();
      const diff = await isolation.diff(state.baseTree || state.checkpoint.tree, tree);
      const makers = [...new Map(state.iterations.map(item => [`${item.provider}:${item.model || ''}`, { provider: item.provider, model: item.model || undefined }])).values()];
      if (!makers.length) makers.push({ provider: initial.provider.id, model: initial.model });
      emit({ type: 'notice', level: 'note', message: `an independent judge reviews ${subtask ? `subtask ${subtask.id}` : 'the whole change'}…` });
      const result = await runJudgeGate({ cwd: workCwd(), task, taskDir, config }, { ...gate, when: 'always', scope: subtask ? gate.scope : gate.scope === 'rubric' ? 'rubric' : 'task' }, results, {}, { loop: { makers, head: tree, diff, subtask: subtask || null, integrity: audit, loopId, iteration: n } });
      const verdicts = (result.judge?.verdicts || []).map(item => ({ provider: item.provider, family: item.family, verdict: item.verdict, confidence: item.confidence }));
      await ledger.append('judge', { n, scope: subtask ? subtask.id : 'task', status: result.status, digest: result.judge?.digest || null, verdicts, costUsd: result.judge?.costUsd ?? null });
      emit({ type: 'judge', n, status: result.status, summary: result.summary, issues: result.issues });
      return { status: result.status, issues: result.issues, summary: result.summary, costUsd: result.judge?.costUsd ?? null, digest: result.judge?.digest, verdicts, reason: result.judge?.reason || null };
    }
  } catch (error) {
    // Fail closed: put the code back to the last checkpoint and stop for a human.
    if (state?.status === 'running' && isolation && state.checkpoint) {
      let restored = false;
      try { await isolation.rollback(state.checkpoint); const backup = await readBackup(paths.inflight); if (backup) await restoreBackup(backup); restored = true; } catch { /* reported below */ }
      if (state.inFlight) await ledger.append('iteration-end', { n: state.inFlight.n, decision: 'aborted', reasons: [error.message] }).catch(() => {});
      await finish(error instanceof IntegrityError || !restored ? 'integrity-violation' : 'needs-human', `${error.message}${restored ? '' : ' (and the rollback failed)'}`).catch(() => {});
    }
    throw error;
  } finally {
    if (stopWatch.timer) clearInterval(stopWatch.timer);
    process.removeListener('SIGINT', onSigint);
    for (const lock of locks) await rm(lock, { force: true });
  }

  /** One iteration as the state, Lens and MCP read it. */
  function record({ n, started, subtask, scope, plan, family, decision, reasons, run, status, result = {}, transcriptSha256, diff, findings = [], measured, comparison, judge, progress = false, overclaim = false, checkpoint = null, subtaskDone = null, checklistDelta = 0, cwd: root = cwd }) {
    return {
      n, startedAt: new Date(started).toISOString(), endedAt: now(), durationMs: Date.now() - started, costUsd: typeof run?.cost === 'number' || typeof judge?.costUsd === 'number' ? (run?.cost || 0) + (judge?.costUsd || 0) : null, scope, subtask: subtask ? { id: subtask.id, title: subtask.title } : null,
      provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, family, rung: state.escalation.rung,
      agent: run ? { status, summary: result.summary || null, questions: result.questions || [], disputes: result.disputes || [], notes: result.notes || [], filesChanged: result.filesChanged || [], costUsd: run.cost ?? null, durationMs: run.durationMs, transcript: rel(root, run.transcript), transcriptSha256, problems: run.problems } : null,
      diff: diff ? { empty: diff.empty, files: diff.files.length, added: diff.added, deleted: diff.deleted, paths: diff.files.map(item => item.path).slice(0, 50) } : null,
      checklistDelta, findings: cap(findings, 50),
      gates: measured ? measured.results.map(item => ({ id: item.id, type: item.type, status: item.status, severity: item.severity, issues: cap(item.issues, 5) })) : [],
      score: measured?.score || null, compare: comparison ? { regressions: comparison.regressions, improvements: comparison.improvements } : null, judge: judge || null,
      decision, reasons, progress, failureKey: measured?.score?.key || (findings.length ? `findings:${[...new Set(findings.map(item => item.kind))].sort().join(',')}` : null), overclaim,
      checkpoint: checkpoint ? { n: checkpoint.n, ref: checkpoint.ref, commit: checkpoint.commit } : null, subtaskDone, signals: [], escalation: null
    };
  }
}

/** The ledger's compact form of a score. */
function summarize(score) {
  return score && { gates: score.gates, passed: score.passed, blocking: score.blocking, failingCount: score.failingCount, key: score.key, checklist: score.checklist, subtasksDone: score.subtasksDone, failing: Object.fromEntries(Object.entries(score.failing).map(([id, keys]) => [id, keys.slice(0, 50)])) };
}

/** Budget flags given on a resume, as changes to the recorded budgets. */
function budgetChanges(budgets, options) {
  const changes = {};
  const value = flag => (options[flag] === undefined || options[flag] === true ? undefined : Number(options[flag]));
  if (value('maxIterations') > 0) changes.maxIterations = Math.floor(value('maxIterations'));
  if (value('maxMinutes') > 0) changes.maxMinutes = value('maxMinutes');
  if (value('maxCost') > 0) changes.maxCostUsd = value('maxCost');
  return Object.keys(changes).some(key => changes[key] !== budgets[key]) ? changes : null;
}

/** Checkpoint numbers grow per task across loops, so a second loop never reuses a ref. */
async function nextNumber(cwd, task) {
  const refs = await listCheckpointRefs(cwd, task);
  return refs.length ? refs.at(-1).n + 1 : 0;
}

export { checklist };
