import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, sectionPresent, replaceVars } from '../src/cli.js';
import { stagesForPreset } from '../src/core/presets.js';
import { recommendPreset } from '../src/core/preset-suggestion.js';
import { buildProjectIndex, cacheProjectIndex } from '../src/core/lens-index.js';
import { commandRegistry } from '../src/core/command-registry.js';

test('replaceVars replaces all variables', () => {
  assert.equal(replaceVars('{{A}}-{{A}}-{{B}}',{A:'x',B:'y'}),'x-x-y');
});

test('sectionPresent finds markdown headings', () => {
  assert.equal(sectionPresent('# Objective\ntext','Objective'), true);
  assert.equal(sectionPresent('## Other\ntext','Objective'), false);
});

test('init creates task artifacts', async () => {
  const cwd = await mkdtemp(join(tmpdir(),'maverick-'));
  await main(['init','sample-task'],cwd);
  const task = await readFile(join(cwd,'.maverick/tasks/sample-task/TASK.md'),'utf8');
  assert.match(task,/sample-task/);
});

test('init without a slug creates canonical project config', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await main(['init'], cwd);
  const config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.equal(config.version, 1);
  assert.equal(config.adapter, 'generic');
});

test('task rejects unsafe slugs and overwrite', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await assert.rejects(main(['task', '../unsafe'], cwd), /lowercase slug/);
  await main(['task', 'safe-task'], cwd);
  await assert.rejects(main(['task', 'safe-task'], cwd), /already exists/);
});

test('validate reports missing required sections', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await main(['task', 'missing-sections'], cwd);
  await writeFile(join(cwd, '.maverick/tasks/missing-sections/TASK.md'), '# Problem\n');
  await assert.rejects(main(['validate', 'missing-sections'], cwd), /validation error/);
});

test('presets generate their distinct required artifacts', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await main(['task', 'small', '--preset', 'lightweight'], cwd);
  await main(['task', 'complex', '--preset', 'spec-driven'], cwd);
  await main(['task', 'risky', '--preset', 'strict-review', '--risk-doc'], cwd);
  const files = async slug => (await readdir(join(cwd, '.maverick/tasks', slug))).sort();
  assert.deepEqual(await files('small'), ['CONTEXT.md', 'REVIEW.md', 'TASK.json', 'TASK.md']);
  assert.ok((await files('complex')).includes('SPEC.md'));
  assert.ok((await files('risky')).includes('RISK.md'));
});

test('preset stages and local recommendations are deterministic', () => {
  assert.deepEqual(stagesForPreset('lightweight'), ['brief', 'context', 'build', 'verify', 'review']);
  assert.equal(recommendPreset({ type: 'migration' }).preset, 'strict-review');
  assert.equal(recommendPreset({ complexity: 'high', openQuestions: 1 }).preset, 'spec-driven');
  assert.equal(recommendPreset({ risk: 'low', estimatedFiles: 2 }).preset, 'lightweight');
});

test('Lens indexes commands, task artifacts, docs, and writes only a local cache', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-lens-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'lens-fixture', scripts: { test: 'node --version' } }));
  await main(['task', 'lens-task', '--preset', 'spec-driven'], cwd);
  await writeFile(join(cwd, 'entry.js'), "import { value } from './dependency.js';\nexport { value };\n");
  await writeFile(join(cwd, 'dependency.js'), 'export const value = 1;\n');
  const index = await buildProjectIndex(cwd);
  assert.equal(index.project.name, 'lens-fixture');
  assert.equal(index.tasks[0].id, 'lens-task');
  assert.ok(index.specs.some(spec => spec.path.endsWith('SPEC.md')));
  assert.match(index.specs[0].content, /Specification/);
  assert.ok(index.couplings.some(link => link.from === 'entry.js' && link.to === './dependency.js'));
  assert.ok(index.improvements.some(item => item.preset));
  assert.ok(index.commands.some(command => command.id === 'dashboard'));
  assert.ok(commandRegistry.some(command => command.id === 'readiness'));
  const cache = await cacheProjectIndex(cwd, index);
  assert.match(await readFile(cache, 'utf8'), /lens-fixture/);
});

test('invalid presets are rejected and old configs default to standard', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await writeFile(join(cwd, 'maverick.config.json'), JSON.stringify({ version: 1 }));
  await main(['task', 'old-config-task'], cwd);
  const metadata = JSON.parse(await readFile(join(cwd, '.maverick/tasks/old-config-task/TASK.json'), 'utf8'));
  assert.equal(metadata.preset, 'standard');
  await assert.rejects(main(['task', 'bad', '--preset', 'unknown'], cwd), /invalid preset/);
});

test('map, packet, verify, and operational status create task evidence', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --version' } }));
  await main(['task', 'operational'], cwd);
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
  assert.match(await readFile(join(taskDir, 'TASK-PACKET.md'), 'utf8'), /Agent: codex/);
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
