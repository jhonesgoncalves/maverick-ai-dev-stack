import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const { calls, loopProject, run, sh } = await import('./loop-fixtures.js');
const { main } = await import('../src/cli.js');
const { captureOutput } = await import('../src/core/util.js');
const { planLanes, predictCollisions } = await import('../src/loop/workgraph.js');
const { loadGraph } = await import('../src/subtasks/graph.js');

const body = (files, extra = '') => `# t\n\n## Files\n${files.map(file => `- \`${file}\``).join('\n')}\n${extra}`;

test('collisions are predicted from declared files, imports within two hops and change coupling', () => {
  const items = [{ id: '01', body: body(['src/a.js']) }, { id: '02', body: body(['src/b.js']) }, { id: '03', body: body(['src/c.js']) }, { id: '04', body: body(['src/d.js']) }, { id: '05', body: body(['src/a.js']) }];
  // c imports b, so a change to b reaches c; d changes with a in history.
  const graph = { out: new Map([['src/a.js', []], ['src/b.js', []], ['src/c.js', ['src/b.js']], ['src/d.js', []]]), incoming: new Map([['src/b.js', ['src/c.js']]]), nodes: [] };
  const collisions = predictCollisions(items, { graph, coupling: [{ a: 'src/d.js', b: 'src/a.js', shared: 4, degree: 0.8 }] });
  const kinds = Object.fromEntries(collisions.map(item => [`${item.a}-${item.b}`, item.reasons.map(reason => reason.kind)]));
  assert.deepEqual(kinds, { '01-04': ['coupling'], '01-05': ['files'], '02-03': ['impact'], '04-05': ['coupling'] });
  assert.deepEqual(planLanes(items, collisions).map(lane => lane.subtasks), [['01', '04', '05'], ['02', '03']]);
  assert.deepEqual(planLanes([{ id: '01' }, { id: '02' }, { id: '03' }], [], { maxLanes: 2 }).map(lane => lane.subtasks), [['01', '03'], ['02']], 'never more lanes than allowed');
});

/** A project whose subtasks do not depend on each other. */
async function independent(agents, specs, checks) {
  const { cwd, binDir } = await loopProject({ agents, subtasks: [specs[0].slice(0, 2)], checks });
  for (const [index, [title, file, extraFiles = []]] of specs.entries()) {
    if (index) await captureOutput(() => main(['subtask', 'add', 'demo', title], cwd));
    const id = String(index + 1).padStart(2, '0');
    await writeFile(join(cwd, `.maverick/tasks/demo/subtasks/task_${id}.md`), `---\ntitle: ${title}\nstatus: pending\n---\n\n# ${title}\n\n## Goal\nCreate ${file}.\n\n## Acceptance Criteria\n- [ ] AC-01: ${file} exists\n\n## Files\n${[file, ...extraFiles].map(path => `- \`${path}\``).join('\n')}\n\n## Steps\n- [ ] Write ${file}\n`);
  }
  sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-qm', 'independent subtasks');
  return { cwd, binDir };
}

const build = files => `const map = ${JSON.stringify(files)}; for (const [file, text] of map[subtask] || []) write(file, text); tick('.maverick/tasks/demo/subtasks/task_' + subtask + '.md');`;

test('the work graph runs independent subtasks in parallel lanes, keeps predicted collisions in one lane, and merges at the fan-in', async () => {
  const agent = build({ '01': [['src/a.txt', 'a']], '02': [['src/b.txt', 'b']], '03': [['src/c.txt', 'c']] });
  const { cwd } = await independent({ claude: agent }, [['Create a', 'src/a.txt'], ['Create b', 'src/b.txt'], ['Create c', 'src/c.txt', ['src/a.txt']]], ['src/a.txt', 'src/b.txt', 'src/c.txt']);
  const plan = JSON.parse((await run(cwd, 'graph', 'demo', '--plan', '--json')).output);
  assert.deepEqual(plan.lanes.map(lane => lane.subtasks), [['01', '03'], ['02']]);
  assert.equal(plan.collisions[0].reasons[0].kind, 'files');
  const { output } = await run(cwd, 'graph', 'demo');
  assert.match(output, /Outcome: DONE — every subtask is done and every blocking gate passes on the merged work, in 1 wave/);
  assert.match(output, /Collisions: 1 predicted · 0 real/);
  const branch = output.match(/Branch: (\S+)/)[1];
  for (const [file, text] of [['src/a.txt', 'a'], ['src/b.txt', 'b'], ['src/c.txt', 'c']]) assert.equal(sh(cwd, 'show', `${branch}:${file}`), text);
  assert.deepEqual((await loadGraph(join(cwd, '.maverick/tasks/demo'))).items.map(item => item.status), ['done', 'done', 'done']);
  assert.equal(sh(cwd, 'branch', '--list', 'maverick/lane/*'), '', 'merged lanes leave no branch behind');
});

test('a merge conflict nobody predicted is a real collision: its subtask runs again on the merged code', async () => {
  // Subtask 02 declares only b, but also rewrites a: the prediction cannot see it, the fan-in can.
  const agent = build({ '01': [['src/a.txt', 'a\n']], '02': [['src/b.txt', 'b'], ['src/a.txt', 'a from 02\n']] });
  const { cwd, binDir } = await independent({ claude: agent }, [['Create a', 'src/a.txt'], ['Create b', 'src/b.txt']], ['src/a.txt', 'src/b.txt']);
  const { output } = await run(cwd, 'graph', 'demo', '--json');
  const record = JSON.parse(output);
  assert.equal(record.outcome, 'done');
  assert.equal(record.waves.length, 2);
  assert.deepEqual(record.waves[0].real.map(item => [item.kind, item.subtasks, item.files, item.predicted]), [['merge-conflict', ['02'], ['src/a.txt'], false]]);
  assert.deepEqual([record.metrics.predicted, record.metrics.real, record.metrics.missed], [0, 1, 1]);
  assert.deepEqual(record.waves[1].lanes.map(lane => lane.subtasks), [['02']]);
  assert.equal((await calls(binDir, 'claude')).filter(call => call.subtask === '02').length, 2);
  assert.equal(JSON.parse(await readFile(join(cwd, '.maverick/tasks/demo/graphs', `${record.id}.json`), 'utf8')).outcome, 'done');
});

test('the architecture gate reuses the base graph for a tree whose sources and resolution files did not change', async () => {
  const { graphOfTree, sameGraph } = await import('../src/proof/architecture.js');
  const { mkdir } = await import('node:fs/promises');
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-arch-'));
  const git = (...args) => sh(cwd, ...args);
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T');
  await mkdir(join(cwd, 'src'));
  await writeFile(join(cwd, 'src/a.js'), "import { b } from './b.js';\nexport const a = b;\n");
  await writeFile(join(cwd, 'src/b.js'), 'export const b = 1;\n');
  await writeFile(join(cwd, 'README.md'), '# x\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD^{tree}');
  await writeFile(join(cwd, 'README.md'), '# docs only\n');
  git('commit', '-qam', 'docs');
  const docs = git('rev-parse', 'HEAD^{tree}');
  await writeFile(join(cwd, 'src/b.js'), "import { a } from './a.js';\nexport const b = 1;\n");
  git('commit', '-qam', 'cycle');
  const cycle = git('rev-parse', 'HEAD^{tree}');
  assert.equal(await sameGraph(cwd, base, docs), true);
  assert.equal(await sameGraph(cwd, docs, cycle), false);
  const first = await graphOfTree(cwd, base);
  const shared = await graphOfTree(cwd, docs, { like: base });
  assert.deepEqual(shared.edges, first.edges);
  const cached = (await import('node:fs')).readdirSync(join(process.env.MAVERICK_HOME, 'cache')).length;
  assert.ok(cached > 0);
  assert.equal((await graphOfTree(cwd, cycle, { like: docs })).cycles.length, 1, 'a source change is built, not shared');
});

test('grounding precision compares the files maverick new suggested with the files the task\'s loops kept', async () => {
  const { BUILD } = await import('./loop-fixtures.js');
  const { cwd } = await loopProject({ agents: { claude: BUILD } });
  const dir = join(cwd, '.maverick/tasks/demo');
  const meta = JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8'));
  assert.ok(meta.grounding.at, 'maverick new recorded the suggestion');
  await writeFile(join(dir, 'TASK.json'), JSON.stringify({ ...meta, grounding: { at: 'x', relevant: ['src/a.txt', 'src/z.txt'], tests: [] } }));
  assert.match((await captureOutput(() => main(['grounding', 'demo'], cwd))).output, /not measured: no loop kept a change yet/);
  await run(cwd, 'run', 'demo', '--quiet');
  const result = JSON.parse((await captureOutput(() => main(['grounding', 'demo', '--json'], cwd))).output);
  assert.deepEqual([result.precision, result.recall, result.missed, result.unused], [0.5, 0.5, ['src/b.txt'], ['src/z.txt']]);
  assert.match((await captureOutput(() => main(['grounding'], cwd))).output, /Over 1 task\(s\): precision 50% · recall 50%/);
});
