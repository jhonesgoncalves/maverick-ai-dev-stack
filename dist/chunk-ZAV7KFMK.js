import {
  PRESET_IDS,
  getPreset,
  presets,
  requirePreset
} from "./chunk-YM2BQGIU.js";

// src/core/util.js
import { access, readFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { delimiter, dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
function findPackageRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).name === "maverick-ai-dev-stack") return dir;
      } catch {
      }
    }
    if (dirname(dir) === dir) return resolve(start, "..");
  }
}
var packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
var packageVersion = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
var IGNORED_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", ".maverick", "dist", "build", "coverage", ".cache", "vendor", "target", ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".gradle", ".dart_tool", "_build", "obj", ".next", ".nuxt", ".turbo", ".idea", ".vscode"]);
var slugOk = /^[a-z0-9][a-z0-9-]{1,80}$/;
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function pretty(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function rel(cwd, path) {
  return relative(cwd, path) || ".";
}
var sink = null;
function output(message) {
  if (sink) sink.push(String(message));
  else console.log(message);
}
async function captureOutput(fn) {
  const previous = sink, lines = [];
  sink = lines;
  try {
    return { value: await fn(), output: lines.join("\n") };
  } catch (error) {
    error.output = lines.join("\n");
    throw error;
  } finally {
    sink = previous;
  }
}
function brand() {
  return process.env.NO_COLOR ? "\u2694 MAVERICK" : "\x1B[38;5;208m\u2694 MAVERICK\x1B[0m";
}
function replaceVars(text, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), text);
}
function sectionPresent(text, name2) {
  const e = name2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,4}\\s+${e}\\s*$`, "mi").test(text);
}
function hasMeaningfulContent(text) {
  return !/\b(TODO|TBD|FILL ME)\b/i.test(text);
}
function requireSlug(slug) {
  if (!slugOk.test(slug || "")) throw new Error("use a lowercase slug such as add-orders-pagination");
}
function parseOptions(args) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = args[i + 1]?.startsWith("--") || args[i + 1] === void 0 ? true : args[++i];
    } else positional.push(args[i]);
  }
  return { positional, options };
}
function splitCommand(command) {
  const argv = [], chars = [...command.trim()];
  let current = "", quote = null, started = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (quote === '"' && char === "\\" && (chars[i + 1] === '"' || chars[i + 1] === "\\")) {
      current += chars[++i];
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started || current) argv.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
  }
  if (quote) throw new Error(`unbalanced quote in command: ${command}`);
  if (started || current) argv.push(current);
  return argv;
}
function commandAvailable(bin, cwd = process.cwd()) {
  if (bin.includes("/") || bin.includes("\\")) return existsSync(resolve(cwd, bin));
  const extensions = process.platform === "win32" ? ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")] : [""];
  return (process.env.PATH || "").split(delimiter).filter(Boolean).some((dir) => extensions.some((ext) => existsSync(join(dir, bin + ext))));
}
function changedFilesFromDiff(diff) {
  return [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]))];
}

// src/core/stack.js
import { readdir, readFile as readFile2 } from "fs/promises";
import { join as join2 } from "path";
var CHECK_KINDS = ["lint", "typecheck", "test", "build"];
var python = process.platform === "win32" ? "python" : "python3";
var mentions = (text, ...needles) => needles.some((needle) => text.includes(needle));
var tomlName = (text) => text.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
var NODE_FRAMEWORKS = [["next", "Next.js"], ["nuxt", "Nuxt"], ["@angular/core", "Angular"], ["@nestjs/core", "NestJS"], ["react-native", "React Native"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["electron", "Electron"], ["express", "Express"], ["fastify", "Fastify"], ["hono", "Hono"]];
var pick = (rules, text) => rules.filter(([needle]) => needle instanceof RegExp ? needle.test(text) : text.includes(needle)).map(([, name2]) => name2);
async function directoryContext(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const cache = /* @__PURE__ */ new Map();
  return {
    dir,
    files,
    dirs,
    has: (name2) => files.includes(name2) || dirs.includes(name2),
    hasAny: (names) => names.some((name2) => files.includes(name2) || dirs.includes(name2)),
    find: (pattern) => files.filter((name2) => pattern.test(name2)),
    text(name2) {
      if (!cache.has(name2)) cache.set(name2, readFile2(join2(dir, name2), "utf8").catch(() => ""));
      return cache.get(name2);
    },
    async texts(names) {
      return (await Promise.all(names.filter((name2) => files.includes(name2)).map((name2) => this.text(name2)))).join("\n");
    }
  };
}
var ECOSYSTEM_RULES = [
  {
    id: "node",
    markers: ["package.json"],
    async inspect(ctx) {
      const pkg = parseJson(await ctx.text("package.json")) || {};
      const declared = String(pkg.packageManager || "").split("@")[0];
      const packageManager = ctx.has("pnpm-lock.yaml") ? "pnpm" : ctx.has("yarn.lock") ? "yarn" : ctx.hasAny(["bun.lockb", "bun.lock"]) ? "bun" : ["npm", "pnpm", "yarn", "bun"].includes(declared) ? declared : "npm";
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const scripts = pkg.scripts || {};
      const script = (...names) => names.find((name2) => scripts[name2] && !/no test specified/.test(scripts[name2]));
      const run2 = (name2) => name2 && `${packageManager} run ${name2}`;
      return {
        name: pkg.name,
        packageManager,
        scripts,
        languages: [ctx.has("tsconfig.json") || deps.typescript ? "TypeScript" : "JavaScript"],
        frameworks: NODE_FRAMEWORKS.filter(([dep]) => dep in deps).map(([, name2]) => name2),
        commands: { lint: run2(script("lint")), typecheck: run2(script("typecheck", "type-check", "types")), test: run2(script("test")), build: run2(script("build")) }
      };
    }
  },
  {
    id: "python",
    markers: ["pyproject.toml", "requirements.txt", "requirements-dev.txt", "setup.py", "setup.cfg", "Pipfile"],
    async inspect(ctx) {
      const pyproject = await ctx.text("pyproject.toml");
      const text = pyproject + await ctx.texts(["requirements.txt", "requirements-dev.txt", "setup.cfg", "setup.py", "Pipfile", "tox.ini"]);
      const packageManager = ctx.has("uv.lock") ? "uv" : ctx.has("poetry.lock") || pyproject.includes("[tool.poetry]") ? "poetry" : ctx.has("pdm.lock") ? "pdm" : ctx.has("Pipfile") ? "pipenv" : "pip";
      const prefix = packageManager === "pip" ? "" : `${packageManager} run `;
      const module = (name2) => packageManager === "pip" ? `${python} -m ${name2}` : `${prefix}${name2}`;
      const django = ctx.has("manage.py") || /\bdjango\b/i.test(text);
      const test = mentions(text, "pytest") || ctx.hasAny(["pytest.ini", "conftest.py"]) ? module("pytest") : django && ctx.has("manage.py") ? prefix ? `${prefix}python manage.py test` : `${python} manage.py test` : ctx.hasAny(["tests", "test"]) ? `${module("unittest")} discover` : null;
      const lint = mentions(text, "ruff") || ctx.hasAny(["ruff.toml", ".ruff.toml"]) ? `${prefix}ruff check .` : mentions(text, "flake8") || ctx.has(".flake8") ? module("flake8") : null;
      const typecheck = mentions(text, "mypy") || ctx.has("mypy.ini") ? `${module("mypy")} .` : mentions(text, "pyright") || ctx.has("pyrightconfig.json") ? `${prefix}pyright` : null;
      return {
        name: tomlName(pyproject),
        packageManager,
        languages: ["Python"],
        frameworks: [...django ? ["Django"] : [], ...pick([[/\bfastapi\b/i, "FastAPI"], [/\bflask\b/i, "Flask"], [/\bstreamlit\b/i, "Streamlit"]], text)],
        commands: { lint, typecheck, test, build: null }
      };
    }
  },
  {
    id: "go",
    markers: ["go.mod"],
    async inspect(ctx) {
      const mod = await ctx.text("go.mod");
      const modulePath = mod.match(/^module\s+(\S+)/m)?.[1];
      const golangci = ctx.find(/^\.golangci\.(ya?ml|toml|json)$/).length > 0;
      return {
        name: modulePath?.split("/").pop(),
        modulePath,
        packageManager: "go modules",
        languages: ["Go"],
        frameworks: pick([["gin-gonic/gin", "Gin"], ["labstack/echo", "Echo"], ["gofiber/fiber", "Fiber"], ["go-chi/chi", "Chi"], ["google.golang.org/grpc", "gRPC"]], mod),
        commands: { lint: golangci ? "golangci-lint run" : "go vet ./...", typecheck: null, test: "go test ./...", build: "go build ./..." }
      };
    }
  },
  {
    id: "rust",
    markers: ["Cargo.toml"],
    async inspect(ctx) {
      const cargo = await ctx.text("Cargo.toml");
      return {
        name: tomlName(cargo),
        packageManager: "cargo",
        languages: ["Rust"],
        frameworks: pick([[/^axum\b/m, "Axum"], [/^actix-web\b/m, "Actix Web"], [/^rocket\b/m, "Rocket"], [/^tauri\b/m, "Tauri"], [/^tokio\b/m, "Tokio"]], cargo),
        commands: { lint: "cargo clippy --all-targets", typecheck: "cargo check", test: "cargo test", build: "cargo build" }
      };
    }
  },
  {
    id: "jvm",
    markers: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"],
    async inspect(ctx) {
      const maven = ctx.has("pom.xml");
      const text = await ctx.texts(["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle.kts"]);
      const tool = maven ? ctx.has("mvnw") ? "./mvnw" : "mvn" : ctx.has("gradlew") ? "./gradlew" : "gradle";
      const kotlin = ctx.has("build.gradle.kts") || /kotlin/i.test(text);
      return {
        name: text.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] || text.match(/rootProject\.name\s*=\s*["']([^"']+)/)?.[1],
        packageManager: maven ? "maven" : "gradle",
        languages: [kotlin ? "Kotlin" : "Java"],
        frameworks: pick([["spring-boot", "Spring Boot"], ["io.quarkus", "Quarkus"], ["io.micronaut", "Micronaut"], ["io.ktor", "Ktor"], ["com.android.application", "Android"]], text),
        commands: maven ? { lint: null, typecheck: null, test: `${tool} test`, build: `${tool} package -DskipTests` } : { lint: null, typecheck: null, test: `${tool} test`, build: `${tool} assemble` }
      };
    }
  },
  {
    id: "dotnet",
    markers: ["global.json"],
    patterns: [/\.(sln|slnx|csproj|fsproj|vbproj)$/],
    async inspect(ctx) {
      const projects = ctx.find(/\.(csproj|fsproj|vbproj)$/);
      const text = await ctx.texts(projects);
      return {
        name: (ctx.find(/\.slnx?$/)[0] || projects[0] || "").replace(/\.[^.]+$/, "") || void 0,
        packageManager: "nuget",
        languages: [projects.some((name2) => name2.endsWith(".fsproj")) ? "F#" : "C#"],
        frameworks: pick([["Microsoft.NET.Sdk.Web", "ASP.NET Core"], ["Microsoft.AspNetCore", "ASP.NET Core"], ["BlazorWebAssembly", "Blazor"], ["<UseMaui>", ".NET MAUI"]], text).filter((name2, index, all2) => all2.indexOf(name2) === index),
        commands: { lint: "dotnet format --verify-no-changes", typecheck: null, test: "dotnet test", build: "dotnet build" }
      };
    }
  },
  {
    id: "ruby",
    markers: ["Gemfile"],
    async inspect(ctx) {
      const gemfile = await ctx.text("Gemfile");
      const rails = /gem ['"]rails['"]/.test(gemfile);
      const test = mentions(gemfile, "rspec") || ctx.has("spec") ? "bundle exec rspec" : rails && ctx.has("bin") ? "bin/rails test" : ctx.has("Rakefile") ? "bundle exec rake test" : null;
      return {
        name: void 0,
        packageManager: "bundler",
        languages: ["Ruby"],
        frameworks: [...rails ? ["Rails"] : [], ...pick([[/gem ['"]sinatra['"]/, "Sinatra"], [/gem ['"]hanami['"]/, "Hanami"]], gemfile)],
        commands: { lint: mentions(gemfile, "rubocop") ? "bundle exec rubocop" : null, typecheck: mentions(gemfile, "sorbet") ? "bundle exec srb tc" : null, test, build: null }
      };
    }
  },
  {
    id: "php",
    markers: ["composer.json"],
    async inspect(ctx) {
      const composer = parseJson(await ctx.text("composer.json")) || {};
      const deps = { ...composer.require, ...composer["require-dev"] };
      const scripts = composer.scripts || {};
      const test = scripts.test ? "composer run-script test" : "pestphp/pest" in deps ? "vendor/bin/pest" : ctx.hasAny(["phpunit.xml", "phpunit.xml.dist"]) || "phpunit/phpunit" in deps ? "vendor/bin/phpunit" : null;
      const lint = scripts.lint ? "composer run-script lint" : "laravel/pint" in deps ? "vendor/bin/pint --test" : ctx.hasAny([".php-cs-fixer.php", ".php-cs-fixer.dist.php"]) ? "vendor/bin/php-cs-fixer fix --dry-run" : null;
      const typecheck = ctx.hasAny(["phpstan.neon", "phpstan.neon.dist"]) || "phpstan/phpstan" in deps ? "vendor/bin/phpstan analyse" : ctx.hasAny(["psalm.xml", "psalm.xml.dist"]) ? "vendor/bin/psalm" : null;
      return {
        name: composer.name,
        packageManager: "composer",
        languages: ["PHP"],
        frameworks: [["laravel/framework", "Laravel"], ["symfony/framework-bundle", "Symfony"], ["slim/slim", "Slim"]].filter(([dep]) => dep in deps).map(([, name2]) => name2),
        commands: { lint, typecheck, test, build: null }
      };
    }
  },
  {
    id: "elixir",
    markers: ["mix.exs"],
    async inspect(ctx) {
      const mix = await ctx.text("mix.exs");
      return {
        name: mix.match(/app:\s*:(\w+)/)?.[1],
        packageManager: "mix",
        languages: ["Elixir"],
        frameworks: pick([[":phoenix", "Phoenix"], [":nerves", "Nerves"]], mix),
        commands: { lint: mix.includes(":credo") ? "mix credo" : null, typecheck: mix.includes(":dialyxir") ? "mix dialyzer" : null, test: "mix test", build: "mix compile --warnings-as-errors" }
      };
    }
  },
  {
    id: "dart",
    markers: ["pubspec.yaml"],
    async inspect(ctx) {
      const pubspec = await ctx.text("pubspec.yaml");
      const flutter = /sdk:\s*flutter/.test(pubspec);
      const tool = flutter ? "flutter" : "dart";
      return {
        name: pubspec.match(/^name:\s*(\S+)/m)?.[1],
        packageManager: "pub",
        languages: ["Dart"],
        frameworks: flutter ? ["Flutter"] : [],
        commands: { lint: `${tool} analyze`, typecheck: null, test: `${tool} test`, build: null }
      };
    }
  },
  {
    id: "swift",
    markers: ["Package.swift"],
    async inspect() {
      return { name: void 0, packageManager: "swiftpm", languages: ["Swift"], frameworks: [], commands: { lint: null, typecheck: null, test: "swift test", build: "swift build" } };
    }
  },
  {
    // CMake projects need a configure step first, so only the language is reported;
    // declare commands in a Makefile, justfile or verification.commands instead.
    id: "cmake",
    markers: ["CMakeLists.txt"],
    async inspect() {
      return { name: void 0, packageManager: "cmake", languages: ["C/C++"], frameworks: [], commands: {} };
    }
  }
];
var RUNNER_TARGETS = { lint: ["lint"], typecheck: ["typecheck", "type-check", "types"], test: ["test"], build: ["build"] };
var RUNNER_RULES = [
  {
    id: "make",
    files: ["Makefile", "makefile", "GNUmakefile"],
    bin: "make",
    targets: (text) => [...text.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?![:=])/gm)].map((match) => match[1])
  },
  {
    id: "just",
    files: ["justfile", "Justfile", ".justfile"],
    bin: "just",
    targets: (text) => [...text.matchAll(/^@?([A-Za-z0-9_-]+)(?:\s+[^:=\n]*)?:(?!=)/gm)].map((match) => match[1])
  },
  {
    id: "task",
    files: ["Taskfile.yml", "Taskfile.yaml"],
    bin: "task",
    targets: (text) => [...(text.split(/^tasks:\s*$/m)[1] || "").matchAll(/^ {2}([A-Za-z0-9_:-]+):\s*$/gm)].map((match) => match[1])
  }
];
function matchesEcosystem(rule, ctx) {
  return ctx.hasAny(rule.markers) || (rule.patterns || []).some((pattern) => ctx.find(pattern).length > 0);
}
async function detectDirectory(dir, subdir = "") {
  const ctx = await directoryContext(dir);
  const ecosystems = [];
  for (const rule of ECOSYSTEM_RULES) {
    if (!matchesEcosystem(rule, ctx)) continue;
    const details = await rule.inspect(ctx);
    const manifests = [...rule.markers.filter((name2) => ctx.has(name2)), ...(rule.patterns || []).flatMap((pattern) => ctx.find(pattern))];
    ecosystems.push({ id: rule.id, manifests, ...details });
  }
  const runners = [];
  for (const rule of RUNNER_RULES) {
    const file = rule.files.find((name2) => ctx.files.includes(name2));
    if (file) runners.push({ id: rule.id, file, bin: rule.bin, targets: [...new Set(rule.targets(await ctx.text(file)))] });
  }
  const commands2 = [];
  for (const kind of CHECK_KINDS) {
    const runner = runners.map((item) => ({ item, target: RUNNER_TARGETS[kind].find((target) => item.targets.includes(target)) })).find((match) => match.target);
    if (runner) {
      commands2.push({ name: kind, kind, command: `${runner.item.bin} ${runner.target}`, cwd: subdir, source: runner.item.id });
      continue;
    }
    for (const ecosystem of ecosystems) {
      const command = ecosystem.commands?.[kind];
      if (command) commands2.push({ name: kind, kind, command, cwd: subdir, source: ecosystem.id });
    }
  }
  return { ecosystems, runners, commands: commands2 };
}
var unique = (values) => [...new Set(values.filter(Boolean))];
async function detectStack(cwd, { maxSubprojects = 40 } = {}) {
  const root = await detectDirectory(cwd);
  const subprojects = [];
  const entries = (await readdir(cwd, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !IGNORED_DIRS.has(entry.name)).map((entry) => entry.name).sort().slice(0, maxSubprojects);
  for (const name2 of entries) {
    const detected = await detectDirectory(join2(cwd, name2), name2);
    if (detected.ecosystems.length || detected.runners.length) subprojects.push({ path: name2, ...detected });
  }
  const all2 = [root, ...subprojects];
  const ecosystems = all2.flatMap((item) => item.ecosystems);
  return {
    ecosystems: root.ecosystems,
    runners: root.runners,
    commands: root.commands,
    subprojects,
    languages: unique(ecosystems.flatMap((item) => item.languages || [])),
    frameworks: unique(ecosystems.flatMap((item) => item.frameworks || [])),
    packageManagers: unique(ecosystems.map((item) => item.packageManager)),
    name: root.ecosystems.map((item) => item.name).find(Boolean)
  };
}
function configuredCommand(entry) {
  if (typeof entry === "string") return { name: entry.split(/\s+/)[1] || entry, kind: "custom", command: entry, cwd: "", source: "config" };
  return { name: entry.name, kind: "custom", command: entry.command, cwd: entry.cwd || "", source: "config" };
}
function selectVerificationCommands(stack, config = {}) {
  const verification = config.verification || {};
  if (verification.commands?.length) return verification.commands.map(configuredCommand);
  const mode = verification.subprojects || "auto";
  let commands2 = mode === "never" ? stack.commands : mode === "always" || !stack.commands.length ? [...stack.commands, ...stack.subprojects.flatMap((item) => item.commands)] : stack.commands;
  if (verification.kinds?.length) commands2 = commands2.filter((item) => verification.kinds.includes(item.kind));
  const legacy = config.defaultVerification || [];
  if (legacy.length) {
    const filtered = commands2.filter((item) => legacy.some((name2) => item.kind === name2 || item.command.endsWith(name2)));
    if (filtered.length) commands2 = filtered;
  }
  return commands2;
}

// src/core/config.js
import { readFile as readFile3 } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join as join4 } from "path";
import { z } from "zod";

// src/runtime/hooks.js
import { join as join3 } from "path";

// src/runtime/process.js
import { spawn } from "child_process";
import { clearTimeout, setTimeout } from "timers";
function runProcess({ bin, args = [], cwd, input, env, timeoutMs = 0, signal, onLine = () => {
}, onStderr = () => {
} }) {
  return new Promise((resolve3) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(bin, args, { cwd, env: env || process.env, shell: false, stdio: [input === void 0 ? "ignore" : "pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve3({ code: null, signal: null, timedOut: false, aborted: false, error: error.message, stderr: "", durationMs: 0 });
      return;
    }
    let buffer = "", stderr = "", timedOut = false, aborted = false, settled = false;
    const kill = () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
        }, 3e3).unref();
      }
    };
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs) : null;
    const onAbort = () => {
      aborted = true;
      kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line) onLine(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-16e3);
      onStderr(chunk);
    });
    if (input !== void 0) {
      child.stdin.on("error", () => {
      });
      child.stdin.end(input);
    }
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (buffer.trim()) onLine(buffer.replace(/\r$/, ""));
      resolve3({ ...result, timedOut, aborted, stderr, durationMs: Date.now() - started });
    };
    child.on("error", (error) => finish({ code: null, signal: null, error: error.message }));
    child.on("close", (code, closeSignal) => finish({ code, signal: closeSignal }));
  });
}

// src/runtime/hooks.js
var HOOK_EVENTS = ["before-agent-run", "after-agent-run", "after-flow-run"];
var BLOCKING = /* @__PURE__ */ new Set(["before-agent-run"]);
async function runHooks(cwd, config, event, payload) {
  const hooks = (config.hooks || []).filter((hook) => hook.event === event);
  const blocking = BLOCKING.has(event), outcome = { allowed: true, appendPrompt: [], warnings: [], ran: [] };
  for (const hook of hooks) {
    let argv;
    try {
      argv = splitCommand(hook.run);
    } catch (error) {
      argv = null;
      outcome.warnings.push(`${hook.run}: ${error.message}`);
    }
    const result = argv ? await runProcess({ bin: argv[0], args: argv.slice(1), cwd: hook.cwd ? join3(cwd, hook.cwd) : cwd, input: JSON.stringify({ event, ...payload }), timeoutMs: hook.timeoutMs || 3e4, onLine: (line) => {
      outcome.stdout = `${outcome.stdout || ""}${line}
`;
    } }) : { code: null, error: "invalid command" };
    outcome.ran.push({ run: hook.run, code: result.code, timedOut: result.timedOut });
    const reason = (result.stderr || "").trim().split("\n").slice(-3).join(" ") || result.error || (result.timedOut ? "timed out" : `exited ${result.code}`);
    if (result.code === 0) {
      try {
        const data = JSON.parse(outcome.stdout || "{}");
        if (typeof data.appendPrompt === "string") outcome.appendPrompt.push(data.appendPrompt);
      } catch {
      }
      outcome.stdout = "";
      continue;
    }
    outcome.stdout = "";
    if (result.code === 2 || blocking) {
      outcome.allowed = false;
      outcome.reason = `hook "${hook.run}" ${result.code === 2 ? "denied" : "failed"}: ${reason}`;
      return outcome;
    }
    outcome.warnings.push(`hook "${hook.run}" failed: ${reason}`);
  }
  return outcome;
}

// src/runtime/policy.js
var PERMISSIONS = ["read-only", "edit", "full"];
var rank = (level) => PERMISSIONS.indexOf(level);
function matches(route, subtask) {
  const match = route.match || {};
  return Object.entries(match).every(([key, value]) => subtask?.[key] === value);
}
function resolveRun(config, { provider, model, permission, subtask } = {}, providers = []) {
  const runtime = config.runtime || {};
  const route = (runtime.routes || []).find((item) => matches(item, subtask));
  const chosen = provider || route?.provider || runtime.default?.provider;
  if (!chosen) throw new Error("no agent provider selected; pass --provider or set runtime.default.provider in .maverick/config.json");
  const definition = providers.find((item) => item.id === chosen);
  if (!definition) throw new Error(`unknown provider ${chosen}; available: ${providers.map((item) => item.id).join(", ")}`);
  const trusted = runtime.trusted || [];
  if (!trusted.includes(chosen)) throw new Error(`provider ${chosen} is not trusted in this repository; review it, then run maverick agent trust ${chosen}`);
  const ceiling = runtime.maxPermission || "edit";
  const requested = permission || route?.permission || runtime.defaultPermission || (rank(ceiling) < rank("edit") ? ceiling : "edit");
  if (!PERMISSIONS.includes(requested)) throw new Error(`permission must be one of ${PERMISSIONS.join(", ")}`);
  if (rank(requested) > rank(ceiling)) throw new Error(`permission ${requested} exceeds runtime.maxPermission (${ceiling}); raise it in .maverick/config.json only after review`);
  const support = definition.permissions?.[requested];
  if (support === false || typeof support === "string") throw new Error(`${definition.name} cannot run with ${requested} permission${typeof support === "string" ? `: ${support}` : ""}`);
  return {
    provider: definition,
    permission: requested,
    // A route's or default's model only applies when that entry also chose this provider.
    model: model || (route?.provider === chosen ? route.model : void 0) || (runtime.default?.provider === chosen ? runtime.default.model : void 0),
    route: provider ? "flag" : route ? `route ${JSON.stringify(route.match || {})}` : "default"
  };
}

// src/core/config.js
var defaultConfig = {
  version: 1,
  project: { name: "", language: "", framework: "" },
  workflow: { requirePlan: true, requireReview: true, requireTests: true, defaultPreset: "standard" },
  adapter: "generic",
  taskRoot: ".maverick/tasks",
  requiredTaskSections: ["Problem", "Goal", "Acceptance Criteria", "In Scope", "Out of Scope", "Verification"],
  requiredContextSections: ["Architecture Summary", "Relevant Paths", "Constraints", "Do Not Touch", "Commands"]
};
var projectPath = z.string().min(1).refine((value) => !isAbsolute(value) && !value.split(/[\\/]/).includes(".."), 'must be a project-relative path without ".."');
var verificationCommand = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), command: z.string().min(1), cwd: projectPath.optional() })
]);
var configSchema = z.looseObject({
  version: z.number().int().positive(),
  project: z.looseObject({ name: z.string(), language: z.string(), framework: z.string() }),
  workflow: z.looseObject({
    requirePlan: z.boolean(),
    requireReview: z.boolean(),
    requireTests: z.boolean(),
    defaultPreset: z.enum(PRESET_IDS),
    riskDocumentation: z.boolean().optional()
  }),
  adapter: z.string().min(1),
  taskRoot: projectPath,
  requiredTaskSections: z.array(z.string()),
  requiredContextSections: z.array(z.string()),
  defaultVerification: z.array(z.string()).optional(),
  maxChangedFilesGuideline: z.number().int().positive().optional(),
  verification: z.object({
    commands: z.array(verificationCommand).optional(),
    kinds: z.array(z.enum(CHECK_KINDS)).optional(),
    subprojects: z.enum(["auto", "always", "never"]).optional()
  }).optional(),
  capabilities: z.object({
    targets: z.array(z.string().min(1)).optional(),
    catalogs: z.array(z.string().min(1)).optional()
  }).optional(),
  // Agent runtime. This file is the trust boundary: flags can lower permissions, never raise them.
  runtime: z.object({
    trusted: z.array(z.string().min(1)).optional(),
    maxPermission: z.enum(PERMISSIONS).optional(),
    defaultPermission: z.enum(PERMISSIONS).optional(),
    default: z.object({ provider: z.string().min(1), model: z.string().optional() }).optional(),
    routes: z.array(z.object({
      match: z.object({ type: z.string().optional(), complexity: z.enum(["low", "medium", "high"]).optional() }),
      provider: z.string().min(1),
      model: z.string().optional(),
      permission: z.enum(PERMISSIONS).optional()
    })).optional(),
    timeoutMinutes: z.number().positive().max(24 * 60).optional(),
    bins: z.record(z.string(), z.string().min(1)).optional(),
    custom: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
      name: z.string().optional(),
      command: z.string().min(1),
      permissions: z.array(z.enum(PERMISSIONS)).optional()
    })).optional()
  }).optional(),
  hooks: z.array(z.object({ event: z.enum(HOOK_EVENTS), run: z.string().min(1), cwd: projectPath.optional(), timeoutMs: z.number().int().positive().optional(), description: z.string().optional() })).optional()
});
var isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function mergeConfig(...layers) {
  return layers.reduce((merged, layer) => {
    const next = { ...merged };
    for (const [key, value] of Object.entries(layer || {})) next[key] = isPlainObject(value) && isPlainObject(merged[key]) ? mergeConfig(merged[key], value) : value;
    return next;
  }, {});
}
function globalConfigPath() {
  return join4(process.env.MAVERICK_HOME || join4(homedir(), ".maverick"), "config.json");
}
async function readLayer(path) {
  try {
    return JSON.parse(await readFile3(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid JSON in ${path}: ${error.message}`);
  }
}
function formatIssues(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
async function resolveConfig(cwd) {
  const layers = [{ scope: "defaults", path: null, values: defaultConfig }];
  const global = globalConfigPath();
  if (await exists(global)) layers.push({ scope: "global", path: global, values: await readLayer(global) });
  const canonical = join4(cwd, ".maverick", "config.json"), legacy = join4(cwd, "maverick.config.json");
  const project = await exists(canonical) ? canonical : await exists(legacy) ? legacy : null;
  if (project) layers.push({ scope: "project", path: project, values: await readLayer(project) });
  const merged = mergeConfig(...layers.map((layer) => layer.values));
  const parsed = configSchema.safeParse(merged);
  const sources = layers.map(({ scope, path }) => ({ scope, path: path && (scope === "project" ? rel(cwd, path) : path) }));
  if (!parsed.success) {
    const where = sources.filter((source) => source.path).map((source) => source.path).join(", ") || "defaults";
    const error = new Error(`invalid configuration (${where}): ${formatIssues(parsed.error)}`);
    error.issues = parsed.error.issues;
    error.sources = sources;
    throw error;
  }
  return { config: parsed.data, sources };
}
async function loadConfig(cwd) {
  return (await resolveConfig(cwd)).config;
}

// src/core/tasks.js
import { readFile as readFile4 } from "fs/promises";
import { join as join5 } from "path";
function taskPath(cwd, config, slug) {
  requireSlug(slug);
  return join5(cwd, config.taskRoot, slug);
}
async function taskPreset(dir, config) {
  const meta = join5(dir, "TASK.json");
  if (await exists(meta)) return (await readJson(meta)).preset || config.workflow.defaultPreset;
  const file = join5(dir, "TASK.md");
  if (await exists(file)) {
    const match = (await readFile4(file, "utf8")).match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    const preset = match?.[1].match(/^preset:\s*([^\s#]+)\s*$/m)?.[1];
    if (preset) return preset;
  }
  return config.workflow.defaultPreset || "standard";
}
async function getTask(cwd, slug) {
  const config = await loadConfig(cwd), dir = taskPath(cwd, config, slug);
  if (!await exists(dir)) throw new Error(`task not found: ${rel(cwd, dir)}; run maverick task ${slug} first`);
  return { config, dir, preset: requirePreset(await taskPreset(dir, config)) };
}

// src/subtasks/graph.js
import { mkdir, readdir as readdir3, readFile as readFile6, writeFile } from "fs/promises";
import { join as join7 } from "path";
import { z as z3 } from "zod";

// src/capabilities/model.js
import { createHash } from "crypto";
import { readdir as readdir2, readFile as readFile5 } from "fs/promises";
import { basename, join as join6, relative as relative2, sep } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z as z2 } from "zod";
var ENTRY_FILES = { skill: "SKILL.md", agent: "AGENT.md", command: "COMMAND.md", mcp: "MCP.json" };
var KINDS = Object.keys(ENTRY_FILES);
var AGENT_TOOLS = ["read", "edit", "shell", "web"];
var name = z2.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "use a lowercase kebab-case name");
var version = z2.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, "use a semantic version such as 1.0.0");
var common = {
  name,
  version: version.default("1.0.0"),
  description: z2.string().min(10, "describe when an agent should use it (10+ characters)").max(1024),
  tags: z2.array(z2.string()).default([]),
  targets: z2.array(z2.string()).optional()
};
var serverSchema = z2.union([
  z2.object({ command: z2.string().min(1), args: z2.array(z2.string()).default([]), env: z2.record(z2.string(), z2.string()).default({}) }),
  z2.object({ url: z2.url(), type: z2.enum(["http", "sse"]).default("http"), headers: z2.record(z2.string(), z2.string()).default({}) })
]);
var SCHEMAS = {
  skill: z2.object({ ...common, "allowed-tools": z2.array(z2.string()).optional() }),
  // Portable permissions; each adapter maps them to its own tool names.
  agent: z2.object({ ...common, tools: z2.array(z2.enum(AGENT_TOOLS)).optional(), model: z2.string().optional() }),
  command: z2.object({ ...common, "argument-hint": z2.string().optional() }),
  mcp: z2.object({ ...common, server: serverSchema })
};
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: text };
  return { data: parseYaml(match[1]) || {}, body: text.slice(match[0].length) };
}
function renderFrontmatter(data, body) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== void 0 && value !== "" && !(Array.isArray(value) && !value.length)));
  return `---
${stringifyYaml(clean, { lineWidth: 0 }).trimEnd()}
---

${body.replace(/^\s+/, "")}`;
}
async function listFiles(dir, root = dir) {
  const files = [];
  for (const entry of (await readdir2(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const path = join6(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, root));
    else if (entry.isFile()) files.push(relative2(root, path).split(sep).join("/"));
  }
  return files;
}
function formatIssues2(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
async function loadCapability(dir, source = "local") {
  const entries = await readdir2(dir).catch(() => []);
  const kinds = KINDS.filter((kind2) => entries.includes(ENTRY_FILES[kind2]));
  if (kinds.length !== 1) throw new Error(`${dir}: expected exactly one of ${Object.values(ENTRY_FILES).join(", ")}`);
  const kind = kinds[0], entry = ENTRY_FILES[kind];
  const text = await readFile5(join6(dir, entry), "utf8");
  let data, body = "";
  if (kind === "mcp") {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${dir}/${entry}: invalid JSON (${error.message})`);
    }
  } else ({ data, body } = parseFrontmatter(text));
  const parsed = SCHEMAS[kind].safeParse(data);
  if (!parsed.success) throw new Error(`${dir}/${entry}: ${formatIssues2(parsed.error)}`);
  if (parsed.data.name !== basename(dir)) throw new Error(`${dir}/${entry}: name "${parsed.data.name}" must match its directory "${basename(dir)}"`);
  if (kind !== "mcp" && !body.trim()) throw new Error(`${dir}/${entry}: the body is empty; add the instructions the agent should follow`);
  const files = kind === "skill" ? await listFiles(dir) : [entry];
  const contents = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile5(join6(dir, file))])));
  const integrity = sha256(files.map((file) => `${file}\0${sha256(contents[file])}`).join("\n"));
  return { ref: `${kind}/${parsed.data.name}`, kind, ...parsed.data, body, dir, source, entry, files, contents, integrity };
}

// src/subtasks/graph.js
var STATUSES = ["pending", "in-progress", "blocked", "done"];
var COMPLEXITY = ["low", "medium", "high"];
var MANIFEST = "_tasks.md";
var nodeId = z3.string().regex(/^\d{2,3}$/, "use a two or three digit id such as 01");
var manifestSchema = z3.object({
  schema: z3.literal("maverick.subtasks/v1"),
  nodes: z3.array(z3.object({ id: nodeId, file: z3.string().regex(/^task_\d{2,3}\.md$/) })),
  edges: z3.array(z3.object({ from: nodeId, to: nodeId })).default([])
});
var itemSchema = z3.object({
  title: z3.string().min(1),
  status: z3.enum(STATUSES),
  type: z3.string().regex(/^[a-z0-9-]+$/).optional(),
  complexity: z3.enum(COMPLEXITY).optional()
});
var dirFor = (taskDir) => join7(taskDir, "subtasks");
function issues(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
function findCycle(ids, edges) {
  const next = new Map(ids.map((id2) => [id2, []]));
  for (const edge of edges) next.get(edge.from)?.push(edge.to);
  const state = /* @__PURE__ */ new Map(), stack = [];
  const visit = (id2) => {
    state.set(id2, "visiting");
    stack.push(id2);
    for (const to of next.get(id2) || []) {
      if (state.get(to) === "visiting") return [...stack.slice(stack.indexOf(to)), to];
      if (!state.has(to)) {
        const cycle = visit(to);
        if (cycle) return cycle;
      }
    }
    state.set(id2, "done");
    stack.pop();
    return null;
  };
  for (const id2 of ids) if (!state.has(id2)) {
    const cycle = visit(id2);
    if (cycle) return cycle;
  }
  return null;
}
function topologicalOrder(ids, edges) {
  const incoming = new Map(ids.map((id2) => [id2, 0]));
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  const ready = ids.filter((id2) => !incoming.get(id2)).sort(), order = [];
  while (ready.length) {
    const id2 = ready.shift();
    order.push(id2);
    for (const edge of edges.filter((item) => item.from === id2)) {
      incoming.set(edge.to, incoming.get(edge.to) - 1);
      if (!incoming.get(edge.to)) {
        ready.push(edge.to);
        ready.sort();
      }
    }
  }
  return order;
}
async function loadGraph(taskDir) {
  const dir = dirFor(taskDir), manifestPath = join7(dir, MANIFEST);
  if (!await exists(manifestPath)) return { exists: false, nodes: [], edges: [], items: [], problems: [] };
  const problems = [];
  const parsed = manifestSchema.safeParse(parseFrontmatter(await readFile6(manifestPath, "utf8")).data);
  if (!parsed.success) return { exists: true, nodes: [], edges: [], items: [], problems: [`${MANIFEST}: ${issues(parsed.error)}`] };
  const { nodes, edges } = parsed.data, ids = nodes.map((node) => node.id);
  for (const id2 of ids.filter((value, index) => ids.indexOf(value) !== index)) problems.push(`duplicate node ${id2}`);
  for (const edge of edges) {
    if (!ids.includes(edge.from) || !ids.includes(edge.to)) problems.push(`edge ${edge.from} \u2192 ${edge.to} references an unknown node`);
    if (edge.from === edge.to) problems.push(`node ${edge.from} depends on itself`);
  }
  const cycle = findCycle(ids, edges.filter((edge) => ids.includes(edge.from) && ids.includes(edge.to)));
  if (cycle) problems.push(`dependency cycle: ${cycle.join(" \u2192 ")}`);
  const items = [];
  for (const node of nodes) {
    const path = join7(dir, node.file);
    if (!await exists(path)) {
      problems.push(`${node.file} is listed in ${MANIFEST} but missing`);
      continue;
    }
    const { data, body } = parseFrontmatter(await readFile6(path, "utf8"));
    const item = itemSchema.safeParse(data);
    if (!item.success) {
      problems.push(`${node.file}: ${issues(item.error)}`);
      continue;
    }
    items.push({ id: node.id, file: node.file, ...item.data, body, dependsOn: edges.filter((edge) => edge.to === node.id).map((edge) => edge.from) });
  }
  const listed = new Set(nodes.map((node) => node.file));
  for (const file of (await readdir3(dir)).filter((name2) => /^task_\d{2,3}\.md$/.test(name2) && !listed.has(name2))) problems.push(`${file} is not listed in ${MANIFEST}`);
  const order = cycle ? ids : topologicalOrder(ids, edges);
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const done = new Set(items.filter((item) => item.status === "done").map((item) => item.id));
  for (const item of items) item.ready = item.status === "pending" && item.dependsOn.every((id2) => done.has(id2));
  return { exists: true, nodes, edges, items, problems };
}
async function writeManifest(taskDir, slug, nodes, edges, items) {
  const table = items.map((item) => `| ${item.id} | ${item.title.replaceAll("|", "\\|")} | ${item.status} | ${item.dependsOn.join(", ") || "\u2014"} |`).join("\n");
  await writeFile(join7(dirFor(taskDir), MANIFEST), renderFrontmatter({ schema: "maverick.subtasks/v1", nodes, edges }, `# Subtasks \u2014 ${slug}

The frontmatter is the source of truth for dependencies. Manage it with \`maverick subtask\`.

| ID | Title | Status | Depends on |
|---|---|---|---|
${table}
`));
}
async function addSubtask(taskDir, slug, { title, after = [], type, complexity }) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  const ids = graph.nodes.map((node) => node.id);
  const unknown = after.filter((id3) => !ids.includes(id3));
  if (unknown.length) throw new Error(`unknown dependency ${unknown.join(", ")}; existing subtasks: ${ids.join(", ") || "none"}`);
  if (complexity && !COMPLEXITY.includes(complexity)) throw new Error(`complexity must be one of ${COMPLEXITY.join(", ")}`);
  const id2 = String(Math.max(0, ...ids.map(Number)) + 1).padStart(2, "0"), file = `task_${id2}.md`;
  const nodes = [...graph.nodes, { id: id2, file }], edges = [...graph.edges, ...after.map((from) => ({ from, to: id2 }))];
  await mkdir(dirFor(taskDir), { recursive: true });
  await writeFile(join7(dirFor(taskDir), file), renderFrontmatter({ title, status: "pending", type, complexity }, `# ${title}

## Goal
FILL ME

## Acceptance Criteria
- FILL ME

## Notes
`));
  await writeManifest(taskDir, slug, nodes, edges, [...graph.items, { id: id2, title, status: "pending", dependsOn: after }]);
  return { id: id2, file };
}
async function setStatus(taskDir, slug, id2, status2) {
  if (!STATUSES.includes(status2)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  const item = graph.items.find((entry) => entry.id === id2);
  if (!item) throw new Error(`subtask not found: ${id2}; existing: ${graph.items.map((entry) => entry.id).join(", ") || "none"}`);
  const blockedBy = item.dependsOn.filter((dep) => graph.items.find((entry) => entry.id === dep)?.status !== "done");
  if (["in-progress", "done"].includes(status2) && blockedBy.length) throw new Error(`subtask ${id2} depends on unfinished ${blockedBy.join(", ")}`);
  const path = join7(dirFor(taskDir), item.file), { data, body } = parseFrontmatter(await readFile6(path, "utf8"));
  await writeFile(path, renderFrontmatter({ ...data, status: status2 }, body));
  item.status = status2;
  await writeManifest(taskDir, slug, graph.nodes, graph.edges, graph.items);
  return item;
}

// src/capabilities/catalog.js
import { readdir as readdir4 } from "fs/promises";
import { join as join8, resolve as resolve2 } from "path";
var entryNames = new Set(Object.values(ENTRY_FILES));
async function capabilityDirs(root, depth = 0) {
  const entries = await readdir4(root, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isFile() && entryNames.has(entry.name))) return [root];
  if (depth >= 4) return [];
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules").map((entry) => capabilityDirs(join8(root, entry.name), depth + 1)));
  return nested.flat();
}
function catalogRoots(cwd, config = {}) {
  return [
    { source: "project", path: join8(cwd, ".maverick", "capabilities") },
    ...(config.capabilities?.catalogs || []).map((path) => ({ source: `catalog:${path}`, path: resolve2(cwd, path) })),
    { source: "built-in", path: join8(packageRoot, "capabilities") }
  ];
}
async function loadCatalog(cwd, config = {}) {
  const capabilities = /* @__PURE__ */ new Map(), shadowed = [], errors = [];
  for (const root of catalogRoots(cwd, config)) {
    for (const dir of await capabilityDirs(root.path)) {
      try {
        const capability = await loadCapability(dir, root.source);
        if (capabilities.has(capability.ref)) shadowed.push({ ref: capability.ref, source: root.source, by: capabilities.get(capability.ref).source });
        else capabilities.set(capability.ref, capability);
      } catch (error) {
        errors.push({ path: rel(cwd, dir), source: root.source, message: error.message.replace(`${dir}/`, "").replace(`${dir}: `, "") });
      }
    }
  }
  return { capabilities: [...capabilities.values()].sort((a, b) => a.ref.localeCompare(b.ref)), shadowed, errors };
}
function findCapability(catalog, reference) {
  if (!reference || reference === true) throw new Error("name a capability, for example: maverick add agent/reviewer");
  const exact = catalog.capabilities.find((item) => item.ref === reference);
  if (exact) return exact;
  const byName2 = catalog.capabilities.filter((item) => item.name === reference);
  if (byName2.length === 1) return byName2[0];
  if (byName2.length > 1) throw new Error(`"${reference}" is ambiguous; use one of: ${byName2.map((item) => item.ref).join(", ")}`);
  const similar = catalog.capabilities.filter((item) => item.name.includes(reference) || reference.includes(item.name)).map((item) => item.ref);
  throw new Error(`capability not found: ${reference}${similar.length ? `; did you mean ${similar.slice(0, 5).join(", ")}?` : "; run maverick catalog to list available capabilities"}`);
}
function searchCatalog(catalog, query = "") {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.capabilities.filter((item) => terms.every((term) => `${item.ref} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(term)));
}

// src/core/project-tools.js
import { mkdir as mkdir2, readdir as readdir5, readFile as readFile7, writeFile as writeFile2 } from "fs/promises";
import { join as join9, relative as relative3 } from "path";
import { spawn as spawn2 } from "child_process";
var INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursorrules", ".cursor/rules", ".windsurfrules", "CONVENTIONS.md", "CONTRIBUTING.md"];
async function inspectProject(cwd) {
  const stack = await detectStack(cwd);
  const entries = await readdir5(cwd, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).filter((name2) => !IGNORED_DIRS.has(name2)).sort();
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const manifests = [...new Set(stack.ecosystems.flatMap((item) => item.manifests))];
  const instructions = (await Promise.all(INSTRUCTION_FILES.map(async (name2) => await exists(join9(cwd, name2)) ? name2 : null))).filter(Boolean);
  const scripts = stack.ecosystems.find((item) => item.id === "node")?.scripts || {};
  return {
    name: stack.name || cwd.split(/[\\/]/).filter(Boolean).pop(),
    manifests,
    directories,
    files: files.slice(0, 40),
    scripts,
    commands: stack.commands,
    instructions,
    language: stack.languages.join(", ") || "unknown",
    languages: stack.languages,
    framework: stack.frameworks.join(", ") || void 0,
    frameworks: stack.frameworks,
    packageManagers: stack.packageManagers,
    stack
  };
}
function commandLine(item) {
  return `- ${item.name}: \`${item.command}\`${item.cwd ? ` (in \`${item.cwd}/\`)` : ""} \u2014 ${item.source}`;
}
function renderProjectMap(map) {
  const stack = map.stack || { ecosystems: [], runners: [], subprojects: [] };
  const commands2 = map.commands.length ? map.commands.map(commandLine).join("\n") : "- No verification commands detected. Declare them in `.maverick/config.json` under `verification.commands`.";
  const ecosystems = stack.ecosystems.map((item) => `- ${item.id} (${item.packageManager}): ${item.manifests.join(", ")}`).join("\n") || "- none detected at the root";
  const runners = stack.runners.map((item) => `- ${item.id}: \`${item.file}\` (${item.targets.slice(0, 12).join(", ") || "no targets"})`).join("\n");
  const subprojects = stack.subprojects.map((item) => `- \`${item.path}/\`: ${item.ecosystems.map((e) => e.id).concat(item.runners.map((r) => r.id)).join(", ")}${item.commands.length ? ` \u2014 ${item.commands.map((c) => c.command).join("; ")}` : ""}`).join("\n");
  return `# Project Map

Generated by Maverick. Refresh with \`maverick map\`.

## Stack
- Project: ${map.name}
- Languages: ${map.language}
- Frameworks: ${map.framework || "not detected"}
- Package managers: ${map.packageManagers?.join(", ") || "not detected"}
- Manifests: ${map.manifests.join(", ") || "none detected"}

## Ecosystems
${ecosystems}
${runners ? `
## Task runners
${runners}
` : ""}${subprojects ? `
## Subprojects
${subprojects}
` : ""}
## Top-level areas
${map.directories.map((name2) => `- \`${name2}/\``).join("\n") || "- none"}

## Verification commands
${commands2}

## Repository instructions
${map.instructions.map((name2) => `- \`${name2}\``).join("\n") || "- none detected"}

## Context guidance
Read the nearest instruction file and only the paths relevant to the task before editing.
`;
}
async function executeCommand(cwd, command, subdir = "") {
  let bin, args;
  try {
    [bin, ...args] = splitCommand(command);
  } catch (error) {
    return { command, cwd: subdir, ok: false, code: null, output: error.message };
  }
  const label = subdir ? `${command} (in ${subdir}/)` : command;
  return new Promise((resolve3) => {
    const child = spawn2(bin, args, { cwd: subdir ? join9(cwd, subdir) : cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output2 = "";
    child.stdout.on("data", (chunk) => {
      output2 += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output2 += chunk;
    });
    child.on("error", (error) => resolve3({ command: label, ok: false, code: null, output: error.message }));
    child.on("close", (code) => resolve3({ command: label, ok: code === 0, code, output: output2.slice(-12e3) }));
  });
}
async function gitDiff(cwd, against = "HEAD") {
  const result = await executeCommand(cwd, `git diff ${against} --`);
  return result.ok ? result.output : "";
}
async function writeEvidence(dir, task, results) {
  await mkdir2(dir, { recursive: true });
  const body = `# Verification Evidence \u2014 ${task}

Generated: ${(/* @__PURE__ */ new Date()).toISOString()}

${results.map((result) => `## ${result.ok ? "PASS" : "FAIL"} \u2014 ${result.command}
Exit code: ${result.code ?? "not started"}

\`\`\`text
${result.output || "(no output)"}
\`\`\``).join("\n\n")}
`;
  const path = join9(dir, "EVIDENCE.md");
  await writeFile2(path, body);
  return path;
}
async function findReferences(cwd, target, maxResults = 40) {
  const needle = target.split("/").pop().replace(/\.[^.]+$/, "");
  const results = [];
  async function visit(directory) {
    if (results.length >= maxResults) return;
    for (const entry of await readdir5(directory, { withFileTypes: true })) {
      if (results.length >= maxResults || IGNORED_DIRS.has(entry.name)) continue;
      const path = join9(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        try {
          const text = await readFile7(path, "utf8");
          if (text.includes(needle)) results.push(relative3(cwd, path));
        } catch {
        }
      }
    }
  }
  await visit(cwd);
  return results;
}

// src/intel/graph.js
import { readdir as readdir6, readFile as readFile8, stat } from "fs/promises";
import { dirname as dirname2, join as join10, normalize, relative as relative4, sep as sep2 } from "path";

// src/core/imports.js
var all = (text, pattern, group = 1) => [...text.matchAll(pattern)].map((match) => match[group]).filter(Boolean);
var SOURCE_LANGUAGES = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".cs": "C#",
  ".fs": "F#",
  ".rb": "Ruby",
  ".php": "PHP",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".dart": "Dart",
  ".swift": "Swift",
  ".c": "C/C++",
  ".h": "C/C++",
  ".cpp": "C/C++",
  ".hpp": "C/C++",
  ".cc": "C/C++"
};
var EXTRACTORS = {
  JavaScript: (text) => all(text, /(?:from\s*|import\s*\(\s*|require\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm),
  // `from pkg import name` may import a submodule, so `pkg.name` is emitted too; the
  // resolver keeps it only when such a file exists.
  Python: (text) => [...text.matchAll(/^[ \t]*(?:from[ \t]+([.\w]+)[ \t]+import[ \t]+(?:\(([^)]*)\)|([\w \t,]+))|import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*))/gm)].flatMap((match) => match[1] ? [match[1], ...(match[2] ?? match[3]).split(",").map((name2) => name2.trim().split(/\s+as\s+/)[0].trim()).filter((name2) => /^\w+$/.test(name2)).map((name2) => `${match[1]}${/\.$/.test(match[1]) ? "" : "."}${name2}`)] : match[4].split(",").map((name2) => name2.trim())),
  Go: (text) => [
    ...all(text, /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm),
    ...[...text.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)].flatMap((block) => all(block[1], /"([^"]+)"/g))
  ],
  Rust: (text) => [...all(text, /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/gm), ...all(text, /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm).map((name2) => `mod:${name2}`)],
  Java: (text) => all(text, /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;?/gm),
  "C#": (text) => all(text, /^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/gm),
  "F#": (text) => all(text, /^\s*open\s+([\w.]+)/gm),
  Ruby: (text) => [...text.matchAll(/^\s*(require_relative|require)\s*\(?\s*['"]([^'"]+)['"]/gm)].map((match) => match[1] === "require_relative" && !match[2].startsWith(".") ? `./${match[2]}` : match[2]),
  PHP: (text) => [...all(text, /^\s*use\s+([\w\\]+)/gm), ...all(text, /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g)],
  Elixir: (text) => all(text, /^\s*(?:alias|import|use|require)\s+([\w.]+)/gm),
  Dart: (text) => all(text, /^\s*(?:import|export)\s+['"]([^'"]+)['"]/gm),
  Swift: (text) => all(text, /^\s*import\s+(?:class\s+|struct\s+|enum\s+|func\s+)?([\w.]+)/gm),
  "C/C++": (text) => all(text, /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)
};
EXTRACTORS.TypeScript = EXTRACTORS.JavaScript;
EXTRACTORS.Kotlin = EXTRACTORS.Java;
function languageForPath(path) {
  const extension = path.match(/\.[^./\\]+$/)?.[0]?.toLowerCase();
  return extension ? SOURCE_LANGUAGES[extension] : void 0;
}
function extractImports(language, text) {
  const extractor = EXTRACTORS[language];
  return extractor ? [...new Set(extractor(text))] : [];
}

// src/intel/graph.js
var MAX_FILES = 5e3;
var MAX_BYTES = 512 * 1024;
var posix = (path) => path.split(sep2).join("/");
var TEST = /(^|\/)(__tests__|tests?|spec)\/|[._-](test|spec)\.[^/]+$|_test\.go$|Tests?\.(java|kt|cs)$/i;
async function sourceFiles(root) {
  const files = [];
  async function visit(dir, depth) {
    if (depth > 12 || files.length >= MAX_FILES) return;
    for (const entry of (await readdir6(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const path = join10(dir, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && languageForPath(entry.name)) files.push(posix(relative4(root, path)));
    }
  }
  await visit(root, 0);
  return files;
}
var JS_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"];
var RESOLVERS = {
  JavaScript(spec, from, ctx) {
    if (!spec.startsWith(".")) return [];
    const base2 = posix(normalize(join10(dirname2(from), spec)));
    const stem = base2.replace(/\.(m|c)?js$/, "");
    return first(ctx, [...JS_EXTENSIONS.map((ext) => base2 + ext), ...JS_EXTENSIONS.map((ext) => stem + ext)]);
  },
  Python(spec, from, ctx) {
    const dots = spec.match(/^\.*/)[0].length, rest = spec.slice(dots).replaceAll(".", "/");
    const bases = dots ? [posix(normalize(join10(dirname2(from), ...Array(dots - 1).fill(".."), rest)))] : [rest, ...ctx.pythonRoots.map((root) => `${root}/${rest}`)];
    return first(ctx, bases.flatMap((base2) => [`${base2}.py`, `${base2}/__init__.py`]));
  },
  Go(spec, from, ctx) {
    if (!ctx.goModulePath || !(spec === ctx.goModulePath || spec.startsWith(`${ctx.goModulePath}/`))) return [];
    const dir = spec.slice(ctx.goModulePath.length).replace(/^\//, "");
    return ctx.files.filter((file) => file.endsWith(".go") && !file.endsWith("_test.go") && posix(dirname2(file)) === (dir || "."));
  },
  Rust(spec, from, ctx) {
    if (spec.startsWith("mod:")) {
      const name2 = spec.slice(4), dir = posix(dirname2(from)), own = from.replace(/(mod|lib|main)\.rs$/, "").replace(/\.rs$/, "/");
      return first(ctx, [`${own}${name2}.rs`, `${own}${name2}/mod.rs`, `${dir}/${name2}.rs`, `${dir}/${name2}/mod.rs`].map((path) => path.replace(/^\.\//, "")));
    }
    const parts = spec.split("::");
    if (parts[0] !== "crate") return [];
    const crateRoot = ctx.files.find((file) => /(^|\/)src\/(lib|main)\.rs$/.test(file))?.replace(/(lib|main)\.rs$/, "") || "src/";
    for (let size = parts.length - 1; size >= 1; size--) {
      const path = parts.slice(1, size + 1).join("/");
      const found = first(ctx, [`${crateRoot}${path}.rs`, `${crateRoot}${path}/mod.rs`]);
      if (found.length) return found;
    }
    return [];
  },
  Java(spec, from, ctx) {
    const path = spec.replace(/\.\*$/, "").replaceAll(".", "/");
    return ctx.files.filter((file) => /\.(java|kt)$/.test(file) && (file.endsWith(`/${path}.java`) || file.endsWith(`/${path}.kt`)));
  },
  Ruby(spec, from, ctx) {
    return spec.startsWith(".") ? first(ctx, [posix(normalize(join10(dirname2(from), spec))) + (spec.endsWith(".rb") ? "" : ".rb")]) : first(ctx, [`lib/${spec}.rb`]);
  },
  PHP(spec, from, ctx) {
    return /\.php$/.test(spec) ? first(ctx, [posix(normalize(join10(dirname2(from), spec)))]) : [];
  },
  Dart(spec, from, ctx) {
    if (spec.startsWith("package:")) {
      const [pkg, ...path] = spec.slice(8).split("/");
      return pkg === ctx.dartPackage ? first(ctx, [`lib/${path.join("/")}`]) : [];
    }
    return spec.includes(":") ? [] : first(ctx, [posix(normalize(join10(dirname2(from), spec)))]);
  },
  "C/C++"(spec, from, ctx) {
    return first(ctx, [posix(normalize(join10(dirname2(from), spec))), spec]);
  }
};
RESOLVERS.TypeScript = RESOLVERS.JavaScript;
RESOLVERS.Kotlin = RESOLVERS.Java;
function first(ctx, candidates) {
  const hit = candidates.find((candidate) => ctx.fileSet.has(candidate));
  return hit ? [hit] : [];
}
async function projectContext(root, files) {
  const read = async (path) => readFile8(join10(root, path), "utf8").catch(() => "");
  const goModulePath = (await read("go.mod")).match(/^module\s+(\S+)/m)?.[1];
  const dartPackage = (await read("pubspec.yaml")).match(/^name:\s*(\S+)/m)?.[1];
  const pythonRoots = ["src", "lib", "app"].filter((dir) => files.some((file) => file.startsWith(`${dir}/`) && file.endsWith(".py")));
  return { files, fileSet: new Set(files), goModulePath, dartPackage, pythonRoots };
}
function stronglyConnected(nodes, adjacency) {
  let index = 0;
  const stack = [], onStack = /* @__PURE__ */ new Set(), indices = /* @__PURE__ */ new Map(), low = /* @__PURE__ */ new Map(), components = [];
  const connect = (node) => {
    indices.set(node, index);
    low.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) || []) {
      if (!indices.has(next)) {
        connect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) low.set(node, Math.min(low.get(node), indices.get(next)));
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || (adjacency.get(node) || []).includes(node)) components.push(component.sort());
    }
  };
  for (const node of nodes) if (!indices.has(node)) connect(node);
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
async function buildGraph(root) {
  const files = await sourceFiles(root), ctx = await projectContext(root, files);
  const nodes = [], edges = [];
  for (const file of files) {
    const info2 = await stat(join10(root, file)).catch(() => null);
    if (!info2 || info2.size > MAX_BYTES) continue;
    const language = languageForPath(file), text = await readFile8(join10(root, file), "utf8").catch(() => "");
    const imports = extractImports(language, text), targets = /* @__PURE__ */ new Map();
    const lazy = /Script$/.test(language) ? new Set([...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1])) : /* @__PURE__ */ new Set();
    for (const spec of imports) {
      for (const target of RESOLVERS[language]?.(spec, file, ctx) || []) {
        if (target === file && !spec.startsWith("mod:")) continue;
        targets.set(target, (targets.get(target) ?? true) && lazy.has(spec));
      }
    }
    nodes.push({ id: file, language, test: TEST.test(file), lines: text ? text.split("\n").length : 0, imports: imports.length });
    for (const [target, dynamic] of targets) edges.push({ from: file, to: target, ...dynamic && { dynamic: true } });
  }
  return withMetrics(nodes, edges, { truncated: files.length >= MAX_FILES });
}
function withMetrics(nodes, edges, extra = {}) {
  const out = new Map(nodes.map((node) => [node.id, []])), incoming = new Map(nodes.map((node) => [node.id, []]));
  const staticOut = new Map(nodes.map((node) => [node.id, []])), staticIn = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    out.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
    if (!edge.dynamic) {
      staticOut.get(edge.from)?.push(edge.to);
      staticIn.get(edge.to)?.push(edge.from);
    }
  }
  for (const node of nodes) {
    node.fanOut = staticOut.get(node.id).length;
    node.fanIn = staticIn.get(node.id).length;
    node.instability = node.fanIn + node.fanOut ? Number((node.fanOut / (node.fanIn + node.fanOut)).toFixed(2)) : 0;
  }
  const cycles = stronglyConnected(nodes.map((node) => node.id), staticOut);
  const inCycles = new Set(cycles.flat());
  const source = nodes.filter((node) => !node.test);
  const threshold = (values) => {
    const sorted = values.sort((a, b) => a - b);
    return Math.max(5, sorted[Math.floor(sorted.length * 0.9)] || 0);
  };
  const fanInLimit = threshold(source.map((node) => node.fanIn)), fanOutLimit = threshold(source.map((node) => node.fanOut));
  const hubs = source.filter((node) => node.fanIn >= fanInLimit && node.fanOut >= fanOutLimit).map((node) => node.id);
  const total = source.length || 1;
  const cycleShare = source.filter((node) => inCycles.has(node.id)).length / total, hubShare = hubs.length / total;
  const health = { score: Math.max(0, Math.round(100 * (1 - 0.7 * cycleShare - 0.3 * hubShare))), formula: "100 \xD7 (1 \u2212 0.7 \xD7 share of files in import cycles \u2212 0.3 \xD7 share of hub files)", cycleShare: Number(cycleShare.toFixed(3)), hubShare: Number(hubShare.toFixed(3)) };
  return { nodes, edges, cycles, hubs, health, out, incoming, ...extra };
}
function impactOf(graph, target, maxDepth = 10) {
  const seen = /* @__PURE__ */ new Map([[target, 0]]), queue = [target];
  while (queue.length) {
    const current = queue.shift(), depth = seen.get(current);
    if (depth >= maxDepth) continue;
    for (const parent of graph.incoming.get(current) || []) if (!seen.has(parent)) {
      seen.set(parent, depth + 1);
      queue.push(parent);
    }
  }
  seen.delete(target);
  const testIds = new Set(graph.nodes.filter((node) => node.test).map((node) => node.id));
  const dependents = [...seen].map(([id2, depth]) => ({ id: id2, depth, test: testIds.has(id2) })).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  return { target, known: graph.out.has(target), direct: dependents.filter((item) => item.depth === 1).map((item) => item.id), dependents, tests: dependents.filter((item) => item.test).map((item) => item.id) };
}
function directoryGraph(graph, depth = 2) {
  const group = (id2) => {
    const parts = id2.split("/");
    return parts.length > 1 ? parts.slice(0, Math.min(depth, parts.length - 1)).join("/") : "(root)";
  };
  const weights = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    const from = group(edge.from), to = group(edge.to);
    if (from !== to) weights.set(`${from}\0${to}`, (weights.get(`${from}\0${to}`) || 0) + 1);
  }
  return [...weights].map(([key, weight]) => {
    const [from, to] = key.split("\0");
    return { from, to, weight };
  }).sort((a, b) => b.weight - a.weight);
}
function toMermaid(graph, depth = 2, limit = 60) {
  const links = directoryGraph(graph, depth).slice(0, limit), ids = /* @__PURE__ */ new Map();
  const id2 = (name2) => {
    if (!ids.has(name2)) ids.set(name2, `n${ids.size}`);
    return ids.get(name2);
  };
  const lines = links.map((link) => `  ${id2(link.from)}["${link.from}"] -->|${link.weight}| ${id2(link.to)}["${link.to}"]`);
  return `graph LR
${lines.join("\n") || '  empty["no local imports"]'}`;
}

// src/core/preset-suggestion.js
function recommendPreset({ risk, type, complexity, openQuestions = 0, estimatedFiles } = {}) {
  if (risk === "high") return { preset: "strict-review", reason: "High-risk changes need explicit verification, security review, and rollback evidence." };
  if (type === "migration" || type === "security") return { preset: "strict-review", reason: `${type === "migration" ? "Migrations" : "Security-sensitive changes"} need rollback and extra verification.` };
  if (complexity === "high" && Number(openQuestions) > 0) return { preset: "spec-driven", reason: "High complexity with open questions benefits from a shared specification." };
  if (risk === "low" && Number(estimatedFiles) <= 2) return { preset: "lightweight", reason: "Low risk and a small file footprint support a lightweight workflow." };
  return { preset: "standard", reason: "Standard is the default workflow for routine engineering changes." };
}

// src/intel/hotspots.js
import { execFile } from "child_process";
import { promisify } from "util";
var exec = promisify(execFile);
async function churn(cwd, since2 = "6 months ago") {
  try {
    const { stdout } = await exec("git", ["log", `--since=${since2}`, "--no-merges", "--name-only", "--format=%x00"], { cwd, maxBuffer: 64 * 1024 * 1024 });
    const counts = /* @__PURE__ */ new Map();
    for (const commit of stdout.split("\0")) for (const file of new Set(commit.split("\n").map((line) => line.trim()).filter(Boolean))) counts.set(file, (counts.get(file) || 0) + 1);
    return counts;
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function rankHotspots(graph, counts, limit = 15) {
  return graph.nodes.filter((node) => !node.test && counts.get(node.id)).map((node) => {
    const commits = counts.get(node.id);
    return { id: node.id, commits, fanIn: node.fanIn, lines: node.lines, score: Math.round(commits * (1 + node.fanIn) * Math.log10(10 + node.lines)) };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

// src/commands/agent.js
import { mkdir as mkdir4, readdir as readdir7, readFile as readFile10, writeFile as writeFile4 } from "fs/promises";
import { join as join13 } from "path";
import { createInterface } from "readline/promises";

// src/runtime/providers.js
var json = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};
var short = (value, size = 80) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > size ? `${text.slice(0, size - 1)}\u2026` : text;
};
var toolDetail = (input) => short(input?.file_path || input?.path || input?.command || input?.pattern || input?.url || input?.description || "");
var claude = {
  id: "claude-code",
  name: "Claude Code",
  bin: "claude",
  permissions: { "read-only": true, edit: true, full: true },
  invocation({ prompt, model, permission }) {
    const modes = {
      // --tools is a hard allow-list; dontAsk denies anything else instead of prompting.
      "read-only": ["--permission-mode", "dontAsk", "--tools", "Read,Grep,Glob"],
      edit: ["--permission-mode", "acceptEdits"],
      full: ["--permission-mode", "bypassPermissions"]
    };
    return { args: ["-p", "--output-format", "stream-json", "--verbose", ...model ? ["--model", model] : [], ...modes[permission]], input: prompt };
  },
  parse(line) {
    const event = json(line);
    if (!event) return [];
    if (event.type === "system" && event.subtype === "init") return [{ type: "session", id: event.session_id }];
    if (event.type === "assistant") return (event.message?.content || []).flatMap((part) => part.type === "text" ? [{ type: "text", text: part.text }] : part.type === "tool_use" ? [{ type: "tool", name: part.name, detail: toolDetail(part.input) }] : []);
    if (event.type === "result") {
      const denials = (event.permission_denials || []).map((denial) => ({ type: "error", message: `permission denied: ${denial.tool_name || short(denial)}` }));
      return [...denials, { type: "result", ok: !event.is_error && event.subtype === "success", text: event.result ?? "", cost: event.total_cost_usd, error: event.is_error ? event.result || event.subtype : void 0 }];
    }
    return [];
  }
};
var codex = {
  id: "codex",
  name: "OpenAI Codex",
  bin: "codex",
  permissions: { "read-only": true, edit: true, full: true },
  invocation({ prompt, model, permission }) {
    const sandbox = { "read-only": "read-only", edit: "workspace-write", full: "danger-full-access" }[permission];
    return { args: ["exec", "--json", "--sandbox", sandbox, ...model ? ["-m", model] : [], "-"], input: prompt };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.type === "thread.started") return [{ type: "session", id: event.thread_id }];
    if (event.type === "item.completed") {
      const item = event.item || {};
      if (item.type === "agent_message") {
        state.last = item.text;
        return [{ type: "text", text: item.text }];
      }
      if (item.type === "command_execution") return [{ type: "tool", name: "shell", detail: short(item.command) }];
      if (item.type === "file_change") return [{ type: "tool", name: "edit", detail: short((item.changes || []).map((change) => change.path).join(", ")) }];
      if (item.type === "mcp_tool_call") return [{ type: "tool", name: `${item.server}:${item.tool}` }];
      return [];
    }
    if (event.type === "turn.completed") return [{ type: "result", ok: true, text: state.last ?? "" }];
    if (event.type === "turn.failed") return [{ type: "result", ok: false, text: state.last ?? "", error: event.error?.message || "turn failed" }];
    if (event.type === "error") return [{ type: "error", message: event.message }];
    return [];
  }
};
var gemini = {
  id: "gemini",
  name: "Gemini CLI",
  bin: "gemini",
  permissions: { "read-only": true, edit: true, full: true },
  invocation({ prompt, model, permission }) {
    const approval = { "read-only": "plan", edit: "auto_edit", full: "yolo" }[permission];
    return { args: ["-o", "stream-json", "--approval-mode", approval, ...model ? ["-m", model] : [], "-p", prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.type === "init") return [{ type: "session", id: event.session_id }];
    if (event.type === "message" && event.role === "assistant") {
      state.text = `${state.text || ""}${event.content || ""}`;
      return event.delta ? [] : [{ type: "text", text: event.content || "" }];
    }
    if (event.type === "tool_use") return [{ type: "tool", name: event.tool_name, detail: toolDetail(event.parameters) }];
    if (event.type === "error") return [{ type: "error", message: event.message || short(event) }];
    if (event.type === "result") return [...state.text ? [{ type: "text", text: state.text }] : [], { type: "result", ok: event.status === "success", text: state.text || "", error: event.status === "success" ? void 0 : event.error?.message || event.status }];
    return [];
  }
};
var cursor = {
  // `agent` is the current binary; `cursor-agent` is the legacy name.
  id: "cursor",
  name: "Cursor CLI",
  bin: ["agent", "cursor-agent"],
  permissions: { "read-only": true, edit: "Cursor CLI applies edits only with --force, which also allows shell commands; use full or another provider", full: true },
  invocation({ prompt, model, permission }) {
    const mode = permission === "read-only" ? ["--mode", "ask"] : ["--force"];
    return { args: ["-p", "--output-format", "stream-json", "--trust", ...mode, ...model ? ["--model", model] : [], prompt] };
  },
  parse(line) {
    const event = json(line);
    if (!event) return [];
    if (event.type === "system" && event.subtype === "init") return [{ type: "session", id: event.session_id }];
    if (event.type === "assistant") return (event.message?.content || []).filter((part) => part.type === "text").map((part) => ({ type: "text", text: part.text }));
    if (event.type === "tool_call" && event.subtype === "started") {
      const [name2, call] = Object.entries(event.tool_call || {})[0] || [];
      return name2 ? [{ type: "tool", name: name2.replace(/ToolCall$/, ""), detail: toolDetail(call?.args) }] : [];
    }
    if (event.type === "result") return [{ type: "result", ok: !event.is_error, text: event.result ?? "", error: event.is_error ? event.result : void 0 }];
    return [];
  }
};
function customProvider(definition) {
  const template = splitCommand(definition.command);
  const allowed = definition.permissions || ["edit"];
  return {
    id: definition.id,
    name: definition.name || definition.id,
    bin: template[0],
    custom: true,
    permissions: Object.fromEntries(["read-only", "edit", "full"].map((level) => [level, allowed.includes(level) || `not enabled for ${definition.id} in runtime.custom`])),
    invocation({ prompt, model }) {
      const usesPrompt = template.some((part) => part.includes("{prompt}"));
      const args = [];
      for (const part of template.slice(1)) {
        if (part.includes("{model}") && !model) {
          if (args.at(-1)?.startsWith("-") && part === "{model}") args.pop();
          continue;
        }
        args.push(part.replaceAll("{prompt}", prompt).replaceAll("{model}", model || ""));
      }
      return { args, input: usesPrompt ? void 0 : prompt };
    },
    parse(line, state) {
      state.lines = [...state.lines || [], line];
      return [{ type: "text", text: line }];
    },
    finish(state) {
      return [{ type: "result", ok: true, text: (state.lines || []).join("\n") }];
    }
  };
}
var BUILTIN_PROVIDERS = [claude, codex, cursor, gemini];
function resolveBin(provider, config, cwd) {
  const configured = config.runtime?.bins?.[provider.id];
  if (configured) return configured;
  const candidates = [provider.bin].flat();
  return candidates.find((bin) => commandAvailable(bin, cwd)) || candidates[0];
}
function providersFor(config = {}) {
  const custom = (config.runtime?.custom || []).map(customProvider);
  return [...BUILTIN_PROVIDERS.filter((provider) => !custom.some((item) => item.id === provider.id)), ...custom];
}

// src/runtime/prompt.js
import { readFile as readFile9 } from "fs/promises";
import { join as join11 } from "path";
import { z as z4 } from "zod";
var HEADLESS_RULES = `You are running non-interactively under Maverick. Follow these rules:
- Work only inside this repository and only within the task scope below. TASK.md is the scope contract.
- Do not commit, push, open pull requests, publish packages, or change CI/CD, credentials, or secrets. A human does that after review.
- Do not add dependencies or change public contracts unless the task explicitly allows it.
- If you are blocked or need a decision, stop and ask in the result block instead of guessing.
- Run the relevant verification commands before finishing and report their real results.
- End your final message with exactly one fenced block in this format:

\`\`\`maverick-result
{"status": "done" | "blocked" | "needs-input", "summary": "one or two sentences", "questions": [], "filesChanged": []}
\`\`\``;
var resultSchema = z4.object({
  status: z4.enum(["done", "blocked", "needs-input"]),
  summary: z4.string().default(""),
  questions: z4.array(z4.string()).default([]),
  filesChanged: z4.array(z4.string()).default([])
});
function parseResultBlock(text = "") {
  const blocks = [...text.matchAll(/```maverick-result\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  try {
    const parsed = resultSchema.safeParse(JSON.parse(blocks.at(-1)[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
var TASK_FILES = ["SPEC.md", "TASK.md", "CONTEXT.md", "PLAN.md"];
async function buildPrompt({ taskDir, task, subtask, instruction, issues: issues2 = [] }) {
  const sections = [HEADLESS_RULES, `# Task: ${task}`];
  for (const file of TASK_FILES) {
    const path = join11(taskDir, file);
    if (await exists(path)) sections.push(`## ${file}

${(await readFile9(path, "utf8")).trim()}`);
  }
  if (subtask) sections.push(`## Current subtask ${subtask.id}: ${subtask.title}

Work only on this subtask. Its dependencies (${subtask.dependsOn.join(", ") || "none"}) are done.

${subtask.body.trim()}`);
  if (issues2.length) sections.push(`## Blocking issues to fix

The last verification run failed. Fix these without widening scope, then re-run the checks:

${issues2.map((issue) => `- ${issue}`).join("\n")}`);
  sections.push(`## Instruction

${instruction || (subtask ? `Implement subtask ${subtask.id}.` : "Implement the task criterion by criterion.")}`);
  return sections.join("\n\n");
}

// src/runtime/session.js
import { appendFile, mkdir as mkdir3, writeFile as writeFile3 } from "fs/promises";
import { join as join12 } from "path";
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}
async function transcriptFile(taskDir, providerId) {
  const dir = join12(taskDir, "runs");
  await mkdir3(dir, { recursive: true });
  if (!await exists(join12(dir, ".gitignore"))) await writeFile3(join12(dir, ".gitignore"), "# Agent transcripts may contain tool output and secrets.\n*\n!.gitignore\n");
  return join12(dir, `${stamp()}-${providerId}.jsonl`);
}
async function runAgent({ cwd, config, taskDir, task, provider, model, permission, prompt, timeoutMs, signal, onEvent = () => {
} }) {
  const bin = resolveBin(provider, config, cwd);
  if (!commandAvailable(bin, cwd)) throw new Error(`${provider.name} is not installed (${bin} not found on PATH)`);
  const before = await runHooks(cwd, config, "before-agent-run", { task, provider: provider.id, model, permission, prompt });
  if (!before.allowed) throw new Error(before.reason);
  const finalPrompt = [prompt, ...before.appendPrompt].join("\n\n");
  const { args, input } = provider.invocation({ prompt: finalPrompt, model, permission });
  const transcript = await transcriptFile(taskDir, provider.id);
  const events = [], state = {};
  let writing = Promise.resolve();
  const record = (event) => {
    events.push(event);
    onEvent(event);
    const line = `${JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), ...event })}
`;
    writing = writing.then(() => appendFile(transcript, line));
    return writing;
  };
  await record({ type: "start", provider: provider.id, model: model || null, permission, argv: [bin, ...args.map((arg) => arg === finalPrompt ? "<prompt>" : arg)] });
  const pending2 = [];
  const processResult = await runProcess({
    bin,
    args,
    cwd,
    input,
    signal,
    timeoutMs,
    onLine: (line) => {
      for (const event of provider.parse(line, state)) pending2.push(record(event));
    }
  });
  await Promise.all(pending2);
  for (const event of provider.finish?.(state) || []) await record(event);
  const resultEvent = events.findLast((event) => event.type === "result");
  const text = resultEvent?.text ?? events.filter((event) => event.type === "text").map((event) => event.text).join("\n");
  const problems = [
    processResult.error && `could not start ${bin}: ${processResult.error}`,
    processResult.timedOut && `timed out after ${Math.round(timeoutMs / 1e3)}s`,
    processResult.aborted && "aborted",
    processResult.code !== 0 && !processResult.timedOut && !processResult.aborted && !processResult.error && `${bin} exited ${processResult.code}${processResult.stderr.trim() ? `: ${processResult.stderr.trim().split("\n").slice(-2).join(" ")}` : ""}`,
    resultEvent?.ok === false && (resultEvent.error || "the agent reported an error")
  ].filter(Boolean);
  const summary = {
    ok: !problems.length,
    problems,
    exitCode: processResult.code,
    durationMs: processResult.durationMs,
    sessionId: events.find((event) => event.type === "session")?.id,
    cost: resultEvent?.cost,
    text,
    result: parseResultBlock(text),
    transcript,
    tools: events.filter((event) => event.type === "tool").length
  };
  await record({ type: "end", ok: summary.ok, problems, exitCode: summary.exitCode, durationMs: summary.durationMs, status: summary.result?.status || null });
  const after = await runHooks(cwd, config, "after-agent-run", { task, provider: provider.id, ok: summary.ok, status: summary.result?.status, summary: summary.result?.summary, transcript });
  summary.warnings = after.warnings;
  return summary;
}

// src/commands/agent.js
var str = (value) => typeof value === "string" ? value : void 0;
function printer(options) {
  if (options.json || options.quiet) return () => {
  };
  return (event) => {
    if (event.type === "start") output(`\u25B6 ${event.provider}${event.model ? ` (${event.model})` : ""} \xB7 permission ${event.permission}`);
    else if (event.type === "text" && event.text.trim()) output(event.text.trim());
    else if (event.type === "tool") output(`  \u2192 ${event.name}${event.detail ? ` ${event.detail}` : ""}`);
    else if (event.type === "error") output(`  ! ${event.message}`);
  };
}
async function selectSubtask(taskDir, reference) {
  if (!reference) return void 0;
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  const subtask = reference === "next" ? graph.items.find((item) => item.ready) : graph.items.find((item) => item.id === String(reference).padStart(2, "0"));
  if (!subtask) throw new Error(reference === "next" ? "no subtask is ready; run maverick subtask list" : `subtask not found: ${reference}`);
  if (subtask.status !== "in-progress" && !subtask.ready) throw new Error(`subtask ${subtask.id} is not ready (status ${subtask.status}, depends on ${subtask.dependsOn.join(", ") || "nothing"})`);
  return subtask;
}
async function startAgentRun(cwd, { slug, dir, config, subtask, instruction, issues: issues2, options, onEvent }) {
  const plan = resolveRun(config, { provider: str(options.provider) || str(options.agent), model: str(options.model), permission: str(options.permission), subtask }, providersFor(config));
  const prompt = await buildPrompt({ taskDir: dir, task: slug, subtask, instruction, issues: issues2 });
  const timeoutMs = Math.round((Number(options.timeout) || config.runtime?.timeoutMinutes || 30) * 6e4);
  if (options.dryRun) return { dryRun: true, plan, prompt, invocation: plan.provider.invocation({ prompt: "<prompt>", model: plan.model, permission: plan.permission }) };
  const controller = new globalThis.AbortController(), abort = () => controller.abort();
  process.once("SIGINT", abort);
  try {
    const run2 = await runAgent({ cwd, config, taskDir: dir, task: slug, provider: plan.provider, model: plan.model, permission: plan.permission, prompt, timeoutMs, signal: controller.signal, onEvent });
    return { plan, run: run2 };
  } finally {
    process.removeListener("SIGINT", abort);
  }
}
async function run(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug), config = await loadConfig(cwd);
  const subtask = await selectSubtask(dir, str(options.subtask) || (options.subtask === true ? "next" : void 0));
  if (subtask && subtask.status === "pending" && !options.dryRun) await setStatus(dir, slug, subtask.id, "in-progress");
  const outcome = await startAgentRun(cwd, { slug, dir, config, subtask, instruction: str(options.prompt), options, onEvent: printer(options) });
  if (outcome.dryRun) {
    const { plan: plan2, prompt, invocation } = outcome;
    const argv = [resolveBin(plan2.provider, config, cwd), ...invocation.args];
    if (options.json) return output(JSON.stringify({ provider: plan2.provider.id, model: plan2.model || null, permission: plan2.permission, route: plan2.route, argv, stdin: invocation.input !== void 0, prompt }, null, 2));
    return output(`${brand()} / AGENT (dry run)
Provider: ${plan2.provider.name} (${plan2.route})
Model: ${plan2.model || "provider default"}
Permission: ${plan2.permission}
Command: ${argv.join(" ")}${invocation.input !== void 0 ? " < prompt" : ""}

----- prompt -----
${prompt}`);
  }
  const { plan, run: result } = outcome;
  const payload = { provider: plan.provider.id, model: plan.model || null, permission: plan.permission, ok: result.ok, problems: result.problems, status: result.result?.status || null, summary: result.result?.summary || null, questions: result.result?.questions || [], filesChanged: result.result?.filesChanged || [], sessionId: result.sessionId || null, durationMs: result.durationMs, cost: result.cost ?? null, subtask: subtask?.id || null, transcript: rel(cwd, result.transcript), warnings: result.warnings };
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    output(`
${brand()} / AGENT ${result.ok ? "FINISHED" : "FAILED"} in ${Math.round(result.durationMs / 1e3)}s${payload.cost != null ? ` \xB7 $${Number(payload.cost).toFixed(4)}` : ""}`);
    result.problems.forEach((problem) => output(`! ${problem}`));
    result.warnings.forEach((warning) => output(`WARN ${warning}`));
    if (result.result) {
      output(`Status: ${result.result.status}
${result.result.summary}`);
      result.result.questions.forEach((question) => output(`? ${question}`));
    } else if (result.ok) output("The agent did not return a maverick-result block; review its output before trusting it.");
    output(`Transcript: ${payload.transcript}${subtask ? `
When verified: maverick subtask set ${slug} ${subtask.id} done` : ""}
Next: maverick flow run ship ${slug}`);
  }
  if (!result.ok) throw new Error("agent run failed");
}
async function confirm(question, options) {
  if (options.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("rerun with --yes to confirm");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question} [y/N] `);
  prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}
async function trust(cwd, id2, options, add2 = true) {
  const config = await loadConfig(cwd), providers = providersFor(config);
  const provider = providers.find((item) => item.id === id2);
  if (!provider) throw new Error(`unknown provider ${id2 || ""}; available: ${providers.map((item) => item.id).join(", ")}`);
  const path = join13(cwd, ".maverick", "config.json");
  const current = await exists(path) ? JSON.parse(await readFile10(path, "utf8")) : { version: 1 };
  const runtime = { ...current.runtime };
  const trusted = new Set(runtime.trusted || []);
  if (add2) trusted.add(id2);
  else trusted.delete(id2);
  runtime.trusted = [...trusted].sort();
  const max = str(options.maxPermission);
  if (max && !PERMISSIONS.includes(max)) throw new Error(`--max-permission must be one of ${PERMISSIONS.join(", ")}`);
  if (add2 && max) runtime.maxPermission = max;
  if (add2 && !runtime.default) runtime.default = { provider: id2 };
  if (!add2 && runtime.default?.provider === id2) delete runtime.default;
  const ceiling = runtime.maxPermission || "edit";
  const message = add2 ? `Trust ${provider.name} to run in ${cwd} with up to "${ceiling}" permission? It will run ${[provider.bin].flat().join(" or ")} with your user account.` : `Stop trusting ${provider.name}?`;
  if (!await confirm(message, options)) return output("Nothing changed.");
  await mkdir4(join13(cwd, ".maverick"), { recursive: true });
  await writeFile4(path, pretty({ ...current, runtime }));
  output(options.json ? JSON.stringify({ trusted: runtime.trusted, maxPermission: ceiling, default: runtime.default || null }) : `${brand()} / AGENT
\u2713 ${add2 ? "trusted" : "untrusted"} ${id2}; runtime written to ${rel(cwd, path)}
Max permission: ${ceiling}. Commit this file so the team reviews the decision.`);
}
async function list(cwd, options) {
  const config = await loadConfig(cwd), trusted = config.runtime?.trusted || [];
  const rows = providersFor(config).map((provider) => ({ id: provider.id, name: provider.name, bin: resolveBin(provider, config, cwd), installed: commandAvailable(resolveBin(provider, config, cwd), cwd), trusted: trusted.includes(provider.id), permissions: PERMISSIONS.filter((level) => provider.permissions[level] === true), custom: Boolean(provider.custom) }));
  if (options.json) return output(JSON.stringify({ providers: rows, maxPermission: config.runtime?.maxPermission || "edit", default: config.runtime?.default || null, routes: config.runtime?.routes || [] }, null, 2));
  output(`${brand()} / AGENTS

${rows.map((row) => `${row.id.padEnd(13)}${(row.installed ? "installed" : "missing").padEnd(11)}${(row.trusted ? "trusted" : "\u2014").padEnd(9)}${row.permissions.join(", ")}${row.custom ? "  [custom]" : ""}`).join("\n")}

Max permission: ${config.runtime?.maxPermission || "edit"} \xB7 default: ${config.runtime?.default?.provider || "not set"}
Trust one with: maverick agent trust <provider>`);
}
async function runs(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const files = (await readdir7(join13(dir, "runs")).catch(() => [])).filter((file) => file.endsWith(".jsonl")).sort();
  const items = [];
  for (const file of files) {
    const events = (await readFile10(join13(dir, "runs", file), "utf8")).split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const start = events.find((event) => event.type === "start"), end = events.findLast((event) => event.type === "end");
    items.push({ file: rel(cwd, join13(dir, "runs", file)), provider: start?.provider, at: start?.at, ok: end?.ok ?? null, status: end?.status ?? null, durationMs: end?.durationMs ?? null });
  }
  if (options.json) return output(JSON.stringify(items, null, 2));
  output(items.length ? items.map((item) => `${item.at}  ${String(item.provider).padEnd(12)}${item.ok === null ? "incomplete" : item.ok ? "ok" : "failed"}${item.status ? ` \xB7 ${item.status}` : ""}  ${item.file}`).join("\n") : `No agent runs for ${slug} yet.`);
}
async function agentCommand(cwd, [action, target], options = {}) {
  if (!action || action === "list") return list(cwd, options);
  if (action === "run") return run(cwd, target, options);
  if (action === "trust") return trust(cwd, target, options, true);
  if (action === "untrust") return trust(cwd, target, options, false);
  if (action === "runs") return runs(cwd, target, options);
  throw new Error("use agent list, agent trust <provider>, agent untrust <provider>, agent run <task>, or agent runs <task>");
}
var agentCommands = [
  { id: "agent", description: "Run trusted AI coding agents headlessly with scoped permissions.", aliases: [], usage: "agent list|trust|untrust|run <task>|runs <task>", run: ({ cwd, rest, options }) => agentCommand(cwd, rest, options) }
];

// src/commands/capabilities.js
import { createInterface as createInterface2 } from "readline/promises";

// src/capabilities/adapters.js
import { join as join14 } from "path";
var argumentsAs = (body, token) => body.replaceAll("{{ARGUMENTS}}", token);
var tomlString = (text) => text.includes("'''") ? JSON.stringify(text) : `'''
${text}'''`;
function skillOutputs(capability, root) {
  const base2 = `${root}/${capability.name}`;
  return capability.files.map((file) => ({
    type: "file",
    path: `${base2}/${file}`,
    content: file === "SKILL.md" ? renderFrontmatter({ name: capability.name, description: capability.description, "allowed-tools": capability["allowed-tools"] }, capability.body) : capability.contents[file]
  }));
}
function stdioOrRemote(server, { typed = false, remote = (server2) => ({ type: server2.type, url: server2.url, ...Object.keys(server2.headers).length && { headers: server2.headers } }) } = {}) {
  if (!server.command) return remote(server);
  return { ...typed && { type: "stdio" }, command: server.command, args: server.args, ...Object.keys(server.env).length && { env: server.env } };
}
var CLAUDE_TOOLS = { read: ["Read", "Grep", "Glob"], edit: ["Edit", "Write"], shell: ["Bash"], web: ["WebFetch", "WebSearch"] };
var ADAPTERS = [
  {
    id: "claude-code",
    name: "Claude Code",
    detect: ["CLAUDE.md", ".claude", ".mcp.json"],
    supports: () => true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".claude/skills");
      if (capability.kind === "agent") return [{ type: "file", path: `.claude/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, tools: capability.tools?.flatMap((tool) => CLAUDE_TOOLS[tool]).join(", "), model: capability.model }, capability.body) }];
      if (capability.kind === "command") return [{ type: "file", path: `.claude/commands/${capability.name}.md`, content: renderFrontmatter({ description: capability.description, "argument-hint": capability["argument-hint"] }, argumentsAs(capability.body, "$ARGUMENTS")) }];
      return [{ type: "json-key", path: ".mcp.json", pointer: ["mcpServers", capability.name], value: stdioOrRemote(capability.server) }];
    }
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    detect: ["AGENTS.md", ".codex", ".agents"],
    supports: (kind) => kind === "command" ? "Codex has no project-level custom commands (prompts are user-level and deprecated); install the matching skill instead" : kind === "mcp" ? "Codex reads MCP servers from .codex/config.toml, which Maverick does not edit yet; add the server there manually" : true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".agents/skills");
      const lines = [`name = ${JSON.stringify(capability.name)}`, `description = ${JSON.stringify(capability.description)}`, ...capability.model ? [`model = ${JSON.stringify(capability.model)}`] : [], `developer_instructions = ${tomlString(capability.body.trim() + "\n")}`];
      return [{ type: "file", path: `.codex/agents/${capability.name}.toml`, content: `${lines.join("\n")}
` }];
    }
  },
  {
    id: "cursor",
    name: "Cursor",
    detect: [".cursor", ".cursorrules"],
    supports: (kind) => kind === "command" ? "Cursor replaced custom commands with skills; install the matching skill instead" : true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".cursor/skills");
      if (capability.kind === "agent") {
        const readonly = capability.tools ? !capability.tools.some((tool) => tool === "edit" || tool === "shell") : void 0;
        return [{ type: "file", path: `.cursor/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, model: capability.model, readonly: readonly || void 0 }, capability.body) }];
      }
      return [{ type: "json-key", path: ".cursor/mcp.json", pointer: ["mcpServers", capability.name], value: stdioOrRemote(capability.server, { typed: true }) }];
    }
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    detect: [".github/copilot-instructions.md", ".github/agents", ".github/prompts", ".github/skills", ".vscode/mcp.json"],
    supports: () => true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".github/skills");
      if (capability.kind === "agent") return [{ type: "file", path: `.github/agents/${capability.name}.agent.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, model: capability.model }, capability.body) }];
      if (capability.kind === "command") return [{ type: "file", path: `.github/prompts/${capability.name}.prompt.md`, content: renderFrontmatter({ description: capability.description, "argument-hint": capability["argument-hint"] }, argumentsAs(capability.body, "${input:args}")) }];
      return [{ type: "json-key", path: ".vscode/mcp.json", pointer: ["servers", capability.name], value: stdioOrRemote(capability.server, { typed: true }) }];
    }
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    detect: ["GEMINI.md", ".gemini"],
    supports: () => true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".gemini/skills");
      if (capability.kind === "agent") return [{ type: "file", path: `.gemini/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, model: capability.model }, capability.body) }];
      if (capability.kind === "command") return [{ type: "file", path: `.gemini/commands/${capability.name}.toml`, content: `description = ${JSON.stringify(capability.description)}
prompt = ${tomlString(argumentsAs(capability.body.trim(), "{{args}}") + "\n")}
` }];
      const remote = (server) => ({ [server.type === "sse" ? "url" : "httpUrl"]: server.url, ...Object.keys(server.headers).length && { headers: server.headers } });
      return [{ type: "json-key", path: ".gemini/settings.json", pointer: ["mcpServers", capability.name], value: stdioOrRemote(capability.server, { remote }) }];
    }
  },
  {
    id: "windsurf",
    name: "Windsurf / Devin Desktop",
    detect: [".windsurf", ".windsurfrules", ".devin"],
    supports: (kind) => kind === "agent" ? "Windsurf (Devin Desktop) has no project-level subagents" : kind === "mcp" ? "Windsurf (Devin Desktop) only reads MCP servers from user-level configuration" : true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".windsurf/skills");
      const body = argumentsAs(capability.body, "the arguments the user provided").trim();
      if (body.length > 12e3) throw new Error(`${capability.ref} is longer than the 12,000-character Windsurf workflow limit`);
      return [{ type: "file", path: `.windsurf/workflows/${capability.name}.md`, content: `# ${capability.name}

${capability.description}

${body}
` }];
    }
  }
];
var ADAPTER_IDS = ADAPTERS.map((adapter2) => adapter2.id);
async function detectAdapters(cwd) {
  const detected = [];
  for (const adapter2 of ADAPTERS) if ((await Promise.all(adapter2.detect.map((path) => exists(join14(cwd, path))))).some(Boolean)) detected.push(adapter2);
  return detected;
}
async function resolveTargets(cwd, config = {}, to) {
  const requested = typeof to === "string" ? to.split(",").map((value) => value.trim()).filter(Boolean) : config.capabilities?.targets;
  if (requested?.length) {
    const ids = requested.includes("all") ? ADAPTER_IDS : requested;
    const unknown = ids.filter((id2) => !ADAPTER_IDS.includes(id2));
    if (unknown.length) throw new Error(`unknown target ${unknown.join(", ")}; use ${ADAPTER_IDS.join(", ")} or all`);
    return ADAPTERS.filter((adapter2) => ids.includes(adapter2.id));
  }
  const detected = await detectAdapters(cwd);
  if (!detected.length) throw new Error(`no AI tool configuration detected; choose targets with --to ${ADAPTER_IDS.join(",")} (or --to all)`);
  return detected;
}

// src/capabilities/engine.js
import { mkdir as mkdir5, readdir as readdir8, readFile as readFile11, rm, rmdir, writeFile as writeFile5 } from "fs/promises";
import { dirname as dirname3, isAbsolute as isAbsolute2, join as join15, normalize as normalize2, relative as relative5, sep as sep3 } from "path";
var LOCK_PATH = ".maverick/capabilities.lock.json";
function resolveInside(cwd, path) {
  const normalized = normalize2(path);
  if (isAbsolute2(normalized) || normalized === ".." || normalized.startsWith(`..${sep3}`)) throw new Error(`refusing to write outside the project: ${path}`);
  return join15(cwd, normalized);
}
var keyId = (path, pointer) => `${path}#${pointer.join(".")}`;
var hashValue = (value) => sha256(JSON.stringify(value));
var toBuffer = (content) => Buffer.isBuffer(content) ? content : Buffer.from(content);
async function readLock(cwd) {
  const path = join15(cwd, LOCK_PATH);
  if (!await exists(path)) return { version: 1, capabilities: {} };
  try {
    return JSON.parse(await readFile11(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid lockfile ${LOCK_PATH}: ${error.message}`);
  }
}
async function writeLock(cwd, lock) {
  const sorted = { version: 1, capabilities: Object.fromEntries(Object.entries(lock.capabilities).sort(([a], [b]) => a.localeCompare(b))) };
  await mkdir5(dirname3(join15(cwd, LOCK_PATH)), { recursive: true });
  await writeFile5(join15(cwd, LOCK_PATH), pretty(sorted));
}
function ownership(lock) {
  const owners = /* @__PURE__ */ new Map();
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    for (const target of Object.values(entry.targets || {})) {
      for (const file of target.files || []) owners.set(file.path, ref);
      for (const key of target.keys || []) owners.set(keyId(key.path, key.pointer), ref);
    }
  }
  return owners;
}
async function readJsonFile(cwd, path) {
  const full = resolveInside(cwd, path);
  if (!await exists(full)) return void 0;
  const text = await readFile11(full, "utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`cannot merge into ${path}: it is not plain JSON (comments are not supported)`);
  }
}
var getAt = (object, pointer) => pointer.reduce((node, key) => node && typeof node === "object" ? node[key] : void 0, object);
function setAt(object, pointer, value) {
  let node = object;
  for (const key of pointer.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[pointer.at(-1)] = value;
}
function deleteAt(object, pointer) {
  const parent = getAt(object, pointer.slice(0, -1));
  if (parent && typeof parent === "object") delete parent[pointer.at(-1)];
}
async function planInstall(cwd, capability, adapters, lock, { force = false } = {}) {
  const owners = ownership(lock), changes = [], skipped = [], conflicts = [], outputsByTarget = {};
  for (const adapter2 of adapters) {
    if (capability.targets && !capability.targets.includes(adapter2.id)) {
      skipped.push({ target: adapter2.id, reason: `the capability is limited to ${capability.targets.join(", ")}` });
      continue;
    }
    const support = adapter2.supports(capability.kind);
    if (support !== true) {
      skipped.push({ target: adapter2.id, reason: support || `${adapter2.name} does not support ${capability.kind} capabilities at project level` });
      continue;
    }
    const outputs = adapter2.render(capability);
    outputsByTarget[adapter2.id] = outputs;
    for (const output2 of outputs) {
      if (output2.type === "file") {
        const full = resolveInside(cwd, output2.path), content = toBuffer(output2.content), hash = sha256(content);
        const current = await exists(full) ? await readFile11(full) : null, owner = owners.get(output2.path);
        const op = !current ? "create" : sha256(current) === hash ? "unchanged" : "update";
        if (current && owner !== capability.ref && op !== "unchanged") conflicts.push({ target: adapter2.id, path: output2.path, reason: owner ? `owned by ${owner}` : "exists and is not managed by Maverick" });
        changes.push({ target: adapter2.id, type: "file", op, path: output2.path, content, sha256: hash });
      } else {
        const document = await readJsonFile(cwd, output2.path), current = getAt(document, output2.pointer), id2 = keyId(output2.path, output2.pointer), owner = owners.get(id2);
        const op = current === void 0 ? "create" : hashValue(current) === hashValue(output2.value) ? "unchanged" : "update";
        if (current !== void 0 && owner !== capability.ref && op !== "unchanged") conflicts.push({ target: adapter2.id, path: `${output2.path} \u2192 ${output2.pointer.join(".")}`, reason: owner ? `owned by ${owner}` : "key exists and is not managed by Maverick" });
        changes.push({ target: adapter2.id, type: "json-key", op, path: output2.path, pointer: output2.pointer, value: output2.value, sha256: hashValue(output2.value) });
      }
    }
  }
  for (const [target, recorded] of Object.entries(lock.capabilities[capability.ref]?.targets || {})) {
    if (!outputsByTarget[target]) continue;
    for (const file of recorded.files || []) if (!changes.some((change) => change.type === "file" && change.path === file.path)) changes.push({ target, type: "file", op: "delete", path: file.path });
    for (const key of recorded.keys || []) if (!changes.some((change) => change.type === "json-key" && keyId(change.path, change.pointer) === keyId(key.path, key.pointer))) changes.push({ target, type: "json-key", op: "delete", path: key.path, pointer: key.pointer });
  }
  return { capability, changes, skipped, conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}
async function planRemove(cwd, ref, lock, { force = false } = {}) {
  const entry = lock.capabilities[ref];
  if (!entry) throw new Error(`${ref} is not installed; run maverick installed to list installed capabilities`);
  const changes = [], conflicts = [];
  for (const [target, recorded] of Object.entries(entry.targets || {})) {
    for (const file of recorded.files || []) {
      const full = resolveInside(cwd, file.path);
      if (!await exists(full)) continue;
      if (sha256(await readFile11(full)) !== file.sha256) conflicts.push({ target, path: file.path, reason: "edited since install" });
      changes.push({ target, type: "file", op: "delete", path: file.path });
    }
    for (const key of recorded.keys || []) {
      const current = getAt(await readJsonFile(cwd, key.path), key.pointer);
      if (current === void 0) continue;
      if (hashValue(current) !== key.sha256) conflicts.push({ target, path: `${key.path} \u2192 ${key.pointer.join(".")}`, reason: "edited since install" });
      changes.push({ target, type: "json-key", op: "delete", path: key.path, pointer: key.pointer });
    }
  }
  return { ref, changes, skipped: [], conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}
async function removeEmptyParents(cwd, path) {
  for (let dir = dirname3(path); relative5(cwd, dir) && !relative5(cwd, dir).startsWith(".."); dir = dirname3(dir)) {
    if ((await readdir8(dir).catch(() => ["x"])).length) return;
    await rmdir(dir).catch(() => {
    });
  }
}
async function applyChanges(cwd, changes) {
  const staged = /* @__PURE__ */ new Map(), originals = /* @__PURE__ */ new Map();
  const load = async (path) => {
    if (!staged.has(path)) {
      const full = resolveInside(cwd, path), current = await exists(full) ? await readFile11(full) : null;
      originals.set(path, current);
      staged.set(path, current);
    }
    return staged.get(path);
  };
  for (const change of changes.filter((item) => item.op !== "unchanged")) {
    if (change.type === "file") {
      await load(change.path);
      staged.set(change.path, change.op === "delete" ? null : change.content);
      continue;
    }
    const current = await load(change.path), document = current ? JSON.parse(current.toString("utf8") || "{}") : {};
    if (change.op === "delete") deleteAt(document, change.pointer);
    else setAt(document, change.pointer, change.value);
    staged.set(change.path, Buffer.from(pretty(document)));
  }
  const written = [];
  try {
    for (const [path, content] of staged) {
      if (content !== null && originals.get(path) !== null && Buffer.compare(content, originals.get(path)) === 0) continue;
      const full = resolveInside(cwd, path);
      written.push(path);
      if (content === null) {
        await rm(full, { force: true });
        await removeEmptyParents(cwd, full);
      } else {
        await mkdir5(dirname3(full), { recursive: true });
        await writeFile5(full, content);
      }
    }
  } catch (error) {
    for (const path of written) {
      const full = resolveInside(cwd, path), original = originals.get(path);
      if (original === null) await rm(full, { force: true }).catch(() => {
      });
      else await writeFile5(full, original).catch(() => {
      });
    }
    throw new Error(`could not apply changes (all files restored): ${error.message}`);
  }
}
function lockEntry(plan, { allowExec = false } = {}) {
  const targets = {};
  for (const change of plan.changes.filter((item) => item.op !== "delete")) {
    const target = targets[change.target] ||= { files: [], keys: [] };
    if (change.type === "file") target.files.push({ path: change.path, sha256: change.sha256 });
    else target.keys.push({ path: change.path, pointer: change.pointer, sha256: change.sha256 });
  }
  const { capability } = plan;
  return { kind: capability.kind, version: capability.version, source: capability.source, integrity: capability.integrity, ...allowExec && { allowExec: true }, installedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), targets };
}
async function checkDrift(cwd, lock) {
  const report2 = [];
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    const issues2 = [];
    for (const [target, recorded] of Object.entries(entry.targets || {})) {
      for (const file of recorded.files || []) {
        const full = resolveInside(cwd, file.path);
        if (!await exists(full)) issues2.push({ target, path: file.path, status: "missing" });
        else if (sha256(await readFile11(full)) !== file.sha256) issues2.push({ target, path: file.path, status: "modified" });
      }
      for (const key of recorded.keys || []) {
        let current;
        try {
          current = getAt(await readJsonFile(cwd, key.path), key.pointer);
        } catch {
          current = void 0;
        }
        if (current === void 0) issues2.push({ target, path: `${key.path} \u2192 ${key.pointer.join(".")}`, status: "missing" });
        else if (hashValue(current) !== key.sha256) issues2.push({ target, path: `${key.path} \u2192 ${key.pointer.join(".")}`, status: "modified" });
      }
    }
    report2.push({ ref, version: entry.version, source: entry.source, targets: Object.keys(entry.targets || {}), issues: issues2 });
  }
  return report2;
}

// src/commands/capabilities.js
var MARK = { create: "+", update: "~", delete: "-", unchanged: "=" };
var describe = (change) => change.type === "json-key" ? `${change.path} \u2192 ${change.pointer.join(".")}` : change.path;
function renderPlans(title, plans) {
  const lines = [`${brand()} / ${title}`];
  for (const plan of plans) {
    lines.push("", plan.capability ? `${plan.capability.ref} ${plan.capability.version} (${plan.capability.source})` : plan.ref);
    for (const change of plan.changes) lines.push(`  ${MARK[change.op]} ${change.target.padEnd(12)} ${describe(change)}`);
    for (const skip of plan.skipped) lines.push(`  \xB7 ${skip.target.padEnd(12)} skipped: ${skip.reason}`);
    for (const conflict of plan.conflicts) lines.push(`  ! ${conflict.target.padEnd(12)} ${conflict.path}: ${conflict.reason}`);
    for (const forced of plan.forced) lines.push(`  ! ${forced.target.padEnd(12)} ${forced.path}: ${forced.reason} (overwriting: --force)`);
  }
  return lines.join("\n");
}
var pending = (plans) => plans.flatMap((plan) => plan.changes).filter((change) => change.op !== "unchanged");
async function confirm2(title, plans, options) {
  const summary = plans.map((plan) => ({ ref: plan.capability?.ref || plan.ref, changes: plan.changes.map(({ target, op, type, path, pointer }) => ({ target, op, type, path, ...pointer && { pointer } })), skipped: plan.skipped, conflicts: plan.conflicts }));
  if (!options.json) output(renderPlans(title, plans));
  const conflicts = plans.flatMap((plan) => plan.conflicts);
  if (conflicts.length) {
    if (options.json) output(JSON.stringify({ applied: false, plans: summary }, null, 2));
    throw new Error(`${conflicts.length} conflict(s): ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join("; ")}; review them, or rerun with --force to overwrite`);
  }
  const count = pending(plans).length;
  const finish = (applied) => {
    if (options.json) output(JSON.stringify({ applied, dryRun: Boolean(options.dryRun), plans: summary }, null, 2));
    return applied;
  };
  if (!count) {
    if (!options.json) output("\nAlready up to date.");
    return finish(false);
  }
  if (options.dryRun) {
    if (!options.json) output(`
${count} change(s) planned. Dry run: nothing was written.`);
    return finish(false);
  }
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY || options.json) throw new Error(`${count} change(s) planned; rerun with --yes to apply or --dry-run to preview`);
    const prompt = createInterface2({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`
Apply ${count} change(s)? [y/N] `);
    prompt.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      output("Nothing was written.");
      return false;
    }
  }
  return finish(true);
}
function requireExecTrust(capability, options) {
  if (capability.kind === "mcp" && capability.server.command && !options.allowExec) {
    throw new Error(`${capability.ref} starts a local process (${[capability.server.command, ...capability.server.args].join(" ")}); review it, then rerun with --allow-exec`);
  }
}
async function add(cwd, references, options = {}) {
  if (!references.length) throw new Error("name at least one capability, for example: maverick add agent/reviewer --to claude-code");
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]);
  const catalog = await loadCatalog(cwd, config);
  const adapters = await resolveTargets(cwd, config, options.to);
  const plans = [];
  for (const reference of references) {
    const capability = findCapability(catalog, reference);
    requireExecTrust(capability, options);
    const plan = await planInstall(cwd, capability, adapters, lock, { force: options.force });
    if (!plan.changes.length) throw new Error(`${capability.ref} is not supported by ${adapters.map((adapter2) => adapter2.id).join(", ")}: ${plan.skipped.map((skip) => skip.reason).join("; ")}`);
    plans.push(plan);
  }
  if (!await confirm2("ADD", plans, options)) return;
  await applyChanges(cwd, plans.flatMap((plan) => plan.changes));
  for (const plan of plans) lock.capabilities[plan.capability.ref] = lockEntry(plan, { allowExec: Boolean(options.allowExec) });
  await writeLock(cwd, lock);
  if (!options.json) output(`
\u2713 installed ${plans.length} capability(ies); recorded in ${LOCK_PATH}`);
}
async function remove(cwd, references, options = {}) {
  if (!references.length) throw new Error("name at least one installed capability, for example: maverick remove agent/reviewer");
  const lock = await readLock(cwd), plans = [];
  for (const reference of references) {
    const refs = Object.keys(lock.capabilities).filter((ref) => ref === reference || ref.split("/")[1] === reference);
    if (refs.length > 1) throw new Error(`"${reference}" is ambiguous; use one of: ${refs.join(", ")}`);
    plans.push(await planRemove(cwd, refs[0] || reference, lock, { force: options.force }));
  }
  const applied = await confirm2("REMOVE", plans, options);
  if (!applied && pending(plans).length) return;
  await applyChanges(cwd, plans.flatMap((plan) => plan.changes));
  for (const plan of plans) delete lock.capabilities[plan.ref];
  await writeLock(cwd, lock);
  if (!options.json) output(`
\u2713 removed ${plans.length} capability(ies)`);
}
async function catalogCommand(cwd, action, value, options = {}) {
  const config = await loadConfig(cwd), catalog = await loadCatalog(cwd, config);
  if (action === "show") {
    const capability = findCapability(catalog, value);
    const { body } = capability;
    if (options.json) return output(JSON.stringify({ ...capability, contents: void 0, dir: void 0 }, null, 2));
    return output(`${brand()} / CAPABILITY

${capability.ref} ${capability.version} (${capability.source})
${capability.description}

Files: ${capability.files.join(", ")}
Supported by: ${ADAPTERS.filter((adapter2) => adapter2.supports(capability.kind) === true).map((adapter2) => adapter2.id).join(", ")}${capability.kind === "mcp" ? `
Server: ${capability.server.command ? [capability.server.command, ...capability.server.args].join(" ") : capability.server.url}` : ""}

${body.trim()}`);
  }
  if (action === "validate") {
    const ok = !catalog.errors.length;
    if (options.json) output(JSON.stringify({ valid: ok, capabilities: catalog.capabilities.length, errors: catalog.errors, shadowed: catalog.shadowed }, null, 2));
    else {
      output(`${brand()} / CATALOG VALIDATE
${catalog.capabilities.length} valid capability(ies)`);
      for (const error of catalog.errors) output(`FAIL ${error.path} [${error.source}]: ${error.message}`);
      for (const item of catalog.shadowed) output(`NOTE ${item.ref} from ${item.source} is shadowed by ${item.by}`);
    }
    if (!ok) throw new Error(`${catalog.errors.length} invalid capability(ies)`);
    return;
  }
  if (action && action !== "search") throw new Error("use catalog, catalog search <text>, catalog show <capability>, or catalog validate");
  const results = searchCatalog(catalog, action === "search" ? value : "");
  if (options.json) return output(JSON.stringify(results.map(({ ref, kind, name: name2, version: version2, description, source, tags }) => ({ ref, kind, name: name2, version: version2, description, source, tags })), null, 2));
  const width = Math.max(10, ...results.map((item) => item.ref.length)) + 2;
  output(`${brand()} / CATALOG

${results.map((item) => `${item.ref.padEnd(width)}${item.version.padEnd(8)}${item.description.split(". ")[0].replace(/\.$/, "")}`).join("\n") || "No capabilities match."}${catalog.errors.length ? `

${catalog.errors.length} invalid capability(ies) hidden; run maverick catalog validate` : ""}

Install with: maverick add <capability> --to <${ADAPTERS.map((adapter2) => adapter2.id).join("|")}>`);
}
async function installed(cwd, options = {}) {
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]);
  const catalog = await loadCatalog(cwd, config), report2 = await checkDrift(cwd, lock);
  for (const item of report2) {
    const current = catalog.capabilities.find((capability) => capability.ref === item.ref);
    item.status = item.issues.length ? "drifted" : "ok";
    item.update = !current ? "source missing" : current.integrity !== lock.capabilities[item.ref].integrity ? `${current.version} available` : null;
  }
  if (options.json) return output(JSON.stringify(report2, null, 2));
  if (!report2.length) return output("No capabilities installed. Run maverick catalog to browse them.");
  const lines = [`${brand()} / INSTALLED`, ""];
  for (const item of report2) {
    lines.push(`${item.status === "ok" ? "OK   " : "DRIFT"} ${item.ref} ${item.version} \u2192 ${item.targets.join(", ")}${item.update ? `  (${item.update})` : ""}`);
    for (const issue of item.issues) lines.push(`      ${issue.status} ${issue.path}`);
  }
  if (report2.some((item) => item.issues.length)) lines.push("", "Restore managed files with: maverick sync");
  output(lines.join("\n"));
}
async function sync(cwd, options = {}) {
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]);
  const catalog = await loadCatalog(cwd, config), plans = [], notes = [];
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    const capability = catalog.capabilities.find((item) => item.ref === ref);
    if (!capability) {
      notes.push(`${ref}: source not found in any catalog; left as is`);
      continue;
    }
    if (capability.integrity !== entry.integrity) {
      notes.push(`${ref}: catalog changed (${entry.version} \u2192 ${capability.version}); run maverick add ${ref} to update`);
      continue;
    }
    const adapters = ADAPTERS.filter((adapter2) => Object.keys(entry.targets).includes(adapter2.id));
    plans.push(await planInstall(cwd, capability, adapters, lock, { force: options.force }));
  }
  if (!options.json) notes.forEach((note) => output(`NOTE ${note}`));
  if (!plans.length) return output(options.json ? JSON.stringify({ applied: false, notes }) : "Nothing to sync.");
  if (!await confirm2("SYNC", plans, options)) return;
  await applyChanges(cwd, plans.flatMap((plan) => plan.changes));
  if (!options.json) output("\n\u2713 managed files match the lockfile");
}
var capabilityCommands = [
  { id: "catalog", description: "Browse, search, show, or validate available capabilities.", aliases: [], usage: "catalog [search <text>|show <name>|validate]", run: ({ cwd, arg, third, options }) => catalogCommand(cwd, arg, third, options) },
  { id: "add", description: "Install skills, agents, commands, or MCP servers into AI tools.", aliases: [], usage: "add <capability...> [--to <tools>] [--dry-run]", run: ({ cwd, rest, options }) => add(cwd, rest, options) },
  { id: "remove", description: "Uninstall capabilities and their managed files.", aliases: [], usage: "remove <capability...> [--dry-run]", run: ({ cwd, rest, options }) => remove(cwd, rest, options) },
  { id: "installed", description: "List installed capabilities, drift, and updates.", aliases: [], usage: "installed [--json]", run: ({ cwd, options }) => installed(cwd, options) },
  { id: "sync", description: "Restore managed files from the capabilities lockfile.", aliases: [], usage: "sync [--dry-run]", run: ({ cwd, options }) => sync(cwd, options) }
];

// src/commands/delivery.js
import { copyFile, mkdir as mkdir6, readFile as readFile12, writeFile as writeFile6 } from "fs/promises";
import { dirname as dirname4, join as join16 } from "path";
var ADAPTERS2 = {
  codex: ["adapters/codex/AGENTS.md.example", "AGENTS.md"],
  "claude-code": ["adapters/claude-code/CLAUDE.md.example", "CLAUDE.md"],
  cursor: ["adapters/cursor/maverick.mdc.example", ".cursor/rules/maverick.mdc"],
  generic: ["adapters/generic/ROLE_PROMPT.txt", ".maverick/ROLE_PROMPT.txt"]
};
async function learn(cwd, slug, options = {}) {
  await getTask(cwd, slug);
  if (!options.rule || options.rule === true) throw new Error('provide a rule with --rule "..."');
  const dir = join16(cwd, ".maverick"), path = join16(dir, "LEARNINGS.md");
  await mkdir6(dir, { recursive: true });
  const existing = await exists(path) ? await readFile12(path, "utf8") : "# Maverick Learnings\n\nProposed reusable rules. Promote only after team review.\n";
  await writeFile6(path, `${existing}
- [ ] ${options.rule}
  - Source task: \`${slug}\`
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), rule: options.rule }) : `${brand()} / LEARN
\u2713 proposed rule saved: ${rel(cwd, path)}`);
}
async function handoff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), present = {};
  for (const file of ["EVIDENCE.md", "REVIEW-FINDINGS.md", "SECURITY-REPORT.md", "DEPENDENCY-REVIEW.md", "SCOPE-GUARD.md", "CHECKPOINT.md"]) present[file] = await exists(join16(dir, file));
  const task = await readFile12(join16(dir, "TASK.md"), "utf8");
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || "See TASK.md.";
  const remaining = Object.entries(present).filter(([, value]) => !value).map(([file]) => file), path = join16(dir, "HANDOFF.md");
  await writeFile6(path, `# Handoff \u2014 ${slug}

## Goal
${goal}

## Workflow
Preset: ${preset.name}

## Completed evidence
${Object.entries(present).filter(([, value]) => value).map(([file]) => `- \`${file}\``).join("\n") || "- none"}

## Still needed
${remaining.map((file) => `- \`${file}\``).join("\n") || "- Complete human review and PR decision."}

## Next owner
Name/agent: ${options.to || "FILL ME"}

## Notes
Read TASK.md, CONTEXT.md, and the reports listed above before continuing.
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), remaining }) : `${brand()} / HANDOFF
\u2713 handoff: ${rel(cwd, path)}
Remaining reports: ${remaining.length}`);
}
async function adapter(cwd, action, name2, options = {}) {
  if (action === "list") return output(options.json ? JSON.stringify(Object.keys(ADAPTERS2)) : `${brand()} / ADAPTERS
${Object.keys(ADAPTERS2).join("\n")}`);
  if (action !== "install" || !ADAPTERS2[name2]) throw new Error(`use adapter list or adapter install <${Object.keys(ADAPTERS2).join("|")}>`);
  const [source, target] = ADAPTERS2[name2], destination = join16(cwd, target);
  if (await exists(destination)) throw new Error(`adapter target already exists: ${rel(cwd, destination)}`);
  await mkdir6(dirname4(destination), { recursive: true });
  await copyFile(join16(packageRoot, source), destination);
  output(options.json ? JSON.stringify({ adapter: name2, path: rel(cwd, destination) }) : `${brand()} / ADAPTER
\u2713 ${name2}: ${rel(cwd, destination)}`);
}
async function ci(cwd, provider, slug, options = {}) {
  if (provider !== "github") throw new Error("only the github CI generator is currently available");
  await getTask(cwd, slug);
  const destination = join16(cwd, ".github", "workflows", `maverick-${slug}.yml`);
  if (await exists(destination)) throw new Error(`CI workflow already exists: ${rel(cwd, destination)}`);
  await mkdir6(dirname4(destination), { recursive: true });
  await writeFile6(destination, replaceVars(await readFile12(join16(packageRoot, "templates", "github-actions-maverick.yml"), "utf8"), { TASK_SLUG: slug }));
  output(options.json ? JSON.stringify({ provider, task: slug, path: rel(cwd, destination) }) : `${brand()} / CI
\u2713 GitHub Actions workflow: ${rel(cwd, destination)}`);
}
async function draftPr(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const task = await readFile12(join16(dir, "TASK.md"), "utf8");
  const evidence = await exists(join16(dir, "EVIDENCE.md")) ? await readFile12(join16(dir, "EVIDENCE.md"), "utf8") : "Verification evidence has not been captured.";
  const findings = await exists(join16(dir, "REVIEW-FINDINGS.md")) ? "Diff review report is available in REVIEW-FINDINGS.md." : "Diff review has not been run.";
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || "See TASK.md.", path = join16(dir, "PR-DRAFT.md");
  await writeFile6(path, `# PR Draft \u2014 ${slug}

## Summary
${goal}

## Workflow
Preset: ${preset.name}

## Verification
${evidence.includes("## PASS") ? "Automated verification evidence captured in EVIDENCE.md." : evidence}

## Review
${findings}

## Risks / rollback
See TASK.md and PLAN.md.

## Human Review
- [ ] Scope, behavior, tests, and security-sensitive decisions reviewed.
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path) }) : `${brand()} / PR
\u2713 draft: ${rel(cwd, path)}`);
}
var deliveryCommands = [
  { id: "learn", description: "Capture a proposed reusable engineering rule.", aliases: [], usage: "learn <task> --rule <text>", run: ({ cwd, arg, options }) => learn(cwd, arg, options) },
  { id: "handoff", description: "Create a task handoff with remaining gates.", aliases: [], usage: "handoff <task> --to <owner>", run: ({ cwd, arg, options }) => handoff(cwd, arg, options) },
  { id: "adapter", description: "List or install an AI adapter.", aliases: [], usage: "adapter list|install <name>", run: ({ cwd, arg, third, options }) => adapter(cwd, arg, third, options) },
  { id: "ci", description: "Generate a GitHub Actions task gate.", aliases: [], usage: "ci github <task>", run: ({ cwd, arg, third, options }) => ci(cwd, arg, third, options) },
  { id: "pr", description: "Generate an evidence-backed PR draft.", aliases: [], usage: "pr <task>", run: ({ cwd, arg, options }) => draftPr(cwd, arg, options) }
];

// src/commands/flow.js
import { readdir as readdir10 } from "fs/promises";
import { join as join19 } from "path";

// src/flows/engine.js
import { mkdir as mkdir7, readFile as readFile14, writeFile as writeFile7 } from "fs/promises";
import { join as join18 } from "path";

// src/flows/model.js
import { readdir as readdir9, readFile as readFile13 } from "fs/promises";
import { basename as basename2, join as join17 } from "path";
import { parse as parseYaml2 } from "yaml";
import { z as z5 } from "zod";
var MAVERICK_GATES = ["validate", "verify", "guard", "security", "deps", "policy", "review", "readiness"];
var TERMINAL = ["stalled", "exhausted"];
var id = z5.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "use a lowercase kebab-case id");
var base = { id, description: z5.string().optional(), severity: z5.enum(["block", "warn"]).default("block") };
var gate = z5.discriminatedUnion("type", [
  z5.object({ ...base, type: z5.literal("check"), kinds: z5.array(z5.enum(CHECK_KINDS)).optional() }),
  z5.object({ ...base, type: z5.literal("maverick"), run: z5.enum(MAVERICK_GATES) }),
  z5.object({ ...base, type: z5.literal("command"), run: z5.string().min(1), cwd: z5.string().optional() }),
  z5.object({ ...base, type: z5.literal("artifact"), file: z5.string().min(1), sections: z5.array(z5.string()).default([]), pattern: z5.string().optional(), noPlaceholders: z5.boolean().default(false) }),
  // An approval is recorded with `maverick flow approve`, or found in a task file (e.g. a checked box in REVIEW.md).
  z5.object({ ...base, type: z5.literal("approval"), prompt: z5.string().min(1), file: z5.string().optional(), pattern: z5.string().optional() })
]);
var flowSchema = z5.object({
  apiVersion: z5.literal("maverick.flow/v1"),
  name: id,
  description: z5.string().min(10),
  contract: z5.object({
    goal: z5.string().min(1),
    iterationCap: z5.number().int().min(1).max(20).default(3),
    noProgressWindow: z5.number().int().min(2).max(10).default(2)
  }),
  gates: z5.array(gate).min(1)
}).superRefine((flow, ctx) => {
  const seen = /* @__PURE__ */ new Set();
  flow.gates.forEach((item, index) => {
    if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: ["gates", index, "id"], message: `duplicate gate id "${item.id}"` });
    seen.add(item.id);
  });
});
function formatIssues3(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
async function loadFlowFile(path, source) {
  const text = await readFile13(path, "utf8");
  let data;
  try {
    data = parseYaml2(text);
  } catch (error) {
    throw new Error(`${path}: invalid YAML (${error.message})`);
  }
  const parsed = flowSchema.safeParse(data);
  if (!parsed.success) throw new Error(`${path}: ${formatIssues3(parsed.error)}`);
  if (parsed.data.name !== basename2(path).replace(/\.ya?ml$/, "")) throw new Error(`${path}: name "${parsed.data.name}" must match the file name`);
  return { ...parsed.data, source, path, integrity: sha256(text) };
}
async function loadFlows(cwd) {
  const flows = /* @__PURE__ */ new Map(), errors = [];
  for (const [source, dir] of [["project", join17(cwd, ".maverick", "flows")], ["built-in", join17(packageRoot, "flows")]]) {
    for (const file of (await readdir9(dir).catch(() => [])).filter((name2) => /\.ya?ml$/.test(name2)).sort()) {
      try {
        const flow = await loadFlowFile(join17(dir, file), source);
        if (!flows.has(flow.name)) flows.set(flow.name, flow);
      } catch (error) {
        errors.push({ source, file, message: error.message.replace(`${join17(dir, file)}: `, "") });
      }
    }
  }
  return { flows: [...flows.values()], errors };
}
async function findFlow(cwd, name2) {
  const { flows, errors } = await loadFlows(cwd);
  const flow = flows.find((item) => item.name === name2);
  if (flow) return flow;
  const broken = errors.find((error) => error.file.replace(/\.ya?ml$/, "") === name2);
  if (broken) throw new Error(`flow ${name2} is invalid: ${broken.message}`);
  throw new Error(`flow not found: ${name2 || "(none)"}; available: ${flows.map((item) => item.name).join(", ") || "none"}`);
}
function interpolate(text, vars) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => vars[key] ?? match);
}

// src/flows/engine.js
function parseJson2(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
  }
  const start = text.indexOf("{");
  try {
    return start >= 0 ? JSON.parse(text.slice(start)) : null;
  } catch {
    return null;
  }
}
var MAVERICK_RESULTS = {
  validate: (json2) => ({ pass: json2.valid, issues: json2.results.filter((item) => item.status === "FAIL").map((item) => `${item.file}: ${item.message}`) }),
  verify: (json2) => ({ pass: json2.ok, issues: json2.results.filter((item) => !item.ok).map((item) => `failed: ${item.command}`) }),
  guard: (json2) => ({ pass: json2.ok, issues: json2.findings }),
  security: (json2) => ({ pass: !json2.findings.length, issues: json2.findings }),
  deps: (json2) => ({ pass: true, issues: [], summary: `${json2.manifests.length} manifest(s), ${json2.lockfiles.length} lockfile(s) changed` }),
  policy: (json2) => ({ pass: json2.ok, issues: json2.findings }),
  review: (json2) => ({ pass: !json2.findings.length, issues: json2.findings }),
  readiness: (json2) => ({ pass: json2.ready, issues: json2.missing.map((item) => `missing: ${item}`) })
};
async function runChecks(context, gate2) {
  const [config, map] = await Promise.all([loadConfig(context.cwd), inspectProject(context.cwd)]);
  let commands2 = selectVerificationCommands(map.stack, config);
  if (gate2.kinds) commands2 = commands2.filter((item) => gate2.kinds.includes(item.kind) || item.kind === "custom");
  if (!commands2.length) return { pass: false, issues: [`no ${gate2.kinds?.join("/") || "verification"} commands detected; declare verification.commands in .maverick/config.json`] };
  const results = [];
  for (const item of commands2) results.push(await executeCommand(context.cwd, item.command, item.cwd));
  await writeEvidence(context.taskDir, context.task, results);
  return { pass: results.every((result) => result.ok), issues: results.filter((result) => !result.ok).map((result) => `failed: ${result.command}`), summary: `${results.filter((result) => result.ok).length}/${results.length} command(s) passed; evidence in EVIDENCE.md` };
}
async function runArtifact(context, gate2) {
  const file = interpolate(gate2.file, { task: context.task });
  if (file.split(/[\\/]/).includes("..")) return { pass: false, issues: [`artifact path must stay inside the task: ${file}`] };
  const path = join18(context.taskDir, file);
  if (!await exists(path)) return { pass: false, issues: [`missing ${file}`] };
  const text = await readFile14(path, "utf8"), issues2 = [];
  for (const section of gate2.sections) if (!sectionPresent(text, section)) issues2.push(`${file}: missing section "${section}"`);
  if (gate2.pattern && !new RegExp(gate2.pattern, "m").test(text)) issues2.push(`${file}: ${gate2.description || `expected /${gate2.pattern}/`}`);
  if (gate2.noPlaceholders && !hasMeaningfulContent(text)) issues2.push(`${file}: placeholders remain`);
  return { pass: !issues2.length, issues: issues2 };
}
async function evaluateGate(context, gate2, state) {
  const base2 = { id: gate2.id, type: gate2.type, severity: gate2.severity, description: gate2.description };
  try {
    if (gate2.type === "approval") {
      const approval = state.approvals?.[gate2.id];
      if (!approval && gate2.file && gate2.pattern) {
        const recorded = await runArtifact(context, { file: gate2.file, sections: [], pattern: gate2.pattern });
        if (recorded.pass) return { ...base2, status: "pass", issues: [], summary: `recorded in ${gate2.file}` };
      }
      if (!approval) return { ...base2, status: "pending", issues: [`awaiting approval: ${gate2.prompt}`], summary: `${gate2.file ? `record it in ${gate2.file} or run` : "run"} maverick flow approve ${context.flow} ${context.task} ${gate2.id}` };
      return { ...base2, status: approval.decision === "approve" ? "pass" : "fail", issues: approval.decision === "approve" ? [] : [`rejected by ${approval.by}: ${approval.reason || "no reason given"}`], summary: `${approval.decision} by ${approval.by}` };
    }
    let result;
    if (gate2.type === "check") result = await runChecks(context, gate2);
    else if (gate2.type === "artifact") result = await runArtifact(context, gate2);
    else if (gate2.type === "command") {
      const command = interpolate(gate2.run, { task: context.task });
      const run2 = await executeCommand(context.cwd, command, gate2.cwd || "");
      result = { pass: run2.ok, issues: run2.ok ? [] : [`${command} exited ${run2.code ?? "before starting"}`], summary: run2.output.trim().split("\n").slice(-3).join(" | ").slice(0, 300) };
    } else {
      const args = [gate2.run, context.task, "--json", ...gate2.run === "review" ? ["--diff"] : []];
      let captured;
      try {
        captured = (await captureOutput(() => context.invoke(args))).output;
      } catch (error) {
        captured = error.output;
        const json2 = parseJson2(captured);
        if (!json2) return { ...base2, status: "fail", issues: [error.message] };
      }
      result = MAVERICK_RESULTS[gate2.run](parseJson2(captured));
    }
    return { ...base2, status: result.pass ? "pass" : "fail", issues: result.issues || [], summary: result.summary };
  } catch (error) {
    return { ...base2, status: "fail", issues: [`gate error: ${error.message}`] };
  }
}
var issueKey = (results) => results.filter((result) => result.severity === "block" && result.status === "fail").flatMap((result) => result.issues.map((issue) => `${result.id}: ${issue}`)).sort().join("\n");
function decideOutcome(results, history, contract) {
  const blocking = results.filter((result) => result.severity === "block");
  const failed = blocking.filter((result) => result.status === "fail"), pending2 = blocking.filter((result) => result.status === "pending");
  if (!failed.length) return { outcome: pending2.length ? "awaiting-approval" : "done", iteration: history.filter((run2) => run2.outcome === "revise").length };
  const failedRuns = history.filter((run2) => ["revise", "stalled", "exhausted"].includes(run2.outcome));
  const iteration = failedRuns.length + 1, key = issueKey(results);
  const recent = failedRuns.slice(-(contract.noProgressWindow - 1));
  if (recent.length === contract.noProgressWindow - 1 && recent.every((run2) => run2.issueKey === key)) return { outcome: "stalled", iteration, issueKey: key };
  if (iteration >= contract.iterationCap) return { outcome: "exhausted", iteration, issueKey: key };
  return { outcome: "revise", iteration, issueKey: key };
}
function statePath(taskDir, flow) {
  return join18(taskDir, "flows", `${flow}.json`);
}
async function readState(taskDir, flow) {
  const path = statePath(taskDir, flow);
  if (!await exists(path)) return { flow, runs: [], approvals: {} };
  return JSON.parse(await readFile14(path, "utf8"));
}
async function writeState(taskDir, state) {
  await mkdir7(join18(taskDir, "flows"), { recursive: true });
  await writeFile7(statePath(taskDir, state.flow), pretty(state));
}
var NEXT_STEP = {
  done: "All blocking gates pass. Hand the change to a human for the merge decision.",
  revise: "Fix the blocking issues below without widening scope, then run the flow again.",
  "awaiting-approval": "Blocking checks pass; a human must record the pending approval(s).",
  stalled: "The same blocking issues repeated with no progress. Stop and ask a human; rerun only with --reset after they decide.",
  exhausted: "The iteration cap was reached. Stop and ask a human; rerun only with --reset after they decide."
};
function renderReport(flow, task, run2, contract) {
  const icon = { pass: "\u2713", fail: "\u2717", pending: "\u2026" };
  const gates = run2.results.map((result) => `- ${icon[result.status]} **${result.id}** (${result.type}${result.severity === "warn" ? ", warn" : ""}) \u2014 ${result.status}${result.summary ? `: ${result.summary}` : ""}${result.issues.length ? `
${result.issues.map((issue) => `  - ${issue}`).join("\n")}` : ""}`).join("\n");
  return `# Flow ${flow.name} \u2014 ${task}

Goal: ${interpolate(contract.goal, { task })}

Outcome: **${run2.outcome.toUpperCase()}** (failed iteration ${run2.iteration}/${contract.iterationCap}, no-progress window ${contract.noProgressWindow})
Run: ${run2.at}

## Next step
${NEXT_STEP[run2.outcome]}

## Gates
${gates}
`;
}
async function runFlow(context, flow, { reset = false } = {}) {
  let state = await readState(context.taskDir, flow.name);
  const notes = [];
  if (state.integrity && state.integrity !== flow.integrity) {
    notes.push("flow definition changed since the last run; history was reset");
    state = { ...state, runs: [] };
  }
  const last = state.runs.at(-1);
  if (reset) {
    if (state.runs.length) notes.push("history reset by request");
    state = { ...state, runs: [], approvals: {} };
  } else if (last && TERMINAL.includes(last.outcome)) throw new Error(`flow ${flow.name} is ${last.outcome} for ${context.task}; a human must decide next steps, then rerun with --reset`);
  else if (last?.outcome === "done") state = { ...state, runs: [] };
  const results = [];
  for (const gate2 of flow.gates) results.push(await evaluateGate({ ...context, flow: flow.name }, gate2, state));
  const decision = decideOutcome(results, state.runs, flow.contract);
  const run2 = { at: (/* @__PURE__ */ new Date()).toISOString(), ...decision, results };
  state = { ...state, flow: flow.name, integrity: flow.integrity, runs: [...state.runs, run2], status: run2.outcome };
  await writeState(context.taskDir, state);
  const reportPath = join18(context.taskDir, `FLOW-${flow.name.toUpperCase()}.md`);
  await writeFile7(reportPath, renderReport(flow, context.task, run2, flow.contract));
  return { run: run2, state, notes, reportPath, next: NEXT_STEP[run2.outcome] };
}

// src/commands/flow.js
var ICON = { pass: "PASS", fail: "FAIL", pending: "WAIT" };
function report(cwd, flow, slug, { run: run2, notes, reportPath, next }, options) {
  if (options.json) return;
  output(`${brand()} / FLOW ${flow.name.toUpperCase()}
Goal: ${interpolate(flow.contract.goal, { task: slug })}
`);
  notes.forEach((note) => output(`NOTE ${note}`));
  for (const result of run2.results) {
    output(`${ICON[result.status]} ${result.id}${result.severity === "warn" ? " (warn)" : ""}${result.summary ? ` \u2014 ${result.summary}` : ""}`);
    result.issues.forEach((issue) => output(`     ${issue}`));
  }
  output(`
Outcome: ${run2.outcome.toUpperCase()} (failed iteration ${run2.iteration}/${flow.contract.iterationCap})
${next}
Report: ${rel(cwd, reportPath)}`);
}
async function afterFlowHook(cwd, config, flow, slug, { run: run2 }) {
  const hooks = await runHooks(cwd, config, "after-flow-run", { task: slug, flow: flow.name, outcome: run2.outcome, iteration: run2.iteration });
  hooks.warnings.forEach((warning) => output(`WARN ${warning}`));
}
async function flowCommand(cwd, [action, ...args], options = {}) {
  if (!action || action === "list") {
    const { flows, errors } = await loadFlows(cwd);
    if (options.json) return output(JSON.stringify({ flows: flows.map(({ name: name2, description, source, contract, gates }) => ({ name: name2, description, source, contract, gates: gates.map((gate2) => gate2.id) })), errors }, null, 2));
    return output(`${brand()} / FLOWS

${flows.map((flow) => `${flow.name.padEnd(14)}${flow.description} [${flow.source}]`).join("\n") || "No flows found."}${errors.length ? `

${errors.length} invalid flow(s); run maverick flow validate` : ""}

Run with: maverick flow run <flow> <task>`);
  }
  if (action === "validate") {
    const { flows, errors } = await loadFlows(cwd);
    if (options.json) output(JSON.stringify({ valid: !errors.length, flows: flows.length, errors }, null, 2));
    else {
      output(`${brand()} / FLOW VALIDATE
${flows.length} valid flow(s)`);
      errors.forEach((error) => output(`FAIL ${error.file} [${error.source}]: ${error.message}`));
    }
    if (errors.length) throw new Error(`${errors.length} invalid flow(s)`);
    return;
  }
  if (action === "show") {
    const flow = await findFlow(cwd, args[0]);
    if (options.json) return output(JSON.stringify(flow, null, 2));
    return output(`${brand()} / FLOW

${flow.name} [${flow.source}]
${flow.description}

Goal: ${flow.contract.goal}
Iteration cap: ${flow.contract.iterationCap} \xB7 no-progress window: ${flow.contract.noProgressWindow}

Gates:
${flow.gates.map((gate2) => `  ${gate2.id.padEnd(14)}${gate2.type}${gate2.run ? `:${gate2.run}` : ""}${gate2.severity === "warn" ? " (warn)" : ""}${gate2.description ? ` \u2014 ${gate2.description}` : ""}`).join("\n")}`);
  }
  if (action === "run") {
    const [name2, slug] = args, flow = await findFlow(cwd, name2), { dir } = await getTask(cwd, slug), config = await loadConfig(cwd);
    const invoke = async (argv) => (await import("./cli-XXWE434X.js")).main(argv, cwd);
    const agentRuns = [];
    let result = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow, { reset: Boolean(options.reset) });
    report(cwd, flow, slug, result, options);
    await afterFlowHook(cwd, config, flow, slug, result);
    while (options.agent && result.run.outcome === "revise") {
      const issues2 = result.run.results.filter((item) => item.severity === "block" && item.status === "fail").flatMap((item) => item.issues.map((issue) => `${item.id}: ${issue}`));
      if (!options.json) output(`
${brand()} / AGENT FIX (iteration ${result.run.iteration}/${flow.contract.iterationCap})`);
      const { run: agent } = await startAgentRun(cwd, { slug, dir, config, issues: issues2, instruction: `Fix the blocking issues so the "${flow.name}" flow passes. Goal: ${interpolate(flow.contract.goal, { task: slug })}`, options, onEvent: printer(options) });
      agentRuns.push({ ok: agent.ok, status: agent.result?.status || null, summary: agent.result?.summary || null, transcript: rel(cwd, agent.transcript) });
      if (!agent.ok) throw new Error(`agent fix run failed: ${agent.problems.join("; ")}`);
      if (agent.result && agent.result.status !== "done") {
        if (options.json) output(JSON.stringify({ flow: flow.name, task: slug, outcome: result.run.outcome, agentRuns, questions: agent.result.questions }, null, 2));
        else {
          output(`
The agent stopped: ${agent.result.status}. ${agent.result.summary}`);
          agent.result.questions.forEach((question) => output(`? ${question}`));
        }
        throw new Error(`agent needs a human: ${agent.result.status}`);
      }
      result = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow);
      report(cwd, flow, slug, result, options);
      await afterFlowHook(cwd, config, flow, slug, result);
    }
    if (options.json) output(JSON.stringify({ flow: flow.name, task: slug, outcome: result.run.outcome, iteration: result.run.iteration, iterationCap: flow.contract.iterationCap, next: result.next, notes: result.notes, report: rel(cwd, result.reportPath), gates: result.run.results, agentRuns }, null, 2));
    if (result.run.outcome !== "done") throw new Error(`flow ${flow.name} outcome: ${result.run.outcome}`);
    return;
  }
  if (action === "status") {
    const [slug] = args, { dir } = await getTask(cwd, slug);
    const files = (await readdir10(join19(dir, "flows")).catch(() => [])).filter((file) => file.endsWith(".json"));
    const states = await Promise.all(files.map((file) => readState(dir, file.replace(/\.json$/, ""))));
    const summary = states.map((state) => ({ flow: state.flow, status: state.status || "not run", runs: state.runs.length, lastRun: state.runs.at(-1)?.at, approvals: state.approvals }));
    if (options.json) return output(JSON.stringify(summary, null, 2));
    return output(summary.length ? summary.map((item) => `${item.flow.padEnd(14)}${item.status.padEnd(18)}${item.runs} run(s)${item.lastRun ? `, last ${item.lastRun}` : ""}`).join("\n") : `No flows have run for ${slug}. Try: maverick flow run ship ${slug}`);
  }
  if (action === "approve") {
    const [name2, slug, gateId] = args, flow = await findFlow(cwd, name2), { dir } = await getTask(cwd, slug);
    const gate2 = flow.gates.find((item) => item.id === gateId);
    if (!gate2 || gate2.type !== "approval") throw new Error(`${flow.name} has no approval gate "${gateId || ""}"; approval gates: ${flow.gates.filter((item) => item.type === "approval").map((item) => item.id).join(", ") || "none"}`);
    if (options.reject && (!options.reason || options.reason === true)) throw new Error('explain the rejection with --reason "..."');
    const state = await readState(dir, flow.name);
    const approval = { decision: options.reject ? "reject" : "approve", by: typeof options.by === "string" ? options.by : process.env.USER || "human", at: (/* @__PURE__ */ new Date()).toISOString(), ...typeof options.reason === "string" && { reason: options.reason } };
    await writeState(dir, { ...state, flow: flow.name, approvals: { ...state.approvals, [gate2.id]: approval } });
    return output(options.json ? JSON.stringify(approval) : `${brand()} / FLOW APPROVAL
\u2713 ${gate2.id}: ${approval.decision} by ${approval.by}
Run maverick flow run ${flow.name} ${slug} to re-evaluate.`);
  }
  throw new Error("use flow list, flow show <flow>, flow validate, flow run <flow> <task>, flow status <task>, or flow approve <flow> <task> <gate>");
}
async function subtaskCommand(cwd, [action, slug, ...args], options = {}) {
  const actions = ["add", "list", "next", "set", "validate"];
  if (!actions.includes(action)) throw new Error(`use subtask ${actions.join("|")} <task> ...`);
  const { dir } = await getTask(cwd, slug);
  if (action === "add") {
    const title = args.join(" ").trim();
    if (!title) throw new Error('give the subtask a title, for example: maverick subtask add my-task "Add pagination to the API"');
    const after = typeof options.after === "string" ? options.after.split(",").map((value) => value.trim().padStart(2, "0")).filter(Boolean) : [];
    const created = await addSubtask(dir, slug, { title, after, type: typeof options.type === "string" ? options.type : void 0, complexity: typeof options.complexity === "string" ? options.complexity : void 0 });
    return output(options.json ? JSON.stringify(created) : `${brand()} / SUBTASK
\u2713 ${created.id}: ${title}${after.length ? ` (after ${after.join(", ")})` : ""}
File: ${rel(cwd, join19(dir, "subtasks", created.file))}`);
  }
  if (action === "set") {
    const [id2, status2] = args;
    const item = await setStatus(dir, slug, (id2 || "").padStart(2, "0"), status2);
    return output(options.json ? JSON.stringify({ id: item.id, status: item.status }) : `\u2713 ${item.id} ${item.title}: ${item.status}`);
  }
  const graph = await loadGraph(dir);
  if (action === "validate") {
    if (options.json) output(JSON.stringify({ valid: !graph.problems.length, subtasks: graph.items.length, problems: graph.problems }, null, 2));
    else {
      output(`${brand()} / SUBTASK VALIDATE
${graph.items.length} subtask(s)`);
      graph.problems.forEach((problem) => output(`FAIL ${problem}`));
      if (!graph.problems.length) output("PASS the subtask graph is valid and acyclic");
    }
    if (graph.problems.length) throw new Error(`${graph.problems.length} subtask graph problem(s)`);
    return;
  }
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  if (action === "next") {
    const ready = graph.items.filter((item) => item.ready), inProgress = graph.items.filter((item) => item.status === "in-progress");
    const allDone = graph.items.length > 0 && graph.items.every((item) => item.status === "done");
    if (options.json) return output(JSON.stringify({ inProgress: inProgress.map(({ body: _body, ...item }) => item), ready: ready.map(({ body: _body, ...item }) => item), allDone }, null, 2));
    if (!graph.items.length) return output(`No subtasks yet. Add one with: maverick subtask add ${slug} "<title>"`);
    if (allDone) return output("All subtasks are done.");
    const lines = [...inProgress.map((item) => `IN PROGRESS ${item.id} ${item.title}`), ...ready.map((item) => `READY       ${item.id} ${item.title}${item.type ? ` [${item.type}]` : ""}`)];
    return output(lines.join("\n") || "Nothing is ready: remaining subtasks are blocked or waiting on dependencies.");
  }
  const counts = Object.fromEntries(STATUSES.map((status2) => [status2, graph.items.filter((item) => item.status === status2).length]));
  if (options.json) return output(JSON.stringify({ counts, items: graph.items.map(({ body: _body, ...item }) => item) }, null, 2));
  if (!graph.items.length) return output(`No subtasks yet. Add one with: maverick subtask add ${slug} "<title>"`);
  output(`${brand()} / SUBTASKS ${slug}

${graph.items.map((item) => `${item.id}  ${item.status.padEnd(12)}${item.ready ? "\u25B6 " : "  "}${item.title}${item.dependsOn.length ? `  (after ${item.dependsOn.join(", ")})` : ""}${item.type ? ` [${item.type}]` : ""}`).join("\n")}

${counts.done}/${graph.items.length} done \xB7 \u25B6 ready to start`);
}
var flowCommands = [
  { id: "flow", description: "Run contract-driven flows with typed gates, iteration caps, and stall detection.", aliases: [], usage: "flow list|show|validate|run <flow> <task>|status <task>|approve", run: ({ cwd, rest, options }) => flowCommand(cwd, rest, options) },
  { id: "subtask", description: "Break a task into a dependency graph of subtasks.", aliases: [], usage: "subtask add|list|next|set|validate <task>", run: ({ cwd, rest, options }) => subtaskCommand(cwd, rest, options) }
];

// src/commands/gates.js
import { mkdir as mkdir9, readFile as readFile16, writeFile as writeFile9 } from "fs/promises";
import { join as join21 } from "path";

// src/commands/task.js
import { mkdir as mkdir8, readFile as readFile15, writeFile as writeFile8 } from "fs/promises";
import { join as join20 } from "path";
async function createTask(cwd, slug, options = {}) {
  const config = await loadConfig(cwd), preset = requirePreset(options.preset || config.workflow.defaultPreset || "standard"), dir = taskPath(cwd, config, slug);
  if (await exists(dir)) throw new Error(`task already exists: ${rel(cwd, dir)}; choose another slug or remove it deliberately`);
  await mkdir8(dir, { recursive: true });
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), artifacts = [...preset.artifacts];
  if ((options.riskDoc || config.workflow.riskDocumentation) && preset.strict) artifacts.push({ id: "RISK", file: "RISK.md", template: "risk.md", sections: ["Risk Assessment", "Mitigations", "Rollback", "Approval"] });
  for (const item of artifacts) await writeFile8(join20(dir, item.file), replaceVars(await readFile15(join20(packageRoot, "templates", item.template), "utf8"), { TASK_SLUG: slug, DATE: today }));
  await writeFile8(join20(dir, "TASK.json"), pretty({ preset: preset.id, createdAt: today }));
  output(`${brand()}
\u2713 task created: ${rel(cwd, dir)}
Preset: ${preset.name}
Stages: ${preset.stages.map((s) => s.toUpperCase()).join(" \u2192 ")}`);
}
async function showArtifact(cwd, slug, filename, label) {
  const { dir } = await getTask(cwd, slug), path = join20(dir, filename);
  output(`${label}: ${rel(cwd, path)}${await exists(path) ? "" : " (not included by this preset)"}`);
}
async function taskPacket(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const mapPath = join20(cwd, ".maverick", "context", "PROJECT_MAP.md"), contents = [];
  for (const file of ["SPEC.md", "TASK.md", "CONTEXT.md", "PLAN.md"]) if (await exists(join20(dir, file))) contents.push(`## ${file}

${await readFile15(join20(dir, file), "utf8")}`);
  if (await exists(mapPath)) contents.unshift(`## PROJECT_MAP.md

${await readFile15(mapPath, "utf8")}`);
  const path = join20(dir, "TASK-PACKET.md");
  await writeFile8(path, `# Maverick Task Packet

Preset: ${preset.name}
Agent: ${options.agent || "generic"}

Follow repository instructions, stay in scope, run relevant verification, and leave findings for human review.

${contents.join("\n\n")}`);
  output(options.json ? JSON.stringify({ preset: preset.id, agent: options.agent || "generic", path: rel(cwd, path) }) : `${brand()} / PACKET
\u2713 agent packet: ${rel(cwd, path)}
Agent: ${options.agent || "generic"}`);
}
function validatorArtifacts(preset, riskDoc) {
  const items = preset.artifacts.map((item) => ({
    ...item,
    sections: preset.strict && item.id === "TASK" ? [...item.sections, "Risk", "Expected Changed Files", "Actual Changed Files"] : preset.strict && item.id === "PLAN" ? [...item.sections, "Rollback"] : preset.strict && item.id === "REVIEW" ? ["Scope", "Behavior", "Tests", "Security", "Reliability", "Observability", "Dependencies", "Rollback", "Maintainability", "Final Decision"] : item.sections
  }));
  return riskDoc ? [...items, { id: "RISK", file: "RISK.md", sections: ["Risk Assessment", "Mitigations", "Rollback", "Approval"] }] : items;
}
async function validate(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  let errors = 0, warnings = 0;
  const results = [];
  for (const item of validatorArtifacts(preset, await exists(join20(dir, "RISK.md")))) {
    const path = join20(dir, item.file);
    if (!await exists(path)) {
      results.push({ file: item.file, status: "FAIL", message: "missing" });
      errors++;
      continue;
    }
    const text = await readFile15(path, "utf8");
    for (const section of item.sections) if (!sectionPresent(text, section)) {
      results.push({ file: item.file, status: "FAIL", message: `missing section "${section}"` });
      errors++;
    }
    if (!hasMeaningfulContent(text)) {
      results.push({ file: item.file, status: "WARN", message: "placeholders remain" });
      warnings++;
    }
  }
  if (options.json) output(JSON.stringify({ preset: preset.id, stages: preset.stages, valid: !errors, errors, warnings, results }, null, 2));
  else {
    output(`${brand()} / VALIDATE
Preset: ${preset.name}`);
    results.forEach((r) => output(`${r.status} ${r.file}: ${r.message}`));
    if (!errors) output(`PASS required artefacts and sections are present${warnings ? ` (${warnings} warning(s))` : ""}.`);
  }
  if (errors) throw new Error(`${errors} validation error(s)`);
}
function showPresets(id2) {
  if (id2) {
    const p = requirePreset(id2);
    return output(`${brand()} / PRESET

Preset:
${p.name}

Artifacts:
${p.artifacts.map((a) => a.id).join("\n")}

Stages:
${p.stages.map((s) => s.toUpperCase()).join(" \u2192 ")}

Best for:
${p.bestFor}`);
  }
  output(`${brand()} / PRESETS

${Object.values(presets).map((p) => `${p.id.toUpperCase()}
${p.description}`).join("\n\n")}`);
}
function suggest(options = {}) {
  const rec = recommendPreset(options);
  output(options.json ? JSON.stringify(rec) : `Recommended preset: ${getPreset(rec.preset).name}
Reason: ${rec.reason}`);
}
var taskCommands = [
  { id: "task", description: "Create preset-driven task artifacts.", aliases: ["create"], usage: "task <slug> --preset <preset>", run: ({ cwd, arg, options }) => createTask(cwd, arg, options) },
  { id: "packet", description: "Compile a focused agent packet.", aliases: ["run"], usage: "packet <task> --agent <name>", run: ({ cwd, arg, options }) => taskPacket(cwd, arg, options) },
  { id: "presets", description: "List or inspect workflow presets.", aliases: [], usage: "presets [show <preset>]", run: ({ arg, third }) => showPresets(arg === "show" ? third : void 0) },
  { id: "suggest", description: "Recommend a preset from local rules.", aliases: [], usage: "suggest [--risk high]", run: ({ options }) => suggest(options) },
  { id: "validate", description: "Validate task artifacts and required sections.", aliases: [], usage: "validate <task> [--json]", run: ({ cwd, arg, options }) => validate(cwd, arg, options) },
  { id: "context", description: "Show a task context artifact.", aliases: [], usage: "context <task>", run: ({ cwd, arg }) => showArtifact(cwd, arg, "CONTEXT.md", "Context") },
  { id: "plan", description: "Show a task plan artifact.", aliases: [], usage: "plan <task>", run: ({ cwd, arg }) => showArtifact(cwd, arg, "PLAN.md", "Plan") }
];

// src/commands/gates.js
var LOCKFILE = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|uv\.lock|pdm\.lock|Pipfile\.lock|requirements[\w.-]*\.txt|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock|mix\.lock|pubspec\.lock|packages\.lock\.json|gradle\.lockfile|Package\.resolved)$/;
var MANIFEST2 = /(?:^|\/)(?:package\.json|pyproject\.toml|Pipfile|setup\.py|setup\.cfg|go\.mod|Cargo\.toml|Gemfile|composer\.json|mix\.exs|pubspec\.yaml|pom\.xml|build\.gradle(?:\.kts)?|[^/]+\.(?:csproj|fsproj|vbproj)|Directory\.Packages\.props|Package\.swift)$/;
async function verifyTask(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const map = await inspectProject(cwd);
  const selected = selectVerificationCommands(map.stack, config);
  if (!selected.length) throw new Error("no verification commands detected; run maverick stack, or declare verification.commands in .maverick/config.json");
  const results = [];
  for (const item of selected) results.push(await executeCommand(cwd, item.command, item.cwd));
  const evidence = await writeEvidence(dir, slug, results);
  const payload = { ok: results.every((result) => result.ok), results: results.map((result, index) => ({ command: result.command, kind: selected[index].kind, source: selected[index].source, ok: result.ok, code: result.code })), evidence: rel(cwd, evidence) };
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    output(`${brand()} / VERIFY`);
    results.forEach((result) => output(`${result.ok ? "PASS" : "FAIL"} ${result.command}`));
    output(`Evidence: ${payload.evidence}`);
  }
  if (!payload.ok) throw new Error("verification failed");
}
async function reviewDiff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || "HEAD"), files = changedFilesFromDiff(diff), findings = [];
  if (!diff) findings.push("No git diff found against the selected base.");
  if (files.some((file) => /(^|\/)(\.env|secrets?|credentials?)/i.test(file))) findings.push("Security: sensitive-looking path changed; confirm secrets and PII were not included.");
  if (files.some((file) => LOCKFILE.test(file))) findings.push("Dependencies: lockfile changed; review new packages, licenses, and vulnerabilities.");
  if (preset.strict && !await exists(join21(dir, "EVIDENCE.md"))) findings.push("Strict Review: test evidence is missing; run maverick verify first.");
  const graph = files.length ? await buildGraph(cwd) : null;
  const radius = graph ? files.map((file) => ({ file, ...impactOf(graph, file) })).filter((item) => item.known && item.dependents.length).sort((a, b) => b.dependents.length - a.dependents.length) : [];
  const path = join21(dir, "REVIEW-FINDINGS.md");
  await writeFile9(path, `# Diff Review Findings \u2014 ${slug}

Base: ${options.against || "HEAD"}
Changed files:
${files.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Findings
${findings.map((finding) => `- ${finding}`).join("\n") || "- No automated findings. Complete the human review in REVIEW.md."}

## Blast radius
${radius.map((item) => `- \`${item.file}\`: ${item.direct.length} direct / ${item.dependents.length} transitive dependents; tests: ${item.tests.slice(0, 5).map((test) => `\`${test}\``).join(", ") || "none"}`).join("\n") || "- Changed files have no local dependents."}
`);
  output(options.json ? JSON.stringify({ files, findings, path: rel(cwd, path) }, null, 2) : `${brand()} / REVIEW
Changed files: ${files.length}
Findings: ${findings.length}
Report: ${rel(cwd, path)}`);
}
async function checkpoint(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const [status2, diff] = await Promise.all([executeCommand(cwd, "git status --short"), gitDiff(cwd, options.against || "HEAD")]);
  const path = join21(dir, "CHECKPOINT.md");
  await writeFile9(path, `# Checkpoint \u2014 ${slug}

Created: ${(/* @__PURE__ */ new Date()).toISOString()}
Base: ${options.against || "HEAD"}

## Git status
\`\`\`text
${status2.output || "(unavailable)"}
\`\`\`

## Diff
\`\`\`diff
${diff || "(no diff available)"}
\`\`\`
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), gitAvailable: status2.ok }) : `${brand()} / CHECKPOINT
\u2713 saved: ${rel(cwd, path)}`);
}
async function impact(cwd, path, options = {}) {
  if (!path || path.includes("..")) throw new Error("provide a project-relative file path");
  const target = path.replace(/^\.\//, "");
  const graph = await buildGraph(cwd), result = impactOf(graph, target);
  const references = result.known ? [] : await findReferences(cwd, target);
  const payload = { path: target, inGraph: result.known, direct: result.direct, dependents: result.dependents, tests: result.tests, references, count: result.known ? result.dependents.length : references.length, truncated: !result.known && references.length === 40 };
  if (options.json) return output(JSON.stringify(payload, null, 2));
  if (!result.known) return output(`${brand()} / IMPACT
Target: ${target} (not a source file in the import graph)
Text references:
${references.map((file) => `- ${file}`).join("\n") || "- none found"}`);
  const production = result.dependents.filter((item) => !item.test);
  output(`${brand()} / IMPACT
Target: ${target}
Direct dependents: ${result.direct.length} \xB7 transitive: ${result.dependents.length} (${result.tests.length} test file(s))

${production.slice(0, 30).map((item) => `${"  ".repeat(Math.min(item.depth - 1, 4))}- ${item.id}${item.depth > 1 ? ` (depth ${item.depth})` : ""}`).join("\n") || "No production file imports it."}${production.length > 30 ? `
\u2026 ${production.length - 30} more` : ""}

Tests to run:
${result.tests.map((file) => `- ${file}`).join("\n") || "- none import it; consider adding one"}`);
}
async function guardScope(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const task = await readFile16(join21(dir, "TASK.md"), "utf8");
  const changed = changedFilesFromDiff(await gitDiff(cwd, options.against || "HEAD"));
  const expected = (task.match(/^## Expected Changed Files\n([\s\S]*?)(?=^## |$)/m)?.[1].match(/`([^`]+)`/g) || []).map((value) => value.slice(1, -1)).filter((value) => !/FILL ME/i.test(value));
  const outsideScope = expected.length ? changed.filter((file) => !expected.includes(file)) : [];
  const maxFiles = config.maxChangedFilesGuideline || 8;
  const findings = [changed.length > maxFiles ? `Change budget exceeded: ${changed.length}/${maxFiles} files.` : null, ...outsideScope.map((file) => `Not listed in Expected Changed Files: ${file}`)].filter(Boolean);
  const report2 = join21(dir, "SCOPE-GUARD.md");
  await writeFile9(report2, `# Scope Guard \u2014 ${slug}

Changed files: ${changed.length}
Expected files: ${expected.length || "not specified"}

## Findings
${findings.map((finding) => `- \u26A0 ${finding}`).join("\n") || "- Within configured scope guard."}
`);
  const payload = { ok: findings.length === 0, changed, expected, findings, path: rel(cwd, report2) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / GUARD
${payload.ok ? "PASS" : "WARN"} ${findings.length} finding(s)
Report: ${payload.path}`);
  if (!payload.ok) throw new Error("scope guard requires human review");
}
async function readiness(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const required = ["EVIDENCE.md", "REVIEW-FINDINGS.md", "SECURITY-REPORT.md", "DEPENDENCY-REVIEW.md", "SCOPE-GUARD.md"];
  if (preset.strict) required.push("CHECKPOINT.md");
  const available = [], missing = [];
  for (const file of required) (await exists(join21(dir, file)) ? available : missing).push(file);
  const review = await exists(join21(dir, "REVIEW.md")) ? await readFile16(join21(dir, "REVIEW.md"), "utf8") : "";
  if (!/- \[[xX]\] (?:approve|approve with follow-up|request changes)/.test(review)) missing.push("Human decision in REVIEW.md");
  const ready = missing.length === 0, path = join21(dir, "MERGE-READINESS.md");
  await writeFile9(path, `# Merge Readiness \u2014 ${slug}

Preset: ${preset.name}
Status: ${ready ? "READY FOR HUMAN MERGE DECISION" : "NOT READY"}

## Available gates
${available.map((file) => `- \u2713 \`${file}\``).join("\n") || "- none"}

## Outstanding gates
${missing.map((file) => `- ! ${file}`).join("\n") || "- none"}

Maverick does not merge code. A human remains accountable for the final decision.
`);
  const payload = { ready, available, missing, path: rel(cwd, path) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / READINESS
${ready ? "READY" : "NOT READY"}
Outstanding gates: ${missing.length}
Report: ${payload.path}`);
  if (!ready) throw new Error("merge readiness gates are incomplete");
}
async function policy(cwd, action, slug, options = {}) {
  const dir = join21(cwd, ".maverick"), path = join21(dir, "policy.json");
  if (action === "init") {
    if (await exists(path)) throw new Error(`policy already exists: ${rel(cwd, path)}`);
    await mkdir9(dir, { recursive: true });
    await writeFile9(path, await readFile16(join21(packageRoot, "templates", "policy.json"), "utf8"));
    return output(`${brand()} / POLICY
\u2713 policy created: ${rel(cwd, path)}`);
  }
  if (!await exists(path)) throw new Error("policy not found; run maverick policy init");
  const rules = await readJson(path);
  if (action === "show") return output(options.json ? JSON.stringify(rules, null, 2) : `${brand()} / POLICY
${pretty(rules)}`);
  if (action !== "check") throw new Error("use policy init, policy show, or policy check <task>");
  const { dir: taskDir, preset } = await getTask(cwd, slug);
  const changed = changedFilesFromDiff(await gitDiff(cwd, options.against || "HEAD"));
  const sensitive = changed.filter((file) => rules.sensitivePaths.some((prefix) => file.includes(prefix)));
  const findings = [];
  if (changed.length > (rules.maxChangedFiles || Infinity)) findings.push(`Changed ${changed.length} files; policy maximum is ${rules.maxChangedFiles}.`);
  if (sensitive.length && preset.id !== rules.requiredPresetForSensitivePaths) findings.push(`Sensitive paths require preset ${rules.requiredPresetForSensitivePaths}: ${sensitive.join(", ")}.`);
  const report2 = join21(taskDir, "POLICY-CHECK.md");
  await writeFile9(report2, `# Policy Check \u2014 ${slug}

Policy: ${rel(cwd, path)}

## Sensitive changed paths
${sensitive.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Findings
${findings.map((finding) => `- \u26A0 ${finding}`).join("\n") || "- Policy satisfied."}
`);
  const payload = { ok: findings.length === 0, changed, sensitive, findings, path: rel(cwd, report2) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / POLICY CHECK
${payload.ok ? "PASS" : "WARN"} ${findings.length} finding(s)
Report: ${payload.path}`);
  if (!payload.ok) throw new Error("policy check requires human review");
}
async function securityScan(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || "HEAD");
  const rules = [
    { name: "Private key material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { name: "Likely cloud/API secret assignment", pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"\s]{12,}/i },
    { name: "Potentially unsafe dynamic execution", pattern: /(?:eval\(|child_process\.exec\(|shell:\s*true)/ }
  ];
  const findings = rules.filter((rule) => rule.pattern.test(diff)).map((rule) => rule.name), path = join21(dir, "SECURITY-REPORT.md");
  await writeFile9(path, `# Security Scan \u2014 ${slug}

Base: ${options.against || "HEAD"}

## Automated signals
${findings.map((finding) => `- \u26A0 ${finding}`).join("\n") || "- No high-signal patterns found in the current diff."}

## Human checks
- [ ] Authorization and trust boundaries reviewed
- [ ] No secrets, PII, or production credentials added
- [ ] New dependencies and network access reviewed
`);
  const payload = { findings, path: rel(cwd, path) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / SECURITY
Signals: ${findings.length}
Report: ${payload.path}`);
  if (findings.length) throw new Error("security signals require human review");
}
async function dependencyReview(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const changed = changedFilesFromDiff(await gitDiff(cwd, options.against || "HEAD"));
  const lockfiles = changed.filter((file) => LOCKFILE.test(file)), manifests = changed.filter((file) => MANIFEST2.test(file));
  const path = join21(dir, "DEPENDENCY-REVIEW.md");
  await writeFile9(path, `# Dependency Review \u2014 ${slug}

## Changed manifests
${manifests.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Changed lockfiles
${lockfiles.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Human checks
- [ ] New packages are necessary and maintained.
- [ ] License and vulnerability impact were reviewed.
- [ ] Lockfile changes match intended manifest changes.
`);
  output(options.json ? JSON.stringify({ manifests, lockfiles, path: rel(cwd, path) }, null, 2) : `${brand()} / DEPENDENCIES
Manifests: ${manifests.length}; lockfiles: ${lockfiles.length}
Report: ${rel(cwd, path)}`);
}
var gateCommands = [
  { id: "checkpoint", description: "Save current Git state and diff.", aliases: [], usage: "checkpoint <task>", run: ({ cwd, arg, options }) => checkpoint(cwd, arg, options) },
  { id: "impact", description: "Find bounded project references to a file.", aliases: [], usage: "impact <path>", run: ({ cwd, arg, options }) => impact(cwd, arg, options) },
  { id: "guard", description: "Compare changed files with declared task scope.", aliases: [], usage: "guard <task>", run: ({ cwd, arg, options }) => guardScope(cwd, arg, options) },
  { id: "readiness", description: "Evaluate merge-readiness gates.", aliases: [], usage: "readiness <task>", run: ({ cwd, arg, options }) => readiness(cwd, arg, options) },
  { id: "policy", description: "Initialize, show, or check repository policy.", aliases: [], usage: "policy init|show|check <task>", run: ({ cwd, arg, third, options }) => policy(cwd, arg, third, options) },
  { id: "verify", description: "Run detected checks for any stack and save evidence.", aliases: [], usage: "verify <task> [--json]", run: ({ cwd, arg, options }) => verifyTask(cwd, arg, options) },
  { id: "security", description: "Scan a changed diff for high-signal security risks.", aliases: [], usage: "security <task>", run: ({ cwd, arg, options }) => securityScan(cwd, arg, options) },
  { id: "deps", description: "Report changed manifests and lockfiles.", aliases: [], usage: "deps <task>", run: ({ cwd, arg, options }) => dependencyReview(cwd, arg, options) },
  { id: "review", description: "Show review or review a diff.", aliases: [], usage: "review <task> --diff", run: ({ cwd, arg, options }) => options.diff ? reviewDiff(cwd, arg, options) : showArtifact(cwd, arg, "REVIEW.md", "Review") }
];

// src/commands/intel.js
var since = (options) => typeof options.since === "string" ? options.since : "6 months ago";
async function graphCommand(cwd, options = {}) {
  const graph = await buildGraph(cwd);
  const depth = Number(options.depth) || 2;
  if (options.format === "mermaid") return output(toMermaid(graph, depth));
  if (options.format === "dot") return output(`digraph maverick {
  rankdir=LR;
${directoryGraph(graph, depth).map((link) => `  "${link.from}" -> "${link.to}" [label=${link.weight}];`).join("\n")}
}`);
  const production = graph.nodes.filter((node) => !node.test);
  const languages = Object.entries(graph.nodes.reduce((counts, node) => ({ ...counts, [node.language]: (counts[node.language] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const topFanIn = [...production].sort((a, b) => b.fanIn - a.fanIn).slice(0, 8).filter((node) => node.fanIn);
  const unstableHubs = production.filter((node) => node.fanIn >= 3 && node.instability >= 0.7).sort((a, b) => b.fanIn - a.fanIn).slice(0, 8);
  const summary = { files: graph.nodes.length, tests: graph.nodes.length - production.length, edges: graph.edges.length, dynamicEdges: graph.edges.filter((edge) => edge.dynamic).length, languages: Object.fromEntries(languages), health: graph.health, cycles: graph.cycles, hubs: graph.hubs, topFanIn: topFanIn.map(({ id: id2, fanIn, fanOut }) => ({ id: id2, fanIn, fanOut })), unstableDependencies: unstableHubs.map(({ id: id2, fanIn, fanOut, instability }) => ({ id: id2, fanIn, fanOut, instability })), truncated: graph.truncated };
  if (options.json) return output(JSON.stringify(summary, null, 2));
  const lines = [`${brand()} / GRAPH`, "", `Files: ${summary.files} (${summary.tests} test) \xB7 local import edges: ${summary.edges}${summary.dynamicEdges ? ` (${summary.dynamicEdges} lazy)` : ""}`, `Languages: ${languages.map(([name2, count]) => `${name2} ${count}`).join(", ") || "none detected"}`, `Health: ${graph.health.score}/100 = ${graph.health.formula}`];
  lines.push("", `Import cycles: ${graph.cycles.length}`, ...graph.cycles.slice(0, 5).map((cycle) => `  ${cycle.join(" \u21C4 ")}`));
  if (graph.hubs.length) lines.push("", "Hubs (high fan-in and fan-out):", ...graph.hubs.slice(0, 8).map((id2) => `  ${id2}`));
  if (topFanIn.length) lines.push("", "Most depended on:", ...topFanIn.map((node) => `  ${String(node.fanIn).padStart(3)} \u2190 ${node.id}`));
  if (unstableHubs.length) lines.push("", "Widely used but unstable (depends on many others):", ...unstableHubs.map((node) => `  ${node.id} (fan-in ${node.fanIn}, instability ${node.instability})`));
  if (graph.truncated) lines.push("", "Note: the scan stopped at 5,000 files.");
  lines.push("", "Diagram: maverick graph --format mermaid");
  output(lines.join("\n"));
}
async function hotspotsCommand(cwd, options = {}) {
  const [graph, counts] = await Promise.all([buildGraph(cwd), churn(cwd, since(options))]);
  const hotspots = rankHotspots(graph, counts, Number(options.limit) || 15);
  if (options.json) return output(JSON.stringify({ since: since(options), hotspots }, null, 2));
  if (!counts.size) return output("No git history found; hotspots need a Git repository with commits.");
  output(`${brand()} / HOTSPOTS (since ${since(options)})

score  commits  fan-in  file
${hotspots.map((item) => `${String(item.score).padStart(5)}  ${String(item.commits).padStart(7)}  ${String(item.fanIn).padStart(6)}  ${item.id}`).join("\n") || "No source files changed in this period."}

Score = commits \xD7 (1 + fan-in) \xD7 log10(10 + lines). Prefer strict-review for changes here.`);
}
async function mcpCommand(cwd) {
  const { serveMcp } = await import("./server-4FHQ5OWG.js");
  process.stderr.write(`maverick mcp: serving read-only project intelligence for ${cwd} over stdio
`);
  await serveMcp({ cwd });
}
var intelCommands = [
  { id: "mcp", description: "Serve read-only project intelligence to AI agents over MCP (stdio).", aliases: [], usage: "mcp", run: ({ cwd }) => mcpCommand(cwd) },
  { id: "graph", description: "Analyze the import graph: cycles, hubs, coupling, and health.", aliases: [], usage: "graph [--json] [--format mermaid|dot]", run: ({ cwd, options }) => graphCommand(cwd, options) },
  { id: "hotspots", description: "Rank files by change frequency and dependents.", aliases: [], usage: 'hotspots [--since "6 months ago"]', run: ({ cwd, options }) => hotspotsCommand(cwd, options) }
];

// src/commands/project.js
import { mkdir as mkdir10, readdir as readdir11, writeFile as writeFile10 } from "fs/promises";
import { join as join22 } from "path";
import { execFileSync } from "child_process";
import { createInterface as createInterface3 } from "readline/promises";
async function chooseDefaultPreset() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "standard";
  output("Choose your default workflow\n1. Standard \u2014 Default engineering workflow.\n2. Lightweight \u2014 Small, low-risk changes.\n3. Spec Driven \u2014 Specification-first for complex work.\n4. Strict Review \u2014 Extra verification for high-risk changes.");
  const prompt = createInterface3({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Choice [1]: ");
  prompt.close();
  return { 1: "standard", 2: "lightweight", 3: "spec-driven", 4: "strict-review" }[answer.trim() || "1"] || "standard";
}
async function initProject(cwd) {
  const dir = join22(cwd, ".maverick"), path = join22(dir, "config.json");
  if (await exists(path)) throw new Error(`configuration already exists: ${rel(cwd, path)}`);
  const preset = await chooseDefaultPreset(), map = await inspectProject(cwd);
  await mkdir10(dir, { recursive: true });
  const name2 = cwd.split(/[\\/]/).filter(Boolean).pop() || "my-project";
  await writeFile10(path, pretty({ ...defaultConfig, workflow: { ...defaultConfig.workflow, defaultPreset: preset }, project: { name: name2, language: map.languages[0] || "", framework: map.frameworks[0] || "" } }));
  output(`${brand()}
\u2713 project initialized: ${rel(cwd, path)}
Default preset: ${getPreset(preset).name}${map.languages.length ? `
Detected stack: ${map.language}` : ""}`);
}
async function mapProject(cwd, options = {}) {
  const map = await inspectProject(cwd), dir = join22(cwd, ".maverick", "context"), path = join22(dir, "PROJECT_MAP.md");
  await mkdir10(dir, { recursive: true });
  await writeFile10(path, renderProjectMap(map));
  if (options.json) return output(JSON.stringify({ ...map, path: rel(cwd, path) }, null, 2));
  output(`${brand()} / MAP
\u2713 project map: ${rel(cwd, path)}
Detected ${map.commands.length} verification command(s) and ${map.directories.length} top-level area(s).`);
}
async function showStack(cwd, options = {}) {
  const [map, config] = await Promise.all([inspectProject(cwd), loadConfig(cwd)]);
  const selected = selectVerificationCommands(map.stack, config);
  if (options.json) return output(JSON.stringify({ ...map.stack, verification: selected }, null, 2));
  const stack = map.stack, pad = (value, width) => String(value).padEnd(width);
  const lines = [`${brand()} / STACK`, "", `Languages:  ${map.language}`, `Frameworks: ${map.framework || "not detected"}`, "", "Ecosystems:"];
  lines.push(...stack.ecosystems.map((item) => `  ${pad(item.id, 9)} ${pad(item.packageManager, 12)} ${item.manifests.join(", ")}`), ...stack.ecosystems.length ? [] : ["  none detected at the root"]);
  if (stack.runners.length) lines.push("", "Task runners:", ...stack.runners.map((item) => `  ${pad(item.id, 9)} ${item.file}`));
  if (stack.subprojects.length) lines.push("", "Subprojects:", ...stack.subprojects.map((item) => `  ${pad(`${item.path}/`, 18)} ${item.ecosystems.map((e) => e.id).concat(item.runners.map((r) => r.id)).join(", ")}`));
  lines.push("", "Verification (maverick verify):", ...selected.map((item) => `  ${pad(item.name, 10)} ${item.command}${item.cwd ? `  (in ${item.cwd}/)` : ""}  [${item.source}]`));
  if (!selected.length) lines.push("  none \u2014 declare verification.commands in .maverick/config.json");
  output(lines.join("\n"));
}
async function configCommand(cwd, action = "show", options = {}) {
  if (action === "path") {
    const project = join22(cwd, ".maverick", "config.json");
    return output(options.json ? JSON.stringify({ project: rel(cwd, project), global: globalConfigPath() }) : `project: ${rel(cwd, project)}
global:  ${globalConfigPath()}`);
  }
  if (!["show", "validate"].includes(action)) throw new Error("use config show, config validate, or config path");
  const { config, sources } = await resolveConfig(cwd);
  if (action === "validate") return output(options.json ? JSON.stringify({ valid: true, sources }) : `${brand()} / CONFIG
PASS configuration is valid
Layers: ${sources.map((source) => source.path ? `${source.scope} (${source.path})` : source.scope).join(" < ")}`);
  output(options.json ? JSON.stringify({ config, sources }, null, 2) : `${brand()} / CONFIG
Layers: ${sources.map((source) => source.path ? `${source.scope} (${source.path})` : source.scope).join(" < ")}

${pretty(config)}`);
}
async function status(cwd, options = {}) {
  const config = await loadConfig(cwd), base2 = join22(cwd, config.taskRoot);
  if (!await exists(base2)) return output(options.json ? "[]" : "No tasks yet. Run maverick task add-your-feature.");
  const tasks = [];
  for (const entry of (await readdir11(base2, { withFileTypes: true })).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join22(base2, entry.name), preset = await taskPreset(dir, config);
    const evidence = await exists(join22(dir, "EVIDENCE.md")), findings = await exists(join22(dir, "REVIEW-FINDINGS.md"));
    tasks.push({ task: entry.name, preset, evidence, findings, next: evidence ? findings ? "complete human review" : "run review --diff" : "run verify" });
  }
  output(options.json ? JSON.stringify(tasks, null, 2) : tasks.map((task) => `${task.task}	${task.preset}	${task.next}`).join("\n"));
}
function gitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
async function doctor(cwd, options = {}) {
  let config, configError;
  try {
    config = await loadConfig(cwd);
  } catch (error) {
    configError = error.message;
  }
  const map = await inspectProject(cwd);
  const commands2 = selectVerificationCommands(map.stack, config || {});
  const checks = [
    ["Node >= 20", Number(process.versions.node.split(".")[0]) >= 20],
    ["Git available", gitAvailable()],
    ["Git repository", await exists(join22(cwd, ".git"))],
    ["Configuration valid", !configError, configError],
    ["Stack detected", map.languages.length > 0, map.languages.length ? map.language : "no known manifests at the root or first-level folders"],
    ["Repository instructions", map.instructions.length > 0],
    ["Verification commands", commands2.length > 0]
  ];
  if (await exists(join22(cwd, LOCK_PATH))) {
    const drifted = (await checkDrift(cwd, await readLock(cwd))).filter((item) => item.issues.length);
    checks.push(["Capabilities match lockfile", !drifted.length, drifted.length ? `${drifted.map((item) => item.ref).join(", ")} changed; run maverick installed` : void 0]);
  }
  const binaries = [...new Set(commands2.map((item) => {
    try {
      return splitCommand(item.command)[0];
    } catch {
      return null;
    }
  }).filter(Boolean))];
  for (const bin of binaries) {
    const where = commands2.find((item) => item.command.startsWith(bin))?.cwd;
    checks.push([`Toolchain: ${bin}`, commandAvailable(bin, where ? join22(cwd, where) : cwd), "not found on PATH"]);
  }
  const fixes = checks.filter(([, ok]) => !ok).map(([name2, , detail]) => `Add or configure: ${name2}${detail ? ` (${detail})` : ""}`);
  if (options.json) return output(JSON.stringify({ checks: checks.map(([name2, ok, detail]) => ({ name: name2, ok, ...detail && { detail } })), fixes }, null, 2));
  for (const [name2, ok, detail] of checks) output(`${ok ? "PASS" : "WARN"} ${name2}${detail && (name2 === "Stack detected" || !ok) ? ` \u2014 ${detail}` : ""}`);
  if (options.fix) output(`Suggested fixes:
${fixes.map((fix) => `- ${fix}`).join("\n") || "- No fixes needed."}`);
  output(`Default preset: ${config?.workflow.defaultPreset || "unknown"}
No telemetry is collected by Maverick.`);
}
async function dashboard(cwd, options = {}) {
  const { startDashboard } = await import("./server-35LBCCZR.js");
  const port = Number(options.port || 4173), host = options.host || "127.0.0.1";
  const server = await startDashboard({ cwd, host, port, watch: !options.noWatch });
  const address = `http://${host}:${port}`;
  if (options.json) output(JSON.stringify({ address, host, port, watch: !options.noWatch }));
  else output(`${brand()} / LENS

\u2713 project indexed
\u2713 tasks indexed
\u2713 specs indexed
\u2713 docs indexed
\u2713 git state indexed

Dashboard:
${address}

Local only. No project data is uploaded.`);
  if (options.open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    try {
      execFileSync(opener, process.platform === "win32" ? ["/c", "start", address] : [address], { stdio: "ignore" });
    } catch {
      if (options.debug) output("Could not open browser automatically.");
    }
  }
  const close = () => server.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
function info(options = {}) {
  if (options.json) return output(JSON.stringify({ name: "maverick-ai-dev-stack", version: packageVersion }));
  output(`Maverick AI Dev Stack
Version ${packageVersion}
A vendor-neutral engineering workflow. No telemetry by default.`);
}
var projectCommands = [
  { id: "dashboard", description: "Open the local project-intelligence dashboard.", aliases: ["dash", "lens"], usage: "dashboard --open", run: ({ cwd, options }) => dashboard(cwd, options) },
  { id: "init", description: "Initialize a project or create a task with a legacy slug.", aliases: [], usage: "init [task]", run: ({ cwd, arg, options }) => arg ? createTask(cwd, arg, options) : initProject(cwd) },
  { id: "map", description: "Build a repository context map.", aliases: [], usage: "map [--json]", run: ({ cwd, options }) => mapProject(cwd, options) },
  { id: "stack", description: "Detect languages, frameworks, and verification commands.", aliases: [], usage: "stack [--json]", run: ({ cwd, options }) => showStack(cwd, options) },
  { id: "config", description: "Show, validate, or locate layered configuration.", aliases: [], usage: "config show|validate|path", run: ({ cwd, arg, options }) => configCommand(cwd, arg, options) },
  { id: "doctor", description: "Inspect local setup, toolchains, and project checks.", aliases: [], usage: "doctor [--fix]", run: ({ cwd, options }) => doctor(cwd, options) },
  { id: "status", description: "Show task stage and pending gates.", aliases: [], usage: "status [--json]", run: ({ cwd, options }) => status(cwd, options) },
  { id: "info", description: "Show Maverick information.", aliases: ["version", "--version", "-v"], usage: "info", run: ({ options }) => info(options) }
];

// src/commands/index.js
var ORDER = ["dashboard", "init", "task", "subtask", "flow", "agent", "map", "stack", "graph", "hotspots", "mcp", "packet", "checkpoint", "impact", "guard", "learn", "handoff", "readiness", "policy", "adapter", "ci", "catalog", "add", "remove", "installed", "sync", "verify", "security", "deps", "pr", "presets", "suggest", "validate", "context", "plan", "review", "config", "doctor", "status", "info", "help"];
var helpCommand = { id: "help", description: "Show usage and the command list.", aliases: ["--help", "-h"], usage: "help", run: () => help() };
var commands = [...projectCommands, ...taskCommands, ...gateCommands, ...deliveryCommands, ...capabilityCommands, ...flowCommands, ...agentCommands, ...intelCommands, helpCommand].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
var byName = new Map(commands.flatMap((command) => [command.id, ...command.aliases].map((name2) => [name2, command])));
function findCommand(name2) {
  return byName.get(name2);
}
function help() {
  const width = Math.max(...commands.map((command) => command.usage.length)) + 2;
  const lines = commands.map((command) => `  ${command.usage.padEnd(width)}${command.description}${command.aliases.filter((alias) => !alias.startsWith("-")).length ? ` (alias: ${command.aliases.filter((alias) => !alias.startsWith("-")).join(", ")})` : ""}`);
  output(`MAVERICK AI DEV STACK ${packageVersion}

Usage: maverick <command> [task] [options]

Commands:
${lines.join("\n")}

Most commands accept --json. Preset values: ${PRESET_IDS.join(", ")}
Standard is the default. Every preset includes human review.`);
}

// src/core/command-registry.js
var commandRegistry = commands.map(({ id: id2, description, aliases, usage }) => ({ id: id2, command: `maverick ${id2}`, description, aliases, example: usage }));

export {
  packageVersion,
  IGNORED_DIRS,
  exists,
  replaceVars,
  sectionPresent,
  parseOptions,
  detectStack,
  selectVerificationCommands,
  defaultConfig,
  loadConfig,
  getTask,
  loadGraph,
  loadCatalog,
  searchCatalog,
  inspectProject,
  buildGraph,
  impactOf,
  recommendPreset,
  churn,
  rankHotspots,
  commandRegistry,
  findCommand
};
