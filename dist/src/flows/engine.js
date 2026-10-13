import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { executeCommand, gitDiff, inspectProject, withCommandScope, writeEvidence } from '../core/project-tools.js';
import { parseDiff } from '../core/diff.js';
import { autonomyFor, eligibleForAutoApproval } from '../decide/autonomy.js';
import { selectVerificationCommands } from '../core/stack.js';
import { captureOutput, exists, hasMeaningfulContent, pretty, sectionPresent } from '../core/util.js';
import { fingerprintsFor } from './fingerprint.js';
import { runJudgeGate } from './judge.js';
import { runSealedGate } from '../sealed/gate.js';
import { interpolate, TERMINAL } from './model.js';

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fall through */ }
  const start = text.indexOf('{');
  try { return start >= 0 ? JSON.parse(text.slice(start)) : null; } catch { return null; }
}

// Turns each Maverick gate's --json payload into pass/fail plus stable issue ids.
const MAVERICK_RESULTS = {
  validate: json => ({ pass: json.valid, issues: json.results.filter(item => item.status === 'FAIL').map(item => `${item.file}: ${item.message}`) }),
  verify: json => {
    const failed = json.results.filter(item => !item.ok);
    return { pass: json.ok, issues: failed.map(failure), keys: failed.flatMap(item => item.keys || [`failed: ${item.command}`]) };
  },
  guard: json => ({ pass: json.ok, issues: json.findings }),
  integrity: json => {
    const blocking = json.findings.filter(item => item.severity === 'block');
    return { pass: json.ok, issues: blocking.map(item => `${item.kind}: ${item.file ? `${item.file} — ` : ''}${item.message}`), keys: blocking.map(item => item.key), summary: `${blocking.length} blocking, ${json.findings.length - blocking.length} warning(s); see INTEGRITY.md` };
  },
  ablation: json => {
    const blocking = json.findings.filter(item => item.severity === 'block'), s = json.stats;
    return { pass: json.ok, issues: blocking.map(item => `${item.kind}: ${item.file} — ${item.message}`), keys: blocking.map(item => item.key), summary: s.tests ? `${s.discriminating}/${s.tests} new test file(s) fail without the change, ${s.vacuous} vacuous, ${s.unmeasured} not measured; see ABLATION.md` : json.note || 'no new test' };
  },
  architecture: json => {
    const blocking = json.findings.filter(item => item.severity === 'block');
    return { pass: json.ok, issues: blocking.map(item => `${item.kind}: ${item.message}`), keys: blocking.map(item => item.key), summary: json.note || (json.base ? `health ${json.base.health} → ${json.head.health}, cycles ${json.base.cycles} → ${json.head.cycles}; see ARCHITECTURE-CHECK.md` : undefined) };
  },
  contracts: json => {
    const blocking = json.findings.filter(item => item.severity === 'block');
    return { pass: json.ok, issues: blocking.map(item => `${item.kind}: ${item.message}`), keys: blocking.map(item => `${item.kind}:${item.id}`), summary: json.touched.length ? `${json.touched.length} contract(s) touched: ${json.touched.map(item => `${item.id} ${item.status}`).join(', ')}` : `${json.active} active contract(s), none touched` };
  },
  // Explain-back never blocks: its questions are for the reviewer, not for the change.
  explain: json => ({ pass: true, issues: [], summary: json.enabled ? (json.questions.length ? `${json.questions.length} question(s) for the reviewer, ${json.questions.filter(item => item.answer).length} answered; see EXPLAIN-BACK.md` : json.note || 'no question') : 'off (review.explainBack)' }),
  attention: json => ({ pass: true, issues: [], summary: `review budget ~${json.minutes.low}–${json.minutes.high} min, ${json.focus.length} hunk(s) to read first; see REVIEW-BUDGET.md` }),
  security: json => ({ pass: !json.findings.length, issues: json.findings }),
  deps: json => ({ pass: true, issues: [], summary: `${json.manifests.length} manifest(s), ${json.lockfiles.length} lockfile(s) changed` }),
  policy: json => ({ pass: json.ok, issues: json.findings }),
  review: json => ({ pass: !json.findings.length, issues: json.findings }),
  readiness: json => ({ pass: json.ready, issues: json.missing.map(item => `missing: ${item}`) }),
  pr: json => ({ pass: true, issues: [], summary: `PR-DRAFT.md ${json.kept ? 'kept' : 'written'}` }),
  'pr-open': json => (json.ok
    ? { pass: true, issues: [], summary: json.opened ? `pull request${json.number ? ` #${json.number}` : ''} ${json.existing ? 'open' : 'opened'} on ${json.providerName}: ${json.url}` : `${json.branch} pushed; ${json.reason}${json.url ? `: ${json.url}` : ''}` }
    : { pass: false, issues: [json.error] })
};

// The CLI command behind a Maverick gate, when it is not the gate's name, and the flags it adds.
// The pr flow's `pr` gate keeps an existing draft, so a run never discards edits or an approval.
const COMMAND = { policy: ['policy', 'check'], 'pr-open': ['pr', 'open'], architecture: ['structure'], contracts: ['contract', 'check'] };
const FLAGS = { review: ['--diff'], pr: ['--keep'] };

// Gates that change shared state (push a branch, open a pull request) run only once every blocking
// gate before them passed, approvals included: until then they are skipped and say what they wait for.
const ACTING = new Set(['pr-open']);
const acts = gate => gate?.type === 'maverick' && ACTING.has(gate.run);

// Enough output to name every failing test; EVIDENCE.md keeps only the tail.
const CHECK_OUTPUT = 200000;

/** "failed: npm test (2 failing: adds numbers, lists items)": what failed, named where the runner says. */
function failure(item) {
  const ids = item.failing || [];
  return `failed: ${item.command}${ids.length ? ` (${ids.length} failing: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', …' : ''})` : ''}`;
}

/** A command result with the failing tests it names and stable keys for stall detection. */
function fingerprinted(context, result) {
  if (result.ok) return result;
  const { ids, keys } = fingerprintsFor({ command: result.command, output: result.output, cwd: context.cwd });
  return { ...result, failing: ids, keys };
}

async function runChecks(context, gate) {
  const [config, map] = await Promise.all([loadConfig(context.cwd), inspectProject(context.cwd)]);
  let commands = selectVerificationCommands(map.stack, config);
  if (gate.kinds) commands = commands.filter(item => gate.kinds.includes(item.kind) || item.kind === 'custom');
  if (!commands.length) return { pass: false, issues: [`no ${gate.kinds?.join('/') || 'verification'} commands detected; declare verification.commands in .maverick/config.json`] };
  const results = [];
  for (const item of commands) results.push(fingerprinted(context, await executeCommand(context.cwd, item.command, item.cwd, CHECK_OUTPUT)));
  await writeEvidence(context.taskDir, context.task, results);
  const failed = results.filter(result => !result.ok);
  return { pass: !failed.length, issues: failed.map(failure), keys: failed.flatMap(result => result.keys), failing: failed.flatMap(result => result.failing), summary: `${results.length - failed.length}/${results.length} command(s) passed; evidence in EVIDENCE.md` };
}

function taskFile(context, gate) {
  const file = interpolate(gate.file, { task: context.task });
  return { file, path: file.split(/[\\/]/).includes('..') ? null : join(context.taskDir, file) };
}

async function runArtifact(context, gate) {
  const { file, path } = taskFile(context, gate);
  if (!path) return { pass: false, issues: [`artifact path must stay inside the task: ${file}`] };
  if (!await exists(path)) return { pass: false, issues: [`missing ${file}`] };
  const text = await readFile(path, 'utf8'), issues = [];
  for (const section of gate.sections) if (!sectionPresent(text, section)) issues.push(`${file}: missing section "${section}"`);
  if (gate.pattern && !new RegExp(gate.pattern, 'm').test(text)) issues.push(`${file}: ${gate.description || `expected /${gate.pattern}/`}`);
  if (gate.noPlaceholders && !hasMeaningfulContent(text)) issues.push(`${file}: placeholders remain`);
  return { pass: !issues.length, issues };
}

// Gates that read the diff: a loop compares against its own baseline instead of HEAD.
const DIFF_GATES = new Set(['guard', 'security', 'deps', 'review', 'policy', 'integrity', 'ablation', 'architecture', 'contracts', 'attention', 'explain']);

/**
 * Evaluates one gate. Gate failures are results, not exceptions: the flow always completes a run.
 * `prior` holds the results of the gates before it in the same run. A context `timeoutMs` and
 * `signal` reach every command the gate starts, and `against` sets the diff base.
 */
export function evaluateGate(context, gate, state, prior = []) {
  return withCommandScope(context, () => evaluate(context, gate, state, prior));
}

async function evaluate(context, gate, state, prior) {
  const base = { id: gate.id, type: gate.type, severity: gate.severity, description: gate.description };
  try {
    if (gate.type === 'judge') return await runJudgeGate({ ...context, config: context.config || await loadConfig(context.cwd) }, gate, prior, state);
    if (gate.type === 'sealed') return await runSealedGate({ ...context, config: context.config || await loadConfig(context.cwd) }, gate, prior, state);
    if (acts(gate)) {
      const waiting = prior.filter(item => item.severity === 'block' && item.status !== 'pass');
      if (waiting.length) return { ...base, status: 'skipped', issues: [], summary: `waits for ${waiting.map(item => item.id).join(', ')}` };
    }
    if (gate.type === 'approval') {
      const approval = state.approvals?.[gate.id];
      if (!approval && gate.file && gate.pattern) {
        const recorded = await runArtifact(context, { file: gate.file, sections: [], pattern: gate.pattern });
        if (recorded.pass) return { ...base, status: 'pass', issues: [], summary: `recorded in ${gate.file}` };
      }
      if (!approval) return { ...base, status: 'pending', issues: [`awaiting approval: ${gate.prompt}`], summary: `${gate.file ? `record it in ${gate.file} or run` : 'run'} maverick flow approve ${context.flow} ${context.task} ${gate.id}` };
      return { ...base, status: approval.decision === 'approve' ? 'pass' : 'fail', issues: approval.decision === 'approve' ? [] : [`rejected by ${approval.by}: ${approval.reason || 'no reason given'}`], summary: approval.auto ? 'auto-approved' : `${approval.decision} by ${approval.by}` };
    }
    let result;
    if (gate.type === 'check') result = await runChecks(context, gate);
    else if (gate.type === 'artifact') result = await runArtifact(context, gate);
    else if (gate.type === 'command') {
      const command = interpolate(gate.run, { task: context.task });
      const run = fingerprinted(context, await executeCommand(context.cwd, command, gate.cwd || '', CHECK_OUTPUT));
      const why = run.timedOut ? 'timed out' : run.aborted ? 'was aborted' : `exited ${run.code ?? 'before starting'}`;
      result = { pass: run.ok, issues: run.ok ? [] : [`${command} ${why}${run.failing?.length ? ` (${run.failing.length} failing: ${run.failing.slice(0, 5).join(', ')}${run.failing.length > 5 ? ', …' : ''})` : ''}`], keys: run.keys, failing: run.failing, summary: run.output.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
    } else {
      const args = [...(COMMAND[gate.run] || [gate.run]), context.task, '--json', ...(FLAGS[gate.run] || []), ...(gate.stage ? ['--stage', gate.stage] : []), ...(context.against && DIFF_GATES.has(gate.run) ? ['--against', context.against] : [])];
      let captured;
      try { captured = (await captureOutput(() => context.invoke(args))).output; } catch (error) {
        captured = error.output;
        const json = parseJson(captured);
        if (!json) return { ...base, status: 'fail', issues: [error.message] };
      }
      result = MAVERICK_RESULTS[gate.run](parseJson(captured));
    }
    return { ...base, status: result.pass ? 'pass' : 'fail', issues: result.issues || [], summary: result.summary, ...(!result.pass && result.keys?.length && { keys: result.keys }), ...(result.failing?.length && { failing: result.failing }) };
  } catch (error) {
    return { ...base, status: 'fail', issues: [`gate error: ${error.message}`] };
  }
}

/**
 * The identity of a run's blocking failures: one line per failing test where the runner names
 * them (`keys`), otherwise per issue. Equal keys across runs mean no progress.
 */
export const issueKey = results => results.filter(result => result.severity === 'block' && result.status === 'fail').flatMap(result => (result.keys?.length ? result.keys : result.issues).map(issue => `${result.id}: ${issue}`)).sort().join('\n');

/**
 * Decides the run outcome from gate results and previous runs. Pure: it enforces the
 * contract (iteration cap and no-progress window) so an agent cannot loop forever.
 */
export function decideOutcome(results, history, contract) {
  const blocking = results.filter(result => result.severity === 'block');
  const failed = blocking.filter(result => result.status === 'fail'), pending = blocking.filter(result => result.status === 'pending');
  if (!failed.length) return { outcome: pending.length ? 'awaiting-approval' : 'done', iteration: history.filter(run => run.outcome === 'revise').length };
  const failedRuns = history.filter(run => ['revise', 'stalled', 'exhausted'].includes(run.outcome));
  const iteration = failedRuns.length + 1, key = issueKey(results);
  const recent = failedRuns.slice(-(contract.noProgressWindow - 1));
  if (recent.length === contract.noProgressWindow - 1 && recent.every(run => run.issueKey === key)) return { outcome: 'stalled', iteration, issueKey: key };
  if (iteration >= contract.iterationCap) return { outcome: 'exhausted', iteration, issueKey: key };
  return { outcome: 'revise', iteration, issueKey: key };
}

export function statePath(taskDir, flow) { return join(taskDir, 'flows', `${flow}.json`); }

export async function readState(taskDir, flow) {
  const path = statePath(taskDir, flow);
  if (!await exists(path)) return { flow, runs: [], approvals: {} };
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeState(taskDir, state) {
  await mkdir(join(taskDir, 'flows'), { recursive: true });
  await writeFile(statePath(taskDir, state.flow), pretty(state));
}

const NEXT_STEP = {
  done: 'All blocking gates pass. Hand the change to a human for the merge decision.',
  revise: 'Fix the blocking issues below without widening scope, then run the flow again.',
  'awaiting-approval': 'Blocking checks pass; a human must record the pending approval(s).',
  stalled: 'The same blocking issues repeated with no progress. Stop and ask a human; rerun only with --reset after they decide.',
  exhausted: 'The iteration cap was reached. Stop and ask a human; rerun only with --reset after they decide.'
};

export function renderReport(flow, task, run, contract) {
  const icon = { pass: '✓', fail: '✗', pending: '…', skipped: '−' };
  const gates = run.results.map(result => `- ${icon[result.status]} **${result.id}** (${result.type}${result.severity === 'warn' ? ', warn' : ''}) — ${result.status}${result.summary ? `: ${result.summary}` : ''}${result.issues.length ? `\n${result.issues.map(issue => `  - ${issue}`).join('\n')}` : ''}`).join('\n');
  return `# Flow ${flow.name} — ${task}\n\nGoal: ${interpolate(contract.goal, { task })}\n\nOutcome: **${run.outcome.toUpperCase()}** (failed iteration ${run.iteration}/${contract.iterationCap}, no-progress window ${contract.noProgressWindow})\nRun: ${run.at}\n\n## Next step\n${NEXT_STEP[run.outcome]}\n\n## Gates\n${gates}\n`;
}

async function writeReport(context, flow, run) {
  const reportPath = join(context.taskDir, `FLOW-${flow.name.toUpperCase()}.md`);
  await writeFile(reportPath, renderReport(flow, context.task, run, flow.contract));
  return reportPath;
}

/** Whether a flow approves its own pending approval gates once every blocking check passes (`flows.autoApprove`). */
export const autoApproves = (config, name) => (config?.flows?.autoApprove || []).includes(name);

const AUTO_NOTE = '> Auto-approved by Maverick';

/**
 * Keeps the gate's file in step with a recorded decision. The task stage and merge readiness
 * read the decision from that file (the checked box in REVIEW.md), so a decision recorded in
 * Lens or with `flow approve` has to land there too: approving checks the first box that
 * satisfies the gate's pattern, rejecting unchecks every box that does.
 */
async function mirrorDecision(context, gate, approval) {
  if (!gate.file || !gate.pattern) return;
  const { path } = taskFile(context, gate);
  if (!path || !await exists(path)) return;
  const lines = (await readFile(path, 'utf8')).split('\n'), satisfies = line => new RegExp(gate.pattern).test(line);
  let next;
  if (approval.decision === 'approve') {
    if (lines.some(satisfies)) return;
    const index = lines.findIndex(line => line.includes('[ ]') && satisfies(line.replace('[ ]', '[x]')));
    if (index < 0) return;
    // A box checked by auto-approval says so, so nobody mistakes it for a human review.
    next = [...lines.slice(0, index), lines[index].replace('[ ]', '[x]'), ...(approval.auto ? [`  ${AUTO_NOTE} (${context.flow} flow, ${approval.at.slice(0, 10)}); no human recorded this decision.`] : []), ...lines.slice(index + 1)];
  } else {
    next = lines.filter(line => !line.includes(AUTO_NOTE)).map(line => (satisfies(line) ? line.replace(/\[[xX]\]/, '[ ]') : line));
    if (next.join('\n') === lines.join('\n')) return;
  }
  await writeFile(path, next.join('\n'));
}

/** The latest run decided again with the current approvals, when nothing but approval gates blocked it. */
async function settle(context, flow, state) {
  // A v2 flow decides its outcome from its path, so a decision there takes effect on the next run.
  if (flow.apiVersion === 'maverick.flow/v2') return null;
  const last = state.runs.at(-1), gates = new Map(flow.gates.map(gate => [gate.id, gate]));
  if (last?.results.some(result => result.id === 'autonomy-judge' && result.type === 'judge')) gates.set('autonomy-judge', { id: 'autonomy-judge', type: 'judge' });
  if (!last || (state.integrity && state.integrity !== flow.integrity)) return null;
  if (last.results.some(result => result.severity === 'block' && result.status === 'fail' && !['approval', 'judge', 'sealed'].includes(gates.get(result.id)?.type))) return null;
  const results = [];
  for (const result of last.results) {
    const gate = gates.get(result.id), human = state.approvals?.[result.id];
    // A human decision on a judge counts only for the exact change the judges saw.
    if (gate?.type === 'judge' || gate?.type === 'sealed') results.push(human && human.evidence && human.evidence === (result.judge?.digest || result.sealed?.evidence) ? { ...result, status: human.decision === 'approve' ? 'pass' : 'fail', issues: human.decision === 'approve' ? [] : [`rejected by ${human.by}: ${human.reason || 'no reason given'}`], summary: `${human.decision} by ${human.by} for this exact change` } : result);
    else if (gate?.type === 'approval') results.push(await evaluateGate(context, gate, state));
    // A gate that waited on this decision runs now, after every result before it.
    else if (result.status === 'skipped' && acts(gate)) results.push(await evaluateGate(context, gate, state, results));
    else results.push(result);
  }
  return { at: last.at, ...decideOutcome(results, state.runs.slice(0, -1), flow.contract), results, decidedAt: new Date().toISOString() };
}

/**
 * Records a decision on an approval gate, from `flow approve` or Lens. When the latest run was
 * only waiting on approvals, its outcome is decided again at once: approving a change whose
 * checks passed finishes the flow without running every gate a second time, and runs the gates
 * that waited on the approval (the pr flow's `open`), so `context` needs `invoke`.
 */
export async function recordApproval(context, flow, gateId, { decision = 'approve', by = 'human', reason, auto = false } = {}) {
  const config = await loadConfig(context.cwd);
  const gate = flow.gates.find(item => item.id === gateId) || (gateId === 'autonomy-judge' && config.autonomy?.paths?.some(p => p.judgeRequired) ? { id: gateId, type: 'judge' } : null);
  if (!gate || !['approval', 'judge', 'sealed'].includes(gate.type)) throw new Error(`${flow.name} has no approval gate "${gateId || ''}"; gates a human decides (approval, judge and sealed): ${flow.gates.filter(item => ['approval', 'judge', 'sealed'].includes(item.type)).map(item => item.id).join(', ') || 'none'}`);
  if (decision === 'reject' && !reason) throw new Error('a rejection needs a reason');
  if (['judge', 'sealed'].includes(gate.type) && auto) throw new Error(`a ${gate.type} gate is never approved automatically`);
  const ctx = { ...context, flow: flow.name };
  let state = await readState(context.taskDir, flow.name);
  // A decision on a judge (or a sealed suite) is bound to the evidence it saw: a later change needs a new one.
  const latest = state.runs.at(-1)?.results.find(result => result.id === gate.id);
  const evidence = gate.type === 'judge' ? latest?.judge?.digest : gate.type === 'sealed' ? latest?.sealed?.evidence : undefined;
  if (['judge', 'sealed'].includes(gate.type) && !evidence) throw new Error(`run the flow first, so ${gate.id} has a change to decide on`);
  const approval = { decision, by, at: new Date().toISOString(), ...(reason && { reason }), ...(auto && { auto: true }), ...(evidence && { evidence }) };
  state = { ...state, flow: flow.name, approvals: { ...state.approvals, [gate.id]: approval } };
  await mirrorDecision(ctx, gate, approval);
  const run = await settle(ctx, flow, state);
  if (run) state = { ...state, runs: [...state.runs.slice(0, -1), run], status: run.outcome };
  await writeState(context.taskDir, state);
  if (run) await writeReport(context, flow, run);
  return { approval, run, next: run ? NEXT_STEP[run.outcome] : null };
}

/**
 * Runs every gate once and records the outcome. Terminal outcomes refuse to rerun without reset.
 * With auto-approval (the option or `flows.autoApprove`), a run that would wait on a human
 * approves its pending approval gates instead, and only when every blocking check passed.
 */
export async function runFlow(context, flow, { reset = false, autoApprove = false, agent } = {}) {
  // A v2 flow is a DAG with its own pass; see src/flows/graph-run.js.
  if (flow.apiVersion === 'maverick.flow/v2') return (await import('./graph-run.js')).runFlowGraph(context, flow, { reset });
  let state = await readState(context.taskDir, flow.name);
  const notes = [], ctx = { ...context, flow: flow.name };
  if (state.integrity && state.integrity !== flow.integrity) { notes.push('flow definition changed since the last run; history was reset'); state = { ...state, runs: [] }; }
  const last = state.runs.at(-1);
  if (reset) { if (state.runs.length) notes.push('history reset by request'); state = { ...state, runs: [], approvals: {} }; }
  else if (last && TERMINAL.includes(last.outcome)) throw new Error(`flow ${flow.name} is ${last.outcome} for ${context.task}; a human must decide next steps, then rerun with --reset`);
  else if (last?.outcome === 'done') state = { ...state, runs: [] };
  const results = [];
  for (const gate of flow.gates) {
    // Approvals recorded before their file existed (or by an older Maverick) reach the file now.
    if (gate.type === 'approval' && state.approvals?.[gate.id]?.decision === 'approve') await mirrorDecision(ctx, gate, state.approvals[gate.id]);
    results.push(await evaluateGate(ctx, gate, state, results));
  }
  const config = await loadConfig(context.cwd);
  const paths = config.autonomy?.paths?.length ? [...new Set(parseDiff(await gitDiff(context.cwd, context.against || 'HEAD')).flatMap(f => [f.oldPath, f.newPath]).filter(Boolean))] : [];
  const autonomy = autonomyFor(config, paths);
  if (autonomy.judgeRequired && !results.some(r => r.type === 'judge')) results.push(await runJudgeGate({ ...ctx, config }, { id: 'autonomy-judge', type: 'judge', severity: 'block', description: 'The reviewed path policy requires an independent judge.' }, results, state));
  let decision = decideOutcome(results, state.runs, flow.contract);
  const pathApproval = autonomy.configured && eligibleForAutoApproval(autonomy, results, paths);
  if (decision.outcome === 'awaiting-approval' && (autoApprove || autoApproves(config, flow.name) || pathApproval) && (!autonomy.configured || pathApproval)) {
    const at = new Date().toISOString();
    for (const [index, result] of results.entries()) {
      const gate = flow.gates.find(item => item.id === result.id);
      // A gate that waited on the approvals runs now, after every result before it.
      if (result.status === 'skipped' && acts(gate)) { results[index] = await evaluateGate(ctx, gate, state, results.slice(0, index)); continue; }
      if (result.type !== 'approval' || result.status !== 'pending') continue;
      const approval = { decision: 'approve', by: 'auto-approve', at, auto: true };
      state = { ...state, approvals: { ...state.approvals, [gate.id]: approval } };
      await mirrorDecision(ctx, gate, approval);
      results[index] = await evaluateGate(ctx, gate, state);
    }
    decision = decideOutcome(results, state.runs, flow.contract);
    notes.push('every blocking check passed, so the pending approvals were auto-approved');
  }
  // The agent run that produced this state of the code, so each iteration links to its transcript.
  const run = { at: new Date().toISOString(), ...decision, results, ...(agent && { agent }) };
  state = { ...state, flow: flow.name, integrity: flow.integrity, runs: [...state.runs, run], status: run.outcome };
  await writeState(context.taskDir, state);
  const reportPath = await writeReport(context, flow, run);
  return { run, state, notes, reportPath, next: NEXT_STEP[run.outcome] };
}
