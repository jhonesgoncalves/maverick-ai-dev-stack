import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { detectStack } from '../core/stack.js';
import { inPlace } from '../loop/git.js';
import { sealedSettings, sealReadiness } from './model.js';
import { holdoutLine } from './run.js';
import { querySeal } from './seal.js';

// The `sealed` flow gate: the task's sealed suite, run against the working tree. It never
// writes EVIDENCE.md, and its issues say only what `feedback` allows: with `none` (the
// default) a result below the threshold is `pending` for a human, because an agent fix
// (`flow run --agent`) must never revise against a signal it cannot see.

/** Issues for a result below the threshold, as the feedback policy allows. */
export function sealedIssues(metrics, settings, task) {
  if (settings.feedback === 'count') return [`${metrics.passed}/${metrics.total} sealed tests pass; the threshold is ${Math.round(settings.threshold * 100)}%`];
  if (settings.feedback === 'ac') return metrics.missed.map(id => `${id}: the sealed tests say this criterion is not delivered`);
  return [`the sealed tests do not reach their threshold; a human reviews them with maverick seal status ${task} --reveal`];
}

export async function runSealedGate(context, gate, prior = [], state = {}) {
  const base = { id: gate.id, type: 'sealed', severity: gate.severity, description: gate.description };
  const config = context.config || await loadConfig(context.cwd);
  const settings = { ...sealedSettings(config), ...(gate.threshold !== undefined && { threshold: gate.threshold }), ...(gate.feedback && { feedback: gate.feedback }) };
  const readiness = await sealReadiness(context.taskDir, settings);
  if (readiness.state === 'missing') return { ...base, status: 'pending', issues: [`no sealed suite: a sealer writes one with maverick seal ${context.task}`] };
  if (['committed', 'discarded'].includes(readiness.state)) return { ...base, status: 'skipped', issues: [], summary: readiness.state === 'committed' ? 'the sealed tests were committed: they run with the visible checks now' : 'the sealed tests were discarded at review' };
  if (readiness.state !== 'ready') return { ...base, status: 'pending', issues: [readiness.detail] };
  // While a loop works on the task, the holdout is the loop's: a flow query would hand a second reading of it to whoever runs the flow.
  const { lockHolder } = await import('../loop/engine.js');
  if (await lockHolder(context.taskDir)) return { ...base, status: 'pending', issues: ['a loop is running for this task; its sealed tests run inside it'] };
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-sealed-index-'));
  let tree;
  try { tree = await inPlace({ cwd: context.cwd, task: context.task, indexFile: join(scratch, 'index'), inflight: scratch }).snapshot(); } finally { await rm(scratch, { recursive: true, force: true }); }
  // A human decision counts for this suite on this exact tree only.
  const evidence = `${readiness.sealed.suiteDigest}:${tree}`, human = state.approvals?.[gate.id];
  if (human?.evidence === evidence) return { ...base, status: human.decision === 'approve' ? 'pass' : 'fail', issues: human.decision === 'approve' ? [] : [`rejected by ${human.by}: ${human.reason || 'no reason given'}`], summary: `${human.decision} by ${human.by} for this exact change`, sealed: { evidence } };
  // What the visible evidence claims: a judge's criteria when one ran before, else every blocking gate before it passing.
  const judged = new Map(prior.filter(item => item.type === 'judge').flatMap(item => (item.judge?.verdicts || []).flatMap(verdict => (verdict.criteria || []).map(entry => [entry.id, entry.met]))));
  const gatesPass = prior.filter(item => item.severity === 'block').every(item => item.status === 'pass');
  const { metrics, query } = await querySeal({ cwd: context.cwd, task: context.task, taskDir: context.taskDir, config, stack: await detectStack(context.cwd), tree, scope: `flow ${context.flow || ''}`.trim(), visible: id => (judged.has(id) ? judged.get(id) : gatesPass), signal: context.signal, timeoutMinutes: gate.timeoutMinutes });
  if (!metrics.total) return { ...base, status: 'pending', issues: ['no sealed test is active (every one is flaky, unmeasured or vacuous); a human reviews the suite'], sealed: { evidence, query } };
  if (metrics.S >= settings.threshold) return { ...base, status: 'pass', issues: [], summary: settings.feedback === 'none' ? 'the sealed tests pass' : holdoutLine(metrics), sealed: { evidence, query } };
  return { ...base, status: settings.feedback === 'none' ? 'pending' : 'fail', issues: sealedIssues(metrics, settings, context.task), summary: settings.feedback === 'none' ? `a human decides: maverick flow approve ${context.flow || '<flow>'} ${context.task} ${gate.id} (or --reject)` : holdoutLine(metrics), sealed: { evidence, query }, ...(settings.feedback !== 'none' && { keys: metrics.missed }) };
}
