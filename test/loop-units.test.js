import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideOutcome, issueKey } from '../src/flows/engine.js';
import { failingTests, fingerprintsFor, outputHash } from '../src/flows/fingerprint.js';
import { checkBudget, costWarnings, forecast, wouldExceed } from '../src/loop/budget.js';
import { diagnose, nextRung } from '../src/loop/diagnose.js';
import { checkpointRef, inPlace } from '../src/loop/git.js';
import { canonical, genesis, openLedger, verifyChain } from '../src/loop/ledger.js';
import { loopSettings } from '../src/loop/model.js';
import { compare, isProgress, scoreOf } from '../src/loop/ratchet.js';
import { familyOf } from '../src/runtime/families.js';
import { providersFor } from '../src/runtime/providers.js';
import { checkboxOnlyChange } from '../src/subtasks/graph.js';

test('fingerprints name failing tests for common runners and ignore run-to-run noise', () => {
  const samples = {
    tap: ['not ok 3 - adds numbers # time=2ms', ['adds numbers']],
    'node-test': ['✖ adds numbers (0.58ms)\n✖ failing tests:\n✖ adds numbers (0.58ms)', ['adds numbers']],
    jest: ['  ● Cart › adds an item\n  ✕ removes an item (12 ms)', ['Cart › adds an item', 'removes an item']],
    vitest: [' × sums values 3ms', ['sums values']],
    pytest: ['FAILED tests/test_api.py::test_create - assert 1 == 2', ['tests/test_api.py::test_create']],
    go: ['--- FAIL: TestCreate (0.00s)', ['TestCreate']],
    cargo: ['test api::creates ... FAILED', ['api::creates']],
    gradle: ['AppTest > adds() FAILED', ['AppTest > adds()']],
    surefire: ['[ERROR]   AppTest.adds:42 expected: <3>', ['AppTest.adds']],
    rspec: ['rspec ./spec/user_spec.rb:12 # User creates', ['./spec/user_spec.rb:12']],
    dotnet: ['  Failed App.Tests.Adds [3 ms]', ['App.Tests.Adds']],
    tsc: ['src/a.ts(3,7): error TS2322: Type string is not assignable', ['src/a.ts TS2322']],
    eslint: ['/repo/src/a.js\n  3:7  error  x is not defined  no-undef', ['/repo/src/a.js no-undef']]
  };
  for (const [runner, [output, ids]] of Object.entries(samples)) assert.deepEqual(failingTests(output).ids, ids, runner);
  assert.equal(outputHash('Error at 2026-10-11T10:00:01Z after 12ms (pid 4411) in /tmp/abc/x'), outputHash('Error at 2026-10-12T09:13:44Z after 980ms (pid 77) in /tmp/zzz/y'));
  assert.notEqual(outputHash('TypeError: a is undefined'), outputHash('SyntaxError: unexpected token'));
  assert.deepEqual(fingerprintsFor({ command: 'npm test', output: 'not ok 1 - a' }).keys, ['npm test :: a']);
  assert.match(fingerprintsFor({ command: 'make', output: 'boom' }).keys[0], /^make #[0-9a-f]{12}$/);
});

test('progress is visible to the flow contract: fewer failing tests is not a stall', () => {
  const run = keys => [{ id: 'checks', severity: 'block', status: 'fail', issues: ['failed: npm test'], keys }];
  const many = run(['npm test :: a', 'npm test :: b', 'npm test :: c']), fewer = run(['npm test :: a']);
  assert.notEqual(issueKey(many), issueKey(fewer));
  assert.equal(decideOutcome(fewer, [{ outcome: 'revise', issueKey: issueKey(many) }], { iterationCap: 5, noProgressWindow: 2 }).outcome, 'revise');
  assert.equal(decideOutcome(fewer, [{ outcome: 'revise', issueKey: issueKey(fewer) }], { iterationCap: 5, noProgressWindow: 2 }).outcome, 'stalled');
});

test('the ledger chain detects edited, reordered and removed entries', async () => {
  assert.equal(canonical({ b: 1, a: [2, { d: undefined, c: 3 }] }), '{"a":[2,{"c":3}],"b":1}');
  const dir = await mkdtemp(join(tmpdir(), 'maverick-ledger-')), path = join(dir, 'ledger.jsonl');
  const ledger = await openLedger(path, 'L1');
  assert.equal(ledger.head, genesis('L1'));
  for (const type of ['loop-start', 'iteration-start', 'iteration-end', 'stop']) await ledger.append(type, { type, cost: 0.01 });
  const entries = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(verifyChain(entries, 'L1').ok, true);
  assert.equal(verifyChain(entries, 'L2').ok, false, 'a ledger is bound to its loop');
  const edited = JSON.parse(JSON.stringify(entries)); edited[2].data.cost = 0;
  assert.match(verifyChain(edited, 'L1').problems[0].problem, /hash mismatch at entry 2/);
  assert.ok(!verifyChain([entries[0], entries[2], entries[1], entries[3]], 'L1').ok);
  assert.ok(!verifyChain([entries[0], entries[1], entries[3]], 'L1').ok, 'a missing middle entry breaks the links');
});

test('budgets: hard limits, forecasts that stop before an expensive iteration, and unreported costs', () => {
  const budgets = { maxIterations: 5, maxMinutes: 60, maxCostUsd: 1, forecast: 'p90' };
  assert.equal(checkBudget(budgets, { iterations: 5, activeMs: 0, costUsd: 0 }).kind, 'iterations');
  assert.equal(checkBudget(budgets, { iterations: 1, activeMs: 0, costUsd: 1.2 }).kind, 'cost');
  assert.equal(checkBudget(budgets, { iterations: 1, activeMs: 0, costUsd: 0.2 }), null);
  assert.equal(forecast([]), null);
  assert.equal(forecast([1, 3]), 2, 'the mean while there are few samples');
  assert.equal(forecast([1, 1, 1, 1, 1, 1, 1, 1, 10, 10]), 10, 'then the 90th percentile');
  const iterations = [{ durationMs: 60000, costUsd: 0.3 }, { durationMs: 60000, costUsd: 0.3 }];
  assert.deepEqual((({ stop, kind }) => ({ stop, kind }))(wouldExceed(budgets, { iterations: 2, activeMs: 120000, costUsd: 0.8 }, iterations)), { stop: true, kind: 'cost' });
  assert.equal(wouldExceed(budgets, { iterations: 2, activeMs: 120000, costUsd: 0.6 }, iterations).stop, false);
  assert.equal(wouldExceed({ ...budgets, maxMinutes: 2.5 }, { iterations: 2, activeMs: 120000, costUsd: 0 }, iterations).kind, 'minutes');
  const providers = providersFor({});
  assert.match(costWarnings([providers.find(item => item.id === 'codex')], budgets)[0], /codex reports no cost/);
  assert.deepEqual(costWarnings([providers.find(item => item.id === 'claude-code')], budgets), []);
});

test('the ratchet: a gate that passed never fails again, and fewer named failures is progress', () => {
  const score = (gates, failing, checklist = { done: 0, total: 4 }) => scoreOf({ results: Object.entries(gates).map(([id, status]) => ({ id, type: 'check', severity: 'block', status, issues: [`failed: ${id}`], keys: failing[id] })), graph: { items: [{ status: 'pending', checklist }] } });
  const base = score({ checks: 'fail', keep: 'pass' }, { checks: ['t :: a', 't :: b'] });
  const regressed = compare(base, score({ checks: 'fail', keep: 'fail' }, { checks: ['t :: a'], keep: ['k #1'] }));
  assert.deepEqual(regressed.regressions.map(item => item.kind), ['gate-regression']);
  const worse = compare(base, score({ checks: 'fail', keep: 'pass' }, { checks: ['t :: a', 't :: b', 't :: c'] }));
  assert.deepEqual(worse.regressions.map(item => item.kind), ['test-regression']);
  const better = compare(base, score({ checks: 'fail', keep: 'pass' }, { checks: ['t :: a'] }));
  assert.deepEqual([better.verdict, better.improvements[0].kind], ['better', 'fewer-failures']);
  const swapped = score({ checks: 'fail', keep: 'pass' }, { checks: ['t :: a', 't :: c'] });
  assert.equal(compare(base, swapped).verdict, 'same');
  assert.deepEqual(compare(base, swapped, { newFailures: 'strict' }).regressions.map(item => item.kind), ['test-regression']);
  const opaque = score({ checks: 'fail', keep: 'pass' }, { checks: ['t #abc'] });
  assert.equal(compare(opaque, score({ checks: 'fail', keep: 'pass' }, { checks: ['t :: a', 't :: b'] })).regressions.length, 0, 'a build that compiles again and names its failures is not a regression');
  const ticked = compare(base, score({ checks: 'fail', keep: 'pass' }, { checks: ['t :: a', 't :: b'] }, { done: 2, total: 4 }));
  assert.equal(isProgress(ticked, { empty: true }), false, 'ticking boxes without code is not progress');
  assert.equal(isProgress(ticked, { empty: false }), true);
  assert.deepEqual(compare(score({}, {}, { done: 3, total: 4 }), score({}, {}, { done: 1, total: 4 })).regressions.map(item => item.kind), ['checklist-regression']);
});

test('diagnosis names the stall, and the ladder climbs one real change at a time to a human', () => {
  const item = (over = {}) => ({ progress: false, failureKey: 'k1', decision: 'accepted', diff: { empty: false, added: 10, deleted: 0 }, agent: { status: 'done' }, overclaim: false, checklistDelta: 0, ...over });
  const stall = { window: 2, churnLines: 300, rollbackStreak: 3, overclaims: 2 };
  const signals = history => diagnose(history, stall).signals.map(signal => signal.kind).sort();
  assert.deepEqual(signals([item()]), []);
  assert.deepEqual(signals([item(), item()]), ['no-progress']);
  assert.deepEqual(signals([item({ failureKey: 'a' }), item({ failureKey: 'b' }), item({ failureKey: 'a' })]), ['oscillation']);
  assert.deepEqual(signals([item({ failureKey: 'a', diff: { added: 400, deleted: 0 } }), item({ failureKey: 'b', diff: { added: 500, deleted: 0 } })]), ['churn']);
  assert.deepEqual(signals([item({ failureKey: 'a', overclaim: true }), item({ failureKey: 'b', overclaim: true })]), ['overclaim']);
  assert.deepEqual(signals([item({ failureKey: 'a', diff: { empty: true } }), item({ failureKey: 'b', diff: { empty: true } })]), ['empty']);
  assert.deepEqual(signals([item({ failureKey: 'a', decision: 'rejected' }), item({ failureKey: 'b', decision: 'rejected' }), item({ failureKey: 'c', decision: 'rejected' })]), ['rollback-streak']);
  assert.deepEqual(signals([item({ failureKey: 'a', agent: { status: 'no-result' } }), item({ failureKey: 'b', agent: { status: 'failed' } })]), ['no-result']);
  assert.deepEqual(signals([item(), item({ progress: true })]), []);

  const providers = providersFor({}), config = {};
  const settings = loopSettings({ loop: { providers: ['claude-code', 'codex', 'gemini'], maxEffort: 'xhigh' } });
  const climb = (escalation, current) => nextRung(escalation, settings, { providers, current, config });
  assert.equal(climb({ rungIndex: -1, tried: ['claude-code'] }, { provider: 'claude-code', effort: 'high' }).rung, 'retry-with-diagnosis');
  assert.deepEqual(climb({ rungIndex: 0, tried: ['claude-code'] }, { provider: 'claude-code', effort: 'high' }).change, { effort: 'xhigh' });
  const maxed = climb({ rungIndex: 0, tried: ['claude-code'] }, { provider: 'claude-code', effort: 'xhigh' });
  assert.equal(maxed.rung, 'switch-provider'); assert.match(maxed.skipped[0], /highest allowed effort/);
  assert.equal(maxed.change.provider, 'codex');
  assert.equal(climb({ rungIndex: 1, tried: ['gemini'] }, { provider: 'gemini' }).change.provider, 'claude-code', 'a different family first');
  const human = climb({ rungIndex: 2, tried: ['claude-code', 'codex', 'gemini'] }, { provider: 'gemini' });
  assert.deepEqual([human.rung, human.human], ['human', true]);
  assert.match(climb({ rungIndex: 0, tried: ['gemini'] }, { provider: 'gemini' }).skipped[0], /gemini has no reasoning setting/);
  assert.deepEqual(loopSettings({ loop: { escalation: ['switch-provider'] } }).escalation, ['switch-provider', 'human'], 'the ladder always ends with a human');
});

test('model families come from the model name first and stay unknown unless configured', () => {
  assert.equal(familyOf({ provider: 'claude-code' }).family, 'anthropic');
  assert.equal(familyOf({ provider: 'codex', model: 'gpt-6-sol' }).family, 'openai');
  assert.equal(familyOf({ provider: 'copilot', model: 'claude-sonnet-5' }).family, 'anthropic');
  assert.equal(familyOf({ provider: 'antigravity', model: 'claude-opus-5' }).family, 'anthropic');
  assert.equal(familyOf({ provider: 'copilot' }).family, 'unknown');
  assert.equal(familyOf({ provider: 'aider' }, { runtime: { families: { aider: 'deepseek' } } }).family, 'deepseek');
});

test('only ticked boxes count as a checklist-only change', () => {
  const before = '---\ntitle: A\nstatus: pending\n---\n\n## Steps\n- [ ] Write a\n- [ ] Test a\n';
  assert.equal(checkboxOnlyChange(before, before.replace('- [ ] Write a', '- [x] Write a')), true);
  assert.equal(checkboxOnlyChange(before, before.replace('status: pending', 'status: done')), false);
  assert.equal(checkboxOnlyChange(before, before.replace('- [ ] Write a', '- [x] Write a quickly')), false);
  assert.equal(checkboxOnlyChange(before, `${before}- [x] Extra\n`), false);
});

test('in-place checkpoints never touch HEAD or the user\'s index, and rollback converges', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-git-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  await mkdir(join(cwd, 'src'), { recursive: true }); await mkdir(join(cwd, '.maverick'), { recursive: true });
  await writeFile(join(cwd, 'src/a.txt'), 'a\n'); await writeFile(join(cwd, 'src/keep.txt'), 'keep\n'); await writeFile(join(cwd, '.maverick/x'), 'x\n');
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T'); git('add', '-A'); git('commit', '-qm', 'init');
  await writeFile(join(cwd, 'staged.txt'), 'staged\n'); git('add', 'staged.txt');
  const head = git('rev-parse', 'HEAD'), index = git('ls-files', '-s');
  const loopDir = join(cwd, '.maverick/tasks/demo/loops/L');
  const tree = inPlace({ cwd, task: 'demo', indexFile: join(loopDir, 'git-index'), inflight: join(loopDir, 'inflight') });
  const base = await tree.snapshot();
  const point = await tree.checkpoint({ ref: checkpointRef('demo', 0), tree: base, parent: head, message: 'baseline\n' });
  await assert.rejects(tree.checkpoint({ ref: checkpointRef('demo', 0), tree: base, parent: head, message: 'again\n' }), /update-ref/, 'refs are create-only');
  const invariants = await tree.captureInvariants();
  await writeFile(join(cwd, 'src/a.txt'), 'changed'); await rm(join(cwd, 'src/keep.txt'));
  await mkdir(join(cwd, 'src/new/deep'), { recursive: true }); await writeFile(join(cwd, 'src/new/deep/n.txt'), 'n');
  await chmod(join(cwd, 'staged.txt'), 0o755); await symlink('a.txt', join(cwd, 'src/link'));
  await writeFile(join(cwd, '.gitignore'), 'hidden.txt\n'); await writeFile(join(cwd, 'hidden.txt'), 'h');
  await writeFile(join(cwd, '.maverick/x'), 'agent');
  const changed = await tree.snapshot();
  const diff = await tree.diff(base, changed);
  assert.deepEqual(diff.files.map(file => `${file.status} ${file.path}`).sort(), ['A .gitignore', 'A src/link', 'A src/new/deep/n.txt', 'D src/keep.txt', 'M src/a.txt', 'M staged.txt']);
  const rollback = await tree.rollback(point);
  assert.ok(rollback.deleted.includes('hidden.txt'), 'a file hidden by an edited .gitignore is found and removed');
  assert.equal(await readFile(join(cwd, 'src/a.txt'), 'utf8'), 'a\n');
  assert.ok(existsSync(join(cwd, 'src/keep.txt')) && !existsSync(join(cwd, 'src/new')) && !existsSync(join(cwd, '.gitignore')));
  assert.equal(await readFile(join(cwd, '.maverick/x'), 'utf8'), 'agent', '.maverick is never part of a snapshot');
  assert.equal(git('rev-parse', 'HEAD'), head);
  assert.equal(git('ls-files', '-s'), index, 'the user\'s index, staged file included, is byte-for-byte the same');
  assert.deepEqual(await tree.checkInvariants(invariants), { fatal: [], findings: [] });
  await writeFile(join(cwd, 'src/a.txt'), 'staged by the agent'); git('add', 'src/a.txt');
  const caught = await tree.checkInvariants(invariants);
  assert.deepEqual(caught.findings.map(item => item.kind), ['git-index-modified']);
  assert.equal(git('ls-files', '-s'), index, 'the agent\'s staging is undone');
  git('commit', '-qm', 'sneaky');
  assert.match((await tree.checkInvariants(invariants)).fatal[0], /HEAD moved during the iteration/);
});
