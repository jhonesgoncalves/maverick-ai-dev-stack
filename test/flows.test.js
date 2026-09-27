import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
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
  await main(['task', 'demo'], cwd);
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
    ...flowFile('dupes', '  - { id: a, type: artifact, file: TASK.md }\n  - { id: a, type: artifact, file: TASK.md }\n'),
    ...flowFile('vague', '  - { id: a, type: vibes }\n'),
    '.maverick/flows/renamed.yaml': 'apiVersion: maverick.flow/v1\nname: other\ndescription: Name does not match file.\ncontract: { goal: x }\ngates: [{ id: a, type: artifact, file: TASK.md }]\n'
  });
  const { flows, errors } = await loadFlows(cwd);
  assert.deepEqual(flows.map(flow => flow.name).sort(), ['fix-checks', 'ship']);
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
  const cwd = await project(flowFile('signoff', '  - id: brief\n    type: artifact\n    file: TASK.md\n    sections: [Goal]\n  - id: lead\n    type: approval\n    prompt: Tech lead signs off\n'));
  await assert.rejects(main(['flow', 'run', 'signoff', 'demo'], cwd), /awaiting-approval/);
  await assert.rejects(main(['flow', 'approve', 'signoff', 'demo', 'lead', '--reject'], cwd), /--reason/);
  await assert.rejects(main(['flow', 'approve', 'signoff', 'demo', 'brief'], cwd), /no approval gate "brief"/);
  await main(['flow', 'approve', 'signoff', 'demo', 'lead', '--by', 'ana'], cwd);
  await main(['flow', 'run', 'signoff', 'demo'], cwd);
  assert.equal((await readState(taskDir(cwd), 'signoff')).approvals.lead.by, 'ana');
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
  await main(['subtask', 'set', 'demo', '01', 'done'], cwd);
  let graph = await loadGraph(taskDir(cwd));
  assert.deepEqual(graph.items.map(item => [item.id, item.title, item.status, item.ready]), [['01', 'Build the API', 'done', false], ['02', 'Build UI', 'pending', true]]);
  assert.match(await readFile(join(taskDir(cwd), 'subtasks/_tasks.md'), 'utf8'), /\| 02 \| Build UI \| pending \| 01 \|/);

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
  const cwd = await project(flowFile('one', '  - { id: brief, type: artifact, file: TASK.md }\n'));
  await main(['subtask', 'add', 'demo', 'First'], cwd);
  await main(['flow', 'run', 'one', 'demo'], cwd);
  const task = (await buildProjectIndex(cwd)).tasks.find(item => item.id === 'demo');
  assert.deepEqual(task.subtasks, { total: 1, done: 0, ready: ['01'], problems: 0 });
  assert.deepEqual(task.flows, [{ flow: 'one', status: 'done', runs: 1 }]);
});

test('ship waits for a human instead of asking the agent to revise, and accepts REVIEW.md decisions', async () => {
  const cwd = await project({ '.maverick/config.json': JSON.stringify({ verification: { commands: [`${node} --version`] } }) });
  await assert.rejects(main(['flow', 'run', 'ship', 'demo'], cwd), /awaiting-approval/);
  await assert.rejects(main(['flow', 'run', 'ship', 'demo'], cwd), /awaiting-approval/, 'waiting never turns into stalled');
  const review = join(taskDir(cwd), 'REVIEW.md');
  await writeFile(review, `${await readFile(review, 'utf8')}\n- [x] approve\n`);
  await main(['flow', 'run', 'ship', 'demo'], cwd);
  assert.equal((await readState(taskDir(cwd), 'ship')).runs.at(-1).results.find(result => result.id === 'human-review').summary, 'recorded in REVIEW.md');
});
