import { createHash } from 'node:crypto';
import { issueKey } from '../flows/engine.js';

// The ratchet: progress only moves forward. Each accepted iteration becomes the reference the
// next one is measured against, and a change that makes anything worse (a blocking gate that
// passed now fails, more tests fail, checked work is unchecked) is rolled back, however much
// else it improved. Judge gates never enter it: their verdicts are not deterministic.

const isNamed = keys => keys.length > 0 && keys.every(key => key.includes(' :: '));

/** The harness's measure of a tree: blocking gate states, failing ids, the task's checklist progress. */
export function scoreOf({ results, graph }) {
  const blocking = results.filter(result => result.severity === 'block' && result.type !== 'judge' && result.type !== 'approval');
  const gates = Object.fromEntries(blocking.map(result => [result.id, result.status]));
  const failing = Object.fromEntries(blocking.filter(result => result.status === 'fail').map(result => [result.id, (result.keys?.length ? result.keys : result.issues).slice(0, 200)]));
  const items = graph?.items || [];
  const checklist = items.reduce((sum, item) => ({ done: sum.done + (item.checklist?.done || 0), total: sum.total + (item.checklist?.total || 0) }), { done: 0, total: 0 });
  return {
    gates, passed: blocking.filter(result => result.status === 'pass').length, blocking: blocking.length, failing,
    failingCount: Object.values(failing).reduce((sum, keys) => sum + keys.length, 0),
    key: createHash('sha256').update(issueKey(blocking)).digest('hex').slice(0, 16),
    checklist, subtasksDone: items.filter(item => item.status === 'done').length, subtasksTotal: items.length
  };
}

export const allBlockingPass = score => Boolean(score) && score.blocking > 0 && score.passed === score.blocking;

/**
 * Regressions and improvements from `prev` to `next`. Failing counts are compared only where
 * both sides name their failing tests: a compile error that becomes five named failures is
 * not a regression, it is the build working again.
 */
export function compare(prev, next, { newFailures = 'count' } = {}) {
  const regressions = [], improvements = [];
  for (const [id, status] of Object.entries(next.gates)) {
    const before = prev.gates[id];
    if (before === 'pass' && status === 'fail') regressions.push({ kind: 'gate-regression', gate: id, detail: `${id} passed at the checkpoint and fails now` });
    if (before === 'fail' && status === 'pass') improvements.push({ kind: 'gate-fixed', gate: id, detail: `${id} passes now` });
    const was = prev.failing[id] || [], now = next.failing[id] || [];
    if (before !== 'fail' || status !== 'fail' || !isNamed(was) || !isNamed(now)) continue;
    const added = now.filter(key => !was.includes(key));
    if (now.length > was.length) regressions.push({ kind: 'test-regression', gate: id, detail: `${id}: ${now.length} failing, was ${was.length}${added.length ? ` (new: ${added.slice(0, 3).map(key => key.split(' :: ').pop()).join(', ')})` : ''}` });
    else if (newFailures === 'strict' && added.length) regressions.push({ kind: 'test-regression', gate: id, detail: `${id}: new failing ${added.slice(0, 3).map(key => key.split(' :: ').pop()).join(', ')}` });
    else if (now.length < was.length) improvements.push({ kind: 'fewer-failures', gate: id, detail: `${id}: ${now.length} failing, was ${was.length}` });
  }
  if (next.checklist.done < prev.checklist.done && next.checklist.total === prev.checklist.total) regressions.push({ kind: 'checklist-regression', detail: `checklist ${next.checklist.done}/${next.checklist.total}, was ${prev.checklist.done}/${prev.checklist.total}` });
  if (next.checklist.done > prev.checklist.done) improvements.push({ kind: 'checklist', detail: `checklist ${next.checklist.done}/${next.checklist.total}, was ${prev.checklist.done}/${prev.checklist.total}` });
  if (next.subtasksDone > prev.subtasksDone) improvements.push({ kind: 'subtask-done', detail: `${next.subtasksDone}/${next.subtasksTotal} subtasks done` });
  return { regressions, improvements, verdict: regressions.length ? 'worse' : improvements.length ? 'better' : 'same' };
}

/** Real progress: something the harness measured got better. Ticking boxes without changing code does not count. */
export function isProgress(comparison, diff) {
  return comparison.improvements.some(item => item.kind !== 'checklist') || (comparison.improvements.some(item => item.kind === 'checklist') && Boolean(diff) && !diff.empty);
}
