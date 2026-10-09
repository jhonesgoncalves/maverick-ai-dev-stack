import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';
import { readState } from '../src/flows/engine.js';
import { workflowForIdea } from '../src/core/generation.js';
import { taskStage } from '../src/core/pipeline.js';
import { planningStages, requirePreset, stagesForPreset } from '../src/core/presets.js';
import { lintTask } from '../src/core/quality.js';
import { PRD, SPEC, TECHSPEC } from './fixtures.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const quiet = (argv, cwd) => captureOutput(() => main(argv, cwd));
async function shop() {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-sdd-'));
  await mkdir(join(cwd, 'src/orders'), { recursive: true });
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'node --test' } }));
  await writeFile(join(cwd, 'src/orders/list.js'), 'export function listOrders(db, { limit = 20 } = {}) { return db.orders.slice(0, limit); }\n');
  return cwd;
}

test('spec-driven puts SPEC between the PRD and the technical spec; other workflows skip it', () => {
  assert.deepEqual(stagesForPreset('spec-driven'), ['prd', 'spec', 'techspec', 'tasks', 'build', 'verify', 'review', 'pr']);
  assert.deepEqual(planningStages(requirePreset('spec-driven')), ['prd', 'spec', 'techspec', 'tasks']);
  assert.deepEqual(planningStages(requirePreset('standard')), ['prd', 'techspec', 'tasks']);
  assert.ok(!stagesForPreset('strict').includes('spec'));
});

test('contract ideas get spec-driven, risky ideas still get strict', () => {
  assert.equal(workflowForIdea('Expose the orders API to partners'), 'spec-driven');
  assert.equal(workflowForIdea('Integração com o ERP via webhook'), 'spec-driven');
  assert.equal(workflowForIdea('Add an API token for partners'), 'strict');
  assert.equal(workflowForIdea('Show todo items in a list'), 'standard');
});

test('new --spec creates a spec-driven task that moves PRD → SPEC → TECHSPEC', async () => {
  const cwd = await shop();
  const { output } = await quiet(['new', 'Paginate the orders list', '--slug', 'pages', '--no-launch', '--spec'], cwd);
  assert.match(output, /Workflow: Spec Driven \(chosen with --spec\)/);
  assert.match(output, /Pipeline: \[PRD\] → SPEC → TECHSPEC → TASKS/);
  const dir = join(cwd, '.maverick/tasks/pages'), preset = requirePreset('spec-driven');
  assert.equal(JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8')).workflow, 'spec-driven');
  await writeFile(join(dir, 'PRD.md'), PRD);
  assert.equal((await taskStage(dir, preset, 'pages')).stage, 'spec');
  const payload = JSON.parse((await quiet(['instructions', 'pages', '--json'], cwd)).output);
  assert.deepEqual([payload.focus.id, payload.focus.skill], ['spec', 'maverick-spec']);
  assert.ok(payload.focus.sections.includes('Traceability'));
  assert.deepEqual(payload.upstream, ['.maverick/tasks/pages/PRD.md']);
  await writeFile(join(dir, 'SPEC.md'), SPEC);
  assert.equal((await taskStage(dir, preset, 'pages')).stage, 'techspec');
  const next = JSON.parse((await quiet(['instructions', 'pages', 'techspec', '--json'], cwd)).output);
  assert.deepEqual(next.upstream, ['.maverick/tasks/pages/PRD.md', '.maverick/tasks/pages/SPEC.md']);
  await writeFile(join(dir, 'TECHSPEC.md'), TECHSPEC);
  assert.equal((await taskStage(dir, preset, 'pages')).stage, 'tasks');
});

test('standard tasks never ask for SPEC.md and reject the spec stage', async () => {
  const cwd = await shop();
  await quiet(['new', 'Paginate the orders list', '--slug', 'plain', '--no-launch'], cwd);
  const dir = join(cwd, '.maverick/tasks/plain');
  await writeFile(join(dir, 'PRD.md'), PRD);
  assert.equal((await taskStage(dir, requirePreset('standard'), 'plain')).stage, 'techspec');
  await assert.rejects(quiet(['validate', 'plain', '--stage', 'spec'], cwd), /stage must be one of prd, techspec, tasks for the standard workflow/);
});

test('SPEC.md is validated: scenarios, known criteria and traceability', async () => {
  const cwd = await shop();
  await quiet(['new', 'Paginate the orders list', '--slug', 'pages', '--no-launch', '--workflow', 'spec-driven'], cwd);
  const dir = join(cwd, '.maverick/tasks/pages');
  await writeFile(join(dir, 'PRD.md'), PRD);
  assert.ok((await lintTask(cwd, dir, { stage: 'spec' })).some(item => item.file === 'SPEC.md' && /not written yet; run the maverick-spec skill/.test(item.message)));
  await writeFile(join(dir, 'SPEC.md'), SPEC);
  assert.deepEqual(await lintTask(cwd, dir, { stage: 'spec', strict: true }), []);
  await writeFile(join(dir, 'SPEC.md'), SPEC.replace('| AC-02 | SC-02 | listOrders |\n', '| AC-09 | SC-02 | listOrders |\n').replace('- **THEN** it gets an `invalid_cursor` error\n', '').replace(/```js[\s\S]*?```/, 'listOrders returns items.'));
  const messages = (await lintTask(cwd, dir, { stage: 'spec' })).map(item => `${item.status} ${item.message}`);
  assert.ok(messages.includes('FAIL references AC-09, which PRD.md does not define'));
  assert.ok(messages.includes('FAIL a scenario of "Bad cursors are rejected" needs WHEN and THEN lines'));
  assert.ok(messages.includes('WARN Traceability does not map AC-02 to a scenario or contract'));
  assert.ok(messages.some(message => /^WARN Contracts has no code block/.test(message)));
});

test('the spec flow waits for a human to approve SPEC.md', async () => {
  const cwd = await shop();
  await quiet(['new', 'Paginate the orders list', '--slug', 'pages', '--no-launch', '--spec'], cwd);
  const dir = join(cwd, '.maverick/tasks/pages');
  await writeFile(join(dir, 'PRD.md'), PRD);
  await writeFile(join(dir, 'SPEC.md'), SPEC);
  await assert.rejects(quiet(['flow', 'run', 'spec', 'pages'], cwd), /awaiting-approval/);
  const state = await readState(dir, 'spec');
  assert.deepEqual(state.runs.at(-1).results.map(gate => [gate.id, gate.status]), [['spec-artifact', 'pass'], ['spec-validation', 'pass'], ['spec-approval', 'pending']]);
  await writeFile(join(dir, 'SPEC.md'), SPEC.replace('- [ ] Spec approved', '- [x] Spec approved'));
  await quiet(['flow', 'run', 'spec', 'pages'], cwd);
  assert.equal((await readState(dir, 'spec')).status, 'done');
});
