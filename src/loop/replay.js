import { getTask } from '../core/tasks.js';
import { providersFor } from '../runtime/providers.js';
import { checkBudget, wouldExceed } from './budget.js';
import { diagnose, nextRung } from './diagnose.js';
import { readState } from './engine.js';
import { readLedger } from './ledger.js';
import { loopPaths, loopSettings, newestTaskLoop } from './model.js';
import { allBlockingPass, compare, isProgress } from './ratchet.js';

// The flight recorder: a recorded loop replayed through the pure policy functions (budgets,
// the ratchet, the stall diagnosis and the escalation ladder) under other settings. Nothing
// runs: the agents' work is the recording, so the replay is exact until its first decision
// differs from the recorded one. From there on the real agent would have seen another
// checkpoint, another provider or another prompt, and the replay says so instead of guessing.

/** The settings `--set key=value` may change, with how their values parse. */
export const REPLAY_KEYS = {
  'budgets.maxIterations': 'int', 'budgets.maxMinutes': 'number', 'budgets.maxCostUsd': 'number', 'budgets.maxTokens': 'int', 'budgets.forecast': ['p90', 'mean', 'off'],
  'stall.window': 'int', 'stall.churnLines': 'int', 'stall.rollbackStreak': 'int', 'stall.overclaims': 'int',
  'yield.enabled': 'bool', 'yield.window': 'int', 'yield.metric': ['tokens', 'cost'], 'yield.floor': 'number',
  escalation: 'list', maxEffort: 'string', 'ratchet.newFailures': ['count', 'strict']
};

/** `stall.window=3` → a settings patch; unknown keys and bad values fail loudly. */
export function parseOverrides(pairs = []) {
  const patch = {};
  for (const pair of [pairs].flat().filter(Boolean)) {
    const at = pair.indexOf('=');
    if (at < 1) throw new Error(`--set takes key=value, got "${pair}"`);
    const key = pair.slice(0, at).trim(), raw = pair.slice(at + 1).trim(), kind = REPLAY_KEYS[key];
    if (!kind) throw new Error(`--set ${key}: not a replayable setting; use one of ${Object.keys(REPLAY_KEYS).join(', ')}`);
    let value;
    if (raw === 'null' || (raw === 'off' && kind !== 'bool' && !Array.isArray(kind))) value = null;
    else if (Array.isArray(kind)) { if (!kind.includes(raw)) throw new Error(`--set ${key} must be one of ${kind.join(', ')}`); value = raw; }
    else if (kind === 'bool') { if (!/^(true|false|on|off)$/.test(raw)) throw new Error(`--set ${key} must be true or false`); value = /^(true|on)$/.test(raw); }
    else if (kind === 'list') value = raw.split(',').map(item => item.trim()).filter(Boolean);
    else if (kind === 'string') value = raw;
    else {
      value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`--set ${key} must be a positive number`);
      if (kind === 'int') value = Math.floor(value);
    }
    const [head, tail] = key.split('.');
    if (tail) patch[head] = { ...patch[head], [tail]: value }; else patch[head] = value;
  }
  return patch;
}

/**
 * The settings the recorded loop ran with, as far as the record knows them: the budgets and
 * the ladder from the state, the rest from the current configuration (the stall, yield and
 * ratchet settings are not in the state; a changed configuration is reported as drift).
 */
export function recordedSettings(state, config = {}) {
  const base = loopSettings(config, { contract: {} });
  return { ...base, budgets: { ...base.budgets, ...state.budgets }, escalation: state.settings?.escalation || base.escalation, providers: state.settings?.providers || base.providers };
}

export function applyOverrides(settings, patch) {
  const next = { ...settings };
  for (const [key, value] of Object.entries(patch)) next[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...settings[key], ...value } : value;
  if (patch.escalation && next.escalation.at(-1) !== 'human') next.escalation = [...next.escalation, 'human'];
  return next;
}

const tokensOf = item => item.tokens?.totalTokens ?? (typeof item.tokens === 'number' ? item.tokens : null);
const blocking = item => (item.findings || []).some(finding => finding.severity === 'block');

/** Between-iteration events from the ledger, keyed by the number of the iteration they precede. */
function timeline(entries = []) {
  const before = new Map(), add = (n, event) => before.set(n, [...(before.get(n) || []), event]);
  let ended = 0;
  for (const entry of entries) {
    if (entry.type === 'iteration-end') ended = Math.max(ended, entry.data?.n || 0);
    else if (entry.type === 'resume' && entry.data?.score) add(ended + 1, { type: 'resume', score: entry.data.score });
    else if (entry.type === 'human-ack') add(ended + 1, { type: 'human-ack', by: entry.data?.by });
    else if (entry.type === 'budget-change') add(ended + 1, { type: 'budget-change', after: entry.data?.after });
  }
  return before;
}

/**
 * Replays `state.iterations` under `settings`. Returns one step per recorded iteration (what
 * the policy would have done, and whether it matches the record), where the replay stops, and
 * what stopping there saves compared with the recorded loop.
 */
export function replayLoop(state, { settings, overrides = {}, ledger = [], providers = [], config = {} } = {}) {
  const events = timeline(ledger), steps = [];
  let budgets = { ...settings.budgets }, prev = state.baseline || null;
  const fresh = (scope, since) => ({ scope, rungIndex: -1, tried: [state.initialProvider].filter(Boolean), since });
  let escalation = fresh(null, 1);
  const spent = { iterations: 0, activeMs: 0, costUsd: 0, tokens: 0 }, history = [];
  let stop = null, divergedAt = null;
  const iterations = [...(state.iterations || [])].sort((a, b) => a.n - b.n);
  // Budgets are checked before an iteration starts, as the engine does.
  const checkBudgets = n => {
    const hard = checkBudget(budgets, spent);
    if (hard) return { before: n, outcome: 'budget-exceeded', reason: hard.detail };
    const forecast = wouldExceed(budgets, spent, history, budgets.forecast);
    return forecast.stop ? { before: n, outcome: 'budget-exceeded', reason: forecast.detail } : null;
  };

  for (const recorded of iterations) {
    const n = recorded.n;
    for (const event of events.get(n) || []) {
      if (event.type === 'resume') prev = event.score;
      if (event.type === 'human-ack') escalation = { ...escalation, rungIndex: -1, since: n };
      // A budget a human raised on a resume still applies, except where the replay sets its own.
      if (event.type === 'budget-change' && event.after) budgets = { ...budgets, ...Object.fromEntries(Object.entries(event.after).filter(([key]) => !(key in (overrides.budgets || {})))) };
    }
    if ((stop = checkBudgets(n))) break;
    if (escalation.scope !== recorded.scope) escalation = fresh(recorded.scope, n);
    // Blocking integrity findings are the integrity policy's, unchanged here; the ratchet is replayed.
    let decision = recorded.decision, progress = Boolean(recorded.progress);
    if (['accepted', 'rejected'].includes(recorded.decision) && !blocking(recorded) && recorded.score && prev) {
      const comparison = compare(prev, recorded.score, settings.ratchet);
      decision = comparison.regressions.length ? 'rejected' : 'accepted';
      progress = decision === 'accepted' && isProgress(comparison, recorded.diff);
    }
    if (decision === 'accepted' && recorded.score) prev = recorded.score;
    history.push({ ...recorded, decision, progress });
    spent.iterations += 1; spent.activeMs += recorded.durationMs || 0;
    if (typeof recorded.costUsd === 'number') spent.costUsd += recorded.costUsd;
    spent.tokens += tokensOf(recorded) || 0;

    const step = { n, scope: recorded.scope, provider: recorded.provider, effort: recorded.effort || null, recorded: { decision: recorded.decision, escalation: recorded.escalation?.rung || null, signals: recorded.signals || [] }, decision, progress, signals: [], escalation: null, costUsd: recorded.costUsd ?? null, tokens: tokensOf(recorded), durationMs: recorded.durationMs || 0 };
    steps.push(step);
    // The agent stops a loop on its own (a dispute, a question): no policy changes that.
    const agentStop = recorded.agent?.disputes?.length ? 'disputed' : ['blocked', 'needs-input'].includes(recorded.agent?.status) ? 'needs-human' : null;
    let human = null;
    if (!agentStop) {
      if (progress && !settings.yield.enabled) escalation = { ...escalation, since: n + 1 };
      else {
        const scoped = history.filter(item => item.scope === recorded.scope && item.n >= escalation.since);
        const completed = Boolean(recorded.subtaskDone) || (recorded.scope === 'goal' && decision === 'accepted' && allBlockingPass(recorded.score) && recorded.agent?.status === 'done');
        const { signals, summary } = diagnose(scoped, settings.stall, completed ? undefined : settings.yield);
        step.signals = signals.map(signal => signal.kind);
        if (signals.length) {
          const rung = nextRung(escalation, settings, { providers, current: { provider: recorded.provider, effort: recorded.effort, model: recorded.model }, config });
          step.escalation = { rung: rung.rung, change: rung.change };
          if (rung.human) human = summary;
          else escalation = { ...escalation, rungIndex: rung.index, tried: [...new Set([...escalation.tried, ...(rung.change.provider ? [rung.change.provider] : [])])], since: n + 1 };
        }
      }
    }
    step.same = step.decision === recorded.decision && (step.escalation?.rung || null) === (recorded.escalation?.rung || null);
    // Stopping here is exact whatever was decided at this iteration: nothing after it runs.
    if (human !== null) { stop = { after: n, outcome: 'stalled-escalated', reason: human }; break; }
    if (agentStop) { stop = { after: n, outcome: agentStop, reason: 'the agent stopped the loop (recorded)' }; break; }
    if (!step.same) { divergedAt = n; break; }
  }
  const last = iterations.at(-1)?.n ?? 0;
  if (!stop && divergedAt === null) stop = checkBudgets(last + 1);

  let outcome, stoppedAt = last;
  if (divergedAt !== null) outcome = { kind: 'diverged', at: divergedAt, detail: 'what the agents would have done next is unknown' };
  else if (stop) {
    stoppedAt = stop.before ? stop.before - 1 : stop.after;
    if (stoppedAt < last) outcome = { kind: 'earlier', outcome: stop.outcome, at: stoppedAt, detail: stop.reason };
    else if (stop.outcome === state.status) outcome = { kind: 'same', outcome: state.status, at: last, detail: state.reason };
    else outcome = { kind: 'different', outcome: stop.outcome, at: last, detail: stop.reason };
  } else outcome = { kind: state.status === 'budget-exceeded' ? 'beyond' : 'same', outcome: state.status, at: last, detail: state.reason };
  const skipped = outcome.kind === 'earlier' ? iterations.filter(item => item.n > stoppedAt) : [];
  const saved = outcome.kind === 'earlier' ? {
    iterations: skipped.length,
    costUsd: skipped.some(item => typeof item.costUsd === 'number') ? round(skipped.reduce((sum, item) => sum + (item.costUsd || 0), 0)) : null,
    tokens: skipped.reduce((sum, item) => sum + (tokensOf(item) || 0), 0),
    minutes: round(skipped.reduce((sum, item) => sum + (item.durationMs || 0), 0) / 60000, 1),
    unknownCost: skipped.filter(item => typeof item.costUsd !== 'number').length
  } : null;
  return { loopId: state.loopId, task: state.task, recorded: { outcome: state.status, reason: state.reason, iterations: iterations.length, spent: state.spent }, steps, stop, divergedAt, outcome, saved };
}

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/** One sentence that answers "what would this policy have done?". */
export function replaySentence(result, patch = {}) {
  const set = Object.entries(patch).flatMap(([key, value]) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).map(([sub, v]) => `${key}.${sub}=${v}`) : [`${key}=${Array.isArray(value) ? value.join(',') : value}`])).join(', ');
  const policy = set ? `With ${set}` : 'With the recorded policy';
  const o = result.outcome;
  if (o.kind === 'earlier') {
    const s = result.saved, parts = [s.costUsd !== null && `$${s.costUsd.toFixed(2)}`, s.tokens && `${s.tokens} tokens`, s.minutes && `${s.minutes} min`].filter(Boolean);
    return `${policy}, the loop would have stopped ${o.at ? `after iteration ${o.at}` : 'before its first iteration'} (${o.outcome}: ${o.detail}) and saved ${s.iterations} iteration(s)${parts.length ? `, ${parts.join(', ')}` : ''}${s.unknownCost ? ` (${s.unknownCost} without a reported cost)` : ''}.`;
  }
  if (o.kind === 'diverged') return `${policy}, the loop follows the recording until iteration ${o.at}, where it decides differently${result.steps.at(-1)?.recorded.escalation === 'human' ? ' (it would not have stopped for a human there)' : ''}; ${o.detail}.`;
  if (o.kind === 'different') return `${policy}, the loop would have ended as ${o.outcome} at iteration ${o.at} instead of ${result.recorded.outcome}: ${o.detail}.`;
  if (o.kind === 'beyond') return `${policy}, the loop would not have stopped where it did (${result.recorded.outcome}); the recording ends there, so what came next is unknown.`;
  return `${policy}, the loop decides exactly as recorded and ends as ${result.recorded.outcome}.`;
}

/** Replays a recorded loop through the policy functions under other settings; nothing runs. */
export async function replayRecorded(cwd, slug, { loop, set } = {}) {
  const { dir, config } = await getTask(cwd, slug);
  const id = (typeof loop === 'string' && loop) || await newestTaskLoop(dir);
  if (!id) throw new Error(`no loop has run for ${slug}`);
  const state = await readState(dir, id);
  if (!state) throw new Error(`loop ${id} of ${slug} has no state`);
  const overrides = parseOverrides(set), settings = applyOverrides(recordedSettings(state, config), overrides);
  const ledger = await readLedger(loopPaths(dir, id).ledger);
  const result = replayLoop(state, { settings, overrides, ledger, providers: providersFor(config), config });
  const drift = ledger.some(entry => entry.type === 'drift');
  return { ...result, overrides, sentence: replaySentence(result, overrides), notes: [
    'Minutes are counted from the recorded iteration durations; cost and tokens from what providers reported.',
    'Stall, yield and ratchet settings come from the current configuration, the budgets and the ladder from the loop.',
    ...(drift ? ['The loop recorded configuration drift between runs: the replay uses one policy for the whole loop.'] : [])
  ] };
}
