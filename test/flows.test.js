import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { planTask } from './fixtures.js';
import { decideOutcome, readState } from '../src/flows/engine.js';
import { loadFlows } from '../src/flows/model.js';
import { findCycle, loadGraph, topologicalOrder } from '../src/subtasks/graph.js';
import { buildProjectIndex } from '../src/core/lens-index.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const node = JSON.stringify(process.execPath);
async function project(files = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-flow-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), content);
  }
  await main(['new', 'Demo idea', '--slug', 'demo', '--no-launch'], cwd);
  await writeFile(join(cwd, '.maverick/tasks/demo/PRD.md'), '# PRD — Demo\n\n## Overview\nDemo task.\n');
  return cwd;
}
const flowFile = (name, gates, contract = 'iterationCap: 3\n  noProgressWindow: 2') => ({ [`.maverick/flows/${name}.yaml`]: `apiVersion: maverick.flow/v1\nname: ${name}\ndescription: Flow used by the automated tests.\ncontract:\n  goal: Gates pass for {{task}}.\n  ${contract}\ngates:\n${gates}` });
const taskDir = cwd => join(cwd, '.maverick/tasks/demo');

const gateResult = (id, status, issues = [], severity = 'block') => ({ id, status, issues, severity });
const contract = { iterationCap: 3, noProgressWindow: 2 };

test('decideOutcome enforces the contract', () => {
  assert.equal(decideOutcome([gateResult('a', 'pass'), gateResult('b', 'fail', ['x'], 'warn')], [], contract).outcome, 'done');
  assert.equal(decideOutcome([gateResult('a', 'pass'), gateResult('b', 'pending', ['wait'])], [], contract).outcome, 'awaiting-approval');
  const first = decideOutcome([gateResult('a', 'fail', ['x', 'y'])], [], contract);
  assert.deepEqual([first.outcome, first.iteration], ['revise', 1]);
  const history = [{ outcome: 'revise', issueKey: first.issueKey }];
  assert.equal(decideOutcome([gateResult('a', 'fail', ['y', 'x'])], history, contract).outcome, 'stalled', 'same issues in any order = no progress');
  assert.equal(decideOutcome([gateResult('a', 'fail', ['y'])], history, contract).outcome, 'revise', 'fewer issues = progress');
  const progressing = [{ outcome: 'revise', issueKey: 'a: 1' }, { outcome: 'revise', issueKey: 'a: 2' }];
  assert.equal(decideOutcome([gateResult('a', 'fail', ['3'])], progressing, contract).outcome, 'exhausted');
  assert.equal(decideOutcome([gateResult('a', 'fail', ['x'])], [{ outcome: 'revise', issueKey: 'a: x' }], { iterationCap: 5, noProgressWindow: 3 }).outcome, 'revise', 'window 3 needs two repeats');
});

test('built-in flows are valid and invalid project flows are reported precisely', async () => {
  const cwd = await project({
    ...flowFile('dupes', '  - { id: a, type: artifact, file: PRD.md }\n  - { id: a, type: artifact, file: PRD.md }\n'),
    ...flowFile('vague', '  - { id: a, type: vibes }\n'),
    '.maverick/flows/renamed.yaml': 'apiVersion: maverick.flow/v1\nname: other\ndescription: Name does not match file.\ncontract: { goal: x }\ngates: [{ id: a, type: artifact, file: PRD.md }]\n'
  });
  const { flows, errors } = await loadFlows(cwd);
  assert.deepEqual(flows.map(flow => flow.name).sort(), ['fix-checks', 'loop', 'pr', 'ship', 'spec']);
  assert.match(errors.find(error => error.file === 'dupes.yaml').message, /duplicate gate id "a"/);
  assert.match(errors.find(error => error.file === 'vague.yaml').message, /gates\.0\.type/);
  assert.match(errors.find(error => error.file === 'renamed.yaml').message, /must match the file name/);
  await assert.rejects(main(['flow', 'run', 'vague', 'demo'], cwd), /flow vague is invalid/);
});

test('a failing flow revises, stalls, refuses to continue, and recovers only with --reset', async () => {
  const cwd = await project(flowFile('loop', `  - id: gate\n    type: command\n    run: '${node} -e "process.exit(require(\\"fs\\").existsSync(\\"ok\\") ? 0 : 1)"'\n`));
  await assert.rejects(main(['flow', 'run', 'loop', 'demo'], cwd), /outcome: revise/);
  await assert.rejects(main(['flow', 'run', 'loop', 'demo'], cwd), /outcome: stalled/);
  await assert.rejects(main(['flow', 'run', 'loop', 'demo'], cwd), /is stalled for demo[\s\S]*--reset/);
  await writeFile(join(cwd, 'ok'), '');
  await main(['flow', 'run', 'loop', 'demo', '--reset'], cwd);
  const state = await readState(taskDir(cwd), 'loop');
  assert.equal(state.status, 'done');
  assert.match(await readFile(join(taskDir(cwd), 'FLOW-LOOP.md'), 'utf8'), /Outcome: \*\*DONE\*\*/);
});

test('artifact and approval gates wait for humans, and rejections need a reason', async () => {
  const cwd = await project(flowFile('signoff', '  - id: brief\n    type: artifact\n    file: PRD.md\n    sections: [Overview]\n  - id: lead\n    type: approval\n    prompt: Tech lead signs off\n'));
  await assert.rejects(main(['flow', 'run', 'signoff', 'demo'], cwd), /awaiting-approval/);
  await assert.rejects(main(['flow', 'approve', 'signoff', 'demo', 'lead', '--reject'], cwd), /--reason/);
  await assert.rejects(main(['flow', 'approve', 'signoff', 'demo', 'brief'], cwd), /no approval gate "brief"/);
  await main(['flow', 'approve', 'signoff', 'demo', 'lead', '--by', 'ana'], cwd);
  await main(['flow', 'run', 'signoff', 'demo'], cwd);
  assert.equal((await readState(taskDir(cwd), 'signoff')).approvals.lead.by, 'ana');
});

test('approving a run that only waits on a human decides it at once and checks the box in the gate file', async () => {
  const cwd = await project(flowFile('signoff', "  - id: brief\n    type: artifact\n    file: PRD.md\n    sections: [Overview]\n  - id: lead\n    type: approval\n    prompt: Tech lead signs off\n    file: REVIEW.md\n    pattern: '- \\[[xX]\\] approve'\n"));
  const review = join(taskDir(cwd), 'REVIEW.md');
  await writeFile(review, '# Review\n\n## Decision\n- [ ] approve\n- [ ] request changes\n');
  await assert.rejects(main(['flow', 'run', 'signoff', 'demo'], cwd), /awaiting-approval/);
  await main(['flow', 'approve', 'signoff', 'demo', 'lead', '--by', 'ana'], cwd);
  let state = await readState(taskDir(cwd), 'signoff');
  assert.equal(state.status, 'done');
  assert.equal(state.runs.length, 1, 'the waiting run is decided again, not repeated');
  assert.equal(state.runs[0].results.find(result => result.id === 'lead').summary, 'approve by ana');
  assert.match(await readFile(review, 'utf8'), /- \[x\] approve\n- \[ \] request changes/);
  assert.match(await readFile(join(taskDir(cwd), 'FLOW-SIGNOFF.md'), 'utf8'), /Outcome: \*\*DONE\*\*/);
  await main(['flow', 'approve', 'signoff', 'demo', 'lead', '--reject', '--reason', 'missing tests'], cwd);
  state = await readState(taskDir(cwd), 'signoff');
  assert.equal(state.status, 'revise');
  assert.match(await readFile(review, 'utf8'), /- \[ \] approve/, 'a rejection unchecks the approval');
});

test('auto-approval approves pending gates only once every blocking check passes, and says so', async () => {
  const cwd = await project({
    ...flowFile('auto', `  - id: gate\n    type: command\n    run: '${node} -e "process.exit(require(\\"fs\\").existsSync(\\"ok\\") ? 0 : 1)"'\n  - id: lead\n    type: approval\n    prompt: Tech lead signs off\n    file: REVIEW.md\n    pattern: '- \\[[xX]\\] approve'\n`)
  });
  const review = join(taskDir(cwd), 'REVIEW.md');
  await writeFile(review, '# Review\n\n## Decision\n- [ ] approve\n');
  await assert.rejects(main(['flow', 'run', 'auto', 'demo', '--auto-approve'], cwd), /outcome: revise/);
  assert.deepEqual((await readState(taskDir(cwd), 'auto')).approvals, {}, 'a failing check is never auto-approved');
  await writeFile(join(cwd, 'ok'), '');
  await main(['flow', 'run', 'auto', 'demo', '--auto-approve'], cwd);
  const state = await readState(taskDir(cwd), 'auto');
  assert.equal(state.status, 'done');
  assert.equal(state.approvals.lead.auto, true);
  assert.equal(state.runs.at(-1).results.find(result => result.id === 'lead').summary, 'auto-approved');
  assert.match(await readFile(review, 'utf8'), /- \[x\] approve\n {2}> Auto-approved by Maverick \(auto flow, \d{4}-\d{2}-\d{2}\); no human recorded this decision\./);
});

test('flow auto-approve turns auto-approval on and off in the project configuration', async () => {
  const cwd = await project(flowFile('signoff', '  - id: lead\n    type: approval\n    prompt: Tech lead signs off\n'));
  const config = async () => JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  await assert.rejects(main(['flow', 'auto-approve', 'signoff', 'maybe'], cwd), /on\|off/);
  await assert.rejects(main(['flow', 'auto-approve', 'missing', 'on'], cwd), /flow not found/);
  await main(['flow', 'auto-approve', 'signoff', 'on'], cwd);
  assert.deepEqual((await config()).flows, { autoApprove: ['signoff'] });
  await main(['flow', 'run', 'signoff', 'demo'], cwd);
  assert.equal((await readState(taskDir(cwd), 'signoff')).approvals.lead.by, 'auto-approve');
  await main(['flow', 'auto-approve', 'signoff', 'off'], cwd);
  assert.equal((await config()).flows, undefined);
  await assert.rejects(main(['flow', 'run', 'signoff', 'demo', '--reset'], cwd), /awaiting-approval/, 'with it off, a human decides again');
});

test('maverick gates run in-process and report stable issues', async () => {
  const cwd = await project(flowFile('gates', '  - { id: checks, type: maverick, run: verify }\n  - { id: security, type: maverick, run: security }\n  - { id: deps, type: maverick, run: deps, severity: warn }\n'));
  await assert.rejects(main(['flow', 'run', 'gates', 'demo', '--json'], cwd), /outcome: revise/);
  const run = (await readState(taskDir(cwd), 'gates')).runs[0];
  const byId = Object.fromEntries(run.results.map(result => [result.id, result]));
  assert.equal(byId.checks.status, 'fail');
  assert.match(byId.checks.issues[0], /no verification commands detected/);
  assert.equal(byId.security.status, 'pass');
  assert.equal(byId.deps.status, 'pass');
});

test('check gates run the detected stack commands and write evidence', async () => {
  const cwd = await project({ '.maverick/config.json': JSON.stringify({ verification: { commands: [`${node} --version`] } }) });
  await main(['flow', 'run', 'fix-checks', 'demo'], cwd);
  assert.match(await readFile(join(taskDir(cwd), 'EVIDENCE.md'), 'utf8'), /## PASS/);
});

test('editing a flow definition resets its history', async () => {
  const cwd = await project(flowFile('edit', `  - { id: gate, type: command, run: '${node} -e "process.exit(1)"' }\n`));
  await assert.rejects(main(['flow', 'run', 'edit', 'demo'], cwd), /revise/);
  await writeFile(join(cwd, '.maverick/flows/edit.yaml'), (await readFile(join(cwd, '.maverick/flows/edit.yaml'), 'utf8')).replace('iterationCap: 3', 'iterationCap: 4'));
  await assert.rejects(main(['flow', 'run', 'edit', 'demo'], cwd), /revise/);
  assert.equal((await readState(taskDir(cwd), 'edit')).runs.length, 1);
});

test('graph helpers detect cycles and order deterministically', () => {
  assert.deepEqual(findCycle(['01', '02', '03'], [{ from: '01', to: '02' }, { from: '02', to: '03' }, { from: '03', to: '01' }]), ['01', '02', '03', '01']);
  assert.equal(findCycle(['01', '02'], [{ from: '01', to: '02' }]), null);
  assert.deepEqual(topologicalOrder(['01', '02', '03', '04'], [{ from: '03', to: '01' }, { from: '01', to: '02' }]), ['03', '01', '02', '04']);
});

test('subtasks enforce dependencies and strict statuses', async () => {
  const cwd = await project();
  await main(['subtask', 'add', 'demo', 'Build', 'the', 'API', '--type', 'backend', '--complexity', 'medium'], cwd);
  await main(['subtask', 'add', 'demo', 'Build UI', '--after', '1'], cwd);
  await assert.rejects(main(['subtask', 'add', 'demo', 'X', '--after', '09'], cwd), /unknown dependency 09/);
  await assert.rejects(main(['subtask', 'set', 'demo', '02', 'done'], cwd), /depends on unfinished 01/);
  await assert.rejects(main(['subtask', 'set', 'demo', '01', 'finished'], cwd), /status must be one of/);
  // A task is done only when every checklist item in its file is checked.
  const first = join(taskDir(cwd), 'subtasks/task_01.md');
  await assert.rejects(main(['subtask', 'set', 'demo', '01', 'done'], cwd), /subtask 01 has 3 of 3 item\(s\) unchecked in task_01.md[\s\S]*- \[ \] Steps: FILL ME/);
  await writeFile(first, (await readFile(first, 'utf8')).replaceAll('- [ ] ', '- [x] '));
  await main(['subtask', 'set', 'demo', '01', 'done'], cwd);
  let graph = await loadGraph(taskDir(cwd));
  assert.deepEqual(graph.items.map(item => [item.id, item.title, item.status, item.ready]), [['01', 'Build the API', 'done', false], ['02', 'Build UI', 'pending', true]]);
  assert.deepEqual([graph.items[0].checklist.done, graph.items[1].checklist.open.length], [3, 3]);
  const tasksList = await readFile(join(taskDir(cwd), 'subtasks/_tasks.md'), 'utf8');
  assert.match(tasksList, /- \[x\] 01 Build the API — done\n- \[ \] 02 Build UI — pending · after 01/);
  await main(['subtask', 'set', 'demo', '02', 'done', '--force'], cwd);
  assert.equal((await loadGraph(taskDir(cwd))).items[1].status, 'done', '--force finishes a task with open items');
  await main(['subtask', 'set', 'demo', '02', 'pending'], cwd);

  const manifest = join(taskDir(cwd), 'subtasks/_tasks.md');
  await writeFile(manifest, (await readFile(manifest, 'utf8')).replace('edges:\n', 'edges:\n  - from: "02"\n    to: "01"\n'));
  await writeFile(join(taskDir(cwd), 'subtasks/task_09.md'), '---\ntitle: stray\nstatus: pending\n---\n');
  const task01 = join(taskDir(cwd), 'subtasks/task_01.md');
  await writeFile(task01, (await readFile(task01, 'utf8')).replace('status: done', 'status: finished'));
  graph = await loadGraph(taskDir(cwd));
  assert.ok(graph.problems.some(problem => /dependency cycle: 01 → 02 → 01/.test(problem)), graph.problems.join('\n'));
  assert.ok(graph.problems.some(problem => /task_09\.md is not listed/.test(problem)));
  assert.ok(graph.problems.some(problem => /task_01\.md: status/.test(problem)));
  await assert.rejects(main(['subtask', 'validate', 'demo'], cwd), /3 subtask graph problem/);
  await assert.rejects(main(['subtask', 'next', 'demo'], cwd), /fix the subtask graph first/);
});

test('Lens reports subtask and flow progress per task', async () => {
  const cwd = await project(flowFile('one', '  - { id: brief, type: artifact, file: PRD.md }\n'));
  await main(['subtask', 'add', 'demo', 'First'], cwd);
  await main(['flow', 'run', 'one', 'demo'], cwd);
  const task = (await buildProjectIndex(cwd)).tasks.find(item => item.id === 'demo');
  assert.deepEqual(task.subtasks, { total: 1, done: 0, ready: ['01'], problems: 0 });
  assert.deepEqual(task.flows, [{ flow: 'one', status: 'done', runs: 1 }]);
});

test('ship waits for a human instead of asking the agent to revise, and accepts REVIEW.md decisions', async () => {
  const cwd = await project({ '.maverick/config.json': JSON.stringify({ verification: { commands: [`${node} --version`] } }) });
  await planTask(cwd, 'demo');
  await assert.rejects(main(['flow', 'run', 'ship', 'demo'], cwd), /awaiting-approval/);
  await assert.rejects(main(['flow', 'run', 'ship', 'demo'], cwd), /awaiting-approval/, 'waiting never turns into stalled');
  const review = join(taskDir(cwd), 'REVIEW.md');
  await writeFile(review, `${await readFile(review, 'utf8')}\n- [x] approve\n`);
  await main(['flow', 'run', 'ship', 'demo'], cwd);
  assert.equal((await readState(taskDir(cwd), 'ship')).runs.at(-1).results.find(result => result.id === 'human-review').summary, 'recorded in REVIEW.md');
});
