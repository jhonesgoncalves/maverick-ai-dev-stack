/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { BUILD, calls, fails, loopProject, node, run, sh, state, status } = await import('./loop-fixtures.js');

test('a loop builds subtask by subtask, checkpoints each, and leaves HEAD and the index alone', async () => {
  const { cwd, binDir } = await loopProject({ agents: { claude: BUILD } });
  const head = sh(cwd, 'rev-parse', 'HEAD');
  const { output } = await run(cwd, 'run', 'demo');
  assert.match(output, /Baseline: checks FAIL \(2 failing\) · keep PASS/);
  assert.match(output, /ACCEPTED #1 · checkpoint 0001 · subtask 01 done/);
  assert.match(output, /Outcome: DONE/);
  const loop = await state(cwd);
  assert.equal(loop.status, 'done');
  assert.deepEqual(loop.iterations.map(item => item.decision), ['accepted', 'accepted']);
  assert.equal(await status(cwd, '01'), 'done'); assert.equal(await status(cwd, '02'), 'done');
  assert.equal(sh(cwd, 'rev-parse', 'HEAD'), head, 'HEAD never moves');
  assert.equal(sh(cwd, 'diff', '--cached', '--name-only'), '', 'the index is untouched');
  assert.equal(sh(cwd, 'for-each-ref', '--format=%(refname)', 'refs/maverick/loops/demo/').split('\n').length, 3);
  assert.ok(existsSync(join(cwd, 'src/a.txt')) && existsSync(join(cwd, 'src/b.txt')));
  const prompts = await calls(binDir, 'claude');
  assert.match(prompts[0].prompt, /## Maverick loop/);
  assert.match(prompts[1].prompt, /#1 subtask 01 · claude-code .*accepted/);
  const { output: verified } = await run(cwd, 'verify', 'demo');
  assert.match(verified, /PASS the ledger chain is intact/);
  assert.ok(existsSync(join(cwd, '.maverick/tasks/demo/LOOP.md')));
});

test('an iteration that breaks a passing gate is rolled back and the reason reaches the next prompt', async () => {
  const { cwd, binDir } = await loopProject({ agents: { claude: `if (call === 1) { write('src/a.txt', 'x'); write('src/keep.txt', 'broken'); write('src/extra/new.txt', 'n'); return; } ${BUILD}` } });
  await run(cwd, 'run', 'demo');
  const loop = await state(cwd);
  assert.equal(loop.status, 'done');
  assert.equal(loop.iterations[0].decision, 'rejected');
  assert.match(loop.iterations[0].reasons.join('\n'), /gate-regression: keep passed at the checkpoint and fails now/);
  assert.equal((await readFile(join(cwd, 'src/keep.txt'), 'utf8')).trim(), 'ok');
  assert.ok(!existsSync(join(cwd, 'src/extra')), 'files the rejected iteration added are removed');
  assert.ok(existsSync(join(cwd, `.maverick/tasks/demo/loops/${loop.loopId}/rejected/1.patch`)));
  const prompts = await calls(binDir, 'claude');
  assert.match(prompts[1].prompt, /## The last attempt was rolled back[\s\S]*keep passed at the checkpoint/);
});

test('an agent cannot rewrite the checks: harness files are restored before the gates run', async () => {
  const tamper = `const path = '.maverick/config.json'; const config = JSON.parse(readFileSync(path, 'utf8')); config.verification.commands = ['true']; writeFileSync(path, JSON.stringify(config)); write('src/a.txt', 'x'); write('config/prod.json', '{}');`;
  const { cwd } = await loopProject({ agents: { claude: `if (call === 1) { ${tamper} return; } ${BUILD}` }, config: { loop: { protectedPaths: ['config/**'] } } });
  const before = await readFile(join(cwd, '.maverick/config.json'), 'utf8');
  await run(cwd, 'run', 'demo');
  const loop = await state(cwd);
  assert.equal(loop.iterations[0].decision, 'rejected');
  assert.ok(loop.iterations[0].findings.some(item => item.kind === 'protected-path-modified' && item.file === '.maverick/config.json'));
  assert.equal(await readFile(join(cwd, '.maverick/config.json'), 'utf8'), before);
  assert.ok(!existsSync(join(cwd, 'config/prod.json')));
  assert.equal(loop.status, 'done');
});

test('the integrity guard rolls back an iteration that skips a test to get through', async () => {
  const cheat = `write('src/a.txt', 'x'); write('test/keep.test.js', readFileSync('test/keep.test.js', 'utf8').replace("test('keeps", "test.skip('keeps")); tick('.maverick/tasks/demo/subtasks/task_01.md');`;
  const { cwd, binDir } = await loopProject({ agents: { claude: `if (call === 1) { ${cheat} return; } ${BUILD}` }, files: { 'test/keep.test.js': "import test from 'node:test';\ntest('keeps the file', () => {});\n" } });
  await run(cwd, 'run', 'demo');
  const loop = await state(cwd);
  assert.equal(loop.iterations[0].decision, 'rejected');
  assert.ok(loop.iterations[0].findings.some(item => item.kind === 'skip-or-only-added' && item.severity === 'block'));
  assert.match(await readFile(join(cwd, 'test/keep.test.js'), 'utf8'), /test\('keeps the file'/);
  // The next agent learns that a check was weakened, not which rule caught it, where or how (loop.feedback criteria).
  const retry = (await calls(binDir, 'claude'))[1].prompt;
  assert.match(retry, /## The last attempt was rolled back[\s\S]*a check was weakened, or a protected file or the repository changed/);
  assert.doesNotMatch(retry, /skip-or-only-added|test\.skip|It changed:/);
  assert.match(loop.iterations[0].reasons.join('\n'), /skip-or-only-added: test\/keep\.test\.js/, 'humans keep the detail');
  assert.equal(await status(cwd, '01'), 'done', 'the unticked boxes of the rejected attempt were restored, then ticked honestly');
  assert.equal(loop.status, 'done');
});

test('a stalled loop climbs the ladder: it switches vendor, then hands a human the escalation', async () => {
  const idle = `return { status: 'done', summary: 'all good' };`;
  const { cwd, binDir } = await loopProject({ agents: { claude: idle, codex: idle }, config: { loop: { providers: ['claude-code', 'codex'], escalation: ['switch-provider', 'human'], stall: { window: 2 } } } });
  const error = await fails(cwd, ['run', 'demo', '--quiet'], /loop outcome: stalled-escalated/);
  assert.match(error.output, /ESCALATE .*no-progress.* → switch-provider \(provider codex/);
  assert.equal((await calls(binDir, 'claude')).length, 2);
  const codex = await calls(binDir, 'codex');
  assert.equal(codex.length, 2);
  assert.match(codex[0].prompt, /## Diagnosis[\s\S]*no-progress/);
  const escalation = await readFile(join(cwd, '.maverick/tasks/demo/LOOP-ESCALATION.md'), 'utf8');
  assert.match(escalation, /STALLED-ESCALATED/);
  assert.match(escalation, /Providers: claude-code, codex/);
  assert.match(escalation, /--resume --note/);
  await fails(cwd, ['run', 'demo'], /waits for a human/);
  const { output: log } = await run(cwd, 'log', 'demo');
  assert.match(log, /escalation\s+#2 .*→ switch-provider/);
});

test('budgets stop a loop before an iteration that would exceed them, and a raised budget resumes it', async () => {
  const build = `const file = { '01': 'src/a.txt', '02': 'src/b.txt', '03': 'src/c.txt' }[subtask]; write(file, 'x'); tick('.maverick/tasks/demo/subtasks/task_' + subtask + '.md'); return { cost: 0.01 };`;
  const { cwd, binDir } = await loopProject({ agents: { claude: build }, subtasks: [['Create a', 'src/a.txt'], ['Create b', 'src/b.txt'], ['Create c', 'src/c.txt']], checks: ['src/a.txt', 'src/b.txt', 'src/c.txt'], config: { loop: { budgets: { maxCostUsd: 0.025 } } } });
  await fails(cwd, ['run', 'demo', '--quiet'], /budget-exceeded: forecast: the next iteration costs about \$0\.01, \$0\.01 remain/);
  assert.equal((await calls(binDir, 'claude')).length, 2);
  await fails(cwd, ['run', 'demo'], /the budget is exhausted/);
  const { output } = await run(cwd, 'run', 'demo', '--max-cost', '1');
  assert.match(output, /Outcome: DONE/);
  assert.equal((await calls(binDir, 'claude')).length, 3);
  assert.match((await run(cwd, 'log', 'demo')).output, /budget-change/);
  await fails(cwd, ['run', 'demo', '--max-iterations', '0'], /must be a positive number|the loop of demo is done/);
});

test('loop stop aborts the agent run, rolls its changes back, and a plain run continues', async () => {
  const { cwd, binDir } = await loopProject({ agents: { claude: `if (call === 1) { write('src/partial.txt', 'half'); await new Promise(resolve => setTimeout(resolve, 15000)); return; } ${BUILD}` } });
  const started = Date.now();
  const running = run(cwd, 'run', 'demo', '--quiet').then(() => null, error => error);
  while (!(await calls(binDir, 'claude')).length) await sleep(50);
  await sleep(200);
  const { output } = await run(cwd, 'stop', 'demo', '--reason', 'lunch');
  assert.match(output, /stop requested/);
  const error = await running;
  assert.match(error.message, /loop outcome: aborted: stopped by .*: lunch/);
  assert.ok(Date.now() - started < 10000, 'the agent run is aborted, not waited for');
  assert.ok(!existsSync(join(cwd, 'src/partial.txt')));
  assert.equal((await state(cwd)).status, 'aborted');
  await fails(cwd, ['stop', 'demo'], /no loop is running/);
  const { output: resumed } = await run(cwd, 'run', 'demo');
  assert.match(resumed, /Outcome: DONE/);
});

test('a loop killed mid-iteration is recovered: the half-done work is rolled back and the loop completes', async () => {
  const { cwd } = await loopProject({ agents: { claude: `if (call === 1) { write('src/junk.txt', 'junk'); process.kill(process.ppid, 'SIGKILL'); await new Promise(resolve => setTimeout(resolve, 5000)); return; } ${BUILD}` } });
  const cli = pathToFileURL(join(process.cwd(), 'src/cli.js')).href;
  const crashed = await new Promise(resolve => execFile(node, ['--input-type=module', '-e', `import { main } from '${cli}'; await main(['loop', 'run', 'demo', '--quiet'], process.cwd());`], { cwd, env: process.env }, error => resolve(error)));
  assert.equal(crashed?.signal, 'SIGKILL');
  assert.equal((await state(cwd)).status, 'running');
  assert.ok(existsSync(join(cwd, 'src/junk.txt')));
  const { output } = await run(cwd, 'run', 'demo');
  assert.match(output, /Recovered iteration 1: rolled back 1 file/);
  assert.match(output, /Outcome: DONE/);
  assert.ok(!existsSync(join(cwd, 'src/junk.txt')));
  assert.match((await run(cwd, 'log', 'demo')).output, /iteration-end\s+#1 aborted/);
  assert.match((await run(cwd, 'verify', 'demo')).output, /PASS/);
});

test('loop verify detects an edited, truncated or detached record', async () => {
  const { cwd } = await loopProject({ agents: { claude: BUILD } });
  await run(cwd, 'run', 'demo');
  const loop = await state(cwd), ledger = join(cwd, `.maverick/tasks/demo/loops/${loop.loopId}/ledger.jsonl`), original = await readFile(ledger, 'utf8');
  await writeFile(ledger, original.replace('"decision":"accepted"', '"decision":"rejected"'));
  await fails(cwd, ['verify', 'demo'], /fails verification/);
  assert.match((await run(cwd, 'verify', 'demo', '--json').catch(error => ({ output: error.output }))).output, /hash mismatch at entry/);
  await writeFile(ledger, original.split('\n').slice(0, -2).join('\n') + '\n');
  assert.match((await run(cwd, 'verify', 'demo').catch(error => ({ output: error.output }))).output, /entries were removed from the end/);
  await writeFile(ledger, original);
  const ref = 'refs/maverick/loops/demo/0001', commit = sh(cwd, 'rev-parse', ref);
  sh(cwd, 'update-ref', '-d', ref);
  assert.match((await run(cwd, 'verify', 'demo').catch(error => ({ output: error.output }))).output, /missing ref refs\/maverick\/loops\/demo\/0001/);
  sh(cwd, 'update-ref', ref, sh(cwd, 'rev-parse', 'HEAD'));
  assert.match((await run(cwd, 'verify', 'demo').catch(error => ({ output: error.output }))).output, /does not match the ledger/);
  sh(cwd, 'update-ref', ref, commit);
  assert.match((await run(cwd, 'verify', 'demo')).output, /PASS/);
});

test('a disputed check stops the loop for a human, whose note reaches the next agent', async () => {
  const { cwd, binDir } = await loopProject({ agents: { claude: `if (call === 1) { write('src/a.txt', 'x'); return { status: 'blocked', disputes: [{ target: 'keep.mjs', reason: 'keep.txt should allow more text' }] }; } ${BUILD}` } });
  await fails(cwd, ['run', 'demo', '--quiet'], /loop outcome: disputed/);
  const loop = await state(cwd);
  assert.equal(loop.iterations[0].decision, 'accepted', 'the work is still decided on its merits');
  assert.ok(existsSync(join(cwd, 'src/a.txt')));
  assert.match(await readFile(join(cwd, '.maverick/tasks/demo/LOOP-ESCALATION.md'), 'utf8'), /`keep\.mjs`: keep\.txt should allow more text/);
  await fails(cwd, ['run', 'demo'], /waits for a human/);
  await run(cwd, 'run', 'demo', '--resume', '--note', 'keep.mjs is right; leave it');
  const prompts = await calls(binDir, 'claude');
  assert.match(prompts[1].prompt, /## Human guidance\n\n- keep\.mjs is right; leave it/);
  assert.equal((await state(cwd)).status, 'done');
});

test('an agent that commits ends the loop as an integrity violation; Maverick never resets your branch', async () => {
  const { cwd } = await loopProject({ agents: { claude: `write('src/a.txt', 'x'); execFileSync('git', ['add', '-A']); execFileSync('git', ['commit', '-qm', 'sneaky']);` } });
  const error = await fails(cwd, ['run', 'demo', '--quiet'], /loop outcome: integrity-violation: HEAD moved during the iteration/);
  assert.match(error.output, /Escalation: .*LOOP-ESCALATION\.md/);
  assert.equal(sh(cwd, 'log', '-1', '--format=%s'), 'sneaky', 'the user\'s branch is left for a human');
  await fails(cwd, ['run', 'demo'], /integrity violation.*--new/);
});

test('hooks guard iterations, a lock refuses a second loop, and a dry run writes nothing', async () => {
  const deny = `"${node}" -e "process.stderr.write('maintenance window'); process.exit(2)"`;
  const { cwd, binDir } = await loopProject({ agents: { claude: BUILD }, config: { hooks: [{ event: 'before-loop-iteration', run: deny }] } });
  await fails(cwd, ['run', 'demo', '--quiet'], /loop outcome: aborted: hook .* denied: maintenance window/);
  assert.equal((await calls(binDir, 'claude')).length, 0);

  const second = await loopProject({ agents: { claude: BUILD } });
  const { output } = await run(second.cwd, 'run', 'demo', '--dry-run', '--json');
  const plan = JSON.parse(output);
  assert.equal(plan.work.subtask.id, '01');
  assert.match(plan.dryRun.prompt, /## Maverick loop[\s\S]*## Instruction/);
  assert.ok(!existsSync(join(second.cwd, '.maverick/tasks/demo/loops')), 'a dry run creates no loop');
  assert.equal(sh(second.cwd, 'for-each-ref', 'refs/maverick/'), '');
  assert.equal((await calls(second.binDir, 'claude')).length, 0);

  await mkdir(join(second.cwd, '.maverick/tasks/demo/loops'), { recursive: true });
  await writeFile(join(second.cwd, '.maverick/tasks/demo/loops/lock'), JSON.stringify({ pid: process.pid, host: (await import('node:os')).hostname(), task: 'demo', loopId: 'x' }));
  await fails(second.cwd, ['run', 'demo'], /a loop is already running for demo \(pid/);
  await rm(join(second.cwd, '.maverick/tasks/demo/loops/lock'));
  await fails(second.cwd, ['run', '--worktree', 'demo'], /--worktree took "demo" as its value; put flags after the task: maverick loop run demo --worktree/);
  await appendFile(join(second.cwd, 'README.md'), 'x');
});

test('with --judge, a reviewer from another family must accept each subtask and the whole change', async () => {
  const judgeBin = await mkdtemp(join(tmpdir(), 'maverick-judge-bin-')), script = join(judgeBin, 'judge.mjs');
  await writeFile(script, `import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const prompt = readFileSync(0, 'utf8'), log = ${JSON.stringify(join(judgeBin, 'calls.jsonl'))};
const call = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\\n').length + 1 : 1;
appendFileSync(log, JSON.stringify({ cwd: process.cwd(), prompt }) + '\\n');
const ids = [...prompt.matchAll(/^\\| ((?:AC|R|S)-\\d+) \\|/gm)].map(match => match[1]);
const pass = call > 1;
console.log('\\x60\\x60\\x60maverick-verdict\\n' + JSON.stringify({ verdict: pass ? 'pass' : 'fail', confidence: 0.9, issues: pass ? [] : ['src/a.txt has no content worth keeping'], criteria: ids.map(id => ({ id, met: pass, evidence: pass ? 'src/a.txt:1' : 'placeholder content' })) }) + '\\n\\x60\\x60\\x60');
`);
  const build = `const file = { '01': 'src/a.txt', '02': 'src/b.txt' }[subtask]; write(file, 'content ' + call); tick('.maverick/tasks/demo/subtasks/task_' + subtask + '.md'); return { summary: 'SENTINEL-SUMMARY all criteria met', filesChanged: [file] };`;
  const { cwd, binDir } = await loopProject({ agents: { claude: build }, config: { runtime: { trusted: ['claude-code', 'codex', 'judge-openai'], custom: [{ id: 'judge-openai', command: `"${node}" "${script}"`, permissions: ['read-only'] }], families: { 'judge-openai': 'openai' } }, loop: { budgets: { maxIterations: 8 }, judge: { prefer: ['judge-openai'] } } } });
  const { output } = await run(cwd, 'run', 'demo', '--judge', '--quiet');
  assert.match(output, /JUDGE FAIL · judge-openai \(openai\) fail/);
  assert.match(output, /Outcome: DONE — every subtask is done and every blocking gate passes, and an independent judge agrees/);
  const loop = await state(cwd);
  assert.deepEqual(loop.iterations.map(item => [item.subtask.id, item.decision, item.subtaskDone]), [['01', 'accepted', null], ['01', 'accepted', '01'], ['02', 'accepted', '02']]);
  const prompts = await calls(binDir, 'claude');
  // The builder learns which criterion is not accepted, never the judge's reasoning, which stays outside the work tree.
  assert.match(prompts[1].prompt, /## The independent judge has not accepted this yet[\s\S]*AC-01: the change does not demonstrate this criterion yet/);
  assert.doesNotMatch(prompts[1].prompt, /no content worth keeping|placeholder content/);
  assert.match(await readFile(join(cwd, '.maverick/tasks/demo/JUDGE-JUDGE.md'), 'utf8'), /kept outside the work tree/);
  assert.ok(prompts.every(call => !call.prompt.includes(process.env.MAVERICK_HOME)), 'the prompt never points at the private reports');
  const judged = (await readFile(join(judgeBin, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(judged.length, 4, 'subtask 01 twice, subtask 02, then the whole change');
  assert.ok(judged.every(call => !call.prompt.includes('SENTINEL-SUMMARY') && !call.cwd.startsWith(cwd)), 'judges never see the author\'s account and never work in the project');
  assert.match(judged[3].prompt, /# Task: demo\n/, 'the last judgement covers the whole task');
  assert.match((await run(cwd, 'log', 'demo')).output, /judge\s+#1 01 fail · judge-openai fail/);
});

test('--worktree builds on its own branch outside your checkout, and clean removes it', async () => {
  const setup = `"${node}" -e "require('fs').writeFileSync('setup-ran', 'yes')"`;
  const { cwd, binDir } = await loopProject({ agents: { claude: `if (call === 1) { write('src/a.txt', 'x'); write('src/keep.txt', 'broken'); return; } ${BUILD}` }, config: { loop: { budgets: { maxIterations: 8 }, setup: [setup] } } });
  const head = sh(cwd, 'rev-parse', 'HEAD'), index = sh(cwd, 'ls-files', '-s');
  const { output } = await run(cwd, 'run', 'demo', '--worktree', '--quiet');
  assert.match(output, /ROLLED BACK #1[\s\S]*Outcome: DONE/);
  const loop = await state(cwd), tree = loop.worktree.path;
  assert.equal(loop.mode, 'worktree');
  assert.ok(!existsSync(join(cwd, 'src/a.txt')), 'your checkout is untouched');
  assert.equal(sh(cwd, 'rev-parse', 'HEAD'), head); assert.equal(sh(cwd, 'ls-files', '-s'), index);
  assert.ok(!tree.startsWith(cwd), 'the worktree lives outside the repository');
  assert.ok(existsSync(join(tree, 'src/a.txt')) && existsSync(join(tree, 'src/b.txt')) && existsSync(join(tree, 'setup-ran')));
  assert.equal((await readFile(join(tree, 'src/keep.txt'), 'utf8')).trim(), 'ok', 'the rejected iteration was reset in the worktree');
  assert.equal(sh(cwd, 'rev-list', '--count', 'main..maverick/loop/demo'), '3', 'setup and two accepted iterations, as commits on the loop branch');
  assert.match(sh(cwd, 'log', '-1', '--format=%an %s', 'maverick/loop/demo'), /^Maverick Loop maverick loop demo #3 \(subtask 02\)/);
  assert.equal(await status(cwd, '01'), 'done'); assert.equal(await status(cwd, '02'), 'done');
  assert.ok((await calls(binDir, 'claude')).every(call => call.cwd === realpathSync(tree)), 'the agent works in the worktree');
  assert.match((await run(cwd, 'verify', 'demo')).output, /PASS/);
  assert.match((await run(cwd, 'status', 'demo')).output, /branch maverick\/loop\/demo/);
  const { output: cleaned } = await run(cwd, 'clean', 'demo', '--yes');
  assert.match(cleaned, /worktree removed/);
  assert.ok(!existsSync(tree));
  assert.ok(sh(cwd, 'rev-parse', '--verify', 'maverick/loop/demo'), 'the branch with the work stays');
  assert.equal(sh(cwd, 'for-each-ref', 'refs/maverick/'), '');
  assert.match((await run(cwd, 'verify', 'demo')).output, /PASS/, 'cleaned refs are recorded, so the record still verifies');
  await fails(cwd, ['run', 'demo', '--new', '--worktree'], /the branch maverick\/loop\/demo exists from an earlier loop/);
});

test('Lens lists loops, shows one with its ledger, and guards the stop request', async () => {
  const { startLens } = await import('../src/lens/server.js');
  const { cwd } = await loopProject({ agents: { claude: BUILD } });
  await run(cwd, 'run', 'demo');
  const loop = await state(cwd);
  const port = 40000 + Math.floor(Math.random() * 20000), server = await startLens({ cwd, port, watch: false });
  try {
    const base = `http://127.0.0.1:${port}`, token = (await (await fetch(base)).text()).match(/name="lens-token" content="([a-f0-9]+)"/)[1];
    const { loops } = await (await fetch(`${base}/api/loops`)).json();
    assert.deepEqual(loops.map(item => [item.task, item.id, item.status, item.live]), [['demo', loop.loopId, 'done', false]]);
    const detail = await (await fetch(`${base}/api/loop?task=demo&id=${loop.loopId}`)).json();
    assert.equal(detail.state.iterations.length, 2);
    assert.equal((await (await fetch(`${base}/api/loop/ledger?task=demo&id=${loop.loopId}`)).json()).ok, true);
    assert.equal((await fetch(`${base}/api/loop?task=demo&id=../../etc`)).status, 400);
    const stop = (headers, body) => fetch(`${base}/api/loops/stop`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await stop({}, { task: 'demo', id: loop.loopId })).status, 403);
    assert.equal((await stop({ 'x-lens-token': token }, { task: 'demo', id: loop.loopId })).status, 409, 'a finished loop cannot be stopped');
    assert.equal((await stop({ 'x-lens-token': token }, { task: 'demo', id: 'nope' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
