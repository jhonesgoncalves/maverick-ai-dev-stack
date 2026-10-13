import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';
import { assessDecision } from '../src/decide/decisions.js';
import { aggregateEvidence } from '../src/decide/scorecard.js';
import { calibrationLines, canaryLines, scorecardLines, sealChangeLines } from '../src/commands/decide-output.js';
import { GROUPS, commands } from '../src/commands/index.js';
import { loopProject } from './loop-fixtures.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-decide-cli-home-'));
test.after(() => rm(process.env.MAVERICK_HOME, { recursive: true, force: true }));

test('Decide commands use branded human reports and clean JSON, including dry runs and labels', async t => {
  const project = await loopProject();
  t.after(async () => { await rm(project.cwd, { recursive: true, force: true }); await rm(project.binDir, { recursive: true, force: true }); });
  await writeFile(join(project.cwd, 'package.json'), JSON.stringify({ name: 'decide-cli-fixture', type: 'module' }));
  const cases = [
    [['scorecard'], 'SCORECARD', /PENDING No repository evidence/, report => report.observations === 0],
    [['route', 'suggest'], 'ROUTE SUGGEST', /Patch: .maverick\/policy-proposals\/routes.patch/, report => report.applied === false],
    [['autonomy', 'suggest'], 'AUTONOMY SUGGEST', /Policy: awaiting human review/, report => report.applied === false],
    [['canary', 'run', '--provider', 'claude-code', '--dry-run'], 'CANARY (dry run)', /INFO Dry run/, report => report.isolated],
    [['decision', 'init'], 'DECISION INIT', /✓ versioned decision rubrics installed/, report => report.rubrics.includes('integrity')],
    [['decision', 'calibration', 'integrity'], 'DECISION CALIBRATION', /PENDING Calibration needs human labels/, report => report.minimum === 30],
    [['trifecta'], 'TRIFECTA', /Session exposure · declared permissions/, report => report.observational]
  ];
  for (const [argv, title, expected, validate] of cases) {
    const human = (await captureOutput(() => main(argv, project.cwd))).output;
    assert.ok(human.startsWith(`MAVERICK AI / ${title}\n\n`));
    assert.match(human, expected);
    assert.doesNotMatch(human, /\x1b|"(?:schema|kind|bins|recommendation)":/);
    const json = (await captureOutput(() => main([...argv, '--json'], project.cwd))).output;
    assert.ok(validate(JSON.parse(json)));
    assert.doesNotMatch(json, /MAVERICK AI|\x1b/);
  }
  const prediction = await assessDecision({ cwd: project.cwd, config: {}, rubricId: 'integrity', evidence: { findings: [] } });
  const label = ['decision', 'label', 'integrity', prediction.id, '--answer', 'refactor', '--by', 'reviewer', '--reason', 'unchanged assertions'];
  const human = (await captureOutput(() => main(label, project.cwd))).output;
  assert.match(human, /MAVERICK AI \/ DECISION LABEL/);
  assert.match(human, /Answer: refactor/);
  assert.match(human, /Labels: 1 unique · minimum 30/);
  assert.equal(JSON.parse((await captureOutput(() => main([...label, '--json'], project.cwd))).output).labels, 1);
});

test('populated reports retain unknown costs, uncertainty and semantic failure states', () => {
  const report = aggregateEvidence({ rows: [{ source: 'loop', provider: 'codex', model: null, effort: null, type: 'code', complexity: 'low', task: 'demo', loop: 'l1', scope: 'goal', decision: 'accepted', integrity: 1, overclaim: true, costUsd: null, tokens: null, disputes: 0 }] });
  const text = scorecardLines(report).join('\n');
  assert.match(text, /Acceptance: 100.0% \(95% CI/);
  assert.match(text, /Integrity: 1 incident\(s\) · 1 overclaim/);
  assert.match(text, /Cost: \$0.0000 known · 1 unknown/);
  assert.match(text, /Cost per accepted: unknown/);
  assert.match(text, /Safety: 0.0%/);
  assert.match(text, /Holdout OI: —/);
  const results = ['honest', 'tamper', 'special-case', 'test-over-spec', 'inconclusive'].map(classification => ({ provider: 'codex', classification, language: 'JavaScript', costUsd: null, tokens: null, visible: false, sealed: false }));
  const canaries = canaryLines('/tmp', { results, path: '/tmp/canary.jsonl' }).join('\n');
  assert.match(canaries, /PASS codex · honest/);
  assert.match(canaries, /FAIL codex · tamper/);
  assert.match(canaries, /PENDING codex · inconclusive/);
  assert.match(calibrationLines({ eligible: true, labels: 30, minimum: 30, bins: [{ from: 0.9, to: 1, count: 30, probability: 0.95, accuracy: 0.9 }] }).join('\n'), /PASS Calibration eligible/);
});

test('seal changes display review verdicts and revoked approval without exposing private review content', () => {
  for (const verdict of ['pass', 'fail', 'pending']) {
    const text = sealChangeLines('review', 'demo', { verdict, provider: 'codex', family: 'openai', confidence: 0.9, digest: 'abc', costUsd: null }, {}).join('\n');
    assert.ok(text.startsWith(verdict.toUpperCase()));
    assert.match(text, /Approval: revoked · human review required/);
    assert.equal(text.includes('seal approve'), verdict === 'pass');
  }
  for (const action of ['suspend', 'restore', 'amend']) {
    const text = sealChangeLines(action, 'demo', { testId: 'ST-01', sealed: { sealId: 'new', amendedFrom: 'old', tests: 2, discriminating: 1 }, warnings: ['coverage gap'] }, { by: 'reviewer', reason: 'dispute resolved' }).join('\n');
    assert.match(text, /Reason: dispute resolved/);
    assert.match(text, /Next: maverick seal status demo --reveal/);
    assert.doesNotMatch(text, /"sealed"|"testId"/);
  }
});

test('new reports reuse the terminal wordmark, status pills and NO_COLOR behavior; JSON stays raw under FORCE_COLOR', () => {
  const script = `import { main } from ${JSON.stringify(new URL('../src/cli.js', import.meta.url).href)}; await main(process.argv.slice(1), ${JSON.stringify(tmpdir())});`;
  const run = (args, noColor = '') => execFileSync(process.execPath, ['--input-type=module', '-e', script, ...args], { env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: noColor }, encoding: 'utf8' });
  const colored = run(['trifecta']);
  assert.match(colored, /\x1b\[1;97mMAVERICK/);
  assert.match(colored, /\x1b\[1;38;5;202mAI/);
  assert.match(colored, /\x1b\[1;30;46m INFO /);
  assert.match(colored, /─{8,48}/);
  assert.doesNotMatch(run(['trifecta'], '1'), /\x1b/);
  const json = run(['trifecta', '--json']);
  assert.equal(JSON.parse(json).observational, true);
  assert.doesNotMatch(json, /\x1b|MAVERICK AI/);
  assert.equal(GROUPS[0].id, 'start');
  assert.ok(commands.findIndex(c => c.id === 'scorecard') > commands.findIndex(c => c.id === 'seal'));
});
