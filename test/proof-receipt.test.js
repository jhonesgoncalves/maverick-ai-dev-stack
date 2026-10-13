/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { BUILD, loopProject, run, sh } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput } = await import('../src/core/util.js');
const { openEnvelope, pae, PAYLOAD_TYPE, trustedKeys } = await import('../src/proof/receipt.js');

const proof = (cwd, ...args) => captureOutput(() => main(['proof', ...args], cwd));
const refuses = async (cwd, args, pattern) => { const error = await proof(cwd, ...args).then(() => null, err => err); assert.ok(error, `expected proof ${args.join(' ')} to fail`); assert.match(error.output || error.message, pattern); return error; };

test('DSSE pre-authentication encoding binds the payload type', () => {
  assert.equal(pae('a/b', Buffer.from('hi')).toString(), 'DSSEv1 3 a/b 2 hi');
});

test('a proof receipt signs what proved the change and fails when the code, intent or receipt change', async () => {
  const { cwd } = await loopProject({ agents: { claude: BUILD } });
  await run(cwd, 'run', 'demo', '--quiet');
  await writeFile(join(cwd, '.maverick/tasks/demo/PRD.md'), '# PRD — Demo\n\n## Acceptance Criteria\n- AC-01: both files exist\n');
  const signed = await proof(cwd, 'sign', 'demo');
  assert.match(signed.output, /Loops: \d{8}-\d{6}-[0-9a-f]{4} done \(2\/2 kept, ledger verified\)/);
  assert.match(signed.output, /Models: builder claude-code/);
  assert.match(signed.output, /not committed: commit it, then sign again/);
  const envelope = JSON.parse(await readFile(join(cwd, '.maverick/tasks/demo/PROOF.json'), 'utf8'));
  assert.equal(envelope.payloadType, PAYLOAD_TYPE);
  const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString());
  assert.equal(statement.predicateType, 'https://maverick.dev/proof/v1');
  assert.match(statement.predicate.intent['PRD.md'], /^[0-9a-f]{64}$/);
  assert.equal(statement.predicate.ledgers[0].iterations.accepted, 2);
  assert.match((await proof(cwd, 'verify', 'demo')).output, /PASS the receipt is signed by a trusted key/);

  // The code moved on: the receipt no longer describes it.
  await writeFile(join(cwd, 'src/a.txt'), 'changed by hand\n');
  await refuses(cwd, ['verify', 'demo'], /the code changed since the receipt was signed/);
  await writeFile(join(cwd, 'src/a.txt'), 'x');
  // The intent moved on: the change was proved against another PRD.
  const prd = join(cwd, '.maverick/tasks/demo/PRD.md'), before = await readFile(prd, 'utf8');
  await writeFile(prd, `${before}\nOne more requirement.\n`);
  await refuses(cwd, ['verify', 'demo'], /PRD\.md changed since the receipt was signed/);
  await writeFile(prd, before);
  // A receipt edited after signing, or signed by an untrusted key, never verifies.
  const forged = { ...envelope, payload: Buffer.from(JSON.stringify({ ...statement, predicate: { ...statement.predicate, gates: { checks: { status: 'pass' } } } })).toString('base64') };
  await writeFile(join(cwd, 'forged.json'), JSON.stringify(forged));
  await refuses(cwd, ['verify', '--file', 'forged.json'], /changed after it was signed/);
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env.MAVERICK_PROOF_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  try {
    const { signStatement, signingKey } = await import('../src/proof/receipt.js');
    await writeFile(join(cwd, 'stranger.json'), JSON.stringify(signStatement(statement, await signingKey())));
  } finally { delete process.env.MAVERICK_PROOF_KEY; }
  await refuses(cwd, ['verify', '--file', 'stranger.json'], /a key this repository does not trust/);
  assert.equal(openEnvelope(envelope, await trustedKeys(cwd)).ok, true);

  // Committed, the receipt travels with the commit as a git note, and CI verifies the commit.
  await rm(join(cwd, 'forged.json')); await rm(join(cwd, 'stranger.json'));
  sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-qm', 'build demo');
  const noted = await proof(cwd, 'sign', 'demo');
  assert.match(noted.output, /attached to [0-9a-f]{12} in refs\/notes\/maverick/);
  assert.match((await proof(cwd, 'verify', '--commit', 'HEAD')).output, /PASS/);
  assert.match((await proof(cwd, 'verify', '--commit', 'HEAD', '--json')).output, /"ok": true/);
});

test('the receipt exports to Agent Trace with exact line ranges, and to a CycloneDX AI-BOM', async () => {
  const build = `const file = { '01': 'src/a.txt', '02': 'src/b.txt' }[subtask]; if (file) { write(file, 'one\\ntwo\\nthree\\n'); tick('.maverick/tasks/demo/subtasks/task_' + subtask + '.md'); }`;
  const { cwd } = await loopProject({ agents: { claude: build } });
  await run(cwd, 'run', 'demo', '--quiet');
  await writeFile(join(cwd, 'src/b.txt'), 'one\nedited by a human\nthree\n');
  const trace = JSON.parse((await proof(cwd, 'export', 'demo', '--format', 'agent-trace')).output);
  assert.equal(trace.tool.name, 'maverick');
  const a = trace.files.find(file => file.path === 'src/a.txt'), b = trace.files.find(file => file.path === 'src/b.txt');
  assert.deepEqual(a.conversations[0].ranges, [{ start_line: 1, end_line: 3 }]);
  assert.equal(a.conversations[0].contributor.type, 'ai');
  assert.match(a.conversations[0].contributor.model_id, /^claude-code/);
  assert.equal(a.conversations[0].related[0].iteration, 1);
  assert.deepEqual(b.conversations[0].ranges, [{ start_line: 1, end_line: 1 }, { start_line: 3, end_line: 3 }], 'a line edited by hand is not the agent\'s');
  const bom = JSON.parse((await proof(cwd, 'export', 'demo', '--format', 'aibom')).output);
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.specVersion, '1.6');
  assert.ok(bom.components.some(item => item.type === 'machine-learning-model' && item.publisher === 'claude-code'));
});

test('explain-back asks the reviewer three questions about the change; answers go to REVIEW.md and it never blocks', async () => {
  const asker = `if (/Ask exactly three questions/.test(prompt)) return { text: 'Here.\\n\\x60\\x60\\x60maverick-questions\\n' + JSON.stringify({ questions: [{ question: 'What happens when src/a.txt already exists?', why: 'overwrite vs append', files: ['src/a.txt'] }, { question: 'Which subtask writes src/b.txt, and when?', files: ['src/b.txt'] }, { question: 'What does the check gate read to decide?', files: ['check.mjs'] }, { question: 'A fourth question that is dropped?' }] }) + '\\n\\x60\\x60\\x60' };`;
  const { cwd, binDir } = await loopProject({ agents: { claude: asker } });
  const dir = join(cwd, '.maverick/tasks/demo');
  assert.equal(JSON.parse((await captureOutput(() => main(['explain', 'demo', '--json'], cwd))).output).enabled, false, 'opt-in');
  const configPath = join(cwd, '.maverick/config.json');
  await writeFile(configPath, JSON.stringify({ ...JSON.parse(await readFile(configPath, 'utf8')), review: { explainBack: true } }));
  await writeFile(join(cwd, 'src/a.txt'), 'x');
  await writeFile(join(dir, 'REVIEW.md'), '# Review\n\n## Decision\n- [ ] approve\n- [ ] request changes\n');
  const { output } = await captureOutput(() => main(['explain', 'demo'], cwd));
  assert.match(output, /Q1\. What happens when src\/a\.txt already exists\?[\s\S]*Q3\./);
  assert.doesNotMatch(output, /fourth/);
  const { calls } = await import('./loop-fixtures.js');
  const call = (await calls(binDir, 'claude')).at(-1);
  assert.match(call.prompt, /\+x/, 'the agent saw the diff');
  assert.notEqual(call.cwd, cwd, 'in an export, not the work tree');
  await captureOutput(() => main(['explain', 'demo', '--answer', 'q1', '--text', 'It is replaced, never appended.', '--by', 'ana'], cwd));
  const review = await readFile(join(dir, 'REVIEW.md'), 'utf8');
  assert.match(review, /## Decision\n- \[ \] approve/, 'the decision checklist is untouched');
  assert.match(review, /## Explain-back\n\n- \*\*Q1\. What happens[^\n]*\n {2}It is replaced, never appended\. — ana/);
  assert.match(await readFile(join(dir, 'EXPLAIN-BACK.md'), 'utf8'), /\*\*Answer\*\* \(ana/);
  // The same diff keeps its questions and answers; the gate reports and never fails.
  const again = JSON.parse((await captureOutput(() => main(['explain', 'demo', '--json'], cwd))).output);
  assert.equal(again.kept, true);
  assert.equal(again.questions[0].answer.by, 'ana');
  await captureOutput(() => main(['flow', 'run', 'ship', 'demo'], cwd)).catch(() => {});
  const ship = JSON.parse(await readFile(join(dir, 'flows/ship.json'), 'utf8')).runs.at(-1).results.find(item => item.id === 'explain-back');
  assert.deepEqual([ship.status, ship.severity], ['pass', 'warn']);
  assert.match(ship.summary, /3 question\(s\) for the reviewer, 1 answered/);
  await assert.rejects(main(['explain', 'demo', '--answer', 'Q9', '--text', 'x'], cwd), /no question Q9/);

  // Lens: the task shows the questions and the proof tree; answering needs the Lens token.
  await captureOutput(() => main(['attention', 'demo'], cwd));
  const { startLens } = await import('../src/lens/server.js');
  const port = 40000 + Math.floor(Math.random() * 20000), server = await startLens({ cwd, port, watch: false });
  try {
    const base = `http://127.0.0.1:${port}`, token = (await (await fetch(base)).text()).match(/name="lens-token" content="([a-f0-9]+)"/)[1];
    const task = await (await fetch(`${base}/api/task?task=demo`)).json();
    assert.equal(task.explainBack.questions.length, 3);
    assert.ok(Array.isArray(task.proofTree.tree));
    const answer = body => fetch(`${base}/api/explain/answer`, { method: 'POST', headers: { 'content-type': 'application/json', ...(body.token && { 'x-lens-token': token }) }, body: JSON.stringify(body) });
    assert.equal((await answer({ task: 'demo', id: 'Q2', text: 'Subtask 02.' })).status, 403);
    assert.equal((await answer({ task: 'demo', id: 'Q2', text: 'Subtask 02.', token: true })).status, 200);
    assert.match(await readFile(join(dir, 'REVIEW.md'), 'utf8'), /Subtask 02\./);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
