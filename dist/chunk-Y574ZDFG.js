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
function output(message) {
  console.log(message);
}
function brand() {
  return process.env.NO_COLOR ? "\u2694 MAVERICK" : "\x1B[38;5;208m\u2694 MAVERICK\x1B[0m";
}
function replaceVars(text, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), text);
}
function sectionPresent(text, name) {
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const argv = [];
  let current = "", quote = null, started = false;
  for (const char of command.trim()) {
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
var pick = (rules, text) => rules.filter(([needle]) => needle instanceof RegExp ? needle.test(text) : text.includes(needle)).map(([, name]) => name);
async function directoryContext(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const cache = /* @__PURE__ */ new Map();
  return {
    dir,
    files,
    dirs,
    has: (name) => files.includes(name) || dirs.includes(name),
    hasAny: (names) => names.some((name) => files.includes(name) || dirs.includes(name)),
    find: (pattern) => files.filter((name) => pattern.test(name)),
    text(name) {
      if (!cache.has(name)) cache.set(name, readFile2(join2(dir, name), "utf8").catch(() => ""));
      return cache.get(name);
    },
    async texts(names) {
      return (await Promise.all(names.filter((name) => files.includes(name)).map((name) => this.text(name)))).join("\n");
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
      const script = (...names) => names.find((name) => scripts[name] && !/no test specified/.test(scripts[name]));
      const run = (name) => name && `${packageManager} run ${name}`;
      return {
        name: pkg.name,
        packageManager,
        scripts,
        languages: [ctx.has("tsconfig.json") || deps.typescript ? "TypeScript" : "JavaScript"],
        frameworks: NODE_FRAMEWORKS.filter(([dep]) => dep in deps).map(([, name]) => name),
        commands: { lint: run(script("lint")), typecheck: run(script("typecheck", "type-check", "types")), test: run(script("test")), build: run(script("build")) }
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
      const module = (name) => packageManager === "pip" ? `${python} -m ${name}` : `${prefix}${name}`;
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
        languages: [projects.some((name) => name.endsWith(".fsproj")) ? "F#" : "C#"],
        frameworks: pick([["Microsoft.NET.Sdk.Web", "ASP.NET Core"], ["Microsoft.AspNetCore", "ASP.NET Core"], ["BlazorWebAssembly", "Blazor"], ["<UseMaui>", ".NET MAUI"]], text).filter((name, index, all) => all.indexOf(name) === index),
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
        frameworks: [["laravel/framework", "Laravel"], ["symfony/framework-bundle", "Symfony"], ["slim/slim", "Slim"]].filter(([dep]) => dep in deps).map(([, name]) => name),
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
    const manifests = [...rule.markers.filter((name) => ctx.has(name)), ...(rule.patterns || []).flatMap((pattern) => ctx.find(pattern))];
    ecosystems.push({ id: rule.id, manifests, ...details });
  }
  const runners = [];
  for (const rule of RUNNER_RULES) {
    const file = rule.files.find((name) => ctx.files.includes(name));
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
  for (const name of entries) {
    const detected = await detectDirectory(join2(cwd, name), name);
    if (detected.ecosystems.length || detected.runners.length) subprojects.push({ path: name, ...detected });
  }
  const all = [root, ...subprojects];
  const ecosystems = all.flatMap((item) => item.ecosystems);
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
    const filtered = commands2.filter((item) => legacy.some((name) => item.kind === name || item.command.endsWith(name)));
    if (filtered.length) commands2 = filtered;
  }
  return commands2;
}

// src/core/config.js
import { readFile as readFile3 } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join as join3 } from "path";
import { z } from "zod";
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
  }).optional()
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
  return join3(process.env.MAVERICK_HOME || join3(homedir(), ".maverick"), "config.json");
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
  const canonical = join3(cwd, ".maverick", "config.json"), legacy = join3(cwd, "maverick.config.json");
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

// src/core/preset-suggestion.js
function recommendPreset({ risk, type, complexity, openQuestions = 0, estimatedFiles } = {}) {
  if (risk === "high") return { preset: "strict-review", reason: "High-risk changes need explicit verification, security review, and rollback evidence." };
  if (type === "migration" || type === "security") return { preset: "strict-review", reason: `${type === "migration" ? "Migrations" : "Security-sensitive changes"} need rollback and extra verification.` };
  if (complexity === "high" && Number(openQuestions) > 0) return { preset: "spec-driven", reason: "High complexity with open questions benefits from a shared specification." };
  if (risk === "low" && Number(estimatedFiles) <= 2) return { preset: "lightweight", reason: "Low risk and a small file footprint support a lightweight workflow." };
  return { preset: "standard", reason: "Standard is the default workflow for routine engineering changes." };
}

// src/commands/delivery.js
import { copyFile, mkdir, readFile as readFile5, writeFile } from "fs/promises";
import { dirname as dirname2, join as join5 } from "path";

// src/core/tasks.js
import { readFile as readFile4 } from "fs/promises";
import { join as join4 } from "path";
function taskPath(cwd, config, slug) {
  requireSlug(slug);
  return join4(cwd, config.taskRoot, slug);
}
async function taskPreset(dir, config) {
  const meta = join4(dir, "TASK.json");
  if (await exists(meta)) return (await readJson(meta)).preset || config.workflow.defaultPreset;
  const file = join4(dir, "TASK.md");
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

// src/commands/delivery.js
var ADAPTERS = {
  codex: ["adapters/codex/AGENTS.md.example", "AGENTS.md"],
  "claude-code": ["adapters/claude-code/CLAUDE.md.example", "CLAUDE.md"],
  cursor: ["adapters/cursor/maverick.mdc.example", ".cursor/rules/maverick.mdc"],
  generic: ["adapters/generic/ROLE_PROMPT.txt", ".maverick/ROLE_PROMPT.txt"]
};
async function learn(cwd, slug, options = {}) {
  await getTask(cwd, slug);
  if (!options.rule || options.rule === true) throw new Error('provide a rule with --rule "..."');
  const dir = join5(cwd, ".maverick"), path = join5(dir, "LEARNINGS.md");
  await mkdir(dir, { recursive: true });
  const existing = await exists(path) ? await readFile5(path, "utf8") : "# Maverick Learnings\n\nProposed reusable rules. Promote only after team review.\n";
  await writeFile(path, `${existing}
- [ ] ${options.rule}
  - Source task: \`${slug}\`
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), rule: options.rule }) : `${brand()} / LEARN
\u2713 proposed rule saved: ${rel(cwd, path)}`);
}
async function handoff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), present = {};
  for (const file of ["EVIDENCE.md", "REVIEW-FINDINGS.md", "SECURITY-REPORT.md", "DEPENDENCY-REVIEW.md", "SCOPE-GUARD.md", "CHECKPOINT.md"]) present[file] = await exists(join5(dir, file));
  const task = await readFile5(join5(dir, "TASK.md"), "utf8");
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || "See TASK.md.";
  const remaining = Object.entries(present).filter(([, value]) => !value).map(([file]) => file), path = join5(dir, "HANDOFF.md");
  await writeFile(path, `# Handoff \u2014 ${slug}

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
async function adapter(cwd, action, name, options = {}) {
  if (action === "list") return output(options.json ? JSON.stringify(Object.keys(ADAPTERS)) : `${brand()} / ADAPTERS
${Object.keys(ADAPTERS).join("\n")}`);
  if (action !== "install" || !ADAPTERS[name]) throw new Error(`use adapter list or adapter install <${Object.keys(ADAPTERS).join("|")}>`);
  const [source, target] = ADAPTERS[name], destination = join5(cwd, target);
  if (await exists(destination)) throw new Error(`adapter target already exists: ${rel(cwd, destination)}`);
  await mkdir(dirname2(destination), { recursive: true });
  await copyFile(join5(packageRoot, source), destination);
  output(options.json ? JSON.stringify({ adapter: name, path: rel(cwd, destination) }) : `${brand()} / ADAPTER
\u2713 ${name}: ${rel(cwd, destination)}`);
}
async function ci(cwd, provider, slug, options = {}) {
  if (provider !== "github") throw new Error("only the github CI generator is currently available");
  await getTask(cwd, slug);
  const destination = join5(cwd, ".github", "workflows", `maverick-${slug}.yml`);
  if (await exists(destination)) throw new Error(`CI workflow already exists: ${rel(cwd, destination)}`);
  await mkdir(dirname2(destination), { recursive: true });
  await writeFile(destination, replaceVars(await readFile5(join5(packageRoot, "templates", "github-actions-maverick.yml"), "utf8"), { TASK_SLUG: slug }));
  output(options.json ? JSON.stringify({ provider, task: slug, path: rel(cwd, destination) }) : `${brand()} / CI
\u2713 GitHub Actions workflow: ${rel(cwd, destination)}`);
}
async function draftPr(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const task = await readFile5(join5(dir, "TASK.md"), "utf8");
  const evidence = await exists(join5(dir, "EVIDENCE.md")) ? await readFile5(join5(dir, "EVIDENCE.md"), "utf8") : "Verification evidence has not been captured.";
  const findings = await exists(join5(dir, "REVIEW-FINDINGS.md")) ? "Diff review report is available in REVIEW-FINDINGS.md." : "Diff review has not been run.";
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || "See TASK.md.", path = join5(dir, "PR-DRAFT.md");
  await writeFile(path, `# PR Draft \u2014 ${slug}

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

// src/commands/gates.js
import { mkdir as mkdir4, readFile as readFile8, writeFile as writeFile4 } from "fs/promises";
import { join as join8 } from "path";

// src/core/project-tools.js
import { mkdir as mkdir2, readdir as readdir2, readFile as readFile6, writeFile as writeFile2 } from "fs/promises";
import { join as join6, relative as relative2 } from "path";
import { spawn } from "child_process";
var INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursorrules", ".cursor/rules", ".windsurfrules", "CONVENTIONS.md", "CONTRIBUTING.md"];
async function inspectProject(cwd) {
  const stack = await detectStack(cwd);
  const entries = await readdir2(cwd, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).filter((name) => !IGNORED_DIRS.has(name)).sort();
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const manifests = [...new Set(stack.ecosystems.flatMap((item) => item.manifests))];
  const instructions = (await Promise.all(INSTRUCTION_FILES.map(async (name) => await exists(join6(cwd, name)) ? name : null))).filter(Boolean);
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
${map.directories.map((name) => `- \`${name}/\``).join("\n") || "- none"}

## Verification commands
${commands2}

## Repository instructions
${map.instructions.map((name) => `- \`${name}\``).join("\n") || "- none detected"}

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
  return new Promise((resolve2) => {
    const child = spawn(bin, args, { cwd: subdir ? join6(cwd, subdir) : cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output2 = "";
    child.stdout.on("data", (chunk) => {
      output2 += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output2 += chunk;
    });
    child.on("error", (error) => resolve2({ command: label, ok: false, code: null, output: error.message }));
    child.on("close", (code) => resolve2({ command: label, ok: code === 0, code, output: output2.slice(-12e3) }));
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
  const path = join6(dir, "EVIDENCE.md");
  await writeFile2(path, body);
  return path;
}
async function findReferences(cwd, target, maxResults = 40) {
  const needle = target.split("/").pop().replace(/\.[^.]+$/, "");
  const results = [];
  async function visit(directory) {
    if (results.length >= maxResults) return;
    for (const entry of await readdir2(directory, { withFileTypes: true })) {
      if (results.length >= maxResults || IGNORED_DIRS.has(entry.name)) continue;
      const path = join6(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        try {
          const text = await readFile6(path, "utf8");
          if (text.includes(needle)) results.push(relative2(cwd, path));
        } catch {
        }
      }
    }
  }
  await visit(cwd);
  return results;
}

// src/commands/task.js
import { mkdir as mkdir3, readFile as readFile7, writeFile as writeFile3 } from "fs/promises";
import { join as join7 } from "path";
async function createTask(cwd, slug, options = {}) {
  const config = await loadConfig(cwd), preset = requirePreset(options.preset || config.workflow.defaultPreset || "standard"), dir = taskPath(cwd, config, slug);
  if (await exists(dir)) throw new Error(`task already exists: ${rel(cwd, dir)}; choose another slug or remove it deliberately`);
  await mkdir3(dir, { recursive: true });
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), artifacts = [...preset.artifacts];
  if ((options.riskDoc || config.workflow.riskDocumentation) && preset.strict) artifacts.push({ id: "RISK", file: "RISK.md", template: "risk.md", sections: ["Risk Assessment", "Mitigations", "Rollback", "Approval"] });
  for (const item of artifacts) await writeFile3(join7(dir, item.file), replaceVars(await readFile7(join7(packageRoot, "templates", item.template), "utf8"), { TASK_SLUG: slug, DATE: today }));
  await writeFile3(join7(dir, "TASK.json"), pretty({ preset: preset.id, createdAt: today }));
  output(`${brand()}
\u2713 task created: ${rel(cwd, dir)}
Preset: ${preset.name}
Stages: ${preset.stages.map((s) => s.toUpperCase()).join(" \u2192 ")}`);
}
async function showArtifact(cwd, slug, filename, label) {
  const { dir } = await getTask(cwd, slug), path = join7(dir, filename);
  output(`${label}: ${rel(cwd, path)}${await exists(path) ? "" : " (not included by this preset)"}`);
}
async function taskPacket(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const mapPath = join7(cwd, ".maverick", "context", "PROJECT_MAP.md"), contents = [];
  for (const file of ["SPEC.md", "TASK.md", "CONTEXT.md", "PLAN.md"]) if (await exists(join7(dir, file))) contents.push(`## ${file}

${await readFile7(join7(dir, file), "utf8")}`);
  if (await exists(mapPath)) contents.unshift(`## PROJECT_MAP.md

${await readFile7(mapPath, "utf8")}`);
  const path = join7(dir, "TASK-PACKET.md");
  await writeFile3(path, `# Maverick Task Packet

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
  for (const item of validatorArtifacts(preset, await exists(join7(dir, "RISK.md")))) {
    const path = join7(dir, item.file);
    if (!await exists(path)) {
      results.push({ file: item.file, status: "FAIL", message: "missing" });
      errors++;
      continue;
    }
    const text = await readFile7(path, "utf8");
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
function showPresets(id) {
  if (id) {
    const p = requirePreset(id);
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
var MANIFEST = /(?:^|\/)(?:package\.json|pyproject\.toml|Pipfile|setup\.py|setup\.cfg|go\.mod|Cargo\.toml|Gemfile|composer\.json|mix\.exs|pubspec\.yaml|pom\.xml|build\.gradle(?:\.kts)?|[^/]+\.(?:csproj|fsproj|vbproj)|Directory\.Packages\.props|Package\.swift)$/;
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
  if (preset.strict && !await exists(join8(dir, "EVIDENCE.md"))) findings.push("Strict Review: test evidence is missing; run maverick verify first.");
  const path = join8(dir, "REVIEW-FINDINGS.md");
  await writeFile4(path, `# Diff Review Findings \u2014 ${slug}

Base: ${options.against || "HEAD"}
Changed files:
${files.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Findings
${findings.map((finding) => `- ${finding}`).join("\n") || "- No automated findings. Complete the human review in REVIEW.md."}
`);
  output(options.json ? JSON.stringify({ files, findings, path: rel(cwd, path) }, null, 2) : `${brand()} / REVIEW
Changed files: ${files.length}
Findings: ${findings.length}
Report: ${rel(cwd, path)}`);
}
async function checkpoint(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const [status2, diff] = await Promise.all([executeCommand(cwd, "git status --short"), gitDiff(cwd, options.against || "HEAD")]);
  const path = join8(dir, "CHECKPOINT.md");
  await writeFile4(path, `# Checkpoint \u2014 ${slug}

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
  const references = await findReferences(cwd, path);
  const payload = { path, references, count: references.length, truncated: references.length === 40 };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / IMPACT
Target: ${path}
References:
${references.map((file) => `- ${file}`).join("\n") || "- none found"}`);
}
async function guardScope(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const task = await readFile8(join8(dir, "TASK.md"), "utf8");
  const changed = changedFilesFromDiff(await gitDiff(cwd, options.against || "HEAD"));
  const expected = (task.match(/^## Expected Changed Files\n([\s\S]*?)(?=^## |$)/m)?.[1].match(/`([^`]+)`/g) || []).map((value) => value.slice(1, -1)).filter((value) => !/FILL ME/i.test(value));
  const outsideScope = expected.length ? changed.filter((file) => !expected.includes(file)) : [];
  const maxFiles = config.maxChangedFilesGuideline || 8;
  const findings = [changed.length > maxFiles ? `Change budget exceeded: ${changed.length}/${maxFiles} files.` : null, ...outsideScope.map((file) => `Not listed in Expected Changed Files: ${file}`)].filter(Boolean);
  const report = join8(dir, "SCOPE-GUARD.md");
  await writeFile4(report, `# Scope Guard \u2014 ${slug}

Changed files: ${changed.length}
Expected files: ${expected.length || "not specified"}

## Findings
${findings.map((finding) => `- \u26A0 ${finding}`).join("\n") || "- Within configured scope guard."}
`);
  const payload = { ok: findings.length === 0, changed, expected, findings, path: rel(cwd, report) };
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
  for (const file of required) (await exists(join8(dir, file)) ? available : missing).push(file);
  const review = await exists(join8(dir, "REVIEW.md")) ? await readFile8(join8(dir, "REVIEW.md"), "utf8") : "";
  if (!/- \[[xX]\] (?:approve|approve with follow-up|request changes)/.test(review)) missing.push("Human decision in REVIEW.md");
  const ready = missing.length === 0, path = join8(dir, "MERGE-READINESS.md");
  await writeFile4(path, `# Merge Readiness \u2014 ${slug}

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
  const dir = join8(cwd, ".maverick"), path = join8(dir, "policy.json");
  if (action === "init") {
    if (await exists(path)) throw new Error(`policy already exists: ${rel(cwd, path)}`);
    await mkdir4(dir, { recursive: true });
    await writeFile4(path, await readFile8(join8(packageRoot, "templates", "policy.json"), "utf8"));
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
  const report = join8(taskDir, "POLICY-CHECK.md");
  await writeFile4(report, `# Policy Check \u2014 ${slug}

Policy: ${rel(cwd, path)}

## Sensitive changed paths
${sensitive.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Findings
${findings.map((finding) => `- \u26A0 ${finding}`).join("\n") || "- Policy satisfied."}
`);
  const payload = { ok: findings.length === 0, changed, sensitive, findings, path: rel(cwd, report) };
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
  const findings = rules.filter((rule) => rule.pattern.test(diff)).map((rule) => rule.name), path = join8(dir, "SECURITY-REPORT.md");
  await writeFile4(path, `# Security Scan \u2014 ${slug}

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
  const lockfiles = changed.filter((file) => LOCKFILE.test(file)), manifests = changed.filter((file) => MANIFEST.test(file));
  const path = join8(dir, "DEPENDENCY-REVIEW.md");
  await writeFile4(path, `# Dependency Review \u2014 ${slug}

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

// src/commands/project.js
import { mkdir as mkdir5, readdir as readdir3, writeFile as writeFile5 } from "fs/promises";
import { join as join9 } from "path";
import { execFileSync } from "child_process";
import { createInterface } from "readline/promises";
async function chooseDefaultPreset() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "standard";
  output("Choose your default workflow\n1. Standard \u2014 Default engineering workflow.\n2. Lightweight \u2014 Small, low-risk changes.\n3. Spec Driven \u2014 Specification-first for complex work.\n4. Strict Review \u2014 Extra verification for high-risk changes.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Choice [1]: ");
  prompt.close();
  return { 1: "standard", 2: "lightweight", 3: "spec-driven", 4: "strict-review" }[answer.trim() || "1"] || "standard";
}
async function initProject(cwd) {
  const dir = join9(cwd, ".maverick"), path = join9(dir, "config.json");
  if (await exists(path)) throw new Error(`configuration already exists: ${rel(cwd, path)}`);
  const preset = await chooseDefaultPreset(), map = await inspectProject(cwd);
  await mkdir5(dir, { recursive: true });
  const name = cwd.split(/[\\/]/).filter(Boolean).pop() || "my-project";
  await writeFile5(path, pretty({ ...defaultConfig, workflow: { ...defaultConfig.workflow, defaultPreset: preset }, project: { name, language: map.languages[0] || "", framework: map.frameworks[0] || "" } }));
  output(`${brand()}
\u2713 project initialized: ${rel(cwd, path)}
Default preset: ${getPreset(preset).name}${map.languages.length ? `
Detected stack: ${map.language}` : ""}`);
}
async function mapProject(cwd, options = {}) {
  const map = await inspectProject(cwd), dir = join9(cwd, ".maverick", "context"), path = join9(dir, "PROJECT_MAP.md");
  await mkdir5(dir, { recursive: true });
  await writeFile5(path, renderProjectMap(map));
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
    const project = join9(cwd, ".maverick", "config.json");
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
  const config = await loadConfig(cwd), base = join9(cwd, config.taskRoot);
  if (!await exists(base)) return output(options.json ? "[]" : "No tasks yet. Run maverick task add-your-feature.");
  const tasks = [];
  for (const entry of (await readdir3(base, { withFileTypes: true })).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join9(base, entry.name), preset = await taskPreset(dir, config);
    const evidence = await exists(join9(dir, "EVIDENCE.md")), findings = await exists(join9(dir, "REVIEW-FINDINGS.md"));
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
    ["Git repository", await exists(join9(cwd, ".git"))],
    ["Configuration valid", !configError, configError],
    ["Stack detected", map.languages.length > 0, map.languages.length ? map.language : "no known manifests at the root or first-level folders"],
    ["Repository instructions", map.instructions.length > 0],
    ["Verification commands", commands2.length > 0]
  ];
  const binaries = [...new Set(commands2.map((item) => {
    try {
      return splitCommand(item.command)[0];
    } catch {
      return null;
    }
  }).filter(Boolean))];
  for (const bin of binaries) {
    const where = commands2.find((item) => item.command.startsWith(bin))?.cwd;
    checks.push([`Toolchain: ${bin}`, commandAvailable(bin, where ? join9(cwd, where) : cwd), "not found on PATH"]);
  }
  const fixes = checks.filter(([, ok]) => !ok).map(([name, , detail]) => `Add or configure: ${name}${detail ? ` (${detail})` : ""}`);
  if (options.json) return output(JSON.stringify({ checks: checks.map(([name, ok, detail]) => ({ name, ok, ...detail && { detail } })), fixes }, null, 2));
  for (const [name, ok, detail] of checks) output(`${ok ? "PASS" : "WARN"} ${name}${detail && (name === "Stack detected" || !ok) ? ` \u2014 ${detail}` : ""}`);
  if (options.fix) output(`Suggested fixes:
${fixes.map((fix) => `- ${fix}`).join("\n") || "- No fixes needed."}`);
  output(`Default preset: ${config?.workflow.defaultPreset || "unknown"}
No telemetry is collected by Maverick.`);
}
async function dashboard(cwd, options = {}) {
  const { startDashboard } = await import("./server-GBXUDHYU.js");
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
var ORDER = ["dashboard", "init", "task", "map", "stack", "packet", "checkpoint", "impact", "guard", "learn", "handoff", "readiness", "policy", "adapter", "ci", "verify", "security", "deps", "pr", "presets", "suggest", "validate", "context", "plan", "review", "config", "doctor", "status", "info", "help"];
var helpCommand = { id: "help", description: "Show usage and the command list.", aliases: ["--help", "-h"], usage: "help", run: () => help() };
var commands = [...projectCommands, ...taskCommands, ...gateCommands, ...deliveryCommands, helpCommand].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
var byName = new Map(commands.flatMap((command) => [command.id, ...command.aliases].map((name) => [name, command])));
function findCommand(name) {
  return byName.get(name);
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
var commandRegistry = commands.map(({ id, description, aliases, usage }) => ({ id, command: `maverick ${id}`, description, aliases, example: usage }));

export {
  packageVersion,
  IGNORED_DIRS,
  replaceVars,
  sectionPresent,
  parseOptions,
  detectStack,
  defaultConfig,
  loadConfig,
  inspectProject,
  recommendPreset,
  commandRegistry,
  findCommand
};
