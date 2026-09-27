import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { executeCommand, inspectProject, writeEvidence } from '../core/project-tools.js';
import { selectVerificationCommands } from '../core/stack.js';
import { captureOutput, exists, hasMeaningfulContent, pretty, sectionPresent } from '../core/util.js';
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
  verify: json => ({ pass: json.ok, issues: json.results.filter(item => !item.ok).map(item => `failed: ${item.command}`) }),
  guard: json => ({ pass: json.ok, issues: json.findings }),
  security: json => ({ pass: !json.findings.length, issues: json.findings }),
  deps: json => ({ pass: true, issues: [], summary: `${json.manifests.length} manifest(s), ${json.lockfiles.length} lockfile(s) changed` }),
  policy: json => ({ pass: json.ok, issues: json.findings }),
  review: json => ({ pass: !json.findings.length, issues: json.findings }),
  readiness: json => ({ pass: json.ready, issues: json.missing.map(item => `missing: ${item}`) })
};

async function runChecks(context, gate) {
  const [config, map] = await Promise.all([loadConfig(context.cwd), inspectProject(context.cwd)]);
  let commands = selectVerificationCommands(map.stack, config);
  if (gate.kinds) commands = commands.filter(item => gate.kinds.includes(item.kind) || item.kind === 'custom');
  if (!commands.length) return { pass: false, issues: [`no ${gate.kinds?.join('/') || 'verification'} commands detected; declare verification.commands in .maverick/config.json`] };
  const results = [];
  for (const item of commands) results.push(await executeCommand(context.cwd, item.command, item.cwd));
  await writeEvidence(context.taskDir, context.task, results);
  return { pass: results.every(result => result.ok), issues: results.filter(result => !result.ok).map(result => `failed: ${result.command}`), summary: `${results.filter(result => result.ok).length}/${results.length} command(s) passed; evidence in EVIDENCE.md` };
}

async function runArtifact(context, gate) {
  const file = interpolate(gate.file, { task: context.task });
  if (file.split(/[\\/]/).includes('..')) return { pass: false, issues: [`artifact path must stay inside the task: ${file}`] };
  const path = join(context.taskDir, file);
  if (!await exists(path)) return { pass: false, issues: [`missing ${file}`] };
  const text = await readFile(path, 'utf8'), issues = [];
  for (const section of gate.sections) if (!sectionPresent(text, section)) issues.push(`${file}: missing section "${section}"`);
  if (gate.pattern && !new RegExp(gate.pattern, 'm').test(text)) issues.push(`${file}: ${gate.description || `expected /${gate.pattern}/`}`);
  if (gate.noPlaceholders && !hasMeaningfulContent(text)) issues.push(`${file}: placeholders remain`);
  return { pass: !issues.length, issues };
}

/** Evaluates one gate. Gate failures are results, not exceptions: the flow always completes a run. */
export async function evaluateGate(context, gate, state) {
  const base = { id: gate.id, type: gate.type, severity: gate.severity, description: gate.description };
  try {
    if (gate.type === 'approval') {
      const approval = state.approvals?.[gate.id];
      if (!approval && gate.file && gate.pattern) {
        const recorded = await runArtifact(context, { file: gate.file, sections: [], pattern: gate.pattern });
        if (recorded.pass) return { ...base, status: 'pass', issues: [], summary: `recorded in ${gate.file}` };
      }
      if (!approval) return { ...base, status: 'pending', issues: [`awaiting approval: ${gate.prompt}`], summary: `${gate.file ? `record it in ${gate.file} or run` : 'run'} maverick flow approve ${context.flow} ${context.task} ${gate.id}` };
      return { ...base, status: approval.decision === 'approve' ? 'pass' : 'fail', issues: approval.decision === 'approve' ? [] : [`rejected by ${approval.by}: ${approval.reason || 'no reason given'}`], summary: `${approval.decision} by ${approval.by}` };
    }
    let result;
    if (gate.type === 'check') result = await runChecks(context, gate);
    else if (gate.type === 'artifact') result = await runArtifact(context, gate);
    else if (gate.type === 'command') {
      const command = interpolate(gate.run, { task: context.task });
      const run = await executeCommand(context.cwd, command, gate.cwd || '');
      result = { pass: run.ok, issues: run.ok ? [] : [`${command} exited ${run.code ?? 'before starting'}`], summary: run.output.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
    } else {
      const args = [gate.run, context.task, '--json', ...(gate.run === 'review' ? ['--diff'] : [])];
      let captured;
      try { captured = (await captureOutput(() => context.invoke(args))).output; } catch (error) {
        captured = error.output;
        const json = parseJson(captured);
        if (!json) return { ...base, status: 'fail', issues: [error.message] };
      }
      result = MAVERICK_RESULTS[gate.run](parseJson(captured));
    }
    return { ...base, status: result.pass ? 'pass' : 'fail', issues: result.issues || [], summary: result.summary };
  } catch (error) {
    return { ...base, status: 'fail', issues: [`gate error: ${error.message}`] };
  }
}

const issueKey = results => results.filter(result => result.severity === 'block' && result.status === 'fail').flatMap(result => result.issues.map(issue => `${result.id}: ${issue}`)).sort().join('\n');

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
  const icon = { pass: '✓', fail: '✗', pending: '…' };
  const gates = run.results.map(result => `- ${icon[result.status]} **${result.id}** (${result.type}${result.severity === 'warn' ? ', warn' : ''}) — ${result.status}${result.summary ? `: ${result.summary}` : ''}${result.issues.length ? `\n${result.issues.map(issue => `  - ${issue}`).join('\n')}` : ''}`).join('\n');
  return `# Flow ${flow.name} — ${task}\n\nGoal: ${interpolate(contract.goal, { task })}\n\nOutcome: **${run.outcome.toUpperCase()}** (failed iteration ${run.iteration}/${contract.iterationCap}, no-progress window ${contract.noProgressWindow})\nRun: ${run.at}\n\n## Next step\n${NEXT_STEP[run.outcome]}\n\n## Gates\n${gates}\n`;
}

/** Runs every gate once and records the outcome. Terminal outcomes refuse to rerun without reset. */
export async function runFlow(context, flow, { reset = false } = {}) {
  let state = await readState(context.taskDir, flow.name);
  const notes = [];
  if (state.integrity && state.integrity !== flow.integrity) { notes.push('flow definition changed since the last run; history was reset'); state = { ...state, runs: [] }; }
  const last = state.runs.at(-1);
  if (reset) { if (state.runs.length) notes.push('history reset by request'); state = { ...state, runs: [], approvals: {} }; }
  else if (last && TERMINAL.includes(last.outcome)) throw new Error(`flow ${flow.name} is ${last.outcome} for ${context.task}; a human must decide next steps, then rerun with --reset`);
  else if (last?.outcome === 'done') state = { ...state, runs: [] };
  const results = [];
  for (const gate of flow.gates) results.push(await evaluateGate({ ...context, flow: flow.name }, gate, state));
  const decision = decideOutcome(results, state.runs, flow.contract);
  const run = { at: new Date().toISOString(), ...decision, results };
  state = { ...state, flow: flow.name, integrity: flow.integrity, runs: [...state.runs, run], status: run.outcome };
  await writeState(context.taskDir, state);
  const reportPath = join(context.taskDir, `FLOW-${flow.name.toUpperCase()}.md`);
  await writeFile(reportPath, renderReport(flow, context.task, run, flow.contract));
  return { run, state, notes, reportPath, next: NEXT_STEP[run.outcome] };
}
