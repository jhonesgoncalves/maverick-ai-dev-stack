import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { homePath } from '../core/home.js';
import { detectStack } from '../core/stack.js';
import { getTask } from '../core/tasks.js';
import { exists, pretty } from '../core/util.js';
import { runJudgeGate } from '../flows/judge.js';
import { judgeGate } from '../flows/model.js';
import { readState, runLoop } from '../loop/engine.js';
import { commitTree, git, inPlace, repoInfo, treeDiff } from '../loop/git.js';
import { openLedger, readLedger, verifyChain } from '../loop/ledger.js';
import { loopSettings, newLoopId } from '../loop/model.js';
import { allBlockingPass } from '../loop/ratchet.js';
import { runAblation } from '../proof/ablation.js';
import { checkArchitecture } from '../proof/architecture.js';
import { familyOf } from '../runtime/families.js';
import { resolveRun } from '../runtime/policy.js';
import { providersFor } from '../runtime/providers.js';
import { sealedSettings, sealReadiness } from '../sealed/model.js';
import { querySeal } from '../sealed/seal.js';
import { harnessWrite, loadGraph, setStatus, withGraphLock } from '../subtasks/graph.js';

// The arena: the same subtask, built by several providers at once, each in a worktree of its own
// from the same snapshot of your working copy, each by a bounded loop the harness decides. The
// winner comes out of evidence, not out of an opinion: the oracle, the sealed holdout, integrity,
// ablation, the architecture delta, the size of the diff and a judge from a model family none of
// the competitors belongs to. A human confirms; the winner's change is applied to the working
// copy, and the others stay as rejected patches whose loops feed the scorecard.

export const ARENA_SCHEMA = 'maverick.arena/v1';
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const competitorId = provider => provider.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'agent';

export const arenaDir = taskDir => join(taskDir, 'arena');
const recordPath = (taskDir, id) => join(arenaDir(taskDir), `${id}.json`);
const ledgerPath = (taskDir, id) => join(arenaDir(taskDir), `${id}.jsonl`);
const baseRef = (task, id) => `refs/maverick/arena/${task}/${id}/base`;
const finalRef = (task, id, competitor) => `refs/maverick/arena/${task}/${id}/${competitor}`;

/** Copies what a loop needs from the main checkout into a competitor's worktree: configuration, flows and the task (without its loops and runs). */
export async function seedWorktree(cwd, workCwd, taskDir) {
  const from = join(cwd, '.maverick'), to = join(workCwd, '.maverick');
  await mkdir(to, { recursive: true });
  for (const name of ['config.json', 'policy.json']) if (await exists(join(from, name))) await cp(join(from, name), join(to, name));
  if (await exists(join(from, 'flows'))) await cp(join(from, 'flows'), join(to, 'flows'), { recursive: true });
  const target = join(workCwd, relative(cwd, taskDir));
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(taskDir)) if (!['loops', 'runs', 'arena'].includes(entry)) await cp(join(taskDir, entry), join(target, entry), { recursive: true });
  return target;
}

/**
 * The evidence on one competitor's change, gathered by the harness: what it scored, what the
 * holdout and the judge say, whether its new tests can fail and whether the architecture got
 * worse. Missing evidence is recorded as missing, never as a pass.
 */
async function evidenceOf({ cwd, task, taskDir, config, stack, competitor, base, makers, subtask, signal }) {
  const state = competitor.loopId ? await readState(competitor.taskDir, competitor.loopId).catch(() => null) : null;
  const head = state?.checkpoint?.tree || base.tree;
  const diff = await treeDiff(cwd, base.tree, head);
  const iterations = state?.iterations || [];
  const findings = iterations.flatMap(item => item.findings || []);
  const evidence = {
    outcome: state?.status || 'error', reason: state?.reason || competitor.error || null,
    tree: head, commit: state?.checkpoint?.commit || null, score: state?.checkpoint?.score || null,
    oracle: allBlockingPass(state?.checkpoint?.score),
    integrity: { blocking: findings.filter(item => item.severity === 'block').length, warnings: findings.filter(item => item.severity === 'warn').length, tainted: Boolean(state?.checkpoint?.tainted) },
    diff: { files: diff.files.length, lines: diff.added + diff.deleted },
    iterations: iterations.length, model: iterations[0]?.model || null, effort: iterations[0]?.effort || null, costUsd: state?.spent?.costUsd ?? null, tokens: state?.spent?.tokens ?? null,
    sealed: null, ablation: null, architecture: null, judge: null
  };
  if (state?.status !== 'done' || diff.empty) return evidence;
  const settings = loopSettings(config, null, {});
  evidence.ablation = await runAblation({ cwd: competitor.workCwd, taskDir: competitor.taskDir, config, stack, base: base.tree, head, diff, settings, signal }).then(report => ({ ok: report.ok, vacuous: report.stats.vacuous || 0, tests: report.stats.tests || 0 })).catch(error => ({ error: error.message }));
  evidence.architecture = await checkArchitecture({ cwd: competitor.workCwd, taskDir: competitor.taskDir, config, base: base.tree, head }).then(report => ({ ok: report.ok, findings: report.findings.length, health: report.head?.health ?? null })).catch(error => ({ error: error.message }));
  const readiness = await sealReadiness(taskDir, sealedSettings(config)).catch(() => ({ state: 'missing' }));
  if (readiness.state === 'ready') evidence.sealed = await querySeal({ cwd, task, taskDir, config, stack, tree: head, scope: `arena ${competitor.id}`, signal }).then(result => ({ S: result.metrics.S, passed: result.metrics.passed, total: result.metrics.total })).catch(error => ({ error: error.message }));
  // The judge comes from a family none of the competitors belongs to, so no competitor is judged by its own kind.
  const verdict = await runJudgeGate({ cwd: competitor.workCwd, task, taskDir: competitor.taskDir, config, reportDir: homePath(cwd, 'reports', task, 'arena', competitor.arenaId, competitor.id) }, judgeGate({ id: 'arena-judge' }), [], {}, { loop: { makers, head, diff, subtask, integrity: { findings }, loopId: competitor.loopId, iteration: iterations.length, signal } }).catch(error => ({ status: 'pending', issues: [error.message], judge: null }));
  evidence.judge = { status: verdict.status, confidence: verdict.judge?.verdicts?.[0]?.confidence ?? null, judges: (verdict.judge?.verdicts || []).map(item => ({ provider: item.provider, family: item.family, verdict: item.verdict })), issues: (verdict.issues || []).slice(0, 5) };
  return evidence;
}

/**
 * The order of the competitors by evidence: the oracle, the holdout, integrity, the judge,
 * vacuous tests, the architecture, then the smaller diff. Each step only breaks the ties of the
 * one before; the reason the winner won is the first step where it was ahead.
 */
export function rankCompetitors(competitors) {
  const keys = [
    ['finished', item => (item.evidence.outcome === 'done' ? 1 : 0)],
    ['oracle', item => (item.evidence.oracle ? 1 : 0)],
    ['sealed', item => item.evidence.sealed?.S ?? -1],
    ['integrity', item => -(item.evidence.integrity.blocking * 10 + item.evidence.integrity.warnings + (item.evidence.integrity.tainted ? 5 : 0))],
    ['judge', item => (item.evidence.judge?.status === 'pass' ? 2 : item.evidence.judge?.status === 'pending' ? 1 : 0) + (item.evidence.judge?.confidence || 0) / 10],
    ['ablation', item => -(item.evidence.ablation?.vacuous ?? 0)],
    ['architecture', item => (item.evidence.architecture?.ok === false ? -1 - item.evidence.architecture.findings : 0)],
    ['diff', item => -item.evidence.diff.lines]
  ];
  const sorted = [...competitors].sort((a, b) => { for (const [, key] of keys) { const delta = key(b) - key(a); if (delta) return delta; } return 0; });
  const [first, second] = sorted;
  const decisive = second ? keys.find(([, key]) => key(first) !== key(second)) : null;
  const tie = Boolean(second) && !decisive;
  return { order: sorted.map(item => item.id), winner: first && first.evidence.outcome === 'done' && !tie ? first.id : null, decidedBy: decisive?.[0] || null, tie };
}

/** Runs an arena for one subtask. `emit` receives each competitor's loop events, tagged with its id. */
export async function runArena({ cwd, task, subtask: subtaskId, providers: wanted, options = {}, emit = () => {} }) {
  const { dir: taskDir, config } = await getTask(cwd, task);
  const ids = [...new Set((Array.isArray(wanted) ? wanted : String(wanted || '').split(',')).map(item => item.trim()).filter(Boolean))];
  if (ids.length < 2) throw new Error('an arena needs at least two providers: --providers claude-code,codex');
  const all = providersFor(config);
  for (const id of ids) resolveRun(config, { provider: id, stage: 'build' }, all);
  const graph = await loadGraph(taskDir), subtask = graph.items.find(item => item.id === String(subtaskId || '').padStart(2, '0'));
  if (!subtask) throw new Error(`subtask ${subtaskId} not found; subtasks: ${graph.items.map(item => item.id).join(', ') || 'none'}`);
  if (subtask.status === 'done') throw new Error(`subtask ${subtask.id} is already done`);
  if (subtask.dependsOn.some(dep => graph.items.find(item => item.id === dep)?.status !== 'done')) throw new Error(`subtask ${subtask.id} depends on unfinished ${subtask.dependsOn.join(', ')}`);
  const info = await repoInfo(cwd);
  if (!info.repo || !info.head) throw new Error('an arena needs a git repository with a commit');
  const arenaId = newLoopId(), stack = await detectStack(cwd);
  // Every competitor starts from the same snapshot of the working copy, kept alive by a ref.
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-arena-'));
  let base;
  try {
    const tree = await inPlace({ cwd, task, indexFile: join(scratch, 'index'), inflight: scratch }).snapshot();
    base = { tree, commit: await commitTree(cwd, tree, info.head, `maverick arena ${task} ${arenaId}: base\n`) };
  } finally { await rm(scratch, { recursive: true, force: true }); }
  await git(cwd, ['update-ref', baseRef(task, arenaId), base.commit]);
  const root = homePath(cwd, 'arena', task, arenaId);
  const competitors = [];
  for (const provider of ids) {
    const id = competitorId(provider), location = join(root, id);
    if (competitors.some(item => item.id === id) || !ID.test(id)) throw new Error(`two providers map to the competitor id ${id}`);
    const added = await git(cwd, ['worktree', 'add', '-q', '--detach', location, base.commit]);
    if (!added.ok) throw new Error(`could not create the arena worktree for ${provider}: ${added.stderr.trim()}`);
    const workCwd = join(location, info.prefix || '');
    competitors.push({ id, provider, location, workCwd, taskDir: await seedWorktree(cwd, workCwd, taskDir), arenaId, family: familyOf({ provider }, config).family });
  }
  await mkdir(arenaDir(taskDir), { recursive: true });
  const ledger = await openLedger(ledgerPath(taskDir, arenaId), arenaId, { schema: ARENA_SCHEMA });
  await ledger.append('arena-start', { task, subtask: subtask.id, base, competitors: competitors.map(item => ({ id: item.id, provider: item.provider, family: item.family })) });
  emit({ type: 'arena-start', arenaId, subtask: { id: subtask.id, title: subtask.title }, competitors: competitors.map(item => ({ id: item.id, provider: item.provider })) });

  // The competitors run at once: each loop is bounded by its own budget and decided by the harness.
  const budget = Object.fromEntries(['maxIterations', 'maxMinutes', 'maxCost', 'maxTokens', 'flow', 'feedback', 'integrity'].filter(key => options[key] !== undefined && options[key] !== true).map(key => [key, options[key]]));
  await Promise.all(competitors.map(async competitor => {
    try {
      const result = await runLoop({ cwd: competitor.workCwd, task, options: { ...budget, provider: competitor.provider, new: true, arena: { id: arenaId, competitor: competitor.id, subtask: subtask.id } }, emit: event => emit({ ...event, competitor: competitor.id }) });
      competitor.loopId = result.state.loopId;
    } catch (error) {
      competitor.error = error.message;
      const states = (await readdir(join(competitor.taskDir, 'loops')).catch(() => [])).filter(name => /^\d{8}-/.test(name));
      competitor.loopId = states.sort().at(-1) || null;
    }
  }));

  // Evidence, one competitor at a time: the holdout and the judges are shared resources.
  const makers = competitors.map(item => ({ provider: item.provider }));
  for (const competitor of competitors) {
    emit({ type: 'arena-evidence', competitor: competitor.id });
    competitor.evidence = await evidenceOf({ cwd, task, taskDir, config, stack, competitor, base, makers, subtask, signal: options.signal });
    if (competitor.evidence.commit) await git(cwd, ['update-ref', finalRef(task, arenaId, competitor.id), competitor.evidence.commit]);
  }
  const ranking = rankCompetitors(competitors);
  const record = {
    schema: ARENA_SCHEMA, id: arenaId, task, subtask: { id: subtask.id, title: subtask.title, type: subtask.type || null, complexity: subtask.complexity || null },
    createdAt: new Date().toISOString(), base, ranking, decision: null,
    competitors: competitors.map(({ id, provider, family, location, loopId, error, evidence }) => ({ id, provider, family, location, loopId, error: error || null, evidence: redact(evidence) }))
  };
  // The full evidence (holdout numbers included) stays outside the work tree; the task keeps what a builder may read.
  const reports = homePath(cwd, 'reports', task, 'arena', arenaId);
  await mkdir(reports, { recursive: true });
  await writeFile(join(reports, 'arena.json'), pretty({ ...record, competitors: competitors.map(({ id, provider, family, loopId, evidence }) => ({ id, provider, family, loopId, evidence })) }));
  await writeFile(recordPath(taskDir, arenaId), pretty(record));
  await ledger.append('arena-ranked', { ranking, evidence: competitors.map(item => ({ id: item.id, outcome: item.evidence.outcome, oracle: item.evidence.oracle, tree: item.evidence.tree, judge: item.evidence.judge?.status || null, diff: item.evidence.diff.lines })) });
  // Each competitor's loop joins the task's loops, so the scorecard and Lens see every attempt.
  for (const competitor of competitors) if (competitor.loopId) await cp(join(competitor.taskDir, 'loops', competitor.loopId), join(taskDir, 'loops', competitor.loopId), { recursive: true }).catch(() => {});
  emit({ type: 'arena-end', record });
  return record;
}

/** The task copy of the evidence leaves out the holdout's numbers: a later builder could read it. */
function redact(evidence) {
  if (!evidence?.sealed) return evidence;
  return { ...evidence, sealed: evidence.sealed.error ? { error: 'see the arena report' } : { ranked: true } };
}

export async function readArena(taskDir, id) {
  if (!ID.test(String(id || '')) && !/^\d{8}-\d{6}-[0-9a-f]{4}$/.test(String(id || ''))) throw new Error('a valid arena id is required');
  const record = await readFile(recordPath(taskDir, id), 'utf8').then(JSON.parse).catch(() => null);
  if (!record) throw new Error(`arena ${id} not found`);
  return record;
}

export async function listArenas(taskDir) {
  const names = (await readdir(arenaDir(taskDir)).catch(() => [])).filter(name => name.endsWith('.json')).sort().reverse();
  const records = [];
  for (const name of names) { const record = await readFile(join(arenaDir(taskDir), name), 'utf8').then(JSON.parse).catch(() => null); if (record) records.push(record); }
  return records;
}

/**
 * A human's decision: the winner (the evidence's, or another with a reason) is applied to the
 * working copy, which must still be the arena's base; its subtask is done; the others are
 * recorded as rejected. Whether the human agreed with the evidence is kept for `arena stats`.
 */
export async function confirmArena(cwd, task, id, { winner, by = process.env.USER || 'human', reason = null, keep = false } = {}) {
  const { dir: taskDir } = await getTask(cwd, task);
  const record = await readArena(taskDir, id);
  if (record.decision) throw new Error(`arena ${id} was decided by ${record.decision.by}`);
  const pick = winner || record.ranking.winner;
  if (!pick) throw new Error(`the evidence names no winner (${record.ranking.tie ? 'a tie' : 'no competitor finished'}); choose one with --winner <id>`);
  const chosen = record.competitors.find(item => item.id === pick);
  if (!chosen) throw new Error(`no competitor ${pick}; competitors: ${record.competitors.map(item => item.id).join(', ')}`);
  if (chosen.evidence.outcome !== 'done' || !chosen.evidence.commit) throw new Error(`${pick} did not finish the subtask (${chosen.evidence.outcome}); it cannot win`);
  if (pick !== record.ranking.winner && !reason) throw new Error(`${pick} is not the winner by evidence (${record.ranking.winner || 'none'}); say why with --reason`);
  // The change applies only on the tree it was built from: anything you changed since would be overwritten.
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-arena-'));
  try {
    const now = await inPlace({ cwd, task, indexFile: join(scratch, 'index'), inflight: scratch }).snapshot();
    if (now !== record.base.tree) throw new Error('the working copy changed since the arena started; commit or stash those changes, or run the arena again');
    // Both trees are whole-repository trees: the patch is made and applied from the root, so a nested project works too.
    const root = (await repoInfo(cwd)).root;
    const patch = (await git(root, ['diff', '--binary', '--no-color', record.base.tree, chosen.evidence.tree, '--', '.', ':(exclude,glob)**/.maverick/**', ':(exclude).maverick'])).stdout;
    if (patch) { const applied = await git(root, ['apply', '--whitespace=nowarn', '-'], { input: patch }); if (!applied.ok) throw new Error(`the winner's change did not apply: ${applied.stderr.trim()}`); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
  // The winner's ticked checklist comes with it; then the subtask is done in the task.
  const graph = await loadGraph(taskDir), item = graph.items.find(entry => entry.id === record.subtask.id);
  const theirs = await readFile(join(chosen.location, relative(cwd, taskDir), 'subtasks', item.file), 'utf8').catch(() => null);
  if (theirs) await withGraphLock(taskDir, () => harnessWrite(taskDir, join(taskDir, 'subtasks', item.file), theirs));
  await setStatus(taskDir, task, item.id, 'done', { force: true });
  const decision = { by, at: new Date().toISOString(), winner: pick, evidenceWinner: record.ranking.winner, agrees: pick === record.ranking.winner, reason };
  record.decision = decision;
  await writeFile(recordPath(taskDir, id), pretty(record));
  const ledger = await openLedger(ledgerPath(taskDir, id), id, { schema: ARENA_SCHEMA });
  await ledger.append('arena-decision', decision);
  for (const loser of record.competitors.filter(entry => entry.id !== pick && entry.loopId)) {
    const loopLedger = join(taskDir, 'loops', loser.loopId, 'ledger.jsonl');
    if (await exists(loopLedger)) await (await openLedger(loopLedger, loser.loopId)).append('arena-rejected', { arena: id, winner: pick, by });
  }
  if (!keep) for (const competitor of record.competitors) { await git(cwd, ['worktree', 'remove', '--force', competitor.location]); await rm(competitor.location, { recursive: true, force: true }); }
  await git(cwd, ['worktree', 'prune']);
  return { record, decision };
}

/** How often the winner by evidence was the human's choice, across every decided arena of the project. */
export async function arenaStats(cwd, tasks) {
  const decided = [];
  for (const { task, dir } of tasks) for (const record of await listArenas(dir)) if (record.decision) decided.push({ task, id: record.id, ...record.decision });
  const agreed = decided.filter(item => item.agrees).length;
  return { decided: decided.length, agreed, rate: decided.length ? agreed / decided.length : null, arenas: decided };
}

/** Re-checks an arena's ledger chain. */
export async function verifyArena(taskDir, id) {
  const entries = await readLedger(ledgerPath(taskDir, id));
  return verifyChain(entries, id, { schema: ARENA_SCHEMA });
}

