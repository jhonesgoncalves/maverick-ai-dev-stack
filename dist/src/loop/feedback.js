// What the agent being judged may learn from a rejection. Telling an agent how it was caught
// teaches it to evade: in a 2026 study, agents given the reviewer's detailed reasoning evaded
// 40.5% of the time, against 20.3% with a generic rejection (arXiv 2609.28614). So the loop
// separates criterion feedback (which acceptance criterion is not met, which visible check
// regressed: what the agent needs to do the work) from detection feedback (which integrity
// rule fired, on which file, matching which pattern: how to get past the guard next time).
//
//   detailed  everything, as before 1.9
//   criteria  (default) criteria and visible checks; integrity findings become one generic line
//   generic   one line per kind of rejection
//
// Humans always get the detail: LOOP.md, LOOP-ESCALATION.md, the ledger and `loop log`.

export const FEEDBACK_LEVELS = ['detailed', 'criteria', 'generic'];
export const DEFAULT_FEEDBACK = 'criteria';

/** Integrity kinds whose rule the loop's prompt already states, so naming them reveals nothing about detection. */
const PUBLIC = new Set(['blast-radius-exceeded']);
const WEAKENED = 'a check was weakened, or a protected file or the repository changed; the changes were undone';
const WORSE = 'the change made a check worse or broke a loop rule; the changes were undone';

/** A rejection cause from an integrity finding, or from a regression the ratchet found. */
export const findingCause = item => ({ source: 'integrity', kind: item.kind, text: `${item.kind}: ${item.file ? `${item.file} — ` : ''}${item.message}` });
export const regressionCause = item => ({ source: 'ratchet', kind: item.kind, text: `${item.kind}: ${item.detail}` });

/** The reasons for a rejection the next agent sees. Without causes (a loop from before 1.9), `reasons` stand in. */
export function visibleReasons({ causes, reasons = [] } = {}, policy = DEFAULT_FEEDBACK) {
  if (policy === 'detailed') return causes ? causes.map(cause => cause.text) : reasons;
  if (!causes) return reasons.length ? [WORSE] : [];
  if (policy === 'generic') return causes.length ? [WORSE] : [];
  const hidden = causes.some(cause => cause.source === 'integrity' && !PUBLIC.has(cause.kind));
  return [...causes.filter(cause => cause.source !== 'integrity' || PUBLIC.has(cause.kind)).map(cause => cause.text), ...(hidden ? [WEAKENED] : [])];
}

/** True when the agent may see which files a rejected attempt changed: not when that would point at what an integrity rule caught. */
export const showFiles = (causes, policy) => policy === 'detailed' || (policy === 'criteria' && Boolean(causes) && !causes.some(cause => cause.source === 'integrity' && !PUBLIC.has(cause.kind)));

/** What the agent learns from a judge that did not accept the change: its unmet criteria, never the judge's reasoning. */
export function judgeLines({ issues = [], unmet = [] } = {}, policy = DEFAULT_FEEDBACK) {
  if (policy === 'detailed') return issues;
  if (policy === 'generic') return ['the independent judge did not accept the change; make every criterion demonstrable in the code and its tests, not only claimed'];
  return unmet.length ? unmet.map(id => `${id}: the change does not demonstrate this criterion yet`) : ['the change does not meet its criteria as a whole yet; re-read them and make each one demonstrable'];
}

/**
 * The blocking issues of one gate result as an agent may read them, for a loop's next prompt
 * or a `flow run --agent` fix. Visible checks keep their detail (the agent can run them
 * itself); the integrity gate is reduced to one line, a judge to its unmet criteria.
 */
export function gateIssues(result, gate = {}, policy = DEFAULT_FEEDBACK) {
  const issues = result.issues || [];
  if (policy === 'detailed' || !issues.length) return issues;
  if (gate.type === 'maverick' && gate.run === 'integrity') return [WEAKENED.replace('; the changes were undone', '')];
  if (gate.type === 'judge') return judgeLines({ issues, unmet: (result.keys || []).filter(key => /^[A-Z]+-\d+$/.test(key)) }, policy);
  if (policy === 'generic' && gate.type === 'maverick' && gate.run === 'ablation') return ['a new test passes without the change, so it cannot fail'];
  return issues;
}
