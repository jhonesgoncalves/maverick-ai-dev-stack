import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { BUILD, SUBTASK, loopProject, run, sh } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput, output } = await import('../src/core/util.js');
const { withFileLock } = await import('../src/core/lock.js');
const { loadGraph, setStatus } = await import('../src/subtasks/graph.js');
const { interruptible, onInterrupt } = await import('../src/loop/signals.js');

test('captured output belongs to its own invocation, even when two run at once', async () => {
  const speak = (word, delay) => captureOutput(async () => { output(`${word} 1`); await sleep(delay); output(`${word} 2`); });
  const [a, b] = await Promise.all([speak('a', 20), speak('b', 5)]);
  assert.equal(a.output, 'a 1\na 2');
  assert.equal(b.output, 'b 1\nb 2');
  const nested = await captureOutput(async () => { output('outer'); const inner = await captureOutput(async () => output('inner')); output('after'); return inner.output; });
  assert.deepEqual([nested.value, nested.output], ['inner', 'outer\nafter']);
});

test('the file lock serializes writers, is re-entrant, and takes over a dead holder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'maverick-lock-')), path = join(dir, 'x.lock'), order = [];
  await Promise.all([1, 2, 3].map(n => withFileLock(path, async () => { order.push(`in ${n}`); await sleep(10); order.push(`out ${n}`); })));
  for (let index = 0; index < order.length; index += 2) assert.equal(order[index].slice(3), order[index + 1].slice(4), 'no writer enters before the previous one leaves');
  assert.equal(await withFileLock(path, () => withFileLock(path, async () => 'nested')), 'nested');
  await writeFile(path, JSON.stringify({ pid: 999999, host: (await import('node:os')).hostname() }));
  assert.equal(await withFileLock(path, async () => 'taken over', { timeoutMs: 500 }), 'taken over');
  assert.ok(!existsSync(path));
});

test('concurrent status changes to one task lose no update', async () => {
  const { cwd } = await loopProject({ subtasks: [['A', 'src/a.txt'], ['B', 'src/b.txt'], ['C', 'src/c.txt'], ['D', 'src/d.txt']] });
  const dir = join(cwd, '.maverick/tasks/demo');
  await Promise.all(['01', '02', '03', '04'].map(id => setStatus(dir, 'demo', id, 'blocked')));
  const graph = await loadGraph(dir);
  assert.deepEqual(graph.items.map(item => item.status), ['blocked', 'blocked', 'blocked', 'blocked']);
  assert.equal((await readFile(join(dir, 'subtasks/_tasks.md'), 'utf8')).match(/— blocked/g).length, 4);
});

test('one Ctrl-C handler stops every loop in the process', () => {
  const stopped = [];
  const before = process.listenerCount('SIGINT');
  const offA = onInterrupt('demo:a', () => stopped.push('a')), offB = onInterrupt('demo:b', () => stopped.push('b'));
  assert.equal(process.listenerCount('SIGINT'), before + 1, 'one listener for every loop');
  process.emit('SIGINT');
  assert.deepEqual(stopped, ['a', 'b']);
  offA(); offB();
  assert.equal(process.listenerCount('SIGINT'), before);
  assert.deepEqual(interruptible(), []);
});

test('two lanes of one task build at once in their own worktrees, with their own refs and branches', async () => {
  const { cwd } = await loopProject({ agents: { claude: BUILD }, subtasks: [['Create a', 'src/a.txt']], checks: ['src/a.txt', 'src/b.txt'] });
  // A second subtask that does not depend on the first: the two can run in parallel lanes.
  await captureOutput(() => main(['subtask', 'add', 'demo', 'Create b'], cwd));
  await writeFile(join(cwd, '.maverick/tasks/demo/subtasks/task_02.md'), SUBTASK('Create b', 'src/b.txt'));
  sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-qm', 'second subtask');
  const [a, b] = await Promise.all([run(cwd, 'run', 'demo', '--lane', 'a', '--only', '01', '--quiet'), run(cwd, 'run', 'demo', '--lane', 'b', '--only', '02', '--quiet')]);
  assert.match(a.output, /Outcome: DONE — every subtask of lane a \(01\) is done/);
  assert.match(b.output, /Outcome: DONE — every subtask of lane b \(02\) is done/);
  const graph = await loadGraph(join(cwd, '.maverick/tasks/demo'));
  assert.deepEqual(graph.items.map(item => item.status), ['done', 'done']);
  assert.match(sh(cwd, 'for-each-ref', '--format=%(refname)', 'refs/maverick/loops/demo/lanes/'), /lanes\/a\/0000[\s\S]*lanes\/b\/0000/);
  assert.equal(sh(cwd, 'show', 'maverick/lane/demo/a:src/a.txt'), 'x');
  assert.equal(sh(cwd, 'show', 'maverick/lane/demo/b:src/b.txt'), 'x');
  assert.ok(!existsSync(join(cwd, 'src/a.txt')), 'the checkout is untouched');
  assert.ok(existsSync(join(cwd, '.maverick/tasks/demo/LOOP-a.md')) && existsSync(join(cwd, '.maverick/tasks/demo/LOOP-b.md')), 'each lane reports on its own');
  await assert.rejects(main(['loop', 'run', 'demo', '--lane', 'Bad Lane', '--only', '01'], cwd), /must be lowercase/);
  await assert.rejects(main(['loop', 'run', 'demo', '--lane', 'c'], cwd), /needs the subtasks it builds/);
});

test('a fork replays the work from a checkpoint with another provider, leaving the original loop and checkout alone', async () => {
  const { cwd, binDir } = await loopProject({ agents: { claude: BUILD, codex: BUILD } });
  await run(cwd, 'run', 'demo', '--quiet');
  const { calls } = await import('./loop-fixtures.js');
  const before = (await loadGraph(join(cwd, '.maverick/tasks/demo'))).items.map(item => item.status);
  const { output: forked } = await run(cwd, 'fork', 'demo', '--from', '1', '--provider', 'codex', '--json');
  const result = JSON.parse(forked);
  assert.equal(result.from.iteration, 1);
  assert.equal(result.outcome, 'done');
  const codex = await calls(binDir, 'codex');
  assert.deepEqual(codex.map(call => call.subtask), ['02'], 'subtask 01 was already done at that checkpoint');
  assert.equal(sh(cwd, 'show', `${result.ref}:src/b.txt`), 'x');
  assert.deepEqual((await loadGraph(join(cwd, '.maverick/tasks/demo'))).items.map(item => item.status), before);
  assert.ok(existsSync(join(cwd, '.maverick/tasks/demo/loops', result.loopId, 'ledger.jsonl')), 'the fork is recorded with the task\'s loops');
  assert.doesNotMatch((await run(cwd, 'status', 'demo')).output, new RegExp(result.loopId), 'status shows the task\'s own loop, not the fork');
  await assert.rejects(main(['loop', 'fork', 'demo', '--from', '9'], cwd), /--from must be an iteration/);
});
