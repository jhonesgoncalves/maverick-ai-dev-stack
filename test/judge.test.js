import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';
import { buildEvidencePacket, loadCriteria, normalizeVerdict, parseVerdictBlock, selectJudge } from '../src/flows/judge.js';
import { flowSchema } from '../src/flows/model.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));
const node = process.execPath;

const config = (extra = {}) => ({ runtime: { trusted: ['claude-code', 'codex', 'gemini', 'copilot'], families: {}, ...extra } });
const always = () => true;

test('a judge comes from another model family, and independence is never assumed', () => {
  const pick = (makers, gate = {}, extra) => selectJudge({ config: config(extra), cwd: '.', makers, gate, isInstalled: always });
  assert.equal(pick([{ provider: 'claude-code' }]).plan.provider.id, 'codex');
  assert.equal(pick([{ provider: 'codex', model: 'gpt-6-sol' }]).plan.provider.id, 'claude-code');
  assert.equal(pick([{ provider: 'claude-code' }, { provider: 'codex' }]).plan.provider.id, 'gemini');
  assert.match(pick([{ provider: 'copilot' }]).reason, /model family of copilot is unknown; set runtime\.families/);
  assert.equal(pick([{ provider: 'copilot', model: 'claude-sonnet-5' }]).plan.provider.id, 'codex', 'the model name decides the family');
  assert.match(pick([{ provider: 'claude-code' }], { provider: 'claude-code' }).reason, /not independent/);
  assert.equal(pick([{ provider: 'claude-code' }], { independence: 'cross-provider', provider: 'copilot' }, { families: {} }).plan.provider.id, 'copilot');
  assert.match(selectJudge({ config: { runtime: { trusted: ['claude-code'] } }, cwd: '.', makers: [{ provider: 'claude-code' }], isInstalled: always }).reason, /no trusted, installed provider can judge independently/);
  assert.match(selectJudge({ config: config(), cwd: '.', makers: [{ provider: 'claude-code' }], isInstalled: provider => provider.id !== 'codex' }).plan.provider.id, /gemini/, 'missing CLIs are skipped');
});

test('verdicts are parsed strictly and made consistent with the criteria', () => {
  const block = value => `Review done.\n\`\`\`maverick-verdict\n${JSON.stringify(value)}\n\`\`\``;
  assert.equal(parseVerdictBlock('no block'), null);
  assert.equal(parseVerdictBlock(block({ verdict: 'pass', confidence: 1.5 })), null);
  assert.equal(parseVerdictBlock('```json\n{"verdict":"pass","confidence":0.9}\n```'), null);
  assert.equal(parseVerdictBlock(`${block({ verdict: 'fail', confidence: 0.2 })}\n${block({ verdict: 'pass', confidence: 0.9 })}`).verdict, 'pass', 'the last block wins');
  const criteria = [{ id: 'AC-01', required: true }, { id: 'AC-02', required: true }];
  const lucky = normalizeVerdict({ verdict: 'pass', criteria: [{ id: 'AC-01', met: true, evidence: 'src/a.js:3' }], issues: [], confidence: 0.95 }, criteria, 0.7);
  assert.deepEqual([lucky.unmet, lucky.confidence < 0.7], [['AC-02'], true], 'an unassessed criterion is unmet, so a pass cannot be confident');
  const vague = normalizeVerdict({ verdict: 'pass', criteria: [{ id: 'AC-01', met: true, evidence: '' }, { id: 'AC-02', met: true, evidence: 'x' }], issues: [], confidence: 0.9 }, criteria, 0.7);
  assert.ok(vague.confidence < 0.7, 'met without evidence is not confident');
  assert.ok(flowSchema.safeParse({ apiVersion: 'maverick.flow/v1', name: 'judged', description: 'A flow with a judge gate.', contract: { goal: 'x' }, gates: [{ id: 'judge', type: 'judge', rubric: ['Errors are handled'], threshold: 0.8 }] }).success);
});

test('the evidence packet holds criteria, harness evidence and the diff, never the author\'s account', async () => {
  const taskDir = await mkdtemp(join(tmpdir(), 'maverick-packet-'));
  await writeFile(join(taskDir, 'PRD.md'), '# PRD\n\n## Acceptance Criteria\n- AC-01: Totals include tax\n- AC-02: Errors are reported\n');
  await writeFile(join(taskDir, 'EVIDENCE.md'), '# Verification Evidence\n\n## PASS — npm test\n');
  const criteria = await loadCriteria(taskDir, { scope: 'auto', rubric: ['No new dependency'] });
  assert.deepEqual(criteria.map(item => item.id), ['R-01', 'AC-01', 'AC-02']);
  const patch = 'diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-a\n+b\n';
  const packet = await buildEvidencePacket({ task: 'demo', taskDir, criteria, results: [{ id: 'checks', type: 'check', status: 'pass', issues: [] }], integrity: { findings: [{ severity: 'warn', kind: 'claim-mismatch', message: 'x' }] }, diff: { patch, numstat: [{ path: 'src/a.js', added: 1, deleted: 1 }] } });
  assert.match(packet.text, /\| AC-02 \| Errors are reported \| PRD\.md \|/);
  assert.match(packet.text, /### Gates\n- checks \(check\): pass/);
  assert.match(packet.text, /\+b/);
  assert.match(packet.text, /you will not see the author's explanation/);
  const again = await buildEvidencePacket({ task: 'demo', taskDir, criteria, results: [{ id: 'checks', type: 'check', status: 'pass', issues: [] }], integrity: { findings: [{ severity: 'warn', kind: 'claim-mismatch', message: 'x' }] }, diff: { patch, numstat: [{ path: 'src/a.js', added: 1, deleted: 1 }] } });
  assert.equal(packet.digest, again.digest, 'the same change gives the same digest');
  await assert.rejects(loadCriteria(taskDir, { rubric: { file: '../outside.md' } }), /must stay inside the task/);
});

/** A fake judge CLI (a custom provider reading the prompt on stdin) that logs where and what it was asked. */
async function fakeJudge(dir, id, verdicts) {
  const path = join(dir, `${id}.mjs`);
  await writeFile(path, `import { readFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';
const prompt = readFileSync(0, 'utf8');
const log = ${JSON.stringify(join(dir, `calls-${id}.jsonl`))};
const call = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\\n').length + 1 : 1;
appendFileSync(log, JSON.stringify({ cwd: process.cwd(), prompt, files: readdirSync('.') }) + '\\n');
const ids = [...prompt.matchAll(/^\\| ((?:AC|R|S)-\\d+) \\|/gm)].map(match => match[1]);
const plan = ${JSON.stringify(verdicts)}[Math.min(call, ${verdicts.length}) - 1];
const verdict = { verdict: plan.verdict, confidence: plan.confidence ?? 0.9, issues: plan.issues || [], criteria: ids.map(id => ({ id, met: plan.verdict === 'pass', evidence: plan.verdict === 'pass' ? 'src/a.txt:1 exists' : 'not implemented' })) };
console.log('Reviewed.');
console.log(plan.raw ?? '\\x60\\x60\\x60maverick-verdict\\n' + JSON.stringify(verdict) + '\\n\\x60\\x60\\x60');
`);
  await chmod(path, 0o755);
  return { id, command: `"${node}" "${path}"`, permissions: ['read-only'] };
}
const judgeCalls = async (dir, id) => { try { return (await readFile(join(dir, `calls-${id}.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line)); } catch { return []; } };

async function judgedProject(judges, families) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-judged-')), bin = await mkdtemp(join(tmpdir(), 'maverick-judges-'));
  const custom = [];
  for (const [id, verdicts] of Object.entries(judges)) custom.push(await fakeJudge(bin, id, verdicts));
  await mkdir(join(cwd, '.maverick/flows'), { recursive: true }); await mkdir(join(cwd, 'src'), { recursive: true });
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ version: 1, runtime: { trusted: Object.keys(judges), custom, families } }));
  await writeFile(join(cwd, '.maverick/flows/judged.yaml'), `apiVersion: maverick.flow/v1\nname: judged\ndescription: A judge gate after a check.\ncontract:\n  goal: Judged for {{task}}.\ngates:\n  - { id: ok, type: command, run: '"${node}" -e "process.exit(0)"' }\n  - { id: judge, type: judge, rubric: ['src/a.txt holds the answer'] }\n`);
  await captureOutput(() => main(['new', 'Demo', '--slug', 'demo', '--no-launch'], cwd));
  await writeFile(join(cwd, '.maverick/tasks/demo/PRD.md'), '# PRD\n\n## Acceptance Criteria\n- AC-01: src/a.txt exists\n');
  // The author: a transcript of an editing run by Claude, with a summary the judge must never see.
  await mkdir(join(cwd, '.maverick/tasks/demo/runs'), { recursive: true });
  await writeFile(join(cwd, '.maverick/tasks/demo/runs/2026-10-11T00-00-00-000Z-claude-code.jsonl'), `${JSON.stringify({ type: 'start', provider: 'claude-code', model: 'sonnet', permission: 'edit' })}\n${JSON.stringify({ type: 'text', text: 'SENTINEL-AUTHOR-SUMMARY' })}\n`);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T'); git('add', '-A'); git('commit', '-qm', 'init');
  await writeFile(join(cwd, 'src/a.txt'), '42\n');
  return { cwd, bin };
}

test('a judge gate runs another family read-only in an export of the change, and a human settles disagreement', async () => {
  const { cwd, bin } = await judgedProject({ 'judge-openai': [{ verdict: 'pass' }] }, { 'judge-openai': 'openai' });
  const { output } = await captureOutput(() => main(['flow', 'run', 'judged', 'demo'], cwd));
  assert.match(output, /PASS judge — judge-openai \(openai\) pass 90%/);
  const [call] = await judgeCalls(bin, 'judge-openai');
  assert.ok(!call.cwd.startsWith(cwd), 'the judge works in an export, not the project');
  assert.ok(call.files.includes('src') && !call.files.includes('.maverick'), 'the export has the code and none of Maverick\'s state');
  assert.doesNotMatch(call.prompt, /SENTINEL-AUTHOR-SUMMARY/);
  assert.match(call.prompt, /\| AC-01 \| src\/a\.txt exists/);
  assert.match(await readFile(join(cwd, '.maverick/tasks/demo/JUDGE-JUDGE.md'), 'utf8'), /Makers: claude-code \(sonnet\)/);
  await captureOutput(() => main(['flow', 'run', 'judged', 'demo'], cwd));
  assert.equal((await judgeCalls(bin, 'judge-openai')).length, 2, 'a flow that passed starts a fresh cycle');

  const split = await judgedProject({ 'judge-openai': [{ verdict: 'pass', confidence: 0.4 }], 'judge-google': [{ verdict: 'fail', confidence: 0.5 }] }, { 'judge-openai': 'openai', 'judge-google': 'google' });
  await assert.rejects(captureOutput(() => main(['flow', 'run', 'judged', 'demo'], split.cwd)), /awaiting-approval/);
  assert.equal((await judgeCalls(split.bin, 'judge-google')).length, 1, 'an unsure judge brings in a third family');
  await assert.rejects(main(['flow', 'approve', 'judged', 'demo', 'judge', '--reject'], split.cwd), /--reason/);
  await captureOutput(() => main(['flow', 'approve', 'judged', 'demo', 'judge', '--by', 'Ana'], split.cwd));
  const state = JSON.parse(await readFile(join(split.cwd, '.maverick/tasks/demo/flows/judged.json'), 'utf8'));
  assert.equal(state.status, 'done');
  assert.ok(state.approvals.judge.evidence, 'the decision is bound to the change the judges saw');
  await writeFile(join(split.cwd, 'src/a.txt'), '43\n');
  await assert.rejects(captureOutput(() => main(['flow', 'run', 'judged', 'demo', '--auto-approve'], split.cwd)), /awaiting-approval/, 'a changed tree needs a new decision, and auto-approve never decides a judge');

  const garbled = await judgedProject({ 'judge-openai': [{ raw: 'looks fine to me' }] }, { 'judge-openai': 'openai' });
  await assert.rejects(captureOutput(() => main(['flow', 'run', 'judged', 'demo'], garbled.cwd)), /outcome: revise/);
  const result = JSON.parse(await readFile(join(garbled.cwd, '.maverick/tasks/demo/flows/judged.json'), 'utf8')).runs[0].results.find(item => item.id === 'judge');
  assert.deepEqual(result.issues, ['judge: judge-openai returned no valid maverick-verdict block']);

  const alone = await judgedProject({ 'judge-anthropic': [{ verdict: 'pass' }] }, { 'judge-anthropic': 'anthropic' });
  await assert.rejects(captureOutput(() => main(['flow', 'run', 'judged', 'demo'], alone.cwd)), /awaiting-approval/);
  assert.equal((await judgeCalls(alone.bin, 'judge-anthropic')).length, 0, 'a judge of the author\'s own family is never asked');
});
