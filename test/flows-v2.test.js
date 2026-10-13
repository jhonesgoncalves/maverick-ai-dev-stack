import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { calls, loopProject, node } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput } = await import('../src/core/util.js');
const { flowV2Schema, topologicalNodes } = await import('../src/flows/graph.js');
const { findFlow } = await import('../src/flows/model.js');

const base = { apiVersion: 'maverick.flow/v2', name: 'x', description: 'A test flow for validation.', contract: { goal: 'g' } };
const issues = flow => { const parsed = flowV2Schema.safeParse({ ...base, ...flow }); return parsed.success ? [] : parsed.error.issues.map(item => item.message); };

test('a v2 flow is a typed DAG: cycles, impossible routes and a decision that finishes the work are refused', () => {
  const nodes = [{ id: 'a', type: 'gate', gate: { type: 'check' } }, { id: 'b', type: 'gate', gate: { type: 'check' } }, { id: 'done', type: 'end', outcome: 'done' }];
  assert.deepEqual(issues({ nodes, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'done' }] }), []);
  assert.match(issues({ nodes, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'done' }] }).join(), /the flow has a cycle: a → b → a/);
  assert.match(issues({ nodes, edges: [{ from: 'a', to: 'b', when: 'approve' }, { from: 'b', to: 'done' }] }).join(), /gate node "a" never outputs approve/);
  assert.match(issues({ nodes: [...nodes, { id: 'd', type: 'decision', rubric: 'integrity' }], edges: [{ from: 'a', to: 'd' }, { from: 'd', to: 'done', when: 'refactor' }, { from: 'b', to: 'done' }] }).join(), /cannot lead straight to a done end/);
  assert.match(issues({ nodes: [...nodes, { id: 'j', type: 'join' }], edges: [{ from: 'a', to: 'j' }, { from: 'j', to: 'done' }, { from: 'b', to: 'done' }] }).join(), /join "j" needs at least two incoming edges/);
  assert.match(issues({ nodes, edges: [{ from: 'a', to: 'done' }] }).join(), /node "b" leads nowhere/);
  assert.match(issues({ nodes: nodes.slice(0, 2), edges: [{ from: 'a', to: 'b' }] }).join(), /at least one end node/);
  assert.deepEqual(topologicalNodes([{ id: 'c' }, { id: 'a' }, { id: 'b' }], [{ from: 'a', to: 'b' }]), ['c', 'a', 'b']);
});

const FLOW = `apiVersion: maverick.flow/v2
name: guarded
description: Checks in parallel, an integrity decision, then a human; a failure goes to a read-only agent.
contract:
  goal: "{{task}} passes and a human approves it"
nodes:
  - { id: start, type: fan-out }
  - { id: checks, type: gate, gate: { type: check } }
  - { id: keep, type: gate, gate: { type: command, run: '"${node}" keep.mjs' } }
  - { id: both, type: join }
  - { id: integrity, type: decision, rubric: integrity, risk: low }
  - { id: approve, type: human, prompt: Approve the change }
  - { id: explain, type: agent, prompt: Explain why the checks fail, context: { include: [gates, diff] } }
  - { id: shipped, type: end, outcome: done }
  - { id: fix, type: end, outcome: revise }
  - { id: ask, type: end, outcome: stalled }
edges:
  - { from: start, to: checks }
  - { from: start, to: keep }
  - { from: checks, to: both, when: pass }
  - { from: keep, to: both, when: pass }
  - { from: checks, to: explain, when: fail }
  - { from: explain, to: fix }
  - { from: both, to: integrity, when: pass }
  - { from: integrity, to: approve, when: refactor }
  - { from: integrity, to: ask, when: [weakening, uncertain, needs-human] }
  - { from: approve, to: shipped, when: approve }
  - { from: approve, to: ask, when: reject }
`;

test('a v2 flow runs its path: a failing check reaches the agent, passing checks the decision and the human', async () => {
  const { cwd, binDir } = await loopProject({ agents: { claude: `return { summary: 'b.txt is missing' };` } });
  await writeFile(join(cwd, '.maverick/flows/guarded.yaml'), FLOW);
  const flow = await findFlow(cwd, 'guarded');
  assert.deepEqual(flow.gates.map(gate => [gate.id, gate.type]), [['checks', 'check'], ['keep', 'command'], ['approve', 'approval']], 'gate and human nodes are its v1 gates');
  const dir = join(cwd, '.maverick/tasks/demo');
  await assert.rejects(main(['flow', 'run', 'guarded', 'demo'], cwd), /outcome: revise/);
  let run = JSON.parse(await readFile(join(dir, 'flows/guarded.json'), 'utf8')).runs.at(-1);
  assert.deepEqual(run.nodes.map(item => [item.id, item.output]), [['start', 'pass'], ['checks', 'fail'], ['keep', 'pass'], ['both', 'fail'], ['integrity', 'skipped'], ['approve', 'skipped'], ['explain', 'done'], ['shipped', 'skipped'], ['fix', 'revise'], ['ask', 'skipped']]);
  const [call] = await calls(binDir, 'claude');
  assert.match(call.prompt, /## Checks so far\n- checks: fail/);
  assert.doesNotMatch(call.prompt, /## PRD/, 'the context policy leaves out what the node does not include');

  await writeFile(join(cwd, 'src/a.txt'), 'x'); await writeFile(join(cwd, 'src/b.txt'), 'x');
  await assert.rejects(main(['flow', 'run', 'guarded', 'demo'], cwd), /outcome: awaiting-approval/);
  run = JSON.parse(await readFile(join(dir, 'flows/guarded.json'), 'utf8')).runs.at(-1);
  assert.deepEqual(run.nodes.filter(item => item.output !== 'skipped').map(item => [item.id, item.output]), [['start', 'pass'], ['checks', 'pass'], ['keep', 'pass'], ['both', 'pass'], ['integrity', 'refactor'], ['approve', 'pending']]);
  await captureOutput(() => main(['flow', 'approve', 'guarded', 'demo', 'approve', '--by', 'ana'], cwd));
  await captureOutput(() => main(['flow', 'run', 'guarded', 'demo'], cwd));
  run = JSON.parse(await readFile(join(dir, 'flows/guarded.json'), 'utf8')).runs.at(-1);
  assert.equal(run.outcome, 'done');
  assert.match(await readFile(join(dir, 'FLOW-GUARDED.md'), 'utf8'), /✓ \*\*shipped\*\* \(end\) → done/);
  const shown = (await captureOutput(() => main(['flow', 'show', 'guarded'], cwd))).output;
  assert.match(shown, /checks \(gate\) → both \[pass\]/);
});
