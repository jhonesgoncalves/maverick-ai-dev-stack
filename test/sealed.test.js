import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { calls, fails, loopProject, node, run, sh, state } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput } = await import('../src/core/util.js');
const { holdoutMetrics, testStatus } = await import('../src/sealed/run.js');
const { sha256 } = await import('../src/capabilities/model.js');
const { canonical } = await import('../src/loop/ledger.js');
const { sealReport } = await import('../src/sealed/seal.js');
const { sealPaths } = await import('../src/sealed/model.js');
const { decrypt, encrypt } = await import('../src/sealed/vault.js');
const { loadConfig } = await import('../src/core/config.js');

// Sealed tests: acceptance tests the builder never sees. These tests hold Maverick to the
// invariant that matters most: the hidden suite never reaches the work tree, git, a prompt or
// a leftover temporary file, and the loop is done only when it passes.

const cli = (cwd, ...args) => captureOutput(() => main(args, cwd));
const PRD = '# PRD — Demo\n\n## Overview\nTwo files with the right content.\n\n## Acceptance Criteria\n- [ ] AC-01: src/a.txt says right\n- [ ] AC-02: src/b.txt says right\n';
const RUNNERS = [{ match: 'test/sealed/**', run: `"${node}" --test {files}` }];
const sealedTest = (id, file, marker, expected = 'right') => `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n// ${id} ${marker}\ntest('${id}: ${file} says ${expected}', () => { assert.equal(readFileSync('${file}', 'utf8').trim(), '${expected}'); });\n`;

/** A builder that does what the visible checks ask (the files exist), and the right thing only once a human says so. */
const BUILDER = `const right = prompt.includes('RIGHT-CONTENT'); const files = { '01': ['src/a.txt'], '02': ['src/b.txt'] }[subtask] || ['src/a.txt', 'src/b.txt']; for (const file of files) write(file, right ? 'right' : 'x'); if (subtask) tick('.maverick/tasks/demo/subtasks/task_' + subtask + '.md');`;

async function sealedProject({ agents = { claude: BUILDER }, config = {}, marker = `SEALED-${randomBytes(8).toString('hex')}`, tests = [['AC-01', 'src/a.txt'], ['AC-02', 'src/b.txt']] } = {}) {
  const project = await loopProject({ agents, config: { verification: { commands: [`"${node}" check.mjs`], runners: RUNNERS }, ...config } });
  await writeFile(join(project.cwd, '.maverick/tasks/demo/PRD.md'), PRD);
  const source = await mkdtemp(join(tmpdir(), 'suite-src-'));
  await mkdir(join(source, 'test/sealed'), { recursive: true });
  for (const [id, file, expected] of tests) await writeFile(join(source, 'test/sealed', `${id.toLowerCase()}.sealed.test.mjs`), sealedTest(id, file, marker, expected));
  return { ...project, marker, source };
}

/** Every regular file under `dir` whose bytes contain `needle` (symlinks are not followed). */
async function filesContaining(dir, needle, found = []) {
  for (const entry of await readdir(dir).catch(() => [])) {
    const path = join(dir, entry), info = await lstat(path).catch(() => null);
    if (!info || info.isSymbolicLink()) continue;
    if (info.isDirectory()) await filesContaining(path, needle, found);
    else if (info.isFile() && (await readFile(path)).includes(needle)) found.push(path);
  }
  return found;
}

test('the holdout decides done: visible checks pass, sealed tests do not, and nothing of the suite leaks', async () => {
  const before = new Set(await readdir(tmpdir()));
  const { cwd, binDir, marker, source } = await sealedProject();
  const { output: sealed } = await cli(cwd, 'seal', 'demo', '--from-file', source);
  assert.match(sealed, /✓ 2 sealed test\(s\)/);
  assert.match(sealed, /Vacuity on the base: 2 fail as expected/);
  assert.match(sealed, /WARN the plaintext suite is still at/);
  await rm(source, { recursive: true, force: true });
  await fails(cwd, ['run', 'demo', '--sealed', 'required', '--quiet'], /loop\.sealed is required, but the sealed suite is unapproved/);
  await cli(cwd, 'seal', 'approve', 'demo', '--yes');

  // The reason lands in files the builder may read after a resume, so with feedback none it carries no number.
  const gap = await fails(cwd, ['run', 'demo'], /loop outcome: holdout-gap: the visible checks pass, the sealed tests do not reach their threshold \(100%\)$/);
  assert.match(gap.output, /Holdout: 0\/2 sealed pass · overfitting index \+100 pp/, 'the human at the terminal sees the numbers');
  const loop = await state(cwd);
  assert.equal(loop.status, 'holdout-gap');
  assert.deepEqual(loop.sealed.log.map(item => item.scope), ['baseline', 'subtask 01', 'subtask 02', 'done']);
  assert.deepEqual([loop.sealed.final.S, loop.sealed.final.Sac, loop.sealed.final.Vac, loop.sealed.final.OI], [0, 0, 1, 100]);
  // In the task the reports say only that the holdout failed; the numbers are in the copies outside the work tree.
  const report = await readFile(join(cwd, '.maverick/tasks/demo/LOOP.md'), 'utf8'), escalation = await readFile(join(cwd, '.maverick/tasks/demo/LOOP-ESCALATION.md'), 'utf8');
  assert.match(report, /## Holdout \(sealed tests\)[\s\S]*\| baseline \| [0-9a-f]{7} \| withheld \(query 1\/6\) \| nothing \|[\s\S]*\| done \(#2\) \| [0-9a-f]{7} \| below the threshold \| nothing \|/);
  assert.match(escalation, /## Holdout\nThe visible checks pass; the sealed tests the builder never saw do not\.[\s\S]*--reveal/);
  assert.doesNotMatch(`${report}${escalation}`, /0\/2|\+100 pp/);
  const full = escalation.match(/the full one, for you: `(.+LOOP-ESCALATION\.md)`/)[1];
  assert.match(await readFile(full, 'utf8'), /## Holdout[\s\S]*0\/2 pass[\s\S]*overfitting index \+100 pp/);
  assert.match(await readFile(full.replace('LOOP-ESCALATION.md', 'LOOP.md'), 'utf8'), /\| done \(#2\) \| [0-9a-f]{7} \| 0\/2 · OI \+100 pp \| nothing \|/);
  const prompts = await calls(binDir, 'claude');
  assert.match(prompts[0].prompt, /An independent holdout suite, written by another model family/);
  assert.ok(prompts.every(call => !/sealed pass|sealed tests at|withheld|## The holdout/.test(call.prompt)), 'with feedback none the builder learns nothing from the holdout');
  const { output: log } = await run(cwd, 'log', 'demo');
  assert.match(log, /sealed\s+baseline · query 1\/6 · withheld/);
  assert.match(log, /sealed-gap\s+S 0% · OI \+100 pp/);
  assert.match((await run(cwd, 'verify', 'demo')).output, /PASS/);

  // A human says what behavior is missing (not the test), and the loop goes back to work.
  const { output } = await run(cwd, 'run', 'demo', '--resume', '--note', 'each file must hold RIGHT-CONTENT: the word right');
  assert.match(output, /Outcome: DONE — every subtask is done and every blocking gate passes, and the sealed tests pass,/);
  const done = await state(cwd);
  assert.deepEqual([done.sealed.final.passed, done.sealed.final.total, done.sealed.final.OI], [2, 2, 0]);
  const config = await loadConfig(cwd);
  const revealed = await sealReport({ cwd, task: 'demo', taskDir: join(cwd, '.maverick/tasks/demo'), config, reveal: true });
  assert.deepEqual(revealed.tests.map(item => [item.id, item.base, item.last]), [['ST-01', 'fail', 'pass'], ['ST-02', 'fail', 'pass']]);

  // The invariant: the marker is nowhere a builder could look.
  assert.deepEqual(await filesContaining(cwd, marker), [], 'no file of the project, .git included, holds the suite');
  assert.ok(!execFileSync('git', ['cat-file', '--batch-all-objects', '--batch'], { cwd, maxBuffer: 1 << 28 }).includes(marker), 'no git object holds the suite');
  assert.ok((await calls(binDir, 'claude')).every(call => !call.prompt.includes(marker)), 'no prompt holds the suite');
  const residue = [];
  for (const entry of (await readdir(tmpdir())).filter(name => !before.has(name) && name.startsWith('maverick-'))) residue.push(...await filesContaining(join(tmpdir(), entry), marker));
  assert.deepEqual(residue, [], 'no temporary file outlives a run of the suite');
  assert.deepEqual(await filesContaining(process.env.MAVERICK_HOME, marker), [], 'the vault holds the suite encrypted only');

  // The loop's ledger, inside the work tree, holds result digests no one without the vault key can invert.
  const plain = sha256(canonical([{ id: 'ST-01', status: 'fail' }, { id: 'ST-02', status: 'fail' }]));
  assert.ok(!(await readFile(join(cwd, `.maverick/tasks/demo/loops/${done.loopId}/ledger.jsonl`), 'utf8')).includes(plain));

  // Sealing again after a loop measures the new suite against the code the loop started from, not the code it built.
  const again = await mkdtemp(join(tmpdir(), 'suite-src-'));
  await mkdir(join(again, 'test/sealed'), { recursive: true });
  await writeFile(join(again, 'test/sealed/ac-01.sealed.test.mjs'), sealedTest('AC-01', 'src/a.txt', marker));
  await writeFile(join(again, 'test/sealed/ac-02.sealed.test.mjs'), sealedTest('AC-02', 'src/b.txt', marker));
  assert.match((await cli(cwd, 'seal', 'demo', '--from-file', again)).output, /Vacuity on the base: 2 fail as expected/);
  assert.match((await cli(cwd, 'seal', 'demo', '--from-file', again, '--base', 'HEAD')).output, /Vacuity on the base: 2 fail as expected/, '--base chooses the code to measure against');
  await rm(again, { recursive: true, force: true });

  // At review the human opens the seal: the tests become protected regression tests.
  await cli(cwd, 'review', 'demo');
  assert.match(await readFile(join(cwd, '.maverick/tasks/demo/REVIEW.md'), 'utf8'), /## Sealed Acceptance Tests[\s\S]*- \[ \] commit the sealed tests/);
  const readiness = await cli(cwd, 'readiness', 'demo', '--json').then(() => null, error => JSON.parse(error.output));
  assert.ok(readiness.missing.some(item => /Decision on the sealed tests/.test(item)));
  const { output: opened } = await cli(cwd, 'unseal', 'demo', '--commit', '--protect');
  assert.match(opened, /2 file\(s\) written[\s\S]*added to loop\.protectedPaths/);
  assert.match(await readFile(join(cwd, 'test/sealed/ac-01.sealed.test.mjs'), 'utf8'), new RegExp(marker));
  assert.ok((await loadConfig(cwd)).loop.protectedPaths.includes('test/sealed/ac-01.sealed.test.mjs'));
  assert.match(await readFile(join(cwd, '.maverick/tasks/demo/REVIEW.md'), 'utf8'), /- \[x\] commit the sealed tests[\s\S]*Committed 2 file\(s\) as protected regression tests by/);
  assert.equal(JSON.parse(await readFile(join(cwd, '.maverick/tasks/demo/SEALED.json'), 'utf8')).status, 'committed');
  assert.match((await run(cwd, 'log', 'demo')).output, /unseal/);
  await assert.rejects(cli(cwd, 'unseal', 'demo', '--discard', '--yes'), /already committed/);
});

test('SEALED.json holds digests and counts only, and a tampered vault is refused', async () => {
  const { cwd, marker, source } = await sealedProject({ tests: [['AC-01', 'src/a.txt'], ['AC-02', 'src/keep.txt', 'ok']] });
  await cli(cwd, 'seal', 'demo', '--from-file', source);
  const text = await readFile(join(cwd, '.maverick/tasks/demo/SEALED.json'), 'utf8'), sealed = JSON.parse(text);
  assert.ok(!text.includes('test/sealed') && !text.includes(marker) && !text.includes('says'), 'no path, test name or test code');
  assert.deepEqual([sealed.tests, sealed.discriminating, sealed.vacuous], [2, 1, 1], 'a sealed test that already passes cannot discriminate');
  assert.deepEqual(sealed.criteria, { 'AC-01': 1, 'AC-02': 1 });
  const paths = sealPaths(cwd, 'demo', sealed.sealId), blob = await readFile(paths.suite);
  blob[blob.length - 1] ^= 1;
  await writeFile(paths.suite, blob);
  const config = await loadConfig(cwd), taskDir = join(cwd, '.maverick/tasks/demo');
  assert.match((await sealReport({ cwd, task: 'demo', taskDir, config, reveal: true })).tampered, /tampered with/);
  await cli(cwd, 'seal', 'approve', 'demo', '--yes');
  await fails(cwd, ['run', 'demo', '--quiet'], /tampered with/);
  const key = (await import('node:crypto')).randomBytes(32), sealedBlob = encrypt(key, 'hello', 'a');
  assert.equal(decrypt(key, sealedBlob, 'a').toString(), 'hello');
  assert.throws(() => decrypt(key, sealedBlob, 'b'), /tampered/, 'a file moved to another seal or role does not open');
  await assert.rejects(cli(cwd, 'seal', 'demo', '--from-file', join(cwd, 'src')), /inside the project/);
  const passing = await mkdtemp(join(tmpdir(), 'suite-src-'));
  await mkdir(join(passing, 'test/sealed'), { recursive: true });
  await writeFile(join(passing, 'test/sealed/keep.sealed.test.mjs'), sealedTest('AC-01', 'src/keep.txt', marker, 'ok'));
  await assert.rejects(cli(cwd, 'seal', 'demo', '--from-file', passing), /no sealed test fails on .+, so none can tell a built change from none/);
});

test('an independent agent writes the suite; a sealer or builder of the same family is refused', async () => {
  const marker = `SEALED-${randomBytes(8).toString('hex')}`;
  const sealerBin = await mkdtemp(join(tmpdir(), 'maverick-sealer-bin-')), script = join(sealerBin, 'sealer.mjs');
  const bundle = { files: [{ path: 'test/sealed/a.sealed.test.mjs', content: sealedTest('AC-01', 'src/a.txt', marker) }, { path: 'test/sealed/b.sealed.test.mjs', content: sealedTest('AC-02', 'src/b.txt', marker) }], tests: [{ id: 'ST-01', file: 0, name: 'AC-01: src/a.txt says right', ids: ['AC-01'] }, { id: 'ST-02', file: 1, name: 'AC-02: src/b.txt says right', ids: ['AC-02'], kind: 'behavior' }] };
  await writeFile(script, `import { readFileSync, appendFileSync } from 'node:fs';\nconst prompt = readFileSync(0, 'utf8');\nappendFileSync(${JSON.stringify(join(sealerBin, 'calls.jsonl'))}, JSON.stringify({ cwd: process.cwd(), prompt }) + '\\n');\nconsole.log('Here is the suite.');\nconsole.log('\\x60\\x60\\x60maverick-sealed');\nconsole.log(${JSON.stringify(JSON.stringify(bundle))});\nconsole.log('\\x60\\x60\\x60');\n`);
  const runtime = { trusted: ['claude-code', 'codex', 'sealer-openai'], custom: [{ id: 'sealer-openai', command: `"${node}" "${script}"`, permissions: ['read-only'] }], families: { 'sealer-openai': 'openai' } };
  const { cwd, binDir } = await sealedProject({ config: { runtime, sealed: { sealer: { provider: 'sealer-openai' } } } });
  const { output } = await cli(cwd, 'seal', 'demo');
  assert.match(output, /Sealer: sealer-openai \(openai\) · read-only · export of base [0-9a-f]{7} · builders: anthropic/);
  const asked = JSON.parse((await readFile(join(sealerBin, 'calls.jsonl'), 'utf8')).trim());
  assert.ok(!asked.cwd.startsWith(cwd), 'the sealer works in an export, outside the project');
  assert.match(asked.prompt, /## Criteria to test[\s\S]*\| AC-01 \| src\/a\.txt says right \| PRD\.md \|[\s\S]*## Surface: spec/);
  assert.ok(!existsSync(join(cwd, '.maverick/tasks/demo/runs')) || (await filesContaining(join(cwd, '.maverick/tasks/demo/runs'), marker)).length === 0, 'the sealer\'s transcript never lands in runs/');
  assert.deepEqual(await filesContaining(process.env.MAVERICK_HOME, marker), [], 'its transcript is in the vault, encrypted');
  const sealed = JSON.parse(await readFile(join(cwd, '.maverick/tasks/demo/SEALED.json'), 'utf8'));
  assert.deepEqual([sealed.sealer.provider, sealed.sealer.family, sealed.builders], ['sealer-openai', 'openai', ['anthropic']]);
  assert.ok(existsSync(join(sealPaths(cwd, 'demo', sealed.sealId).transcripts, 'sealer.jsonl.enc')));
  await cli(cwd, 'seal', 'approve', 'demo', '--yes');
  // Codex is OpenAI too: it cannot build against tests its own family wrote, whether chosen for the run or routed to fixes.
  await fails(cwd, ['run', 'demo', '--provider', 'codex', '--quiet'], /written by sealer-openai \(openai\), the family of codex, a builder of this loop/);
  const path = join(cwd, '.maverick/config.json'), config = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...config, runtime: { ...config.runtime, stages: { fix: { provider: 'codex' } } } }));
  await fails(cwd, ['run', 'demo', '--quiet'], /the family of codex, a builder of this loop/);
  await writeFile(path, JSON.stringify(config));
  await assert.rejects(cli(cwd, 'seal', 'demo', '--provider', 'claude-code'), /no independent sealer: claude-code is not trusted|no independent sealer: .*not independent of the makers \(anthropic\)/);
  assert.equal((await calls(binDir, 'codex')).length, 0);
});

test('with sealed.feedback count, a milestone tells the builder how many sealed tests pass, never which', async () => {
  const { cwd, binDir, source } = await sealedProject({ config: { sealed: { feedback: 'count' } } });
  await cli(cwd, 'seal', 'demo', '--from-file', source);
  await cli(cwd, 'seal', 'approve', 'demo', '--yes');
  await fails(cwd, ['run', 'demo', '--quiet'], /holdout-gap/);
  const prompts = await calls(binDir, 'claude');
  assert.match(prompts[1].prompt, /## The holdout\n\nThe independent holdout passed 0 of 2 sealed tests at subtask 01/);
  assert.ok(prompts.every(call => !/ST-0\d|test\/sealed|sealed\.test/.test(call.prompt)));
  assert.match((await run(cwd, 'log', 'demo')).output, /sealed\s+subtask 01 · query 2\/6 · 0\/2 · builder saw count/);
});

test('the sealed flow gate waits for a human below its threshold, and binds the decision to the exact tree', async () => {
  const { cwd, source } = await sealedProject();
  await mkdir(join(cwd, '.maverick/flows'), { recursive: true });
  await writeFile(join(cwd, '.maverick/flows/holdout.yaml'), 'apiVersion: maverick.flow/v1\nname: holdout\ndescription: Holdout flow for the sealed gate test.\ncontract:\n  goal: The sealed tests pass.\ngates:\n  - { id: holdout, type: sealed }\n');
  await writeFile(join(cwd, '.maverick/flows/counted.yaml'), 'apiVersion: maverick.flow/v1\nname: counted\ndescription: Counted holdout for the sealed gate test.\ncontract:\n  goal: The sealed tests pass.\ngates:\n  - { id: holdout, type: sealed, feedback: count, threshold: 0.5 }\n');
  await assert.rejects(cli(cwd, 'flow', 'run', 'holdout', 'demo'), /awaiting-approval/);
  await cli(cwd, 'seal', 'demo', '--from-file', source);
  await cli(cwd, 'seal', 'approve', 'demo', '--yes');
  const waiting = await cli(cwd, 'flow', 'run', 'holdout', 'demo').then(() => null, error => error);
  assert.match(waiting.message, /awaiting-approval/);
  assert.match(waiting.output, /WAIT holdout — a human decides[\s\S]*the sealed tests do not reach their threshold/);
  assert.ok(!existsSync(join(cwd, '.maverick/tasks/demo/EVIDENCE.md')), 'the sealed gate never writes evidence');
  const lock = join(cwd, '.maverick/tasks/demo/loops/lock');
  await mkdir(join(cwd, '.maverick/tasks/demo/loops'), { recursive: true });
  await writeFile(lock, JSON.stringify({ pid: process.pid, host: (await import('node:os')).hostname(), task: 'demo', loopId: 'x' }));
  assert.match((await cli(cwd, 'flow', 'run', 'counted', 'demo').then(() => null, error => error)).output, /a loop is running for this task; its sealed tests run inside it/);
  await rm(lock);
  await assert.rejects(cli(cwd, 'flow', 'run', 'counted', 'demo', '--reset'), /outcome: revise/);
  await writeFile(join(cwd, 'src/a.txt'), 'right\n');
  const { output } = await cli(cwd, 'flow', 'run', 'counted', 'demo', '--reset');
  assert.match(output, /PASS holdout — 1\/2 sealed pass/);
  // A human accepts the gap for this tree; any later change needs a new decision.
  await assert.rejects(cli(cwd, 'flow', 'run', 'holdout', 'demo', '--reset'), /awaiting-approval/);
  const { output: approved } = await cli(cwd, 'flow', 'approve', 'holdout', 'demo', 'holdout');
  assert.match(approved, /Outcome: DONE/);
  await cli(cwd, 'flow', 'run', 'holdout', 'demo');
  await writeFile(join(cwd, 'src/b.txt'), 'other\n');
  await assert.rejects(cli(cwd, 'flow', 'run', 'holdout', 'demo'), /awaiting-approval/);
});

test('holdout metrics leave out flaky, unmeasured and vacuous tests', () => {
  const bundle = { tests: [{ id: 'ST-01', ids: ['AC-01'], kind: 'behavior' }, { id: 'ST-02', ids: ['AC-01', 'AC-02'], kind: 'behavior' }, { id: 'ST-03', ids: ['AC-03'], kind: 'regression' }, { id: 'ST-04', ids: ['AC-04'], kind: 'behavior' }, { id: 'ST-05', ids: ['AC-05'], kind: 'behavior' }] };
  const tests = [{ id: 'ST-01', status: 'pass' }, { id: 'ST-02', status: 'fail' }, { id: 'ST-03', status: 'pass' }, { id: 'ST-04', status: 'flaky' }, { id: 'ST-05', status: 'pass' }];
  const metrics = holdoutMetrics({ bundle, tests, discriminating: new Set(['ST-01', 'ST-02', 'ST-04']), visible: () => true });
  assert.deepEqual([metrics.passed, metrics.total], [2, 3], 'ST-04 is flaky and ST-05 passed on the base; the regression guard ST-03 counts');
  assert.equal(metrics.Sac, 1 / 3);
  assert.equal(metrics.OI, 67);
  assert.deepEqual(metrics.escape, ['AC-01', 'AC-02']);
  assert.deepEqual(metrics.excluded, { flaky: 1, unmeasured: 0, vacuous: 1, suspended: 0 });
});

test('a seal whose PRD changed is stale: loops warn and run without it, and required refuses', async () => {
  const { cwd, source } = await sealedProject();
  await cli(cwd, 'seal', 'demo', '--from-file', source);
  await cli(cwd, 'seal', 'approve', 'demo', '--yes');
  // Ticking an acceptance criterion's box is progress, not a new criterion.
  await writeFile(join(cwd, '.maverick/tasks/demo/PRD.md'), PRD.replaceAll('- [ ] AC-', '- [x] AC-'));
  assert.match((await cli(cwd, 'seal', 'status', 'demo')).output, /READY/);
  await writeFile(join(cwd, '.maverick/tasks/demo/PRD.md'), PRD.replace('says right', 'says correct'));
  const { output } = await cli(cwd, 'seal', 'status', 'demo');
  assert.match(output, /STALE — PRD\.md acceptance criteria or SPEC\.md behavior changed since the seal/);
  await fails(cwd, ['run', 'demo', '--sealed', 'required'], /the sealed suite is stale/);
  const { output: ran } = await run(cwd, 'run', 'demo', '--feedback', 'detailed');
  assert.match(ran, /WARN the sealed suite is stale/);
  assert.match(ran, /Outcome: DONE/);
  assert.equal((await state(cwd)).sealed, null);
  assert.ok(sh(cwd, 'status', '--porcelain'));
});

test('a sealed test is measured by its own case, never by another case of the same file', () => {
  const ran = (ok, cases = []) => ({ started: true, ok, cases });
  const test = { name: 'AC-01: sums', match: 'case' };
  assert.equal(testStatus(test, ran(false, [{ name: 'AC-01: sums', status: 'pass' }, { name: 'AC-02: other', status: 'fail' }])), 'pass');
  assert.equal(testStatus(test, ran(false, [{ name: 'something else', status: 'fail' }])), 'unmeasured', 'cases reported, none of them this test');
  assert.equal(testStatus(test, ran(false, [{ name: '', status: 'fail' }])), 'fail', 'a nameless case matches nothing; the file decides');
  assert.equal(testStatus(test, ran(true)), 'pass', 'no per-case results: the file decides');
  assert.equal(testStatus({ name: 'test/sealed/a.test.mjs', match: 'file' }, ran(false, [{ name: 'x', status: 'pass' }])), 'fail');
  assert.equal(testStatus(test, { started: false }), 'unmeasured');
});
