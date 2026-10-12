import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EFFORTS, INTEGRITY_LEVELS, LOOP_LADDER_STEPS } from '../core/enums.js';
import { DEFAULT_FEEDBACK, FEEDBACK_LEVELS } from './feedback.js';

// The vocabulary of a loop: its outcomes, defaults and where it keeps its state. A loop is a
// sequence of fresh-context agent iterations over a task; the harness, not the agent, decides
// each one, keeps what passes and rolls back what does not.

export const LOOP_SCHEMA = 'maverick.loop/v1';

/** How a loop ends. `running` is the only non-terminal state. */
export const LOOP_OUTCOMES = ['running', 'done', 'budget-exceeded', 'stalled-escalated', 'disputed', 'needs-human', 'holdout-gap', 'aborted', 'integrity-violation'];
/** A plain `loop run` continues these (a budget only when the new budget leaves room). */
export const LOOP_RESUMABLE = ['aborted', 'budget-exceeded'];
/** These wait for a human: `loop run --resume --note "..."` records the decision and continues. */
export const LOOP_HUMAN = ['stalled-escalated', 'disputed', 'needs-human', 'holdout-gap', 'integrity-violation'];
/** Whether a task's sealed tests decide its loop. */
export const LOOP_SEALED = ['auto', 'required', 'off'];

/** Defaults when neither `loop` in the configuration nor a flag says otherwise. */
export const LOOP_DEFAULTS = {
  flow: 'loop',
  providers: [],
  isolation: 'in-place',
  worktreeDir: null,
  setup: [],
  setupTimeoutMinutes: 20,
  budgets: { maxIterations: 10, maxMinutes: 120, maxCostUsd: null, maxTokens: null, forecast: 'p90' },
  stall: { window: null, churnLines: 300, rollbackStreak: 3, overclaims: 2 },
  escalation: ['retry-with-diagnosis', 'raise-effort', 'switch-provider', 'human'],
  maxEffort: 'xhigh',
  // Secrets are never part of a change an agent makes on its own.
  protectedPaths: ['**/.env', '**/.env.*'],
  blastRadius: { maxFiles: 25, maxLines: 1500 },
  integrity: { level: 'standard', severity: {}, allow: [] },
  ratchet: { newFailures: 'count', recheck: 1 },
  gateTimeoutMinutes: 20,
  stopPollMs: 500,
  judge: { enabled: false, prefer: [], isolation: 'export' },
  // What the next agent learns from a rejection or a verdict: see src/loop/feedback.js.
  feedback: DEFAULT_FEEDBACK,
  // A task's sealed tests decide its loop when they are ready (auto), always (required: the loop refuses without them) or never (off).
  sealed: 'auto'
};

const number = value => (value === undefined || value === null || value === true || value === '' ? undefined : Number(value));

/**
 * Settings for one loop run: defaults < `config.loop` < command-line flags. The escalation
 * ladder always ends with a human, so a stuck loop can never escalate forever.
 */
export function loopSettings(config = {}, flow, flags = {}) {
  const loop = config.loop || {}, d = LOOP_DEFAULTS;
  const integrity = typeof loop.integrity === 'string' ? { level: loop.integrity } : loop.integrity || {};
  const budgets = { ...d.budgets, ...loop.budgets };
  for (const [flag, key] of [['maxIterations', 'maxIterations'], ['maxMinutes', 'maxMinutes'], ['maxCost', 'maxCostUsd'], ['maxTokens', 'maxTokens']]) {
    const value = number(flags[flag]);
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`--${flag.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)} must be a positive number`);
    budgets[key] = ['maxIterations', 'maxTokens'].includes(key) ? Math.floor(value) : value;
  }
  const escalation = (loop.escalation || d.escalation).filter(step => LOOP_LADDER_STEPS.includes(step));
  if (escalation.at(-1) !== 'human') escalation.push('human');
  const level = typeof flags.integrity === 'string' ? flags.integrity : integrity.level || d.integrity.level;
  if (!INTEGRITY_LEVELS.includes(level)) throw new Error(`integrity level must be one of ${INTEGRITY_LEVELS.join(', ')}`);
  const isolation = flags.worktree ? 'worktree' : flags.inPlace ? 'in-place' : loop.isolation || d.isolation;
  const feedback = typeof flags.feedback === 'string' ? flags.feedback : loop.feedback || d.feedback;
  if (!FEEDBACK_LEVELS.includes(feedback)) throw new Error(`--feedback must be one of ${FEEDBACK_LEVELS.join(', ')}`);
  const sealed = typeof flags.sealed === 'string' ? flags.sealed : loop.sealed || d.sealed;
  if (!LOOP_SEALED.includes(sealed)) throw new Error(`--sealed must be one of ${LOOP_SEALED.join(', ')}`);
  return {
    flow: typeof flags.flow === 'string' ? flags.flow : loop.flow || d.flow,
    providers: loop.providers || d.providers,
    isolation,
    worktreeDir: loop.worktreeDir || d.worktreeDir,
    setup: loop.setup || d.setup,
    setupTimeoutMinutes: loop.setupTimeoutMinutes || d.setupTimeoutMinutes,
    budgets,
    stall: { ...d.stall, ...loop.stall, window: loop.stall?.window || flow?.contract?.noProgressWindow || 2 },
    escalation,
    maxEffort: EFFORTS.includes(loop.maxEffort) ? loop.maxEffort : d.maxEffort,
    protectedPaths: loop.protectedPaths || d.protectedPaths,
    blastRadius: { ...d.blastRadius, ...loop.blastRadius },
    integrity: { level, severity: integrity.severity || {}, allow: integrity.allow || [] },
    ratchet: { ...d.ratchet, ...loop.ratchet },
    gateTimeoutMinutes: loop.gateTimeoutMinutes || d.gateTimeoutMinutes,
    stopPollMs: loop.stopPollMs || d.stopPollMs,
    judge: { ...d.judge, ...loop.judge, ...(flags.judge && { enabled: true }) },
    feedback,
    sealed
  };
}

/** Where a task's loops live: `<task>/loops/<loopId>/`, git-ignored, next to `flows/` and `runs/`. */
export function loopPaths(taskDir, loopId) {
  const root = join(taskDir, 'loops'), dir = loopId ? join(root, loopId) : null;
  return {
    root, dir, taskLock: join(root, 'lock'),
    ...(dir && { state: join(dir, 'state.json'), ledger: join(dir, 'ledger.jsonl'), stop: join(dir, 'stop.json'), gitIndex: join(dir, 'git-index'), inflight: join(dir, 'inflight'), rejected: join(dir, 'rejected') })
  };
}

/** `20261011-142233-a1b2`: sortable by start time, unique within a second. */
export function newLoopId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

export const LOOP_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

/** Every loop of a task, newest first. */
export async function loopIds(taskDir) {
  return (await readdir(join(taskDir, 'loops'), { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory() && LOOP_ID.test(entry.name)).map(entry => entry.name).sort().reverse();
}

/** What a human does next after each outcome. */
export const NEXT_STEP = {
  running: 'The loop is running. Watch it with maverick loop status, or stop it with maverick loop stop.',
  done: 'Every subtask is done and every blocking gate passes. Review the change, then run the ship flow for the human review.',
  'budget-exceeded': 'The budget ran out, or the next iteration would exceed it. Raise the budget (--max-iterations, --max-minutes, --max-cost, --max-tokens) and run the loop again.',
  'stalled-escalated': 'The loop stopped making progress and ran out of escalation steps. Read LOOP-ESCALATION.md, then resume with --resume --note "<your guidance>", or start over with --new.',
  disputed: 'The agent disputes a check instead of changing it. Decide the dispute (fix the check, or tell the agent it is right), then resume with --resume --note "<decision>".',
  'needs-human': 'The agent or the harness needs a decision. Read LOOP-ESCALATION.md, then resume with --resume --note "<answer>".',
  aborted: 'The loop was stopped. Run it again to continue from the last accepted checkpoint.',
  'holdout-gap': 'Every visible check passes, but the sealed tests the builder never saw do not. Read them in your terminal with maverick seal status --reveal: if they are right, resume with --resume --note "<the missing behavior, not the test>"; if one is wrong, seal the task again; to finish without them, resume with --sealed off.',
  'integrity-violation': 'Something outside the agent\'s remit changed (history, refs or the ledger). Run maverick loop verify, inspect the repository, then start over with --new.'
};
