import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';
import { buildGraph, impactOf, stronglyConnected, toMermaid, withMetrics } from '../src/intel/graph.js';
import { churn, rankHotspots } from '../src/intel/hotspots.js';
import { handleMessage, serveMcp, TOOLS } from '../src/mcp/server.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

async function project(files) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-intel-'));
  for (const [path, content] of Object.entries(files)) { await mkdir(join(cwd, path, '..'), { recursive: true }); await writeFile(join(cwd, path), content); }
  return cwd;
}
const edge = (graph, from, to) => graph.edges.some(item => item.from === from && item.to === to);

test('imports resolve to real files across languages', async () => {
  const cwd = await project({
    'web/src/app.ts': "import { api } from './api.js';\nimport React from 'react';\nconst lazy = () => import('./lazy');\n",
    'web/src/api.ts': "export * from './util/index';\n", 'web/src/util/index.ts': '', 'web/src/lazy.tsx': '',
    'svc/app/views.py': 'from .models import User\nfrom ..shared import helpers\nimport os\n', 'svc/app/models.py': '', 'svc/shared/helpers.py': '', 'svc/shared/__init__.py': '',
    'go.mod': 'module example.com/shop\n', 'cmd/main.go': 'package main\nimport (\n  "fmt"\n  "example.com/shop/internal/db"\n)\n', 'internal/db/db.go': 'package db\n', 'internal/db/db_test.go': 'package db\n',
    'src/main.rs': 'mod routes;\nuse crate::routes::health;\n', 'src/routes/mod.rs': 'pub mod health;\n', 'src/routes/health.rs': '',
    'java/src/main/java/com/acme/App.java': 'import com.acme.core.Service;\nimport java.util.List;\n', 'java/src/main/java/com/acme/core/Service.java': '',
    'lib/tasks.rb': "require_relative 'helpers'\n", 'lib/helpers.rb': ''
  });
  const graph = await buildGraph(cwd);
  assert.ok(edge(graph, 'web/src/app.ts', 'web/src/api.ts'), 'TypeScript .js specifier resolves to .ts');
  assert.ok(edge(graph, 'web/src/api.ts', 'web/src/util/index.ts'));
  assert.ok(graph.edges.find(item => item.to === 'web/src/lazy.tsx').dynamic, 'lazy import() is marked');
  assert.ok(edge(graph, 'svc/app/views.py', 'svc/app/models.py'));
  assert.ok(edge(graph, 'svc/app/views.py', 'svc/shared/helpers.py'));
  assert.ok(edge(graph, 'cmd/main.go', 'internal/db/db.go'));
  assert.ok(!edge(graph, 'cmd/main.go', 'internal/db/db_test.go'), 'Go test files are not package members');
  assert.ok(edge(graph, 'src/main.rs', 'src/routes/mod.rs'));
  assert.ok(edge(graph, 'src/routes/mod.rs', 'src/routes/health.rs'));
  assert.ok(edge(graph, 'java/src/main/java/com/acme/App.java', 'java/src/main/java/com/acme/core/Service.java'));
  assert.ok(edge(graph, 'lib/tasks.rb', 'lib/helpers.rb'));
  assert.equal(graph.edges.some(item => /react|fmt|java\/util|os$/.test(item.to)), false, 'third-party imports are not edges');
});

test('metrics: Tarjan cycles, instability, hubs and health', () => {
  const adjacency = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['d']], ['e', []]]);
  assert.deepEqual(stronglyConnected(['a', 'b', 'c', 'd', 'e'], adjacency), [['a', 'b', 'c'], ['d']]);
  const nodes = ['a', 'b', 'c', 'x'].map(id => ({ id, test: false }));
  const graph = withMetrics(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'c', to: 'a' }, { from: 'x', to: 'a', dynamic: true }]);
  assert.deepEqual(graph.cycles, [['a', 'b']]);
  assert.deepEqual(nodes.find(node => node.id === 'a'), { id: 'a', test: false, fanOut: 1, fanIn: 2, instability: 0.33 }, 'lazy edges do not count toward coupling');
  assert.equal(graph.health.score, Math.round(100 * (1 - 0.7 * 0.5)));
  const lazyOnly = withMetrics([{ id: 'p' }, { id: 'q' }], [{ from: 'p', to: 'q' }, { from: 'q', to: 'p', dynamic: true }]);
  assert.deepEqual(lazyOnly.cycles, [], 'a cycle closed only by a lazy import is not a cycle');
});

test('impact walks dependents transitively and finds the tests to run', async () => {
  const cwd = await project({ 'core.js': '', 'service.js': "import './core.js';", 'api.js': "import './service.js';", 'api.test.js': "import './api.js';", 'other.js': '' });
  const result = impactOf(await buildGraph(cwd), 'core.js');
  assert.deepEqual(result.dependents.map(item => [item.id, item.depth]), [['service.js', 1], ['api.js', 2], ['api.test.js', 3]]);
  assert.deepEqual(result.tests, ['api.test.js']);
  const { output } = await captureOutput(() => main(['impact', 'core.js', '--json'], cwd));
  const payload = JSON.parse(output);
  assert.equal(payload.inGraph, true);
  assert.equal(payload.count, 3);
  const docs = await project({ 'README.md': '#', 'a.js': "// see README\n" });
  const { output: fallback } = await captureOutput(() => main(['impact', 'README.md', '--json'], docs));
  assert.equal(JSON.parse(fallback).inGraph, false, 'non-source files fall back to text references');
});

test('graph and hotspots commands report on a real Git history', async () => {
  const cwd = await project({ 'a.js': "import './b.js';", 'b.js': "import './a.js';", 'c.js': "import './b.js';" });
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'one');
  await writeFile(join(cwd, 'b.js'), "import './a.js';\n// change\n");
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'two');
  const summary = JSON.parse((await captureOutput(() => main(['graph', '--json'], cwd))).output);
  assert.deepEqual(summary.cycles, [['a.js', 'b.js']]);
  assert.ok(summary.health.score < 100);
  assert.match((await captureOutput(() => main(['graph', '--format', 'mermaid'], cwd))).output, /^graph LR/);
  const graph = await buildGraph(cwd), counts = await churn(cwd, '1 year ago');
  assert.equal(counts.get('b.js'), 2);
  assert.equal(rankHotspots(graph, counts)[0].id, 'b.js');
  assert.match(toMermaid(graph), /\(root\)|empty/);
});

test('MCP: handshake, tool listing, read-only calls and protocol errors', async () => {
  const cwd = await project({ 'package.json': JSON.stringify({ name: 'mcp-fixture', scripts: { test: 'node --version' } }), 'core.js': '', 'use.js': "import './core.js';" });
  await captureOutput(() => main(['task', 'demo'], cwd));
  await captureOutput(() => main(['subtask', 'add', 'demo', 'First step'], cwd));
  const call = (id, method, params) => handleMessage(cwd, { jsonrpc: '2.0', id, method, params });
  const init = await call(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  assert.equal(init.result.protocolVersion, '2024-11-05');
  assert.equal((await call(2, 'initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
  const { tools } = (await call(3, 'tools/list')).result;
  assert.deepEqual(tools.map(tool => tool.name), TOOLS.map(tool => tool.name));
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint && tool.inputSchema.type === 'object'));
  const overview = (await call(4, 'tools/call', { name: 'project_overview', arguments: {} })).result;
  assert.equal(overview.structuredContent.name, 'mcp-fixture');
  assert.equal(overview.structuredContent.verification[0].command, 'npm run test');
  assert.deepEqual((await call(5, 'tools/call', { name: 'next_subtasks', arguments: { task: 'demo' } })).result.structuredContent.ready.map(item => item.title), ['First step']);
  assert.match((await call(6, 'tools/call', { name: 'get_task', arguments: { task: 'demo' } })).result.structuredContent.artifacts['TASK.md'], /demo/);
  assert.deepEqual((await call(7, 'tools/call', { name: 'impact', arguments: { path: 'core.js' } })).result.structuredContent.direct, ['use.js']);
  assert.equal((await call(8, 'tools/call', { name: 'get_task', arguments: { task: 'missing-task' } })).result.isError, true, 'tool failures are readable results');
  assert.equal((await call(9, 'tools/call', { name: 'impact', arguments: { path: '../etc/passwd' } })).error.code, -32602);
  assert.equal((await call(10, 'tools/call', { name: 'rm_rf' })).error.code, -32602);
  assert.equal((await call(11, 'resources/read')).error.code, -32601);
  assert.equal(await handleMessage(cwd, { jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
});

test('MCP over stdio answers in order and handles malformed input', async () => {
  const cwd = await project({ 'a.js': '' });
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.on('data', chunk => lines.push(...chunk.toString().split('\n').filter(Boolean)));
  const done = serveMcp({ cwd, input, output, log: () => {} });
  input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  input.write('not json\n');
  input.write('[{"jsonrpc":"2.0","id":2,"method":"ping"},{"jsonrpc":"2.0","method":"notifications/initialized"}]\n');
  input.end();
  await done;
  assert.deepEqual(lines.map(line => JSON.parse(line)), [{ jsonrpc: '2.0', id: 1, result: {} }, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, [{ jsonrpc: '2.0', id: 2, result: {} }]]);
});
