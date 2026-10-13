import { EFFORTS } from '../core/enums.js';
import { familyOf } from '../runtime/families.js';

// Stall diagnosis and the escalation ladder. A loop that repeats itself is not given more of
// the same: each signal names what is going wrong, and each rung changes something real (a
// diagnosis in the prompt, more reasoning, a different vendor) before a human is asked.

export const SIGNALS = ['no-progress', 'oscillation', 'churn', 'overclaim', 'empty', 'rollback-streak', 'no-result', 'low-yield'];

/** Gate gains per dollar or 1K tokens; unknown usage cannot be treated as free work. */
export function yieldOf(history, settings = {}) {
  if (!settings.enabled) return null;
  const window = settings.window || 4;
  if (history.length < window) return null;
  const recent = history.slice(-window), metric = settings.metric || 'tokens';
  const values = recent.map(item => metric === 'cost' ? item.costUsd : item.tokens?.totalTokens);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return { measurable: false, metric, window };
  const usage = values.reduce((sum, value) => sum + value, 0);
  if (!usage) return { measurable: false, metric, window };
  const gains = recent.reduce((sum, item) => sum + Math.max(0, item.gateGain || 0), 0);
  const rate = gains / (metric === 'cost' ? usage : usage / 1000);
  return { measurable: true, metric, window, usage, gains, rate, floor: settings.floor ?? 0.01, low: rate < (settings.floor ?? 0.01) };
}

const lines = record => (record.diff?.added || 0) + (record.diff?.deleted || 0);
const lastN = (items, n) => (items.length >= n ? items.slice(-n) : null);

/**
 * Signals in the iterations of one scope (a subtask, or the goal) since its last escalation.
 * Each record carries: progress, failureKey, decision, diff, agent.status, overclaim, checklistDelta.
 */
export function diagnose(history, stall, yieldSettings) {
  const signals = [], window = Math.max(2, stall.window || 2);
  const stuck = lastN(history, window);
  if (stuck && stuck.every(item => !item.progress) && stuck[0].failureKey && stuck.every(item => item.failureKey === stuck[0].failureKey)) signals.push({ kind: 'no-progress', evidence: `the same failures ${window} times in a row` });
  const recent = lastN(history, 3);
  if (recent && recent.every(item => !item.progress) && recent[2].failureKey && recent[2].failureKey === recent[0].failureKey && recent[1].failureKey !== recent[2].failureKey) signals.push({ kind: 'oscillation', evidence: 'the failures alternate between two states (fixing one breaks the other)' });
  if (stuck && stuck.every(item => !item.progress && lines(item) >= stall.churnLines)) signals.push({ kind: 'churn', evidence: `${window} iterations changed ${stuck.map(lines).join(', ')} lines without measurable progress` });
  const overclaims = history.filter(item => item.overclaim).length;
  if (overclaims >= stall.overclaims) signals.push({ kind: 'overclaim', evidence: `${overclaims} times the agent said "done" while the harness disagreed` });
  const pair = lastN(history, 2);
  if (pair && pair.every(item => item.diff?.empty && !item.checklistDelta && !['blocked', 'needs-input'].includes(item.agent?.status))) signals.push({ kind: 'empty', evidence: 'two iterations in a row changed nothing' });
  const rejected = lastN(history, stall.rollbackStreak);
  if (rejected && rejected.every(item => item.decision === 'rejected')) signals.push({ kind: 'rollback-streak', evidence: `the last ${stall.rollbackStreak} iterations were rolled back` });
  if (pair && pair.every(item => ['no-result', 'failed'].includes(item.agent?.status))) signals.push({ kind: 'no-result', evidence: 'two runs in a row failed or ended without a result block' });
  const yieldReport = yieldOf(history, yieldSettings);
  if (yieldReport?.low) signals.push({ kind: 'low-yield', evidence: `${yieldReport.gains} gate gains for ${yieldReport.usage} ${yieldReport.metric === 'cost' ? 'USD' : 'tokens'} over ${yieldReport.window} iterations (yield ${yieldReport.rate.toFixed(4)}, floor ${yieldReport.floor})` });
  return { signals, yield: yieldReport, summary: signals.map(signal => `${signal.kind}: ${signal.evidence}`).join('; ') };
}

/** The next effort level above `current` that the provider accepts, up to `max`. */
function higherEffort(provider, current, max) {
  if (!provider?.efforts?.length) return null;
  const from = EFFORTS.indexOf(current || 'medium'), limit = EFFORTS.indexOf(max);
  return EFFORTS.find((level, index) => index > from && index <= limit && provider.efforts.includes(level)) || null;
}

/**
 * The next rung for a scope, never an earlier one: `escalation.rungIndex` only grows, and the
 * ladder ends with `human`, so escalation always terminates. Rungs that cannot change anything
 * (no higher effort, no untried provider) are skipped and reported.
 */
export function nextRung(escalation, settings, { providers, current, config }) {
  const skipped = [];
  for (let index = escalation.rungIndex + 1; index < settings.escalation.length; index += 1) {
    const rung = settings.escalation[index];
    if (rung === 'human') return { index, rung, change: {}, skipped, human: true };
    if (rung === 'retry-with-diagnosis') return { index, rung, change: {}, skipped };
    if (rung === 'raise-effort') {
      const provider = providers.find(item => item.id === current.provider), effort = higherEffort(provider, current.effort, settings.maxEffort);
      if (effort) return { index, rung, change: { effort }, skipped };
      skipped.push(`${rung}: ${provider?.efforts?.length ? `${current.provider} is already at the highest allowed effort` : `${current.provider} has no reasoning setting`}`);
      continue;
    }
    if (rung === 'switch-provider') {
      const tried = new Set(escalation.tried || []), families = new Set([...tried].map(id => familyOf({ provider: id }, config).family));
      // The sealer's family never builds: it wrote the hidden tests.
      const excluded = new Set(settings.excludeFamilies || []);
      const untried = settings.providers.filter(id => !tried.has(id) && id !== current.provider && providers.some(item => item.id === id));
      const candidates = untried.filter(id => !excluded.has(familyOf({ provider: id }, config).family));
      // A different model family first: a vendor that has not seen this failure mode yet.
      const pick = candidates.find(id => !families.has(familyOf({ provider: id }, config).family)) || candidates[0];
      if (pick) return { index, rung, change: { provider: pick, model: undefined, effort: undefined }, skipped };
      skipped.push(`${rung}: ${untried.length ? 'every untried provider is in the family that wrote the sealed tests' : 'no untried provider in loop.providers'}`);
    }
  }
  return { index: settings.escalation.length - 1, rung: 'human', change: {}, skipped, human: true };
}
