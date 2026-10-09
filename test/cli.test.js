import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, sectionPresent, replaceVars } from '../src/cli.js';
import { stagesForPreset } from '../src/core/presets.js';
import { captureOutput } from '../src/core/util.js';
import { planTask } from './fixtures.js';
import { buildProjectIndex, cacheProjectIndex } from '../src/core/lens-index.js';
import { commandRegistry } from '../src/core/command-registry.js';

// Keep tests independent of the developer's ~/.maverick/config.json.
process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

test('replaceVars replaces all variables', () => {
  assert.equal(replaceVars('{{A}}-{{A}}-{{B}}',{A:'x',B:'y'}),'x-x-y');
});

test('sectionPresent finds markdown headings', () => {
  assert.equal(sectionPresent('# Objective\ntext','Objective'), true);
  assert.equal(sectionPresent('## Other\ntext','Objective'), false);
});

test('init creates canonical project config', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await main(['init'], cwd);
  const config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.equal(config.version, 1);
  assert.equal(config.adapter, 'generic');
  assert.equal(config.workflow.default, 'standard');
});

test('new rejects unsafe slugs and overwrite, and resumes an existing task by slug', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await assert.rejects(main(['new', 'Demo idea', '--slug', '../unsafe', '--no-launch'], cwd), /lowercase slug/);
  await main(['new', 'Demo idea', '--slug', 'safe-task', '--no-launch'], cwd);
  await assert.rejects(main(['new', 'Other idea', '--slug', 'safe-task', '--no-launch'], cwd), /already exists/);
  const { output } = await captureOutput(() => main(['new', 'safe-task', '--no-launch'], cwd));
  assert.match(output, /resuming: safe-task/);
  assert.deepEqual(await readdir(join(cwd, '.maverick/tasks/safe-task')), ['TASK.json'], 'no templates are written');
});

test('workflow stages are fixed and strict adds a security gate', () => {
  assert.deepEqual(stagesForPreset('standard'), ['prd', 'techspec', 'tasks', 'build', 'verify', 'review', 'pr']);
  assert.ok(stagesForPreset('strict').includes('security'));
  assert.throws(() => stagesForPreset('lightweight'), /invalid workflow/);
});

test('Lens indexes commands, task artifacts, docs, and writes only a local cache', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-lens-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'lens-fixture', scripts: { test: 'node --version' } }));
  await main(['new', 'Paginate orders', '--slug', 'lens-task', '--no-launch'], cwd);
  await planTask(cwd, 'lens-task');
  await writeFile(join(cwd, 'entry.js'), "import { value } from './dependency.js';\nexport { value };\n");
  await writeFile(join(cwd, 'dependency.js'), 'export const value = 1;\n');
  const index = await buildProjectIndex(cwd);
  assert.equal(index.project.name, 'lens-fixture');
  assert.equal(index.tasks[0].id, 'lens-task');
  assert.equal(index.tasks[0].stage, 'build');
  assert.match(index.tasks[0].acceptanceCriteria, /AC-01/);
  assert.ok(index.specs.some(spec => spec.path.endsWith('PRD.md') && spec.status === 'documented'));
  assert.ok(index.couplings.some(link => link.from === 'entry.js' && link.to === 'dependency.js'));
  assert.ok(index.improvements.some(item => item.preset));
  assert.ok(index.commands.some(command => command.id === 'lens'));
  assert.ok(commandRegistry.some(command => command.id === 'readiness'));
  const cache = await cacheProjectIndex(cwd, index);
  assert.match(await readFile(cache, 'utf8'), /lens-fixture/);
});

test('diff gates only see the project directory when it is nested inside another repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'maverick-parent-')), cwd = join(root, 'examples/app');
  const git = (...args) => execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=Ana', ...args], { cwd: root, stdio: 'ignore' });
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeFile(join(root, 'parent.js'), 'export const a = 1;\n');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'nested', scripts: { test: 'node --version' } }));
  await writeFile(join(cwd, 'src/app.js'), 'export const b = 1;\n');
  await captureOutput(() => main(['new', 'Demo idea', '--slug', 'nested', '--no-launch'], cwd));
  await planTask(cwd, 'nested');
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'init');
  await writeFile(join(root, 'parent.js'), 'export const a = 2;\n');
  await writeFile(join(cwd, 'src/app.js'), 'export const b = 2;\n');
  const report = JSON.parse((await captureOutput(() => main(['guard', 'nested', '--json'], cwd).catch(() => {}))).output);
  assert.deepEqual(report.changed, ['src/app.js'], 'the parent repository change is not in scope, and paths are relative to the project; the committed task reports it rewrote are not changes');

  // A file the task created counts before `git add`; the task's own artifacts in .maverick/ do not.
  await writeFile(join(cwd, 'src/new.js'), "export const token = 'sk_live_abcdefghijklmnop';\n");
  const withNew = JSON.parse((await captureOutput(() => main(['guard', 'nested', '--json'], cwd).catch(() => {}))).output);
  assert.deepEqual(withNew.changed, ['src/app.js', 'src/new.js']);
  const security = JSON.parse((await captureOutput(() => main(['security', 'nested', '--json'], cwd).catch(() => {}))).output);
  assert.deepEqual(security.findings, ['Likely cloud/API secret assignment'], 'untracked content is scanned');

  // A project git has never tracked has no baseline: one clear finding, not every file.
  const fresh = join(root, 'examples/fresh');
  await mkdir(join(fresh, 'src'), { recursive: true });
  await writeFile(join(fresh, 'package.json'), JSON.stringify({ name: 'fresh' }));
  await writeFile(join(fresh, 'src/a.js'), 'export const a = 1;\n');
  await captureOutput(() => main(['new', 'Demo idea', '--slug', 'fresh', '--no-launch'], fresh));
  const untracked = JSON.parse((await captureOutput(() => main(['guard', 'fresh', '--json'], fresh).catch(() => {}))).output);
  assert.deepEqual(untracked.changed, []);
  assert.equal(untracked.findings.length, 1);
  assert.match(untracked.findings[0], /No git baseline/);
});

test('map, packet, verify, and operational status create task evidence', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --version' } }));
  await main(['new', 'Demo idea', '--slug', 'operational', '--no-launch'], cwd);
  await planTask(cwd, 'operational');
  await main(['map'], cwd);
  await main(['packet', 'operational', '--agent', 'codex'], cwd);
  await main(['verify', 'operational'], cwd);
  await main(['checkpoint', 'operational'], cwd);
  await main(['impact', 'package.json'], cwd);
  await main(['guard', 'operational'], cwd);
  await main(['learn', 'operational', '--rule', 'Run focused tests before review.'], cwd);
  await main(['policy', 'init'], cwd);
  await main(['policy', 'check', 'operational'], cwd);
  await main(['adapter', 'install', 'codex'], cwd);
  await main(['ci', 'github', 'operational'], cwd);
  await main(['handoff', 'operational', '--to', 'reviewer'], cwd);
  await main(['security', 'operational'], cwd);
  await main(['deps', 'operational'], cwd);
  await main(['pr', 'operational'], cwd);
  const taskDir = join(cwd, '.maverick/tasks/operational');
  assert.match(await readFile(join(cwd, '.maverick/context/PROJECT_MAP.md'), 'utf8'), /fixture/);
  assert.match(await readFile(join(taskDir, 'TASK-PACKET.md'), 'utf8'), /Agent: codex[\s\S]*## PRD\.md[\s\S]*## TECHSPEC\.md[\s\S]*01 Keyset pagination/);
  assert.match(await readFile(join(taskDir, 'PR-DRAFT.md'), 'utf8'), /Clients receive every order at once/);
  assert.match(await readFile(join(taskDir, 'EVIDENCE.md'), 'utf8'), /PASS/);
  assert.match(await readFile(join(taskDir, 'SECURITY-REPORT.md'), 'utf8'), /Human checks/);
  assert.match(await readFile(join(taskDir, 'DEPENDENCY-REVIEW.md'), 'utf8'), /Changed lockfiles/);
  assert.match(await readFile(join(taskDir, 'PR-DRAFT.md'), 'utf8'), /Human Review/);
  assert.match(await readFile(join(cwd, '.maverick/LEARNINGS.md'), 'utf8'), /focused tests/);
  assert.match(await readFile(join(taskDir, 'POLICY-CHECK.md'), 'utf8'), /Policy satisfied/);
  assert.match(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), /Maverick adapter/);
  assert.match(await readFile(join(cwd, '.github/workflows/maverick-operational.yml'), 'utf8'), /validate operational/);
  assert.match(await readFile(join(taskDir, 'HANDOFF.md'), 'utf8'), /reviewer/);
  await assert.rejects(main(['readiness', 'operational'], cwd), /readiness gates/);
  assert.match(await readFile(join(taskDir, 'MERGE-READINESS.md'), 'utf8'), /NOT READY/);
});

test('unknown commands suggest the closest match and help groups every command', async () => {
  const { GROUPS, commands, suggestCommand } = await import('../src/commands/index.js');
  assert.equal(suggestCommand('stak'), 'stack');
  assert.equal(suggestCommand('verfy'), 'verify');
  assert.equal(suggestCommand('zzzzzz'), undefined);
  await assert.rejects(main(['stak']), /did you mean "maverick stack"/);
  assert.deepEqual(GROUPS.flatMap(group => group.commands).sort(), commands.map(command => command.id).sort());
});

test('launcher pre-fills arguments from the latest task', async () => {
  const { prefill, needsInput, entriesFor } = await import('../src/ui/launcher.js');
  const { findCommand } = await import('../src/commands/index.js');
  const snapshot = { initialized: true, latest: { slug: 'add-orders', stage: 'build' }, tasks: [{ slug: 'add-orders' }] };
  assert.deepEqual(prefill(findCommand('review'), snapshot), ['add-orders', '--diff']);
  assert.deepEqual(prefill(findCommand('subtask'), snapshot), ['list', 'add-orders']);
  assert.equal(needsInput(findCommand('verify'), snapshot), false);
  assert.equal(needsInput(findCommand('new'), snapshot), true);
  assert.equal(entriesFor(snapshot, 'stak')[0].id, 'stack');
  assert.ok(entriesFor(snapshot).some(entry => entry.group === 'suggested' && entry.argv?.join(' ') === 'next add-orders'), 'building suggests the next task');
  const planning = entriesFor({ ...snapshot, latest: { slug: 'add-orders', stage: 'techspec' } });
  assert.ok(planning.some(entry => entry.group === 'suggested' && entry.id === 'new' && entry.argv?.[0] === 'add-orders'), 'planning suggests resuming it');
});

test('decorated output stays plain without a terminal', async () => {
  const { decorate } = await import('../src/core/style.js');
  const text = 'MAVERICK AI / DOCTOR\nPASS Node >= 20\nWARN Git — missing';
  assert.equal(decorate(text), text);
});

test('adapter install writes each tool its native instruction file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-adapter-'));
  for (const id of ['antigravity', 'windsurf', 'kiro', 'gemini', 'copilot']) await main(['adapter', 'install', id], cwd);
  assert.match(await readFile(join(cwd, '.agents/rules/maverick.md'), 'utf8'), /^---\ntrigger: model_decision/);
  assert.match(await readFile(join(cwd, '.windsurf/rules/maverick.md'), 'utf8'), /PRD\.md/);
  assert.match(await readFile(join(cwd, '.kiro/steering/maverick.md'), 'utf8'), /^---\ninclusion: always/);
  assert.match(await readFile(join(cwd, 'GEMINI.md'), 'utf8'), /Gemini CLI/);
  assert.match(await readFile(join(cwd, '.github/copilot-instructions.md'), 'utf8'), /TECHSPEC\.md/);
  await assert.rejects(main(['adapter', 'install', 'windsurf'], cwd), /already exists/);
});
