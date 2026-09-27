import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IGNORED_DIRS, parseJson } from './util.js';

/** Verification check kinds Maverick knows how to run, in execution order. */
export const CHECK_KINDS = ['lint', 'typecheck', 'test', 'build'];

const python = process.platform === 'win32' ? 'python' : 'python3';
const mentions = (text, ...needles) => needles.some(needle => text.includes(needle));
const tomlName = text => text.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
const NODE_FRAMEWORKS = [['next', 'Next.js'], ['nuxt', 'Nuxt'], ['@angular/core', 'Angular'], ['@nestjs/core', 'NestJS'], ['react-native', 'React Native'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['electron', 'Electron'], ['express', 'Express'], ['fastify', 'Fastify'], ['hono', 'Hono']];
const pick = (rules, text) => rules.filter(([needle]) => (needle instanceof RegExp ? needle.test(text) : text.includes(needle))).map(([, name]) => name);

/** A lazily-read view of one directory, shared by every rule that inspects it. */
async function directoryContext(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
  const dirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  const cache = new Map();
  return {
    dir, files, dirs,
    has: name => files.includes(name) || dirs.includes(name),
    hasAny: names => names.some(name => files.includes(name) || dirs.includes(name)),
    find: pattern => files.filter(name => pattern.test(name)),
    text(name) {
      if (!cache.has(name)) cache.set(name, readFile(join(dir, name), 'utf8').catch(() => ''));
      return cache.get(name);
    },
    async texts(names) { return (await Promise.all(names.filter(name => files.includes(name)).map(name => this.text(name)))).join('\n'); }
  };
}

/**
 * Ecosystem rules. Each rule detects a toolchain from marker files and describes its
 * conventional verification commands. Adding an ecosystem is one entry in this table.
 */
export const ECOSYSTEM_RULES = [
  {
    id: 'node', markers: ['package.json'],
    async inspect(ctx) {
      const pkg = parseJson(await ctx.text('package.json')) || {};
      const declared = String(pkg.packageManager || '').split('@')[0];
      const packageManager = ctx.has('pnpm-lock.yaml') ? 'pnpm' : ctx.has('yarn.lock') ? 'yarn' : ctx.hasAny(['bun.lockb', 'bun.lock']) ? 'bun' : ['npm', 'pnpm', 'yarn', 'bun'].includes(declared) ? declared : 'npm';
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const scripts = pkg.scripts || {};
      const script = (...names) => names.find(name => scripts[name] && !/no test specified/.test(scripts[name]));
      const run = name => name && `${packageManager} run ${name}`;
      return {
        name: pkg.name, packageManager, scripts,
        languages: [ctx.has('tsconfig.json') || deps.typescript ? 'TypeScript' : 'JavaScript'],
        frameworks: NODE_FRAMEWORKS.filter(([dep]) => dep in deps).map(([, name]) => name),
        commands: { lint: run(script('lint')), typecheck: run(script('typecheck', 'type-check', 'types')), test: run(script('test')), build: run(script('build')) }
      };
    }
  },
  {
    id: 'python', markers: ['pyproject.toml', 'requirements.txt', 'requirements-dev.txt', 'setup.py', 'setup.cfg', 'Pipfile'],
    async inspect(ctx) {
      const pyproject = await ctx.text('pyproject.toml');
      const text = pyproject + await ctx.texts(['requirements.txt', 'requirements-dev.txt', 'setup.cfg', 'setup.py', 'Pipfile', 'tox.ini']);
      const packageManager = ctx.has('uv.lock') ? 'uv' : ctx.has('poetry.lock') || pyproject.includes('[tool.poetry]') ? 'poetry' : ctx.has('pdm.lock') ? 'pdm' : ctx.has('Pipfile') ? 'pipenv' : 'pip';
      const prefix = packageManager === 'pip' ? '' : `${packageManager} run `;
      const module = name => packageManager === 'pip' ? `${python} -m ${name}` : `${prefix}${name}`;
      const django = ctx.has('manage.py') || /\bdjango\b/i.test(text);
      const test = mentions(text, 'pytest') || ctx.hasAny(['pytest.ini', 'conftest.py']) ? module('pytest')
        : django && ctx.has('manage.py') ? (prefix ? `${prefix}python manage.py test` : `${python} manage.py test`)
          : ctx.hasAny(['tests', 'test']) ? `${module('unittest')} discover` : null;
      const lint = mentions(text, 'ruff') || ctx.hasAny(['ruff.toml', '.ruff.toml']) ? `${prefix}ruff check .` : mentions(text, 'flake8') || ctx.has('.flake8') ? module('flake8') : null;
      const typecheck = mentions(text, 'mypy') || ctx.has('mypy.ini') ? `${module('mypy')} .` : mentions(text, 'pyright') || ctx.has('pyrightconfig.json') ? `${prefix}pyright` : null;
      return {
        name: tomlName(pyproject), packageManager, languages: ['Python'],
        frameworks: [...(django ? ['Django'] : []), ...pick([[/\bfastapi\b/i, 'FastAPI'], [/\bflask\b/i, 'Flask'], [/\bstreamlit\b/i, 'Streamlit']], text)],
        commands: { lint, typecheck, test, build: null }
      };
    }
  },
  {
    id: 'go', markers: ['go.mod'],
    async inspect(ctx) {
      const mod = await ctx.text('go.mod');
      const modulePath = mod.match(/^module\s+(\S+)/m)?.[1];
      const golangci = ctx.find(/^\.golangci\.(ya?ml|toml|json)$/).length > 0;
      return {
        name: modulePath?.split('/').pop(), modulePath, packageManager: 'go modules', languages: ['Go'],
        frameworks: pick([['gin-gonic/gin', 'Gin'], ['labstack/echo', 'Echo'], ['gofiber/fiber', 'Fiber'], ['go-chi/chi', 'Chi'], ['google.golang.org/grpc', 'gRPC']], mod),
        commands: { lint: golangci ? 'golangci-lint run' : 'go vet ./...', typecheck: null, test: 'go test ./...', build: 'go build ./...' }
      };
    }
  },
  {
    id: 'rust', markers: ['Cargo.toml'],
    async inspect(ctx) {
      const cargo = await ctx.text('Cargo.toml');
      return {
        name: tomlName(cargo), packageManager: 'cargo', languages: ['Rust'],
        frameworks: pick([[/^axum\b/m, 'Axum'], [/^actix-web\b/m, 'Actix Web'], [/^rocket\b/m, 'Rocket'], [/^tauri\b/m, 'Tauri'], [/^tokio\b/m, 'Tokio']], cargo),
        commands: { lint: 'cargo clippy --all-targets', typecheck: 'cargo check', test: 'cargo test', build: 'cargo build' }
      };
    }
  },
  {
    id: 'jvm', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    async inspect(ctx) {
      const maven = ctx.has('pom.xml');
      const text = await ctx.texts(['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle.kts']);
      const tool = maven ? (ctx.has('mvnw') ? './mvnw' : 'mvn') : (ctx.has('gradlew') ? './gradlew' : 'gradle');
      const kotlin = ctx.has('build.gradle.kts') || /kotlin/i.test(text);
      return {
        name: text.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] || text.match(/rootProject\.name\s*=\s*["']([^"']+)/)?.[1],
        packageManager: maven ? 'maven' : 'gradle', languages: [kotlin ? 'Kotlin' : 'Java'],
        frameworks: pick([['spring-boot', 'Spring Boot'], ['io.quarkus', 'Quarkus'], ['io.micronaut', 'Micronaut'], ['io.ktor', 'Ktor'], ['com.android.application', 'Android']], text),
        commands: maven
          ? { lint: null, typecheck: null, test: `${tool} test`, build: `${tool} package -DskipTests` }
          : { lint: null, typecheck: null, test: `${tool} test`, build: `${tool} assemble` }
      };
    }
  },
  {
    id: 'dotnet', markers: ['global.json'], patterns: [/\.(sln|slnx|csproj|fsproj|vbproj)$/],
    async inspect(ctx) {
      const projects = ctx.find(/\.(csproj|fsproj|vbproj)$/);
      const text = await ctx.texts(projects);
      return {
        name: (ctx.find(/\.slnx?$/)[0] || projects[0] || '').replace(/\.[^.]+$/, '') || undefined,
        packageManager: 'nuget', languages: [projects.some(name => name.endsWith('.fsproj')) ? 'F#' : 'C#'],
        frameworks: pick([['Microsoft.NET.Sdk.Web', 'ASP.NET Core'], ['Microsoft.AspNetCore', 'ASP.NET Core'], ['BlazorWebAssembly', 'Blazor'], ['<UseMaui>', '.NET MAUI']], text).filter((name, index, all) => all.indexOf(name) === index),
        commands: { lint: 'dotnet format --verify-no-changes', typecheck: null, test: 'dotnet test', build: 'dotnet build' }
      };
    }
  },
  {
    id: 'ruby', markers: ['Gemfile'],
    async inspect(ctx) {
      const gemfile = await ctx.text('Gemfile');
      const rails = /gem ['"]rails['"]/.test(gemfile);
      const test = mentions(gemfile, 'rspec') || ctx.has('spec') ? 'bundle exec rspec' : rails && ctx.has('bin') ? 'bin/rails test' : ctx.has('Rakefile') ? 'bundle exec rake test' : null;
      return {
        name: undefined, packageManager: 'bundler', languages: ['Ruby'],
        frameworks: [...(rails ? ['Rails'] : []), ...pick([[/gem ['"]sinatra['"]/, 'Sinatra'], [/gem ['"]hanami['"]/, 'Hanami']], gemfile)],
        commands: { lint: mentions(gemfile, 'rubocop') ? 'bundle exec rubocop' : null, typecheck: mentions(gemfile, 'sorbet') ? 'bundle exec srb tc' : null, test, build: null }
      };
    }
  },
  {
    id: 'php', markers: ['composer.json'],
    async inspect(ctx) {
      const composer = parseJson(await ctx.text('composer.json')) || {};
      const deps = { ...composer.require, ...composer['require-dev'] };
      const scripts = composer.scripts || {};
      const test = scripts.test ? 'composer run-script test' : 'pestphp/pest' in deps ? 'vendor/bin/pest' : ctx.hasAny(['phpunit.xml', 'phpunit.xml.dist']) || 'phpunit/phpunit' in deps ? 'vendor/bin/phpunit' : null;
      const lint = scripts.lint ? 'composer run-script lint' : 'laravel/pint' in deps ? 'vendor/bin/pint --test' : ctx.hasAny(['.php-cs-fixer.php', '.php-cs-fixer.dist.php']) ? 'vendor/bin/php-cs-fixer fix --dry-run' : null;
      const typecheck = ctx.hasAny(['phpstan.neon', 'phpstan.neon.dist']) || 'phpstan/phpstan' in deps ? 'vendor/bin/phpstan analyse' : ctx.hasAny(['psalm.xml', 'psalm.xml.dist']) ? 'vendor/bin/psalm' : null;
      return {
        name: composer.name, packageManager: 'composer', languages: ['PHP'],
        frameworks: [['laravel/framework', 'Laravel'], ['symfony/framework-bundle', 'Symfony'], ['slim/slim', 'Slim']].filter(([dep]) => dep in deps).map(([, name]) => name),
        commands: { lint, typecheck, test, build: null }
      };
    }
  },
  {
    id: 'elixir', markers: ['mix.exs'],
    async inspect(ctx) {
      const mix = await ctx.text('mix.exs');
      return {
        name: mix.match(/app:\s*:(\w+)/)?.[1], packageManager: 'mix', languages: ['Elixir'],
        frameworks: pick([[':phoenix', 'Phoenix'], [':nerves', 'Nerves']], mix),
        commands: { lint: mix.includes(':credo') ? 'mix credo' : null, typecheck: mix.includes(':dialyxir') ? 'mix dialyzer' : null, test: 'mix test', build: 'mix compile --warnings-as-errors' }
      };
    }
  },
  {
    id: 'dart', markers: ['pubspec.yaml'],
    async inspect(ctx) {
      const pubspec = await ctx.text('pubspec.yaml');
      const flutter = /sdk:\s*flutter/.test(pubspec);
      const tool = flutter ? 'flutter' : 'dart';
      return {
        name: pubspec.match(/^name:\s*(\S+)/m)?.[1], packageManager: 'pub', languages: ['Dart'], frameworks: flutter ? ['Flutter'] : [],
        commands: { lint: `${tool} analyze`, typecheck: null, test: `${tool} test`, build: null }
      };
    }
  },
  {
    id: 'swift', markers: ['Package.swift'],
    async inspect() {
      return { name: undefined, packageManager: 'swiftpm', languages: ['Swift'], frameworks: [], commands: { lint: null, typecheck: null, test: 'swift test', build: 'swift build' } };
    }
  },
  {
    // CMake projects need a configure step first, so only the language is reported;
    // declare commands in a Makefile, justfile or verification.commands instead.
    id: 'cmake', markers: ['CMakeLists.txt'],
    async inspect() { return { name: undefined, packageManager: 'cmake', languages: ['C/C++'], frameworks: [], commands: {} }; }
  }
];

/** Task-runner target names that map to each check kind. */
const RUNNER_TARGETS = { lint: ['lint'], typecheck: ['typecheck', 'type-check', 'types'], test: ['test'], build: ['build'] };

/**
 * Task runners express the project's own intent across languages, so their targets
 * take precedence over ecosystem conventions for the same check kind.
 */
export const RUNNER_RULES = [
  {
    id: 'make', files: ['Makefile', 'makefile', 'GNUmakefile'], bin: 'make',
    targets: text => [...text.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?![:=])/gm)].map(match => match[1])
  },
  {
    id: 'just', files: ['justfile', 'Justfile', '.justfile'], bin: 'just',
    targets: text => [...text.matchAll(/^@?([A-Za-z0-9_-]+)(?:\s+[^:=\n]*)?:(?!=)/gm)].map(match => match[1])
  },
  {
    id: 'task', files: ['Taskfile.yml', 'Taskfile.yaml'], bin: 'task',
    targets: text => [...(text.split(/^tasks:\s*$/m)[1] || '').matchAll(/^ {2}([A-Za-z0-9_:-]+):\s*$/gm)].map(match => match[1])
  }
];

function matchesEcosystem(rule, ctx) {
  return ctx.hasAny(rule.markers) || (rule.patterns || []).some(pattern => ctx.find(pattern).length > 0);
}

/** Detects ecosystems, task runners and verification commands for a single directory. */
export async function detectDirectory(dir, subdir = '') {
  const ctx = await directoryContext(dir);
  const ecosystems = [];
  for (const rule of ECOSYSTEM_RULES) {
    if (!matchesEcosystem(rule, ctx)) continue;
    const details = await rule.inspect(ctx);
    const manifests = [...rule.markers.filter(name => ctx.has(name)), ...(rule.patterns || []).flatMap(pattern => ctx.find(pattern))];
    ecosystems.push({ id: rule.id, manifests, ...details });
  }
  const runners = [];
  for (const rule of RUNNER_RULES) {
    const file = rule.files.find(name => ctx.files.includes(name));
    if (file) runners.push({ id: rule.id, file, bin: rule.bin, targets: [...new Set(rule.targets(await ctx.text(file)))] });
  }
  const commands = [];
  for (const kind of CHECK_KINDS) {
    const runner = runners.map(item => ({ item, target: RUNNER_TARGETS[kind].find(target => item.targets.includes(target)) })).find(match => match.target);
    if (runner) { commands.push({ name: kind, kind, command: `${runner.item.bin} ${runner.target}`, cwd: subdir, source: runner.item.id }); continue; }
    for (const ecosystem of ecosystems) {
      const command = ecosystem.commands?.[kind];
      if (command) commands.push({ name: kind, kind, command, cwd: subdir, source: ecosystem.id });
    }
  }
  return { ecosystems, runners, commands };
}

const unique = values => [...new Set(values.filter(Boolean))];

/**
 * Detects the project stack at the root plus first-level subprojects (for polyglot
 * repositories such as frontend/ + backend/). Pure file inspection: nothing is executed.
 */
export async function detectStack(cwd, { maxSubprojects = 40 } = {}) {
  const root = await detectDirectory(cwd);
  const subprojects = [];
  const entries = (await readdir(cwd, { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name))
    .map(entry => entry.name).sort().slice(0, maxSubprojects);
  for (const name of entries) {
    const detected = await detectDirectory(join(cwd, name), name);
    if (detected.ecosystems.length || detected.runners.length) subprojects.push({ path: name, ...detected });
  }
  const all = [root, ...subprojects];
  const ecosystems = all.flatMap(item => item.ecosystems);
  return {
    ecosystems: root.ecosystems, runners: root.runners, commands: root.commands, subprojects,
    languages: unique(ecosystems.flatMap(item => item.languages || [])),
    frameworks: unique(ecosystems.flatMap(item => item.frameworks || [])),
    packageManagers: unique(ecosystems.map(item => item.packageManager)),
    name: root.ecosystems.map(item => item.name).find(Boolean)
  };
}

/** Normalises a verification.commands entry from configuration into a command item. */
function configuredCommand(entry) {
  if (typeof entry === 'string') return { name: entry.split(/\s+/)[1] || entry, kind: 'custom', command: entry, cwd: '', source: 'config' };
  return { name: entry.name, kind: 'custom', command: entry.command, cwd: entry.cwd || '', source: 'config' };
}

/**
 * Chooses the commands `maverick verify` runs. Explicit configuration wins; otherwise root
 * commands are used, and subproject commands when the root has none (or when configured).
 */
export function selectVerificationCommands(stack, config = {}) {
  const verification = config.verification || {};
  if (verification.commands?.length) return verification.commands.map(configuredCommand);
  const mode = verification.subprojects || 'auto';
  let commands = mode === 'never' ? stack.commands
    : mode === 'always' || !stack.commands.length ? [...stack.commands, ...stack.subprojects.flatMap(item => item.commands)]
      : stack.commands;
  if (verification.kinds?.length) commands = commands.filter(item => verification.kinds.includes(item.kind));
  const legacy = config.defaultVerification || [];
  if (legacy.length) {
    const filtered = commands.filter(item => legacy.some(name => item.kind === name || item.command.endsWith(name)));
    if (filtered.length) commands = filtered;
  }
  return commands;
}
