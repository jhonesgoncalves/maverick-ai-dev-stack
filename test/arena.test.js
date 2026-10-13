import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { calls, loopProject, sh } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput } = await import('../src/core/util.js');
const { rankCompetitors } = await import('../src/arena/arena.js');
const { collectEvidence } = await import('../src/decide/scorecard.js');
const { loadGraph } = await import('../src/subtasks/graph.js');

const arena = (cwd, ...args) => captureOutput(() => main(['arena', ...args], cwd));

test('the ranking decides by the first evidence that differs, and calls a tie a tie', () => {
  const competitor = (id, evidence) => ({ id, evidence: { outcome: 'done', oracle: true, sealed: null, integrity: { blocking: 0, warnings: 0, tainted: false }, judge: null, ablation: null, architecture: null, diff: { files: 1, lines: 10 }, ...evidence } });
  assert.deepEqual(rankCompetitors([competitor('a', { oracle: false }), competitor('b', {})]), { order: ['b', 'a'], winner: 'b', decidedBy: 'oracle', tie: false });
  assert.equal(rankCompetitors([competitor('a', { integrity: { blocking: 0, warnings: 2, tainted: false } }), competitor('b', { diff: { files: 3, lines: 90 } })]).decidedBy, 'integrity');
  assert.equal(rankCompetitors([competitor('a', { diff: { files: 3, lines: 90 } }), competitor('b', {})]).winner, 'b');
  const tie = rankCompetitors([competitor('a', {}), competitor('b', {})]);
  assert.deepEqual([tie.winner, tie.tie], [null, true]);
  assert.equal(rankCompetitors([competitor('a', { outcome: 'stalled-escalated' }), competitor('b', { outcome: 'budget-exceeded' })]).winner, null, 'no competitor finished');
});

test('an arena runs one subtask with two providers at once, ranks them by evidence, and a human confirms the winner', async () => {
  const lean = `if (subtask === '01') { write('src/a.txt', 'x'); tick('.maverick/tasks/demo/subtasks/task_01.md'); }`;
  const verbose = `if (subtask === '01') { write('src/a.txt', 'x'); write('src/extra.txt', 'a\\nb\\nc\\nd\\n'); tick('.maverick/tasks/demo/subtasks/task_01.md'); }`;
  const { cwd, binDir } = await loopProject({ agents: { claude: lean, codex: verbose } });
  const { output } = await arena(cwd, 'run', 'demo', '--subtask', '01', '--providers', 'claude-code,codex', '--max-iterations', '3');
  assert.match(output, /Subtask 01: Create a · claude-code vs codex/);
  assert.match(output, /★ claude-code .*done/);
  assert.match(output, /Winner by evidence: claude-code \(decided by diff\)/);
  assert.equal((await calls(binDir, 'claude')).length, 1);
  assert.equal((await calls(binDir, 'codex')).length, 1);
  assert.ok(!existsSync(join(cwd, 'src/a.txt')), 'nothing reaches the working copy before a human decides');
  const { dir, id } = await (async () => { const list = JSON.parse((await arena(cwd, 'list', 'demo', '--json')).output); return { dir: join(cwd, '.maverick/tasks/demo'), id: list[0].id }; })();
  const record = JSON.parse(await readFile(join(dir, 'arena', `${id}.json`), 'utf8'));
  assert.deepEqual(record.competitors.map(item => [item.id, item.evidence.outcome]), [['claude-code', 'done'], ['codex', 'done']]);
  assert.equal((await loadGraph(dir)).items[0].status, 'pending', 'the competitors worked on private copies of the task');
  assert.match(sh(cwd, 'for-each-ref', '--format=%(refname)', 'refs/maverick/arena/'), /arena\/demo\/.*\/base[\s\S]*claude-code[\s\S]*codex/);

  await assert.rejects(main(['arena', 'confirm', 'demo', id, '--winner', 'codex'], cwd), /not the winner by evidence .* say why with --reason/);
  const confirmed = await arena(cwd, 'confirm', 'demo', id, '--by', 'ana');
  assert.match(confirmed.output, /claude-code's change is applied to your working copy; subtask 01 is done/);
  assert.equal(await readFile(join(cwd, 'src/a.txt'), 'utf8'), 'x');
  assert.ok(!existsSync(join(cwd, 'src/extra.txt')), 'the loser\'s change is not applied');
  assert.equal((await loadGraph(dir)).items[0].status, 'done');
  assert.match((await arena(cwd, 'stats')).output, /was the human's choice in 1 of 1 arena/);
  assert.match((await arena(cwd, 'verify', 'demo', id)).output, /PASS/);
  const loser = record.competitors.find(item => item.id === 'codex');
  assert.match(await readFile(join(dir, 'loops', loser.loopId, 'ledger.jsonl'), 'utf8'), /"type":"arena-rejected"/);
  const evidence = await collectEvidence(cwd);
  assert.deepEqual(evidence.rows.filter(row => row.source === 'arena').map(row => [row.provider, row.decision]).sort(), [['claude-code', 'won'], ['codex', 'lost']]);
  assert.ok(evidence.rows.some(row => row.source === 'loop' && row.provider === 'codex'), 'the loser\'s loop feeds the scorecard');
  await assert.rejects(main(['arena', 'confirm', 'demo', id], cwd), /was decided by ana/);
});
