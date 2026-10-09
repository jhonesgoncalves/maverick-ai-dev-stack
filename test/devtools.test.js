/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';
import { startLens } from '../src/lens/server.js';
import { analyzeArchitecture, depths, globToRegex, inferComponents } from '../src/intel/architecture.js';
import { buildDevtools, serializeDevtools } from '../src/intel/devtools.js';
import { buildGraph, createResolver } from '../src/intel/graph.js';
import { activity, changeCoupling, ownership } from '../src/intel/history.js';
import { analyzeIntegrations, manifestDependencies, serviceName } from '../src/intel/integrations.js';
import { blank, fileMetrics } from '../src/intel/metrics.js';
import { extractRoutes, joinPath, pathKey, routeInsights } from '../src/intel/routes.js';
import { handleMessage } from '../src/mcp/server.js';
import { languageForPath } from '../src/core/imports.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

async function project(files) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-devtools-'));
  for (const [path, content] of Object.entries(files)) { await mkdir(join(cwd, path, '..'), { recursive: true }); await writeFile(join(cwd, path), content); }
  return cwd;
}
async function routesOf(cwd) {
  const sources = new Map(), graph = await buildGraph(cwd, { sources });
  return extractRoutes(cwd, { sources: new Map(sources), resolve: await createResolver(cwd, graph.files, sources) });
}
const has = (routes, method, path, framework) => routes.some(route => route.method === method && route.path === path && (!framework || route.framework === framework));

const POLYGLOT = {
  'nest/src/main.ts': "app.setGlobalPrefix('api');\napp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });",
  'nest/src/users/users.controller.ts': "@Controller({ path: 'users', version: '2' })\n@UseGuards(AuthGuard)\nexport class UsersController {\n  @Get(':id')\n  findOne() {}\n  @Post()\n  @Version('3')\n  create() {}\n  @EventPattern('user.created')\n  onCreated() {}\n  @Cron('0 * * * *')\n  tick() {}\n}\nconst doc = `@Controller('fake') @Get('nope')`;",
  'express/app.js': "const express = require('express');\nconst users = require('./routes/users');\nconst app = express();\nconst admin = express.Router();\nadmin.get('/stats', auth, getStats);\napp.use('/admin', admin);\napp.use('/api/users', users);\napp.get('/health', (req, res) => res.send('ok'));\naxios.get('/nope', {});",
  'express/routes/users.js': "const router = require('express').Router();\nrouter.get('/', list);\nrouter.post('/:id', requireAuth, update);\nrouter.route('/:id/avatar').get(a).put(b);\nmodule.exports = router;",
  'py/app/main.py': "from fastapi import FastAPI\nfrom .routers import items\napp = FastAPI()\napp.include_router(items.router, prefix='/api')\n@app.get('/ping')\nasync def ping():\n    return 1\n",
  'py/app/routers/items.py': "from fastapi import APIRouter\nrouter = APIRouter(prefix='/items')\n@router.get('/{item_id}')\ndef read(item_id: int):\n    pass\n",
  'py/app/__init__.py': '', 'py/app/routers/__init__.py': '',
  'go.mod': 'module example.com/shop\n',
  'cmd/server.go': 'package main\nimport "github.com/gin-gonic/gin"\nfunc main() {\n r := gin.Default()\n v1 := r.Group("/v1")\n v1.GET("/orders/:id", getOrder)\n http.HandleFunc("GET /metrics", m)\n resp, _ := http.Get("/x")\n}',
  'java/src/main/java/com/acme/OrderController.java': '@RestController\n@RequestMapping("/orders")\npublic class OrderController {\n  @GetMapping("/{id}")\n  public ResponseEntity<Order> get(@PathVariable Long id) {}\n  @RequestMapping(value = "/bulk", method = {RequestMethod.POST, RequestMethod.PUT})\n  public void bulk() {}\n  @KafkaListener(topics = "orders.created")\n  public void consume(String m) {}\n}',
  'java/src/main/resources/application.properties': 'server.servlet.context-path=/shop\n',
  'cs/UsersController.cs': '[ApiController]\n[Route("api/[controller]")]\npublic class UsersController : ControllerBase {\n  [HttpGet("{id}")]\n  public async Task<ActionResult<User>> Get(int id) {}\n}',
  'cs/Program.cs': 'var app = builder.Build();\nvar api = app.MapGroup("/v2");\napi.MapGet("/todos", () => 1);',
  'rails/config/routes.rb': "Rails.application.routes.draw do\n  root 'home#index'\n  namespace :api do\n    resources :posts, only: [:index, :show] do\n      resources :comments, only: [:create]\n    end\n  end\n  get 'about', to: 'pages#about'\nend\n",
  'php/routes/api.php': "<?php\nRoute::get('/users', [UserController::class, 'index']);\nRoute::prefix('admin')->group(function () {\n  Route::post('/ban/{id}', [AdminController::class, 'ban']);\n});\n",
  'rust/src/main.rs': '#[get("/hello/{name}")]\nasync fn greet() {}\nfn app() -> Router { Router::new().route("/users", get(list).post(create)) }',
  'phx/lib/app_web/router.ex': 'defmodule AppWeb.Router do\n  use AppWeb, :router\n  scope "/api", AppWeb do\n    get "/status", StatusController, :show\n  end\nend\n',
  'kt/Routes.kt': 'fun Application.module() {\n  routing {\n    route("/api") {\n      get("/items") { call.respond(1) }\n    }\n  }\n}',
  'web/next.config.js': 'module.exports = {}', 'web/app/(shop)/products/[id]/page.tsx': '', 'web/app/api/cart/route.ts': 'export async function GET() {}\nexport async function POST() {}',
  'contracts/openapi.yaml': "openapi: 3.0.0\npaths:\n  /api/v2/users/{id}:\n    get:\n      operationId: getUser\n  /api/v1/missing:\n    delete: {}\n",
  'contracts/schema.graphql': 'type Query {\n  me: User\n}\ntype Mutation {\n  login(email: String!): Token\n}',
  'contracts/shop.proto': 'package shop.v1;\nservice Orders {\n  rpc Get(GetReq) returns (Order);\n}'
};

test('entry points are found across frameworks, languages and contracts', async () => {
  const routes = await routesOf(await project(POLYGLOT));
  // NestJS: global prefix, URI versioning (controller and method level), guards inherited.
  assert.ok(has(routes, 'GET', '/api/v2/users/:id', 'NestJS'));
  assert.ok(has(routes, 'POST', '/api/v3/users', 'NestJS'));
  assert.deepEqual(routes.find(route => route.path === '/api/v2/users/:id').guards, ['UseGuards(AuthGuard)']);
  assert.ok(routes.some(route => route.kind === 'event' && route.path === 'user.created'));
  assert.ok(routes.some(route => route.kind === 'job' && route.path === '0 * * * *' && !route.guards.length), 'jobs do not inherit HTTP guards');
  assert.ok(!routes.some(route => /fake|nope/.test(route.path)), 'decorators inside strings and HTTP clients are ignored');
  // Express: same-file and cross-file mounts, middleware as guards, route chains.
  assert.ok(has(routes, 'GET', '/admin/stats', 'Express'));
  assert.ok(has(routes, 'GET', '/api/users', 'Express'));
  assert.deepEqual(routes.find(route => route.path === '/api/users/:id' && route.method === 'POST').guards, ['requireAuth']);
  assert.ok(has(routes, 'PUT', '/api/users/:id/avatar'));
  // FastAPI router prefix + include_router prefix.
  assert.ok(has(routes, 'GET', '/api/items/{item_id}', 'FastAPI'));
  assert.ok(has(routes, 'GET', '/ping', 'FastAPI'));
  // Go groups and Go 1.22 method patterns; http.Get is a client call.
  assert.ok(has(routes, 'GET', '/v1/orders/:id'));
  assert.ok(has(routes, 'GET', '/metrics'));
  assert.ok(!routes.some(route => route.path === '/x'));
  // Spring context path, class prefix, method arrays; Kafka consumer.
  assert.ok(has(routes, 'GET', '/shop/orders/{id}', 'Spring'));
  assert.ok(has(routes, 'POST', '/shop/orders/bulk') && has(routes, 'PUT', '/shop/orders/bulk'));
  assert.ok(routes.some(route => route.kind === 'event' && route.path === 'orders.created'));
  // ASP.NET attribute routes with [controller], minimal APIs with groups.
  assert.ok(has(routes, 'GET', '/api/Users/{id}', 'ASP.NET Core'));
  assert.ok(has(routes, 'GET', '/v2/todos'));
  // Rails, Laravel, Actix/Axum, Phoenix, Ktor.
  assert.ok(has(routes, 'GET', '/', 'Rails') && has(routes, 'GET', '/api/posts/:id', 'Rails') && has(routes, 'POST', '/api/posts/:post_id/comments', 'Rails') && has(routes, 'GET', '/about', 'Rails'));
  assert.ok(!has(routes, 'DELETE', '/api/posts/:id', 'Rails'), 'only: limits resource actions');
  assert.ok(has(routes, 'GET', '/api/users', 'Laravel') && has(routes, 'POST', '/api/admin/ban/{id}', 'Laravel'));
  assert.ok(has(routes, 'GET', '/hello/{name}') && has(routes, 'POST', '/users'));
  assert.ok(has(routes, 'GET', '/api/status', 'Phoenix'));
  assert.ok(has(routes, 'GET', '/api/items', 'Ktor'));
  // File-system routing and contracts.
  assert.ok(has(routes, 'PAGE', '/products/:id', 'Next.js') && has(routes, 'POST', '/api/cart', 'Next.js'));
  assert.ok(routes.some(route => route.kind === 'graphql' && route.method === 'MUTATION' && route.path === 'login'));
  assert.ok(routes.some(route => route.kind === 'rpc' && route.path === '/shop.v1.Orders/Get'));
  const insights = routeInsights(routes);
  assert.deepEqual(insights.contract.unimplemented.map(route => route.path), ['/api/v1/missing'], 'a documented operation missing from code is drift; a documented one in code is not');
});

test('route helpers normalise paths and parameters of every syntax', () => {
  assert.equal(joinPath('/api/', '', 'v1', '/users/'), '/api/v1/users');
  assert.equal(joinPath(''), '/');
  assert.equal(pathKey('/users/:id'), pathKey('/users/{id}'));
  assert.equal(pathKey('/users/[id]'), pathKey('/Users/<int:id>'));
});

test('imports resolve through workspaces, tsconfig paths and language module systems', async () => {
  const cwd = await project({
    'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    'packages/core/package.json': JSON.stringify({ name: '@acme/core', main: './dist/index.js' }), 'packages/core/src/index.ts': 'export const x = 1;', 'packages/core/src/util/strings.ts': '',
    'apps/web/tsconfig.json': '{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } }, }',
    'apps/web/src/page.tsx': "import { x } from '@acme/core';\nimport s from '@acme/core/util/strings';\nimport Button from '@/components/Button';\nimport React from 'react';",
    'apps/web/src/components/Button.tsx': '',
    'composer.json': JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'app/' } } }), 'app/Http/Controller.php': '<?php\nuse App\\Models\\User;\n', 'app/Models/User.php': '<?php\n',
    'svc/Orders.cs': 'namespace Shop.Orders;\npublic class Orders {}', 'svc/Api.cs': 'using Shop.Orders;\nusing System;\n',
    'lib/shop/accounts.ex': 'defmodule Shop.Accounts do\nend', 'lib/shop_web/controller.ex': 'defmodule ShopWeb.Controller do\n  alias Shop.Accounts\nend',
    'services/billing/go.mod': 'module example.com/billing\n', 'services/billing/main.go': 'package main\nimport "example.com/billing/internal/tax"\n', 'services/billing/internal/tax/tax.go': 'package tax\n',
    'crates/app/Cargo.toml': '[package]\nname = "app"\n', 'crates/app/src/main.rs': 'use shared_kernel::money::Money;\n', 'crates/shared-kernel/Cargo.toml': '[package]\nname = "shared-kernel"\n', 'crates/shared-kernel/src/lib.rs': 'pub mod money;\n', 'crates/shared-kernel/src/money.rs': ''
  });
  const graph = await buildGraph(cwd), edge = (from, to) => graph.edges.some(item => item.from === from && item.to === to);
  assert.ok(edge('apps/web/src/page.tsx', 'packages/core/src/index.ts'), 'workspace package entry maps dist/ back to src/');
  assert.ok(edge('apps/web/src/page.tsx', 'packages/core/src/util/strings.ts'), 'workspace deep import');
  assert.ok(edge('apps/web/src/page.tsx', 'apps/web/src/components/Button.tsx'), 'tsconfig paths alias');
  assert.ok(edge('app/Http/Controller.php', 'app/Models/User.php'), 'PSR-4 autoloading');
  assert.ok(edge('svc/Api.cs', 'svc/Orders.cs'), 'C# namespaces');
  assert.ok(edge('lib/shop_web/controller.ex', 'lib/shop/accounts.ex'), 'Elixir modules');
  assert.ok(edge('services/billing/main.go', 'services/billing/internal/tax/tax.go'), 'nested Go module');
  assert.ok(edge('crates/app/src/main.rs', 'crates/shared-kernel/src/money.rs'), 'Rust workspace crate');
});

test('code metrics are comparable across languages', () => {
  assert.equal(blank('const a = "if (x) {}"; // if', 'JavaScript').includes('if'), false, 'strings and comments are blanked');
  const js = fileMetrics('// TODO: split this\nfunction f(a) {\n  if (a && b) {\n    for (const x of y) {\n      return x;\n    }\n  }\n}\n', 'JavaScript');
  assert.equal(js.complexity, 4);
  assert.equal(js.maxNesting, 3);
  assert.deepEqual(js.debt, [{ tag: 'TODO', text: 'split this', line: 1 }]);
  const py = fileMetrics('class Repo(Protocol):\n    pass\n\nclass Sql:\n    def find(self):\n        if x or y:\n            pass\n', 'Python');
  assert.deepEqual(py.types, { abstract: 1, concrete: 1 }, 'methods are not module-level functions');
  assert.equal(py.complexity, 3);
  assert.deepEqual(fileMetrics('type Store interface{}\ntype Mem struct{}\nfunc New() {}\n', 'Go').types, { abstract: 1, concrete: 2 });
});

test('components are inferred for any layout and carry Martin metrics', () => {
  assert.deepEqual(inferComponents(['apps/web/a.ts', 'apps/web/b.ts', 'apps/api/c.ts', 'packages/core/d.ts', 'packages/ui/e.ts']), ['apps/api', 'apps/web', 'packages/core', 'packages/ui']);
  assert.deepEqual(inferComponents(['src/main/java/com/acme/orders/A.java', 'src/main/java/com/acme/users/B.java', 'src/main/java/com/acme/users/C.java']), ['src/main/java/com/acme/orders', 'src/main/java/com/acme/users'], 'single-child chains collapse');
  assert.ok(globToRegex('src/domain/**').test('src/domain/a/b.ts') && !globToRegex('src/*').test('src/a/b.ts'));
  const node = (id, types = { abstract: 0, concrete: 1 }) => ({ id, language: 'TypeScript', loc: 10, complexity: 1, types });
  const nodes = [node('domain/port.ts', { abstract: 1, concrete: 0 }), node('domain/model.ts'), node('infra/db.ts'), node('api/http.ts')];
  const edges = [{ from: 'infra/db.ts', to: 'domain/port.ts' }, { from: 'api/http.ts', to: 'domain/model.ts' }, { from: 'api/http.ts', to: 'infra/db.ts' }, { from: 'domain/model.ts', to: 'infra/db.ts' }];
  const arch = analyzeArchitecture(nodes, edges, { prefixes: ['domain', 'infra', 'api'], rules: [{ from: 'domain/**', disallow: ['infra/**'], reason: 'domain stays pure' }] });
  const domain = arch.components.find(item => item.id === 'domain');
  assert.deepEqual({ ca: domain.ca, ce: domain.ce, instability: domain.instability, abstractness: domain.abstractness, distance: domain.distance }, { ca: 2, ce: 1, instability: 0.33, abstractness: 0.5, distance: 0.17 });
  assert.deepEqual(arch.cycles.map(cycle => cycle.members), [['domain', 'infra']]);
  assert.deepEqual(arch.violations, [{ from: 'domain/model.ts', to: 'infra/db.ts', rule: 'domain/** ↛ infra/**', reason: 'domain stays pure' }]);
  assert.equal(arch.dsm.order.length, 3);
  const depth = depths(['a', 'b', 'c', 'd'], new Map([['a', ['b']], ['b', ['c']], ['c', ['b', 'd']], ['d', []]]));
  assert.deepEqual([...depth], [['a', 2], ['b', 1], ['c', 1], ['d', 0]], 'depth stays finite through cycles');
});

test('history: change coupling, ownership, bus factor and activity', () => {
  const now = Date.UTC(2026, 8, 27), day = 24 * 3600 * 1000;
  const commits = [
    ...Array.from({ length: 4 }, (_, i) => ({ author: 'ana', time: now - i * day, files: ['a.ts', 'b.ts'] })),
    { author: 'bo', time: now - 3 * day, files: ['a.ts'] },
    { author: 'ana', time: now - 40 * day, files: Array.from({ length: 60 }, (_, i) => `bulk${i}.ts`) }
  ];
  assert.deepEqual(changeCoupling(commits), [{ a: 'a.ts', b: 'b.ts', shared: 4, degree: 0.89 }], 'bulk commits are ignored');
  const owners = ownership(commits, file => (file.startsWith('bulk') ? 'bulk' : 'core'));
  assert.equal(owners.files.get('a.ts').owner, 'ana');
  assert.equal(owners.groups.core.busFactor, 1);
  assert.equal(owners.contributors[0].name, 'ana');
  const weeks = activity(commits, 4, now);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[3].commits, 5);
});

test('integrations come from manifests of any ecosystem and from the files that import them', async () => {
  assert.deepEqual(manifestDependencies('go.mod', 'module x\nrequire (\n  github.com/jackc/pgx/v5 v5.5.0\n)\n'), ['github.com/jackc/pgx/v5']);
  assert.deepEqual(manifestDependencies('Gemfile', "gem 'sidekiq'\ngem \"pg\", '~> 1.5'\n"), ['sidekiq', 'pg']);
  assert.ok(manifestDependencies('svc/App.csproj', '<PackageReference Include="Confluent.Kafka" Version="2" />').includes('Confluent.Kafka'));
  assert.equal(serviceName('PAYMENTS_API_URL'), 'Payments API');
  const cwd = await project({
    'package.json': JSON.stringify({ dependencies: { pg: '1', kafkajs: '2', stripe: '1' } }),
    'docker-compose.yml': 'services:\n  cache:\n    image: redis:7\n',
    '.env.example': 'DATABASE_URL=\n',
    'src/db.ts': "import { Pool } from 'pg';\nconst url = process.env.DATABASE_URL;\nconst secret = process.env.JWT_SECRET;\nconst pay = process.env.PAYMENTS_API_URL;",
    'worker/consumer.py': "import os\nfrom kafka import KafkaConsumer\nhost = os.environ.get('BROKER_HOST')\nrequests.get('https://api.partner.io/v1')"
  });
  const sources = new Map(); await buildGraph(cwd, { sources });
  const result = await analyzeIntegrations(cwd, { sources, languageOf: languageForPath });
  const byId = Object.fromEntries(result.integrations.map(item => [item.id, item]));
  assert.deepEqual(byId.postgres.files, ['src/db.ts']);
  assert.deepEqual(byId.kafka.files, ['worker/consumer.py'], 'the Python import names the file even though the package is declared in npm');
  assert.ok(byId.redis.declaredOnly && byId.redis.manifests.includes('docker-compose.yml'), 'infrastructure from compose files');
  assert.ok(byId.stripe.declaredOnly);
  const variables = Object.fromEntries(result.variables.map(item => [item.name, item]));
  assert.equal(variables.DATABASE_URL.documented, true);
  assert.equal(variables.JWT_SECRET.documented, false);
  assert.equal(variables.JWT_SECRET.secret, true);
  assert.ok(result.services.some(item => item.name === 'Payments API') && result.services.some(item => item.name === 'api.partner.io'));
});

test('the Devtools report ties it together, with findings that name their files', async () => {
  const cwd = await project({
    '.maverick/config.json': JSON.stringify({ version: 1, architecture: { rules: [{ from: 'src/domain/**', disallow: ['src/infra/**'] }] } }),
    'src/domain/order.ts': "import { save } from '../infra/db';\nexport function place() { return save(); }",
    'src/infra/db.ts': "import { place } from '../domain/order';\nexport function save() { return place; }",
    'src/api/routes.ts': "import express from 'express';\nimport { place } from '../domain/order';\nconst router = express.Router();\nrouter.post('/orders', place);\nrouter.get('/orders', list);",
    'src/api/routes.test.ts': "import './routes';"
  });
  execFileSync('git', ['init', '-q'], { cwd }); execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=Ana', 'add', '.'], { cwd }); execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=Ana', 'commit', '-qm', 'init'], { cwd });
  const report = serializeDevtools(await buildDevtools(cwd));
  assert.equal(report.summary.sourceFiles, 3);
  assert.deepEqual(report.health.deductions.map(item => item.rule), ['Import cycle', 'Boundary violation']);
  assert.ok(report.health.score < 100);
  assert.deepEqual(report.routes.items.filter(route => route.kind === 'http').map(route => `${route.method} ${route.path}`), ['GET /orders', 'POST /orders']);
  assert.ok(report.findings.some(item => item.category === 'boundaries' && item.files.includes('src/domain/order.ts')));
  assert.ok(report.findings.some(item => item.category === 'cycles'));
  assert.ok(report.files.every(file => typeof file.complexity === 'number' && file.component));
  assert.equal(report.summary.commits, 1);
  assert.ok(JSON.stringify(report).length > 100 && !('fileIndex' in report));
});

test('CLI routes, coupling and audit print and emit JSON', async () => {
  const cwd = await project({ 'src/app.ts': "import express from 'express';\nconst app = express();\napp.get('/health', ok);", 'src/lib/a.ts': "import { b } from './b';", 'src/lib/b.ts': "import { a } from './a';" });
  const routes = JSON.parse((await captureOutput(() => main(['routes', '--json'], cwd))).output);
  assert.deepEqual(routes.routes.map(route => `${route.method} ${route.path}`), ['GET /health']);
  assert.match((await captureOutput(() => main(['coupling'], cwd))).output, /COUPLING[\s\S]*I = Ce/);
  const audit = JSON.parse((await captureOutput(() => main(['audit', '--json'], cwd))).output);
  assert.ok(audit.findings.some(item => item.category === 'cycles'));
});

test('MCP exposes routes, architecture and findings read-only', async () => {
  const cwd = await project({ 'src/app.ts': "import express from 'express';\nconst app = express();\napp.post('/login', login);" });
  const list = await handleMessage(cwd, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = list.result.tools.map(tool => tool.name);
  for (const name of ['list_routes', 'architecture', 'audit']) assert.ok(names.includes(name), name);
  const call = await handleMessage(cwd, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_routes', arguments: { method: 'post' } } });
  assert.deepEqual(call.result.structuredContent.routes.map(route => route.path), ['/login']);
});

test('Lens serves Devtools data, guards writes with a token and rejects foreign hosts', async () => {
  const cwd = await project({ 'src/app.ts': "import express from 'express';\nconst app = express();\napp.get('/health', ok);" });
  const server = await startLens({ cwd, port: 0, watch: false }).catch(async () => startLens({ cwd, port: 40000 + Math.floor(Math.random() * 20000), watch: false }));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(`${base}/`)).text();
    const token = html.match(/name="lens-token" content="([a-f0-9]+)"/)?.[1];
    assert.ok(token, 'the page carries the per-process token');
    const report = await (await fetch(`${base}/api/devtools`)).json();
    assert.equal(report.routes.items[0].path, '/health');
    assert.equal((await fetch(`${base}/api/source?file=src/app.ts`)).status, 200);
    assert.equal((await fetch(`${base}/api/source?file=../../etc/passwd`)).status, 404, 'only analysed files can be read');
    assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST' })).status, 403, 'writes need the token');
    assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST', headers: { 'x-lens-token': token } })).status, 204);
    assert.equal((await fetch(`${base}/devtools.js`)).status, 200);
    const rebinding = await new Promise(resolve => { import('node:http').then(({ request }) => { const req = request(`${base}/api/project`, { headers: { host: 'evil.example:80' } }, res => resolve(res.statusCode)); req.end(); }); });
    assert.equal(rebinding, 421, 'DNS rebinding is refused');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Lens task workspace serves its assets and records a human gate decision', async () => {
  const cwd = await project({ '.maverick/tasks/demo/TASK.json': JSON.stringify({ idea: 'Review the demo', workflow: 'standard' }) });
  const server = await startLens({ cwd, port: 0, watch: false }).catch(async () => startLens({ cwd, port: 40000 + Math.floor(Math.random() * 20000), watch: false }));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base)).text(), token = html.match(/name="lens-token" content="([a-f0-9]+)"/)?.[1];
    assert.match(html, /src="\/app\.js"/);
    assert.match((await fetch(`${base}/lens.css`)).headers.get('content-type'), /text\/css/);
    assert.match((await fetch(`${base}/views/task.js`)).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${base}/views/../../server.js`)).status, 404, 'only files under ui/ are served');
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    const detail = await (await fetch(`${base}/api/task-flow?task=demo&flow=ship`)).json();
    assert.ok(detail.flow.gates.some(gate => gate.id === 'human-review' && gate.type === 'approval'));
    const endpoint = `${base}/api/task-flow/approval`, body = JSON.stringify({ task: 'demo', flow: 'ship', gate: 'human-review', decision: 'approve', by: 'Reviewer' });
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token }, body: JSON.stringify({ task: 'demo', flow: 'ship', gate: 'human-review', decision: 'reject', by: 'Reviewer' }) })).status, 400);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token }, body })).status, 200);
    const updated = await (await fetch(`${base}/api/task-flow?task=demo&flow=ship`)).json();
    assert.equal(updated.state.approvals['human-review'].by, 'Reviewer');
    assert.equal(updated.state.approvals['human-review'].decision, 'approve');
    const auto = `${base}/api/task-flow/auto-approve`, post = (url, payload) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token }, body: JSON.stringify(payload) });
    assert.equal((await post(auto, { flow: '../ship', enabled: true })).status, 400);
    assert.deepEqual(await (await post(auto, { flow: 'ship', enabled: true })).json(), { ok: true, command: 'maverick flow auto-approve ship on', autoApprove: ['ship'] });
    assert.equal((await (await fetch(`${base}/api/task?task=demo`)).json()).flows.find(flow => flow.name === 'ship').autoApprove, true);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8')).flows, { autoApprove: ['ship'] });
    assert.deepEqual((await (await post(auto, { flow: 'ship', enabled: false })).json()).autoApprove, []);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Lens task API reads the task files and runs only whitelisted commands', async () => {
  const cwd = await project({
    '.maverick/tasks/demo/TASK.json': JSON.stringify({ idea: 'Page the orders', workflow: 'standard' }),
    '.maverick/tasks/demo/PRD.md': '# PRD — Page the orders\n\n## Overview\nLarge accounts time out.\n\n## Goals\n- Page by cursor\n\n## Acceptance Criteria\n- [ ] AC-01: Given 45 orders, when listing, then 20 are returned.\n- [ ] AC-02: Given a cursor, when passed back, then the next page starts after it.\n\n## Non-Goals\n- Offset pagination\n',
    '.maverick/tasks/demo/TECHSPEC.md': '# Tech\n\n## File References\n- `src/orders.js` — the query\n\n## Test Plan\n- UT-01 → AC-01\n',
    '.maverick/tasks/demo/subtasks/_tasks.md': '---\nschema: maverick.subtasks/v1\nnodes:\n  - id: "01"\n    file: task_01.md\n  - id: "02"\n    file: task_02.md\nedges:\n  - from: "01"\n    to: "02"\n---\n',
    '.maverick/tasks/demo/subtasks/task_01.md': '---\ntitle: Cursor codec\nstatus: pending\n---\n\n## Steps\n- [x] Encode\n- [ ] Decode\n\nCovers AC-01.\n',
    '.maverick/tasks/demo/subtasks/task_02.md': '---\ntitle: Service\nstatus: pending\n---\n\nCovers AC-02.\n',
    'src/orders.js': 'export const x = 1;\n'
  });
  const server = await startLens({ cwd, port: 40000 + Math.floor(Math.random() * 20000), watch: false });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const token = (await (await fetch(base)).text()).match(/name="lens-token" content="([a-f0-9]+)"/)[1];
    const post = (path, body, auth = true) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { 'x-lens-token': token } : {}) }, body: JSON.stringify(body) });
    const detail = await (await fetch(`${base}/api/task?task=demo`)).json();
    assert.equal(detail.title, 'Page the orders');
    assert.equal(detail.goal, 'Large accounts time out.');
    assert.deepEqual(detail.goals, ['Page by cursor']);
    assert.deepEqual(detail.nonGoals, ['Offset pagination']);
    assert.deepEqual(detail.scope, ['src/orders.js']);
    assert.deepEqual(detail.criteria.map(c => [c.id, c.tested, c.tasks]), [['AC-01', true, ['01']], ['AC-02', false, ['02']]]);
    assert.equal(detail.criteria[0].text, 'Given 45 orders, when listing, then 20 are returned.');
    assert.deepEqual(detail.subtasks.map(s => [s.id, s.ready, s.dependsOn, s.checklist.done, s.checklist.total]), [['01', true, [], 1, 2], ['02', false, ['01'], 0, 0]]);
    assert.ok(detail.flows.some(flow => flow.name === 'ship'), 'ship is always offered');
    assert.ok(detail.artifacts.some(a => a.file === 'subtasks/task_01.md' && a.kind === 'subtask'));
    assert.equal((await fetch(`${base}/api/task?task=missing`)).status, 404);
    assert.equal((await fetch(`${base}/api/task?task=..%2F..`)).status, 400);
    assert.match((await (await fetch(`${base}/api/artifact?task=demo&file=PRD.md`)).json()).content, /AC-01/);
    assert.equal((await fetch(`${base}/api/artifact?task=demo&file=..%2F..%2Fsrc%2Forders.js`)).status, 400);

    assert.equal((await post('/api/action', { action: 'validate', task: 'demo' }, false)).status, 403, 'actions need the page token');
    assert.equal((await post('/api/action', { action: 'rm', task: 'demo' })).status, 400, 'unknown actions are refused');
    assert.equal((await post('/api/action', { action: 'subtask-set', task: 'demo', id: '01', status: 'shipped' })).status, 400);
    const set = await (await post('/api/action', { action: 'subtask-set', task: 'demo', id: '01', status: 'in-progress' })).json();
    assert.equal(set.ok, true, set.error);
    assert.equal((await (await fetch(`${base}/api/task?task=demo`)).json()).subtasks[0].status, 'in-progress');
    const validate = await (await post('/api/action', { action: 'validate', task: 'demo' })).json();
    assert.equal(validate.command, 'maverick validate demo');
    assert.match(validate.output, /VALIDATE/);
    const flow = await (await post('/api/action', { action: 'flow-run', task: 'demo', flow: 'ship' })).json();
    assert.equal(flow.ok, true, flow.error);
    assert.ok(flow.run.results.length);
    const { runs } = await (await fetch(`${base}/api/runs`)).json();
    assert.equal(runs[0].task, 'demo');
    assert.equal(runs[0].flow, 'ship');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Lens runs trusted agents, streams their events, stops them and lists transcripts', async () => {
  const cwd = await project({
    '.maverick/tasks/demo/TASK.json': JSON.stringify({ idea: 'Demo', workflow: 'standard' }),
    '.maverick/tasks/demo/PRD.md': '# PRD — Demo\n\n## Overview\nDemo.\n',
    '.maverick/tasks/demo/subtasks/_tasks.md': '---\nschema: maverick.subtasks/v1\nnodes:\n  - id: "01"\n    file: task_01.md\nedges: []\n---\n',
    '.maverick/tasks/demo/subtasks/task_01.md': '---\ntitle: Codec\nstatus: pending\n---\n\nBuild it.\n'
  });
  // A fake `claude` that speaks stream-json; FAKE_SLOW keeps it running so it can be stopped.
  const fake = join(cwd, 'fake-claude.mjs');
  await writeFile(fake, `#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
readFileSync(0, 'utf8');
const out = e => console.log(JSON.stringify(e));
out({ type: 'system', subtype: 'init', session_id: 's1' });
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.js' } }] } });
if (existsSync('slow')) await new Promise(r => setTimeout(r, 20000));
const text = 'Done.\\n\\n\`\`\`maverick-result\\n{"status":"done","summary":"ok","filesChanged":["src/a.js"],"questions":[]}\\n\`\`\`';
out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
out({ type: 'result', subtype: 'success', is_error: false, result: text, total_cost_usd: 0.01 });
`);
  await chmod(fake, 0o755);
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ version: 1, runtime: { bins: { 'claude-code': fake } } }));
  const server = await startLens({ cwd, port: 40000 + Math.floor(Math.random() * 20000), watch: false });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (await (await fetch(base)).text()).match(/name="lens-token" content="([a-f0-9]+)"/)[1];
  const post = async (path, body) => { const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
  const get = async path => (await fetch(`${base}${path}`)).json();
  const settle = async id => { for (let i = 0; i < 100; i++) { const run = await get(`/api/agents/run?id=${id}`); if (run.status !== 'running') return run; await new Promise(r => setTimeout(r, 50)); } throw new Error('run did not finish'); };
  try {
    const info = await get('/api/agents');
    assert.equal(info.providers.find(p => p.id === 'claude-code').installed, true);
    assert.equal(info.providers.find(p => p.id === 'claude-code').trusted, false);
    const refused = await post('/api/agents/run', { task: 'demo', subtask: '01', provider: 'claude-code' });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /not trusted/);
    assert.equal((await post('/api/agents/trust', { provider: 'claude-code' })).body.ok, true);
    assert.equal(JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8')).runtime.trusted[0], 'claude-code', 'trust goes through maverick agent trust');
    assert.equal((await post('/api/agents/run', { task: 'demo', provider: 'claude-code', permission: 'full' })).status, 400, 'the permission ceiling holds');

    const started = await post('/api/agents/run', { task: 'demo', subtask: '01' });
    assert.equal(started.status, 202);
    assert.equal(started.body.subtask, '01');
    const done = await settle(started.body.id);
    assert.equal(done.status, 'ok');
    assert.equal(done.result.summary, 'ok');
    assert.deepEqual(done.result.filesChanged, ['src/a.js']);
    assert.ok(done.events.some(e => e.type === 'tool' && e.name === 'Edit'));
    assert.equal((await get('/api/task?task=demo')).subtasks[0].status, 'in-progress', 'starting a pending subtask marks it in progress');

    await writeFile(join(cwd, 'slow'), '');
    const slow = await post('/api/agents/run', { task: 'demo', subtask: '01' });
    assert.equal((await post('/api/agents/run', { task: 'demo' })).status, 409, 'one agent per task at a time');
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await post('/api/agents/stop', { id: slow.body.id })).status, 200);
    assert.equal((await settle(slow.body.id)).status, 'stopped');

    const runs = await get('/api/agents/runs');
    assert.equal(runs.live.length, 2);
    assert.equal(runs.history.length, 2);
    const transcript = await get(`/api/agents/transcript?task=demo&file=${encodeURIComponent(runs.history.find(h => h.ok).file)}`);
    assert.ok(transcript.events.some(e => e.type === 'end' && e.ok));
    assert.equal((await fetch(`${base}/api/agents/transcript?task=demo&file=..%2FPRD.md`)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Lens previews capability changes before applying them, and changes settings through the CLI', async () => {
  const cwd = await project({ '.maverick/config.json': JSON.stringify({ version: 1 }), 'package.json': JSON.stringify({ name: 'caps', scripts: { test: 'node --version' } }) });
  const server = await startLens({ cwd, port: 40000 + Math.floor(Math.random() * 20000), watch: false });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (await (await fetch(base)).text()).match(/name="lens-token" content="([a-f0-9]+)"/)[1];
  const post = async (path, body) => { const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
  const get = async path => (await fetch(`${base}${path}`)).json();
  const skill = join(cwd, '.agents/skills/maverick-build/SKILL.md');
  try {
    const caps = await get('/api/capabilities');
    assert.ok(caps.catalog.some(c => c.ref === 'skill/maverick-build'));
    assert.deepEqual(caps.installed, []);
    assert.ok(caps.adapters.some(a => a.id === 'claude-code'));
    assert.equal((await get('/api/capability?ref=agent/reviewer')).ref, 'agent/reviewer');
    assert.equal((await fetch(`${base}/api/capability?ref=..%2Fx`)).status, 400);

    assert.equal((await post('/api/capabilities', { action: 'add', refs: ['skill/maverick-build; rm -rf /'] })).status, 400, 'references are validated');
    assert.equal((await post('/api/capabilities', { action: 'add', refs: ['skill/maverick-build'], to: ['vim'] })).status, 400, 'targets are validated');
    const preview = (await post('/api/capabilities', { action: 'add', refs: ['skill/maverick-build'], to: ['claude-code'] })).body;
    assert.equal(preview.ok, true, preview.error);
    assert.match(preview.command, /--dry-run/);
    assert.ok(preview.data.plans[0].changes.some(c => c.op === 'create'));
    await assert.rejects(readFile(skill), 'a preview writes nothing');
    const applied = (await post('/api/capabilities', { action: 'add', refs: ['skill/maverick-build'], to: ['claude-code'], apply: true })).body;
    assert.equal(applied.ok, true, applied.error);
    assert.match(await readFile(skill, 'utf8'), /maverick/i);
    assert.equal((await get('/api/capabilities')).installed[0].ref, 'skill/maverick-build');
    assert.equal((await post('/api/capabilities', { action: 'remove', refs: ['skill/maverick-build'], apply: true })).body.ok, true);
    assert.deepEqual((await get('/api/capabilities')).installed, []);

    const settings = await get('/api/settings');
    assert.ok(settings.doctor.checks.some(c => c.name === 'Node >= 20' && c.ok));
    assert.ok(settings.config.sources.length);
    assert.equal((await post('/api/settings', { action: 'language', docs: 'pt-BR', code: 'no way' })).status, 400);
    assert.equal((await post('/api/settings', { action: 'language', docs: 'pt-BR', code: 'en' })).body.ok, true);
    assert.equal((await get('/api/settings')).language.docs, 'pt-BR');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('doctor recognises a project nested inside another Git repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'maverick-doctor-')), cwd = join(root, 'packages/app');
  await mkdir(cwd, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  const { output } = await captureOutput(() => main(['doctor', '--json'], cwd));
  assert.equal(JSON.parse(output).checks.find(c => c.name === 'Git repository').ok, true);
});
