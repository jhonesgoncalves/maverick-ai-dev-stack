import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { descriptionTerms } from '../src/core/grounding.js';
import { healthTrend, readSnapshots, recordSnapshot, sparkline } from '../src/intel/snapshots.js';
import { classify } from '../src/memory/proposals.js';
import { parseLocation, parseTrailers, reviewDecision } from '../src/memory/why.js';
import { diffName, parseHunks } from '../src/proof/attention.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { BUILD, loopProject, node, run, sh } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput } = await import('../src/core/util.js');
const cli = async (cwd, ...args) => (await captureOutput(() => main(args, cwd))).output;
const json = async (cwd, ...args) => JSON.parse(await cli(cwd, ...args, '--json'));
const TASK = '.maverick/tasks/demo';
const PRD = '# PRD — demo\n\n## Overview\nDemo.\n\n## Acceptance Criteria\n- [ ] AC-01: the files exist\n';
/** The loop fixture with a PRD whose criterion has an id. */
async function plannedProject(options) {
  const project = await loopProject(options);
  await writeFile(join(project.cwd, TASK, 'PRD.md'), PRD);
  sh(project.cwd, 'add', '-A'); sh(project.cwd, 'commit', '-qm', 'prd');
  return project;
}

// v1.10 "Remember": why a line exists, living contracts, the error ratchet, the review budget,
// grounding with memory and graph snapshots.

test('trailers, locations, review decisions and hunks parse', () => {
  assert.deepEqual(parseTrailers('maverick loop demo #3 (subtask 01)\n\nMaverick-Loop: 20261012-101500-ab12\nMaverick-Iteration: 3\n'), { task: 'demo', loopId: '20261012-101500-ab12', iteration: 3, label: 'subtask 01' });
  assert.equal(parseTrailers('feat: x\n\nMaverick task: add-orders').task, 'add-orders');
  assert.deepEqual(parseLocation('src/a.js:12'), { file: 'src/a.js', line: 12 });
  assert.deepEqual(parseLocation('src/a.js#L7'), { file: 'src/a.js', line: 7 });
  assert.throws(() => parseLocation('src/a.js'), /<file>:<line>/);
  assert.equal(reviewDecision('- [ ] approve\n- [x] approve with follow-up\n'), 'approve with follow-up');
  assert.equal(reviewDecision('- [ ] approve'), null);
  const hunks = parseHunks('diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -3,0 +4,2 @@\n+one\n+two\n@@ -9 +11 @@\n-old\n+new\ndiff --git a/src/gone.js b/src/gone.js\n--- a/src/gone.js\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n--- not a header\n');
  assert.equal(diffName('b/my file.js\t', 'b/'), 'my file.js', 'names with spaces end with a tab');
  assert.equal(diffName('"b/q\\"uote \\303\\251.js"', 'b/'), 'q"uote é.js', 'unusual names are C-quoted');
  assert.deepEqual(hunks.map(({ file, start, added, deleted, removed }) => ({ file, start, added, deleted, removed })), [
    { file: 'src/a.js', start: 4, added: 2, deleted: 0, removed: undefined },
    { file: 'src/a.js', start: 11, added: 1, deleted: 1, removed: undefined },
    { file: 'src/gone.js', start: 0, added: 0, deleted: 2, removed: true }
  ]);
});

test('maverick why walks from a line to its loop iteration, criterion, checks and guards', async () => {
  const { cwd } = await plannedProject({ agents: { claude: BUILD } });
  await run(cwd, 'run', 'demo', '--quiet');
  const trace = await json(cwd, 'why', 'src/a.txt:1');
  assert.equal(trace.task.slug, 'demo');
  assert.equal(trace.task.via, 'loop checkpoint');
  assert.deepEqual(trace.commit, { uncommitted: true });
  assert.equal(trace.built.iteration, 1);
  assert.equal(trace.built.agent.provider, 'claude-code');
  assert.equal(trace.built.decision, 'accepted');
  assert.deepEqual(trace.intent.subtasks.map(item => item.id), ['01']);
  assert.deepEqual(trace.intent.criteria.map(item => item.id), ['AC-01']);
  assert.deepEqual(trace.proven.gates, { checks: 'fail', keep: 'pass' }, 'iteration 1 alone: b is still missing');
  assert.deepEqual(trace.proven.integrity.findings, []);
  assert.ok(trace.missing.some(item => /human review/.test(item)), 'what is missing is said');
  assert.equal((await json(cwd, 'why', 'src/b.txt:1')).built.iteration, 2, 'each line maps to its own iteration');

  // Committed with the PR trailer: the commit names the task, the checkpoints still name the iteration.
  sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-qm', 'feat: demo\n\nMaverick task: demo');
  const committed = await json(cwd, 'why', 'src/a.txt:1');
  assert.equal(committed.commit.summary, 'feat: demo');
  assert.equal(committed.built.iteration, 1);
  const text = await cli(cwd, 'why', 'src/a.txt:1');
  assert.match(text, /Task\s+demo/);
  assert.match(text, /Intent\s+AC-01 the files exist/);
  assert.match(text, /Built\s+subtask 01 · loop \d{8}-\d{6}-[0-9a-f]{4} · iteration 1 · claude-code/);
  assert.match(text, /Proven\s+gates checks FAIL, keep PASS · integrity clean/);

  // A line no task wrote: blame, and what is missing.
  const cold = await json(cwd, 'why', 'src/keep.txt:1');
  assert.equal(cold.task, null);
  assert.equal(cold.commit.summary, 'init');
  assert.equal(cold.commit.author, 'T');
  assert.ok(cold.missing.some(item => /no Maverick task/.test(item)));
  await assert.rejects(cli(cwd, 'why', 'src/a.txt:9'), /out of range/);
  await assert.rejects(cli(cwd, 'why', 'src/keep.txt:2'), /out of range/, 'the newline at the end is not a line');
  await assert.rejects(cli(cwd, 'why', '/etc/hosts:1'), /outside the project|no such file/);

  // The reverse walk, and the agent's view through MCP: no author names.
  const ac = await json(cwd, 'why', 'demo', '--ac', 'AC-01');
  assert.deepEqual(ac.subtasks.map(item => item.id), ['01', '02']);
  assert.ok(ac.iterations.some(item => item.subtask === '01' && item.decision === 'accepted'));
  const { handleMessage } = await import('../src/mcp/server.js');
  const mcp = (await handleMessage(cwd, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'why', arguments: { path: 'src/a.txt', line: 1 } } })).result.structuredContent;
  assert.equal(mcp.built.iteration, 1);
  assert.equal(mcp.commit.author, undefined);
  assert.equal(mcp.proven.integrity, undefined, 'detections stay out of what a builder can read');
  const escape = await handleMessage(cwd, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'why', arguments: { path: '/etc/hosts', line: 1 } } });
  assert.ok(escape.error || escape.result.isError, 'an absolute path never reaches the file system');
});

test('a finished task leaves living contracts that the next change must keep or revoke', async () => {
  const { cwd } = await plannedProject({ agents: { claude: BUILD } });
  await run(cwd, 'run', 'demo', '--quiet');
  await writeFile(join(cwd, TASK, 'SPEC.md'), '# Spec — demo\n\n## Invariants\n- The files are never empty.\n');
  // A reviewer committed sealed tests that prove AC-01 (what unseal --commit records).
  await mkdir(join(cwd, 'test'), { recursive: true });
  await writeFile(join(cwd, 'test/a.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\ntest('a holds x', () => assert.equal(readFileSync('src/a.txt', 'utf8'), 'x'));\n");
  await writeFile(join(cwd, TASK, 'SEALED.json'), JSON.stringify({ status: 'committed', tests: 1, decision: { decision: 'commit', by: 'rev', protect: true, files: ['test/a.test.js'], tests: [{ id: 'ST-01', file: 'test/a.test.js', ids: ['AC-01'] }] } }));
  // The project says how to run one test file, so a contract's tests can run on their own.
  const config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  config.verification.runners = [{ match: 'test/**/*.test.js', run: `"${node}" --test {files}` }];
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify(config));
  sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-qm', 'feat: demo\n\nMaverick task: demo');

  const done = await json(cwd, 'done', 'demo', '--force', '--by', 'ana');
  assert.deepEqual(done.contracts, ['C-01', 'C-02']);
  const contracts = await json(cwd, 'contract', 'list');
  assert.equal(contracts[0].source, 'invariant-1');
  assert.deepEqual(contracts[0].anchors, ['src/a.txt', 'src/b.txt']);
  assert.equal(contracts[1].source, 'AC-01');
  assert.deepEqual(contracts[1].tests, ['test/a.test.js']);
  assert.equal(contracts[1].owner, 'ana');
  assert.deepEqual((await json(cwd, 'contract', 'harvest', 'demo')).created, [], 'harvesting twice adds nothing');

  // why shows the guard; the agent's prompt carries the contract.
  assert.deepEqual((await json(cwd, 'why', 'src/a.txt:1')).guards.contracts.map(item => item.id), ['C-01', 'C-02']);
  const { memorySections } = await import('../src/commands/agent.js');
  const sections = await memorySections(cwd, join(cwd, TASK), null);
  assert.match(sections.find(item => item.title === 'Contracts in these files').body, /C-02 .*test\/a\.test\.js/);

  // Unchanged: nothing touched. Kept: the anchor changes and the test still passes (drift warns in CI).
  assert.equal((await json(cwd, 'contract', 'check')).touched.length, 0);
  await writeFile(join(cwd, 'src/b.txt'), 'y');
  const drift = await json(cwd, 'contract', 'check');
  assert.ok(drift.ok);
  assert.ok(drift.findings.some(item => item.kind === 'contract-drift' && item.id === 'C-01'));
  await assert.rejects(cli(cwd, 'contract', 'check', '--strict'), /breaks a living contract/);
  // Broken: the guarded behavior changes. A task's PRD may revoke it; a deleted test never passes.
  await writeFile(join(cwd, 'src/a.txt'), 'changed');
  await assert.rejects(cli(cwd, 'contract', 'check', 'demo'), /breaks a living contract/);
  const broken = JSON.parse(await captureOutput(() => main(['contract', 'check', 'demo', '--json'], cwd)).catch(error => ({ output: error.output })).then(result => result.output));
  assert.ok(broken.findings.some(item => item.kind === 'contract-broken' && item.id === 'C-02'));
  await writeFile(join(cwd, TASK, 'PRD.md'), `${await readFile(join(cwd, TASK, 'PRD.md'), 'utf8')}\nRevokes C-02: a now holds "changed".\n`);
  const revoked = await json(cwd, 'contract', 'check', 'demo');
  assert.ok(revoked.ok);
  assert.equal(revoked.touched.find(item => item.id === 'C-02').status, 'revoked-by-task');
  await rm(join(cwd, 'test/a.test.js'));
  await writeFile(join(cwd, TASK, 'PRD.md'), (await readFile(join(cwd, TASK, 'PRD.md'), 'utf8')).replace(/Revokes C-02.*\n/, ''));
  await assert.rejects(cli(cwd, 'contract', 'check', 'demo'), /breaks a living contract/);

  // A revocation in the PRD takes effect when the task is finished.
  await writeFile(join(cwd, TASK, 'PRD.md'), `${await readFile(join(cwd, TASK, 'PRD.md'), 'utf8')}\nRevokes C-02: replaced.\n`);
  await cli(cwd, 'reopen', 'demo');
  assert.deepEqual((await json(cwd, 'done', 'demo', '--force')).revoked, ['C-02']);
  assert.deepEqual((await json(cwd, 'contract', 'list')).map(item => item.id), ['C-01']);
  assert.equal((await json(cwd, 'contract', 'list', '--all')).find(item => item.id === 'C-02').revoked.reason, 'replaced.');
  await assert.rejects(cli(cwd, 'contract', 'revoke', 'C-01'), /needs a reason/);
});

test('the error ratchet turns loop failures into proposals a human promotes and measures', async () => {
  const cheat = `write('src/a.txt', 'x'); write('test/keep.test.js', readFileSync('test/keep.test.js', 'utf8').replace("test('keeps", "test.skip('keeps")); tick('.maverick/tasks/demo/subtasks/task_01.md');`;
  const { cwd } = await loopProject({ agents: { claude: `if (call === 1) { ${cheat} return; } ${BUILD}` }, files: { 'test/keep.test.js': "import test from 'node:test';\ntest('keeps the file', () => {});\n" } });
  const result = await run(cwd, 'run', 'demo', '--quiet');
  assert.match(result.output, /Learned: \d+ new rule proposal/);
  const all = await json(cwd, 'proposals'), proposal = all.find(item => item.class === 'rollback:skip-or-only-added');
  assert.ok(all.some(item => item.class === 'rollback:test-count-decreased'), 'one proposal per failure class');
  assert.equal(proposal.class, 'rollback:skip-or-only-added');
  assert.equal(proposal.kind, 'agents');
  assert.deepEqual(proposal.paths, ['test/**']);
  assert.equal(proposal.occurrences.length, 1);
  assert.match(proposal.occurrences[0].evidence.patch, /rejected\/1\.patch$/);
  assert.equal((await json(cwd, 'proposals', 'harvest')).created.length, 0, 'an occurrence is recorded once');
  assert.deepEqual(classify('rollback:lint-or-type-suppression-added').kind, 'lint');
  assert.deepEqual(classify('dispute').kind, 'prd-question');

  await cli(cwd, 'proposals', 'accept', proposal.id, '--agents-md');
  const agents = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  assert.match(agents, /<!-- maverick:rules -->[\s\S]*Never delete, skip or weaken a test[\s\S]*test\/\*\*[\s\S]*<!-- \/maverick:rules -->/);
  // Injected only when the subtask touches the rule's paths.
  const { memorySections } = await import('../src/commands/agent.js');
  const { loadGraph } = await import('../src/subtasks/graph.js');
  const graph = await loadGraph(join(cwd, TASK));
  assert.equal((await memorySections(cwd, join(cwd, TASK), graph.items[0])).length, 0, 'subtask 01 touches only src/a.txt');
  await writeFile(join(cwd, TASK, 'subtasks/task_02.md'), (await readFile(join(cwd, TASK, 'subtasks/task_02.md'), 'utf8')).replace('## Files\n', '## Files\n- `test/b.test.js` (new)\n'));
  const second = (await loadGraph(join(cwd, TASK))).items[1];
  assert.match((await memorySections(cwd, join(cwd, TASK), second))[0].body, /Never delete, skip or weaken a test/);
  const [measured] = (await json(cwd, 'proposals', 'stats')).filter(item => item.id === proposal.id);
  assert.equal(measured.verdict, 'no loop since');
  assert.deepEqual(measured.occurrences, { before: 1, after: 0 });
  await assert.rejects(cli(cwd, 'proposals', 'accept', proposal.id), /already accepted/);
});

test('the review budget ranks hunks by risk and builds a proof tree per criterion', async () => {
  const { cwd } = await plannedProject({ agents: { claude: BUILD } });
  await run(cwd, 'run', 'demo', '--quiet');
  await writeFile(join(cwd, 'src/c.js'), 'export const c = 1;\n');
  const budget = await json(cwd, 'attention', 'demo');
  assert.equal(budget.files, 3);
  assert.match(budget.against, /^[0-9a-f]{40}$/, 'by default, the commit the loop started from');
  assert.ok(budget.minutes.low >= 1 && budget.minutes.high >= budget.minutes.low);
  assert.equal(budget.focus[0].file, 'src/c.js');
  assert.ok(budget.focus[0].why.includes('no test reaches this file'));
  assert.deepEqual(budget.hunksRanked.find(item => item.file === 'src/a.txt').why, [], 'a file the graph does not know is not called untested');
  assert.deepEqual(budget.tree.map(item => item.id), ['AC-01']);
  assert.deepEqual(budget.tree[0].files, ['src/a.txt', 'src/b.txt']);
  const inTask = await readFile(join(cwd, TASK, 'REVIEW-BUDGET.md'), 'utf8');
  assert.match(inTask, /## Where to look first[\s\S]*## Proof tree by criterion/);
  assert.match(inTask, /detailed copy, outside the work tree/, 'with loop.feedback criteria the task keeps the redacted copy');
  assert.equal((await json(cwd, 'attention', 'demo', '--against', 'HEAD')).against, 'HEAD');
  await cli(cwd, 'pr', 'demo');
  assert.match(await readFile(join(cwd, TASK, 'PR-DRAFT.md'), 'utf8'), /## Where to look\nThis change needs ~\d+(–\d+)? min of review/);
});

test('the contracts gate passes in a repository without commits', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-empty-'));
  sh(cwd, 'init', '-q');
  await mkdir(join(cwd, '.maverick/contracts'), { recursive: true });
  await writeFile(join(cwd, '.maverick/contracts/C-01.md'), '---\nid: C-01\ntitle: x\ntask: t\nanchors: [src/a.js]\nstatus: active\n---\n\n# C-01 x\n');
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeFile(join(cwd, 'src/a.js'), 'x\n');
  const report = await json(cwd, 'contract', 'check');
  assert.ok(report.ok);
  assert.equal(report.touched[0].id, 'C-01', 'every file is new');
});

test('grounding remembers similar tasks and drops Spanish stopwords', async () => {
  assert.deepEqual(descriptionTerms('Agregar paginación para los pedidos del usuario'), ['pagina', 'pedido']);
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-ground-'));
  await mkdir(join(cwd, 'src/orders'), { recursive: true });
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'g', scripts: { test: 'node --test' } }));
  await writeFile(join(cwd, 'src/orders/list.js'), 'export const list = () => [];\n');
  await writeFile(join(cwd, 'src/cursor.js'), 'export const encode = value => value;\n');
  await cli(cwd, 'new', 'Paginate the orders list with a cursor', '--slug', 'old', '--no-launch');
  await writeFile(join(cwd, '.maverick/tasks/old/TECHSPEC.md'), '# Technical Spec\n\n## File References\n- `src/cursor.js`\n- `src/orders/list.js`\n');
  const { groundChange } = await import('../src/core/grounding.js');
  const ground = await groundChange(cwd, 'Add cursor pagination to the orders list', { exclude: 'new-one' });
  assert.equal(ground.pastTasks[0].task, 'old');
  assert.ok(ground.relevant.find(item => item.path === 'src/cursor.js').reasons.includes('planned by similar task old'));
  assert.equal((await groundChange(cwd, 'Add cursor pagination to the orders list', { exclude: 'old' })).pastTasks.length, 0);
});

test('graph snapshots make health a trend', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-trend-'));
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeFile(join(cwd, 'src/a.js'), "import './b.js';\n");
  await writeFile(join(cwd, 'src/b.js'), 'export const b = 1;\n');
  await cli(cwd, 'graph');
  await cli(cwd, 'graph');
  assert.equal((await readSnapshots(cwd)).length, 1, 'the same numbers are not recorded twice');
  await writeFile(join(cwd, 'src/b.js'), "import './a.js';\nexport const b = 1;\n");
  await cli(cwd, 'graph');
  const trend = await json(cwd, 'graph', '--trend');
  assert.equal(trend.points, 2);
  assert.equal(trend.cycles, 1);
  assert.ok(trend.delta < 0, 'a new cycle lowers health');
  assert.equal(healthTrend([]).points, 0);
  assert.equal(sparkline([1, 5, 9]), '▁▅█');
  assert.equal(await recordSnapshot(cwd, { graph: { nodes: [], edges: [], cycles: [], hubs: [] } }).then(entry => entry.files), 0);
  assert.match(await cli(cwd, 'graph', '--trend'), /Health \d+ → \d+/);
});
