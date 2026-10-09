import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { commands, findCommand } from '../src/commands/index.js';
import { commandRegistry } from '../src/core/command-registry.js';
import { loadConfig, mergeConfig, resolveConfig } from '../src/core/config.js';
import { extractImports, isLocalImport, languageForPath } from '../src/core/imports.js';
import { buildProjectIndex } from '../src/core/lens-index.js';
import { detectStack, selectVerificationCommands } from '../src/core/stack.js';
import { splitCommand } from '../src/core/util.js';

// Keep tests independent of the developer's ~/.maverick/config.json.
process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

async function fixture(files) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-stack-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), content);
  }
  return cwd;
}
const commandsOf = stack => Object.fromEntries(stack.commands.map(item => [item.kind, item.command]));

test('detects Node package managers, frameworks and scripts', async () => {
  const cwd = await fixture({
    'package.json': JSON.stringify({ name: 'web', scripts: { test: 'vitest', lint: 'eslint .', 'type-check': 'tsc' }, dependencies: { next: '1', react: '1' }, devDependencies: { typescript: '5' } }),
    'pnpm-lock.yaml': ''
  });
  const stack = await detectStack(cwd);
  assert.equal(stack.name, 'web');
  assert.deepEqual(stack.languages, ['TypeScript']);
  assert.deepEqual(stack.frameworks, ['Next.js', 'React']);
  assert.deepEqual(commandsOf(stack), { lint: 'pnpm run lint', typecheck: 'pnpm run type-check', test: 'pnpm run test' });
});

test('ignores the npm placeholder test script', async () => {
  const cwd = await fixture({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) });
  assert.deepEqual((await detectStack(cwd)).commands, []);
});

test('detects Python toolchains and runs tools through the package manager', async () => {
  const cwd = await fixture({ 'pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n[tool.ruff]\n[tool.mypy]\n[dependency-groups]\ndev = ["pytest"]\n', 'uv.lock': '' });
  const stack = await detectStack(cwd);
  assert.equal(stack.name, 'api');
  assert.deepEqual(stack.frameworks, ['FastAPI']);
  assert.equal(stack.ecosystems[0].packageManager, 'uv');
  assert.deepEqual(commandsOf(stack), { lint: 'uv run ruff check .', typecheck: 'uv run mypy .', test: 'uv run pytest' });
});

test('detects Go, Rust, JVM, .NET, Ruby, PHP, Elixir and Dart projects', async () => {
  const cases = [
    [{ 'go.mod': 'module github.com/acme/svc\nrequire github.com/gin-gonic/gin v1\n' }, 'Go', 'go test ./...', 'Gin'],
    [{ 'Cargo.toml': '[package]\nname = "cli"\n[dependencies]\naxum = "0.7"\n' }, 'Rust', 'cargo test', 'Axum'],
    [{ 'pom.xml': '<project><artifactId>orders</artifactId><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>', mvnw: '' }, 'Java', './mvnw test', 'Spring Boot'],
    [{ 'build.gradle.kts': 'plugins { kotlin("jvm") }\n' }, 'Kotlin', 'gradle test', undefined],
    [{ 'Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>' }, 'C#', 'dotnet test', 'ASP.NET Core'],
    [{ Gemfile: "gem 'rails'\ngem 'rspec-rails'\n" }, 'Ruby', 'bundle exec rspec', 'Rails'],
    [{ 'composer.json': JSON.stringify({ require: { 'laravel/framework': '11' }, 'require-dev': { 'phpunit/phpunit': '11' } }) }, 'PHP', 'vendor/bin/phpunit', 'Laravel'],
    [{ 'mix.exs': 'defp deps do [{:phoenix, "~> 1.7"}] end' }, 'Elixir', 'mix test', 'Phoenix'],
    [{ 'pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n' }, 'Dart', 'flutter test', 'Flutter']
  ];
  for (const [files, language, testCommand, framework] of cases) {
    const stack = await detectStack(await fixture(files));
    assert.deepEqual(stack.languages, [language], language);
    assert.equal(commandsOf(stack).test, testCommand, language);
    if (framework) assert.ok(stack.frameworks.includes(framework), `${language}: ${stack.frameworks}`);
  }
});

test('task-runner targets take precedence over ecosystem conventions', async () => {
  const cwd = await fixture({ 'go.mod': 'module example.com/x\n', Makefile: 'VERSION := 1\ntest: deps\n\tgo test -race ./...\nlint:\n\tgolangci-lint run\n' });
  const stack = await detectStack(cwd);
  assert.deepEqual(commandsOf(stack), { lint: 'make lint', test: 'make test', build: 'go build ./...' });
  assert.equal(stack.commands.find(item => item.kind === 'test').source, 'make');
});

test('polyglot repositories report subprojects and verify them when the root has no checks', async () => {
  const cwd = await fixture({ 'backend/go.mod': 'module example.com/api\n', 'frontend/package.json': JSON.stringify({ scripts: { test: 'vitest' } }), 'docs/README.md': '# docs' });
  const stack = await detectStack(cwd);
  assert.deepEqual(stack.subprojects.map(item => item.path), ['backend', 'frontend']);
  assert.deepEqual(stack.languages.sort(), ['Go', 'JavaScript']);
  const selected = selectVerificationCommands(stack, {});
  assert.ok(selected.some(item => item.command === 'go test ./...' && item.cwd === 'backend'));
  assert.ok(selected.some(item => item.command === 'npm run test' && item.cwd === 'frontend'));
  assert.deepEqual(selectVerificationCommands(stack, { verification: { subprojects: 'never' } }), []);
  assert.deepEqual(selectVerificationCommands(stack, { verification: { kinds: ['build'] } }).map(item => item.cwd), ['backend']);
});

test('configured verification commands replace detection', async () => {
  const stack = await detectStack(await fixture({ 'Cargo.toml': '[package]\nname = "x"\n' }));
  const selected = selectVerificationCommands(stack, { verification: { commands: ['cargo nextest run', { name: 'e2e', command: 'npm run e2e', cwd: 'web' }] } });
  assert.deepEqual(selected.map(item => [item.name, item.command, item.cwd, item.source]), [['nextest', 'cargo nextest run', '', 'config'], ['e2e', 'npm run e2e', 'web', 'config']]);
});

test('verify runs configured commands for non-Node projects and writes evidence', async () => {
  const cwd = await fixture({ 'go.mod': 'module example.com/x\n' });
  await mkdir(join(cwd, '.maverick'), { recursive: true });
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ verification: { commands: [`"${process.execPath}" --version`] } }));
  await main(['new', 'Demo idea', '--slug', 'go-task', '--no-launch'], cwd);
  await main(['verify', 'go-task'], cwd);
  assert.match(await readFile(join(cwd, '.maverick/tasks/go-task/EVIDENCE.md'), 'utf8'), /## PASS/);
});

test('verify fails loudly instead of writing empty evidence when nothing is detected', async () => {
  const cwd = await fixture({ 'README.md': '# nothing' });
  await main(['new', 'Demo idea', '--slug', 'empty', '--no-launch'], cwd);
  await assert.rejects(main(['verify', 'empty'], cwd), /no verification commands detected/);
});

test('configuration is layered and validated', async () => {
  const home = process.env.MAVERICK_HOME;
  const cwd = await fixture({ '.maverick/config.json': JSON.stringify({ workflow: { default: 'strict' } }) });
  await writeFile(join(home, 'config.json'), JSON.stringify({ adapter: 'codex', taskRoot: 'work/tasks' }));
  try {
    const { config, sources } = await resolveConfig(cwd);
    assert.equal(config.adapter, 'codex');
    assert.equal(config.workflow.default, 'strict', 'the project layer wins');
    assert.equal(config.taskRoot, 'work/tasks', 'the global layer fills what the project does not set');
    assert.deepEqual(sources.map(source => source.scope), ['defaults', 'global', 'project']);
  } finally { await writeFile(join(home, 'config.json'), '{}'); }
  const bad = await fixture({ '.maverick/config.json': JSON.stringify({ taskRoot: '../outside', workflow: { default: 'yolo' } }) });
  await assert.rejects(loadConfig(bad), error => /taskRoot: must be a project-relative path/.test(error.message) && /workflow\.default/.test(error.message));
  await assert.rejects(main(['config', 'validate'], bad), /invalid configuration/);
  assert.deepEqual(mergeConfig({ a: { b: 1, c: [1] } }, { a: { c: [2] } }), { a: { b: 1, c: [2] } });
});

test('commands are registered once and drive help, routing and the Lens registry', () => {
  const names = commands.flatMap(command => [command.id, ...command.aliases]);
  assert.equal(new Set(names).size, names.length, 'command names and aliases must be unique');
  assert.equal(findCommand('dashboard').id, 'lens');
  assert.equal(findCommand('-v').id, 'info');
  assert.deepEqual(commandRegistry.map(item => item.id), commands.map(command => command.id));
  assert.ok(commandRegistry.some(item => item.id === 'stack'));
});

test('splitCommand honours quotes without invoking a shell', () => {
  assert.deepEqual(splitCommand('cargo clippy -- -D warnings'), ['cargo', 'clippy', '--', '-D', 'warnings']);
  assert.deepEqual(splitCommand(`pytest -k "not slow" ''`), ['pytest', '-k', 'not slow', '']);
  assert.throws(() => splitCommand('echo "open'), /unbalanced quote/);
  assert.deepEqual(splitCommand('node -e "console.log(\\"hi\\")" \'a\\b\''), ['node', '-e', 'console.log("hi")', 'a\\b']);
});

test('import extraction covers multiple languages', () => {
  assert.equal(languageForPath('pkg/server.go'), 'Go');
  assert.deepEqual(extractImports('Python', 'import os, sys\nfrom .models import User\nfrom . import views as v\n'), ['os', 'sys', '.models', '.models.User', '.', '.views']);
  assert.deepEqual(extractImports('Go', 'import (\n  "fmt"\n  "example.com/x/internal/db"\n)\n'), ['fmt', 'example.com/x/internal/db']);
  assert.deepEqual(extractImports('Rust', 'use crate::db::Pool;\nmod routes;\n'), ['crate::db::Pool', 'mod:routes']);
  assert.deepEqual(extractImports('C#', 'using System.Text;\nusing static Foo.Bar;\n'), ['System.Text', 'Foo.Bar']);
  assert.deepEqual(extractImports('Ruby', "require 'json'\nrequire_relative 'lib/a'\n"), ['json', './lib/a']);
  assert.equal(isLocalImport('Go', 'example.com/x/internal/db', { goModulePath: 'example.com/x' }), true);
  assert.equal(isLocalImport('Go', 'fmt', { goModulePath: 'example.com/x' }), false);
});

test('Lens indexes modules and local couplings beyond JavaScript', async () => {
  const cwd = await fixture({
    'go.mod': 'module example.com/svc\n',
    'cmd/main.go': 'package main\nimport "example.com/svc/internal/db"\n',
    'internal/db/db.go': 'package db\n',
    'app/views.py': 'from .models import User\n',
    'app/models.py': 'class User: pass\n'
  });
  const index = await buildProjectIndex(cwd);
  assert.equal(index.project.packageManager, 'go modules');
  assert.ok(index.modules.some(item => item.path === 'app/views.py' && item.language === 'Python'));
  assert.ok(index.couplings.some(link => link.from === 'cmd/main.go' && link.to === 'internal/db/db.go'));
  assert.ok(index.couplings.some(link => link.from === 'app/views.py' && link.to === 'app/models.py'));
});
