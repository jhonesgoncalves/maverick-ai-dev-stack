import {
  AGENT_STAGE_IDS,
  EFFORTS,
  FINDING_KINDS,
  GIT_PROVIDERS,
  HOOK_EVENTS,
  INTEGRITY_LEVELS,
  LOOP_ISOLATION,
  LOOP_LADDER_STEPS,
  PERMISSIONS
} from "./chunk-5ZWVM3IA.js";
import {
  fold,
  headingAliases
} from "./chunk-YL4AI5AN.js";

// src/core/style.js
function colorEnabled(stream = process.stdout) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR !== void 0) return process.env.FORCE_COLOR !== "0";
  return Boolean(stream?.isTTY) && process.env.TERM !== "dumb";
}
var sgr = (open, close = 0) => (text, stream) => colorEnabled(stream) ? `\x1B[${open}m${text}\x1B[${close}m` : String(text);
var style = {
  bold: sgr(1, 22),
  dim: sgr(2, 22),
  italic: sgr(3, 23),
  underline: sgr(4, 24),
  brand: sgr("1;38;5;202", "22;39"),
  text: sgr("1;97", "22;39"),
  amber: sgr("38;5;214", 39),
  gray: sgr("38;5;244", 39),
  green: sgr(32, 39),
  red: sgr(31, 39),
  yellow: sgr(33, 39),
  cyan: sgr(36, 39),
  blue: sgr(34, 39)
};
var BADGES = {
  PASS: "1;30;42",
  OK: "1;30;42",
  DONE: "1;30;42",
  WARN: "1;30;43",
  PENDING: "1;30;43",
  FAIL: "1;97;41",
  ERROR: "1;97;41",
  BLOCK: "1;97;41",
  BLOCKED: "1;97;41",
  SKIP: "1;97;100",
  INFO: "1;30;46"
};
function badge(label, stream) {
  const code = BADGES[label] || "1;30;47";
  return colorEnabled(stream) ? `\x1B[${code}m ${label} \x1B[0m` : label;
}
function rule(width = 48, stream) {
  const columns = Math.min(width, (stream || process.stdout).columns || width);
  return style.gray("\u2500".repeat(Math.max(8, columns)), stream);
}
var ESC = "\x1B[";
var HEADER = /^MAVERICK AI(?: \/ (.+))?$/;
var STATUS = new RegExp(`^(\\s*)(${Object.keys(BADGES).join("|")})(?= |$)(.*)$`);
var SECTION = /^([A-Z][\w &/()'.-]{0,48}):$/;
var KEY_VALUE = /^([A-Z][\w /-]{0,22}):(\s+)(\S.*)$/;
var COMMAND_HINT = /\bmaverick(?: (?:[a-z<[][^\s;,)]*|--[\w-]+))+/g;
var URL = /\bhttps?:\/\/[^\s)]+/g;
function wordmark(stream) {
  return `${style.text("MAVERICK", stream)} ${style.brand("AI", stream)}`;
}
function inline(text) {
  return text.replace(URL, (url) => style.underline(style.cyan(url))).replace(COMMAND_HINT, (hint) => style.cyan(hint));
}
function decorateLine(line) {
  if (!line || line.includes(ESC)) return line;
  const header = line.match(HEADER);
  if (header) return `${wordmark()}${header[1] ? `${style.gray(" \u203A ")}${style.bold(header[1])}` : ""}
${rule()}`;
  const status = line.match(STATUS);
  if (status) {
    const [, indent, label, rest] = status, cut = rest.indexOf(" \u2014 ");
    return `${indent}${badge(label)}${cut < 0 ? inline(rest) : `${inline(rest.slice(0, cut))}${style.gray(rest.slice(cut))}`}`;
  }
  if (/^\s*✓/.test(line)) return line.replace("\u2713", style.green("\u2714"));
  if (/^\s*[✗✖]/.test(line)) return style.red(line);
  if (/^#{1,4} /.test(line)) return style.brand(line);
  if (SECTION.test(line)) return style.amber(style.bold(line));
  if (/^[A-Z][A-Z0-9 -]{2,40}$/.test(line)) return style.bold(line);
  const pair = line.match(KEY_VALUE);
  if (pair) return `${style.gray(`${pair[1]}:`)}${pair[2]}${inline(pair[3])}`;
  return inline(line);
}
function decorate(message) {
  const text = String(message);
  if (!colorEnabled() || /^\s*[[{]/.test(text)) return text;
  return text.split("\n").map(decorateLine).join("\n");
}

// src/core/util.js
import { AsyncLocalStorage } from "async_hooks";
import { access, readFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { delimiter, dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
function findPackageRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).name === "@maverick-ai/cli") return dir;
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
async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
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
var sinks = new AsyncLocalStorage();
var pendingHeader = null;
function brandOutput(title) {
  pendingHeader = title;
}
var branded = (text) => text.startsWith("MAVERICK AI") || text.startsWith(wordmark());
function output(message) {
  const sink = sinks.getStore();
  if (sink) return void sink.push(String(message));
  if (pendingHeader) {
    const text = String(message).replace(/^\n+/, "");
    if (colorEnabled() && !branded(text) && !/^\s*[[{]/.test(text)) console.log(decorate(`${brand()} / ${pendingHeader}`));
    pendingHeader = null;
  }
  console.log(decorate(message));
}
async function captureOutput(fn) {
  const lines = [];
  return sinks.run(lines, async () => {
    try {
      return { value: await fn(), output: lines.join("\n") };
    } catch (error) {
      error.output = lines.join("\n");
      throw error;
    }
  });
}
function brand() {
  return "MAVERICK AI";
}
function replaceVars(text, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), text);
}
function sectionPresent(text, name2) {
  return headingIndex(String(text).split("\n"), name2).start >= 0;
}
function sectionBody(text, name2) {
  const lines = String(text).split("\n"), { start, level, headings } = headingIndex(lines, name2);
  if (start < 0) return "";
  const end = headings.findIndex((match, index) => index > start && match && match[1].length <= level);
  return lines.slice(start + 1, end < 0 ? void 0 : end).join("\n").trim();
}
function headingIndex(lines, name2) {
  let fenced = false;
  const headings = lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return null;
    }
    return fenced ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  });
  const wanted = headingAliases(name2), start = headings.findIndex((match) => match && wanted.includes(fold(match[2])));
  return { start, level: start >= 0 ? headings[start][1].length : 0, headings };
}
function hasMeaningfulContent(text) {
  return !/\b(TODO|TBD|FILL ME)\b/.test(text);
}
function requireSlug(slug) {
  if (!slugOk.test(slug || "")) throw new Error("use a lowercase slug such as add-orders-pagination");
}
function parseOptions(args) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = args[i + 1]?.startsWith("--") || args[i + 1] === void 0 ? true : args[++i];
      options[key] = typeof value === "string" && (typeof options[key] === "string" || Array.isArray(options[key])) ? [options[key]].flat().concat(value) : value;
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
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
function closest(name2, candidates) {
  const [best] = candidates.map((key) => ({ key, score: distance(String(name2), key) })).sort((a, b) => a.score - b.score);
  return best && best.score <= Math.max(1, Math.floor(String(name2).length / 3)) ? best.key : void 0;
}

// src/core/presets.js
var PRESET_IDS = ["standard", "spec-driven", "strict"];
var artifact = (id, file, stage, sections) => ({ id, file, stage, sections });
var PRD = artifact("PRD", "PRD.md", "prd", ["Overview", "Goals", "User Stories", "Requirements", "Acceptance Criteria", "Business Rules", "Edge Cases", "Non-Goals", "Open Questions"]);
var SPEC = artifact("SPEC", "SPEC.md", "spec", ["Summary", "Behavior", "Contracts", "States and Data", "Invariants", "Errors", "Traceability", "Open Questions"]);
var TECHSPEC = artifact("TECHSPEC", "TECHSPEC.md", "techspec", ["Summary", "Current State", "Approach", "File References", "Interfaces and Data", "Impact", "Test Plan", "Build Order", "Risks and Rollback", "Commands", "Do Not Touch"]);
var ARTIFACTS = [PRD, SPEC, TECHSPEC];
var PLANNING_STAGES = ["prd", "spec", "techspec", "tasks"];
var DEFAULT_ARTIFACTS = [PRD, TECHSPEC];
var presets = {
  standard: { id: "standard", name: "Standard", description: "PRD, technical spec and task graph, then build, verify and human review.", bestFor: "Features, fixes and refactors.", artifacts: DEFAULT_ARTIFACTS, stages: ["prd", "techspec", "tasks", "build", "verify", "review", "pr", "done"] },
  "spec-driven": { id: "spec-driven", name: "Spec Driven", description: "PRD, then an approved behavioral spec (SPEC.md) that the technical spec, tasks and tests trace to, then build, verify and human review.", bestFor: "APIs, integrations, shared contracts, complex domain rules or work several people must agree on.", artifacts: ARTIFACTS, stages: ["prd", "spec", "techspec", "tasks", "build", "verify", "review", "pr", "done"] },
  strict: { id: "strict", name: "Strict", description: "The standard pipeline plus a security gate and a checkpoint before merge.", bestFor: "Security, data, payment, migration or shared-infrastructure work.", artifacts: DEFAULT_ARTIFACTS, stages: ["prd", "techspec", "tasks", "build", "verify", "security", "review", "pr", "done"], strict: true }
};
function getPreset(id = "standard") {
  return presets[id];
}
function requirePreset(id) {
  const preset = getPreset(id);
  if (!preset) throw new Error(`invalid workflow "${id}"; choose: ${PRESET_IDS.join(", ")}`);
  return preset;
}
function stagesForPreset(id) {
  return requirePreset(id).stages;
}
function planningStages(preset = presets.standard) {
  return preset.stages.filter((stage) => PLANNING_STAGES.includes(stage));
}
function artifactForStage(stage) {
  return ARTIFACTS.find((item) => item.stage === stage);
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
      const run = (name2) => name2 && `${packageManager} run ${name2}`;
      return {
        name: pkg.name,
        packageManager,
        scripts,
        languages: [ctx.has("tsconfig.json") || deps.typescript ? "TypeScript" : "JavaScript"],
        frameworks: NODE_FRAMEWORKS.filter(([dep]) => dep in deps).map(([, name2]) => name2),
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
        frameworks: pick([["Microsoft.NET.Sdk.Web", "ASP.NET Core"], ["Microsoft.AspNetCore", "ASP.NET Core"], ["BlazorWebAssembly", "Blazor"], ["<UseMaui>", ".NET MAUI"]], text).filter((name2, index, all) => all.indexOf(name2) === index),
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
function matchesEcosystem(rule2, ctx) {
  return ctx.hasAny(rule2.markers) || (rule2.patterns || []).some((pattern) => ctx.find(pattern).length > 0);
}
async function detectDirectory(dir, subdir = "") {
  const ctx = await directoryContext(dir);
  const ecosystems = [];
  for (const rule2 of ECOSYSTEM_RULES) {
    if (!matchesEcosystem(rule2, ctx)) continue;
    const details = await rule2.inspect(ctx);
    const manifests = [...rule2.markers.filter((name2) => ctx.has(name2)), ...(rule2.patterns || []).flatMap((pattern) => ctx.find(pattern))];
    ecosystems.push({ id: rule2.id, manifests, ...details });
  }
  const runners = [];
  for (const rule2 of RUNNER_RULES) {
    const file = rule2.files.find((name2) => ctx.files.includes(name2));
    if (file) runners.push({ id: rule2.id, file, bin: rule2.bin, targets: [...new Set(rule2.targets(await ctx.text(file)))] });
  }
  const commands = [];
  for (const kind of CHECK_KINDS) {
    const runner = runners.map((item) => ({ item, target: RUNNER_TARGETS[kind].find((target) => item.targets.includes(target)) })).find((match) => match.target);
    if (runner) {
      commands.push({ name: kind, kind, command: `${runner.item.bin} ${runner.target}`, cwd: subdir, source: runner.item.id });
      continue;
    }
    for (const ecosystem of ecosystems) {
      const command = ecosystem.commands?.[kind];
      if (command) commands.push({ name: kind, kind, command, cwd: subdir, source: ecosystem.id });
    }
  }
  return { ecosystems, runners, commands };
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
  let commands = mode === "never" ? stack.commands : mode === "always" || !stack.commands.length ? [...stack.commands, ...stack.subprojects.flatMap((item) => item.commands)] : stack.commands;
  if (verification.kinds?.length) commands = commands.filter((item) => verification.kinds.includes(item.kind));
  const legacy = config.defaultVerification || [];
  if (legacy.length) {
    const filtered = commands.filter((item) => legacy.some((name2) => item.kind === name2 || item.command.endsWith(name2)));
    if (filtered.length) commands = filtered;
  }
  return commands;
}

// src/core/config.js
import { readFile as readFile3 } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join as join3 } from "path";
import { z } from "zod";
var defaultConfig = {
  version: 1,
  project: { name: "", language: "", framework: "" },
  workflow: { default: "standard" },
  language: { docs: "en", code: "en" },
  adapter: "generic",
  taskRoot: ".maverick/tasks"
};
var projectPath = z.string().min(1).refine((value) => !isAbsolute(value) && !value.split(/[\\/]/).includes(".."), 'must be a project-relative path without ".."');
var verificationCommand = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), command: z.string().min(1), cwd: projectPath.optional() })
]);
var configSchema = z.looseObject({
  version: z.number().int().positive(),
  project: z.looseObject({ name: z.string(), language: z.string(), framework: z.string() }),
  // `default` is the workflow for new tasks; `maverick new` picks strict for high-risk ideas anyway.
  workflow: z.looseObject({ default: z.enum(PRESET_IDS) }),
  adapter: z.string().min(1),
  taskRoot: projectPath,
  decisions: z.object({ enabled: z.boolean().optional(), localCommand: z.string().min(1).optional(), llm: z.boolean().optional(), timeoutSeconds: z.number().positive().max(300).optional() }).optional(),
  autonomy: z.object({ windowDays: z.number().int().min(7).optional(), minSamples: z.number().int().min(30).optional(), paths: z.array(z.object({ path: projectPath, autoApprove: z.boolean(), judgeRequired: z.boolean(), maxFiles: z.number().int().positive(), maxPermission: z.enum(PERMISSIONS) })).optional() }).optional(),
  session: z.object({ privateData: z.boolean().optional(), web: z.boolean().optional(), externalWrite: z.boolean().optional() }).optional(),
  canary: z.object({ fixture: z.object({ language: z.string().min(1), source: projectPath, code: z.string(), test: projectPath, visible: z.string(), truth: z.string(), commands: z.array(z.string().min(1)).min(1) }).optional() }).optional(),
  defaultVerification: z.array(z.string()).optional(),
  maxChangedFilesGuideline: z.number().int().positive().optional(),
  verification: z.object({
    commands: z.array(verificationCommand).optional(),
    kinds: z.array(z.enum(CHECK_KINDS)).optional(),
    subprojects: z.enum(["auto", "always", "never"]).optional(),
    // How to run chosen test files (ablation, sealed tests): the first runner whose glob matches a file runs it.
    runners: z.array(z.object({
      name: z.string().min(1).optional(),
      match: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      run: z.string().min(1).refine((value) => /\{(files?|dir|name)\}/.test(value), "must name the test with {files}, {file}, {dir} or {name}"),
      cwd: projectPath.optional()
    })).optional()
  }).optional(),
  capabilities: z.object({
    targets: z.array(z.string().min(1)).optional(),
    catalogs: z.array(z.string().min(1)).optional(),
    // linked: one copy in .agents/, symlinked into each tool; copy: each tool gets its own files.
    layout: z.enum(["linked", "copy"]).optional()
  }).optional(),
  // Agent runtime. This file is the trust boundary: flags can lower permissions, never raise them.
  runtime: z.object({
    trusted: z.array(z.string().min(1)).optional(),
    maxPermission: z.enum(PERMISSIONS).optional(),
    defaultPermission: z.enum(PERMISSIONS).optional(),
    default: z.object({ provider: z.string().min(1), model: z.string().optional(), effort: z.enum(EFFORTS).optional() }).optional(),
    routes: z.array(z.object({
      match: z.object({ type: z.string().optional(), complexity: z.enum(["low", "medium", "high"]).optional() }),
      provider: z.string().min(1),
      model: z.string().optional(),
      effort: z.enum(EFFORTS).optional(),
      permission: z.enum(PERMISSIONS).optional()
    })).optional(),
    // Per workflow step: which agent, model and reasoning effort a run of that step uses by default.
    stages: z.partialRecord(z.enum(AGENT_STAGE_IDS), z.object({ provider: z.string().min(1).optional(), model: z.string().min(1).optional(), effort: z.enum(EFFORTS).optional(), permission: z.enum(PERMISSIONS).optional() })).optional(),
    timeoutMinutes: z.number().positive().max(24 * 60).optional(),
    bins: z.record(z.string(), z.string().min(1)).optional(),
    // The model family of a provider whose CLI can run several vendors' models (judges and loops need it).
    families: z.record(z.string(), z.string().regex(/^[a-z0-9-]+$/)).optional(),
    // USD per million tokens, by model or provider id: the cost of runs whose provider reports tokens but no cost.
    prices: z.record(z.string(), z.object({ input: z.number().min(0), output: z.number().min(0), cachedInput: z.number().min(0).optional() })).optional(),
    custom: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
      name: z.string().optional(),
      command: z.string().min(1),
      permissions: z.array(z.enum(PERMISSIONS)).optional()
    })).optional()
  }).optional(),
  // Flows that approve their own pending approval gates once every blocking check passes.
  flows: z.object({ autoApprove: z.array(z.string().min(1)).optional() }).optional(),
  // Pull requests the `pr` flow opens: the provider when the remote's host does not say, the remote
  // and base branch when they cannot be inferred, draft pull requests, and whether to commit the change.
  pr: z.object({
    provider: z.enum(GIT_PROVIDERS).optional(),
    remote: z.string().min(1).optional(),
    base: z.string().min(1).optional(),
    draft: z.boolean().optional(),
    commit: z.boolean().optional()
  }).optional(),
  // Explain-back (experimental): before approval, a read-only agent asks the reviewer three questions about the change. Never blocks.
  review: z.object({ explainBack: z.boolean().optional(), provider: z.string().min(1).optional() }).optional(),
  // Proof receipts (`maverick proof`): where the signing key lives, and whether the pr flow signs the commit it pushes.
  proof: z.object({ keyFile: z.string().min(1).optional(), onPullRequest: z.boolean().optional() }).optional(),
  // Loops: budgets, escalation and guardrails for `maverick loop run`. Defaults live in src/loop/model.js.
  loop: z.object({
    yield: z.object({ enabled: z.boolean().optional(), window: z.number().int().min(3).max(20).optional(), metric: z.enum(["tokens", "cost"]).optional(), floor: z.number().nonnegative().optional() }).optional(),
    flow: z.string().min(1).optional(),
    providers: z.array(z.string().min(1)).optional(),
    isolation: z.enum(LOOP_ISOLATION).optional(),
    worktreeDir: z.string().min(1).optional(),
    setup: z.array(z.string().min(1)).optional(),
    setupTimeoutMinutes: z.number().positive().max(240).optional(),
    budgets: z.object({
      maxIterations: z.number().int().min(1).max(500).optional(),
      maxMinutes: z.number().positive().max(7 * 24 * 60).optional(),
      maxCostUsd: z.number().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      forecast: z.enum(["p90", "mean", "off"]).optional()
    }).optional(),
    stall: z.object({
      window: z.number().int().min(2).max(10).optional(),
      churnLines: z.number().int().positive().optional(),
      rollbackStreak: z.number().int().min(2).max(10).optional(),
      overclaims: z.number().int().min(1).max(10).optional()
    }).optional(),
    escalation: z.array(z.enum(LOOP_LADDER_STEPS)).min(1).optional(),
    maxEffort: z.enum(EFFORTS).optional(),
    protectedPaths: z.array(z.string().min(1)).optional(),
    blastRadius: z.object({ maxFiles: z.number().int().positive().optional(), maxLines: z.number().int().positive().optional() }).optional(),
    integrity: z.union([z.enum(INTEGRITY_LEVELS), z.object({
      level: z.enum(INTEGRITY_LEVELS).optional(),
      severity: z.partialRecord(z.enum(FINDING_KINDS), z.enum(["block", "warn", "off"])).optional(),
      allow: z.array(z.object({ kind: z.enum(FINDING_KINDS), path: z.string().min(1), reason: z.string().min(1) })).optional()
    })]).optional(),
    ratchet: z.object({ newFailures: z.enum(["count", "strict"]).optional(), recheck: z.number().int().min(0).max(3).optional() }).optional(),
    gateTimeoutMinutes: z.number().positive().max(24 * 60).optional(),
    stopPollMs: z.number().int().min(50).max(1e4).optional(),
    judge: z.object({
      enabled: z.boolean().optional(),
      prefer: z.array(z.string().min(1)).optional(),
      // Judges always work in an export; `live` is accepted for older configurations and warned about.
      isolation: z.enum(["export", "live"]).optional()
    }).optional(),
    // What the next agent learns from a rejection or a verdict (also for flow run --agent fixes).
    feedback: z.enum(["detailed", "criteria", "generic"]).optional(),
    // Whether a task's sealed tests decide its loop: when ready (auto), always (required), or never (off).
    sealed: z.enum(["auto", "required", "off"]).optional()
  }).optional(),
  // Sealed tests: acceptance tests the builder never sees (maverick seal). Defaults live in src/sealed/model.js.
  sealed: z.object({
    ratchet: z.boolean().optional(),
    review: z.object({ required: z.boolean().optional(), provider: z.string().min(1).optional() }).optional(),
    surface: z.enum(["spec", "techspec", "boundary"]).optional(),
    feedback: z.enum(["none", "count", "ac"]).optional(),
    threshold: z.number().min(0).max(1).optional(),
    when: z.enum(["milestones", "done"]).optional(),
    maxQueries: z.number().int().min(1).max(50).optional(),
    timeoutMinutes: z.number().positive().max(240).optional(),
    requireApproval: z.boolean().optional(),
    encryption: z.object({ key: z.enum(["file", "env", "command"]).optional(), command: z.string().min(1).optional() }).optional(),
    sealer: z.object({ provider: z.string().min(1).optional(), model: z.string().min(1).optional(), effort: z.enum(EFFORTS).optional(), prefer: z.array(z.string().min(1)).optional() }).optional()
  }).optional(),
  // Languages: `docs` for what the flow writes and says, `code` for what lands in the codebase.
  language: z.object({ docs: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, "use a language code such as en or pt-BR").optional(), code: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, "use a language code such as en or pt-BR").optional() }).optional(),
  // Authoring: project context and per-artifact rules given to every agent that writes task artifacts.
  authoring: z.object({
    context: z.string().max(5e4).optional(),
    rules: z.partialRecord(z.enum(["PRD", "TECHSPEC", "TASKS"]), z.array(z.string().min(1))).optional()
  }).optional(),
  // Architecture intelligence: component boundaries and rules checked on every import.
  architecture: z.object({
    components: z.array(z.string().min(1)).optional(),
    depth: z.number().int().positive().max(12).optional(),
    maxComponents: z.number().int().min(2).max(200).optional(),
    rules: z.array(z.object({ from: z.string().min(1), disallow: z.array(z.string().min(1)).min(1), allow: z.array(z.string().min(1)).optional(), reason: z.string().optional() })).optional(),
    // The architecture gate fails a change that lowers health by more than this many points.
    maxHealthDrop: z.number().min(0).max(100).optional()
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

// src/capabilities/model.js
import { createHash } from "crypto";
import { readdir as readdir2, readFile as readFile4 } from "fs/promises";
import { basename, join as join4, relative as relative2, sep } from "path";
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
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = join4(dir, entry.name);
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
  const text = await readFile4(join4(dir, entry), "utf8");
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
  const contents = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile4(join4(dir, file))])));
  const integrity = sha256(files.map((file) => `${file}\0${sha256(contents[file])}`).join("\n"));
  return { ref: `${kind}/${parsed.data.name}`, kind, ...parsed.data, body, dir, source, entry, files, contents, integrity };
}

// src/core/home.js
import { homedir as homedir2 } from "os";
import { basename as basename2, join as join5, relative as relative3, resolve as resolve2, isAbsolute as isAbsolute2 } from "path";
function maverickHome() {
  return process.env.MAVERICK_HOME || join5(homedir2(), ".maverick");
}
function repoKey(root) {
  return `${basename2(root)}-${sha256(resolve2(root)).slice(0, 8)}`;
}
function homePath(root, area, ...parts) {
  return join5(maverickHome(), area, repoKey(root), ...parts);
}
function overlaps(a, b) {
  const inside = (outer, inner) => {
    const path = relative3(resolve2(outer), resolve2(inner));
    return path === "" || !path.startsWith("..") && !isAbsolute2(path);
  };
  return inside(a, b) || inside(b, a);
}

// src/subtasks/graph.js
import { mkdir as mkdir2, readdir as readdir3, readFile as readFile6, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname3, join as join6, resolve as resolve3 } from "path";
import { z as z3 } from "zod";

// src/core/lock.js
import { AsyncLocalStorage as AsyncLocalStorage2 } from "async_hooks";
import { mkdir, readFile as readFile5, rm, writeFile } from "fs/promises";
import { hostname } from "os";
import { dirname as dirname2 } from "path";
import { setTimeout as sleep } from "timers/promises";
var held = new AsyncLocalStorage2();
var alive = (holder) => {
  if (!holder || holder.host !== hostname()) return Boolean(holder);
  try {
    process.kill(holder.pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};
async function withFileLock(path, fn, { timeoutMs = 15e3, retryMs = 15 } = {}) {
  if (held.getStore()?.has(path)) return fn();
  await mkdir(dirname2(path), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    try {
      await writeFile(path, JSON.stringify({ pid: process.pid, host: hostname(), at: (/* @__PURE__ */ new Date()).toISOString() }), { flag: "wx" });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const holder = await readFile5(path, "utf8").then(JSON.parse).catch(() => null);
      if (holder && !alive(holder)) {
        await rm(path, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`${path} is locked by pid ${holder?.pid ?? "?"}${holder?.host && holder.host !== hostname() ? ` on ${holder.host}` : ""}; try again, or remove the file if no Maverick process is running`);
      await sleep(retryMs + Math.floor(Math.random() * retryMs));
    }
  }
  const paths = /* @__PURE__ */ new Set([...held.getStore() || [], path]);
  try {
    return await held.run(paths, fn);
  } finally {
    await rm(path, { force: true });
  }
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
var dirFor = (taskDir) => join6(taskDir, "subtasks");
var lockBase = (taskDir) => join6(maverickHome(), "locks", sha256(resolve3(taskDir)).slice(0, 24));
var withGraphLock = (taskDir, fn) => withFileLock(`${lockBase(taskDir)}.lock`, fn);
async function harnessWrite(taskDir, path, content) {
  await writeFile2(path, content);
  const journal = `${lockBase(taskDir)}.journal.json`, entries = await readFile6(journal, "utf8").then(JSON.parse).catch(() => ({}));
  entries[resolve3(path)] = sha256(content);
  await mkdir2(dirname3(journal), { recursive: true });
  await writeFile2(journal, JSON.stringify(entries));
}
async function writtenByHarness(taskDir, path, content) {
  if (!content) return false;
  const entries = await readFile6(`${lockBase(taskDir)}.journal.json`, "utf8").then(JSON.parse).catch(() => ({}));
  return entries[resolve3(path)] === sha256(content);
}
var CHECKBOX = /^\s*[-*] \[( |x|X)\] +(.+)$/;
function checklist(body = "") {
  const items = [];
  let section = "";
  for (const line of String(body).split("\n")) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    const box = line.match(CHECKBOX);
    if (box) items.push({ section, text: box[2].trim(), done: box[1] !== " " });
  }
  const done = items.filter((item) => item.done).length;
  return { total: items.length, done, open: items.filter((item) => !item.done) };
}
function checkboxOnlyChange(before = "", after = "") {
  const a = String(before).split("\n"), b = String(after).split("\n");
  if (a.length !== b.length) return false;
  return a.every((line, index) => {
    if (line === b[index]) return true;
    const x = line.match(CHECKBOX), y = b[index].match(CHECKBOX);
    return Boolean(x && y) && line.replace(/\[( |x|X)\]/, "[ ]") === b[index].replace(/\[( |x|X)\]/, "[ ]");
  });
}
function issues(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
function findCycle(ids, edges) {
  const next = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) next.get(edge.from)?.push(edge.to);
  const state = /* @__PURE__ */ new Map(), stack = [];
  const visit = (id) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const to of next.get(id) || []) {
      if (state.get(to) === "visiting") return [...stack.slice(stack.indexOf(to)), to];
      if (!state.has(to)) {
        const cycle = visit(to);
        if (cycle) return cycle;
      }
    }
    state.set(id, "done");
    stack.pop();
    return null;
  };
  for (const id of ids) if (!state.has(id)) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}
function topologicalOrder(ids, edges) {
  const incoming = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  const ready = ids.filter((id) => !incoming.get(id)).sort(), order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const edge of edges.filter((item) => item.from === id)) {
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
  const dir = dirFor(taskDir), manifestPath = join6(dir, MANIFEST);
  if (!await exists(manifestPath)) return { exists: false, nodes: [], edges: [], items: [], problems: [] };
  const problems = [];
  const parsed = manifestSchema.safeParse(parseFrontmatter(await readFile6(manifestPath, "utf8")).data);
  if (!parsed.success) return { exists: true, nodes: [], edges: [], items: [], problems: [`${MANIFEST}: ${issues(parsed.error)}`] };
  const { nodes, edges } = parsed.data, ids = nodes.map((node) => node.id);
  for (const id of ids.filter((value, index) => ids.indexOf(value) !== index)) problems.push(`duplicate node ${id}`);
  for (const edge of edges) {
    if (!ids.includes(edge.from) || !ids.includes(edge.to)) problems.push(`edge ${edge.from} \u2192 ${edge.to} references an unknown node`);
    if (edge.from === edge.to) problems.push(`node ${edge.from} depends on itself`);
  }
  const cycle = findCycle(ids, edges.filter((edge) => ids.includes(edge.from) && ids.includes(edge.to)));
  if (cycle) problems.push(`dependency cycle: ${cycle.join(" \u2192 ")}`);
  const items = [];
  for (const node of nodes) {
    const path = join6(dir, node.file);
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
    items.push({ id: node.id, file: node.file, ...item.data, body, checklist: checklist(body), dependsOn: edges.filter((edge) => edge.to === node.id).map((edge) => edge.from) });
  }
  const listed = new Set(nodes.map((node) => node.file));
  for (const file of (await readdir3(dir)).filter((name2) => /^task_\d{2,3}\.md$/.test(name2) && !listed.has(name2))) problems.push(`${file} is not listed in ${MANIFEST}`);
  const order = cycle ? ids : topologicalOrder(ids, edges);
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const done = new Set(items.filter((item) => item.status === "done").map((item) => item.id));
  for (const item of items) item.ready = item.status === "pending" && item.dependsOn.every((id) => done.has(id));
  return { exists: true, nodes, edges, items, problems };
}
async function writeManifest(taskDir, slug, nodes, edges, items) {
  const list = items.map((item) => `- [${item.status === "done" ? "x" : " "}] ${item.id} ${item.title} \u2014 ${item.status}${item.dependsOn.length ? ` \xB7 after ${item.dependsOn.join(", ")}` : ""}`).join("\n");
  await harnessWrite(taskDir, join6(dirFor(taskDir), MANIFEST), renderFrontmatter({ schema: "maverick.subtasks/v1", nodes, edges }, `# Subtasks \u2014 ${slug}

The frontmatter is the source of truth for dependencies and each task_NN.md for its status. Manage them with \`maverick subtask\`.

${list}
`));
}
async function refreshManifest(taskDir, slug) {
  return withGraphLock(taskDir, () => refresh(taskDir, slug));
}
async function refresh(taskDir, slug) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  await writeManifest(taskDir, slug, graph.nodes, graph.edges, graph.items);
}
async function addSubtask(taskDir, slug, spec) {
  await mkdir2(dirFor(taskDir), { recursive: true });
  return withGraphLock(taskDir, () => add(taskDir, slug, spec));
}
async function add(taskDir, slug, { title, after = [], type, complexity, body }) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  const ids = graph.nodes.map((node) => node.id);
  const unknown = after.filter((id2) => !ids.includes(id2));
  if (unknown.length) throw new Error(`unknown dependency ${unknown.join(", ")}; existing subtasks: ${ids.join(", ") || "none"}`);
  if (complexity && !COMPLEXITY.includes(complexity)) throw new Error(`complexity must be one of ${COMPLEXITY.join(", ")}`);
  const id = String(Math.max(0, ...ids.map(Number)) + 1).padStart(2, "0"), file = `task_${id}.md`;
  const nodes = [...graph.nodes, { id, file }], edges = [...graph.edges, ...after.map((from) => ({ from, to: id }))];
  await mkdir2(dirFor(taskDir), { recursive: true });
  await harnessWrite(taskDir, join6(dirFor(taskDir), file), renderFrontmatter({ title, status: "pending", type, complexity }, body?.trim() ? `${body.trim()}
` : `# ${title}

## Goal
FILL ME

## Acceptance Criteria
- [ ] AC-01: FILL ME

## Files
- \`FILL ME\`

## Steps
- [ ] FILL ME

## Verification
\`\`\`bash
FILL ME
\`\`\`
- [ ] UT-01: FILL ME
`));
  await writeManifest(taskDir, slug, nodes, edges, [...graph.items, { id, title, status: "pending", dependsOn: after }]);
  return { id, file };
}
async function setStatus(taskDir, slug, id, status, options = {}) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  return withGraphLock(taskDir, () => updateStatus(taskDir, slug, id, status, options));
}
async function updateStatus(taskDir, slug, id, status, { force = false } = {}) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  const item = graph.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`subtask not found: ${id}; existing: ${graph.items.map((entry) => entry.id).join(", ") || "none"}`);
  const blockedBy = item.dependsOn.filter((dep) => graph.items.find((entry) => entry.id === dep)?.status !== "done");
  if (["in-progress", "done"].includes(status) && blockedBy.length) throw new Error(`subtask ${id} depends on unfinished ${blockedBy.join(", ")}`);
  if (status === "done" && !force && item.checklist.open.length) {
    const open = item.checklist.open.map((entry) => `
  - [ ] ${entry.section ? `${entry.section}: ` : ""}${entry.text}`).join("");
    throw new Error(`subtask ${id} has ${item.checklist.open.length} of ${item.checklist.total} item(s) unchecked in ${item.file}; check each one as it is done (- [x]), or pass --force:${open}`);
  }
  const path = join6(dirFor(taskDir), item.file), { data, body } = parseFrontmatter(await readFile6(path, "utf8"));
  await harnessWrite(taskDir, path, renderFrontmatter({ ...data, status }, body));
  item.status = status;
  await writeManifest(taskDir, slug, graph.nodes, graph.edges, graph.items);
  return item;
}

// src/core/pipeline.js
import { readFile as readFile7 } from "fs/promises";
import { join as join7 } from "path";
var STAGE_SKILLS = { prd: "maverick-prd", spec: "maverick-spec", techspec: "maverick-techspec", tasks: "maverick-tasks" };
var NEXT = {
  prd: (slug) => `write the PRD: run the maverick-prd skill for ${slug}`,
  spec: (slug) => `write the behavioral spec: run the maverick-spec skill for ${slug}, then get it approved`,
  techspec: (slug) => `write the technical spec: run the maverick-techspec skill for ${slug}`,
  tasks: (slug) => `break it into tasks: run the maverick-tasks skill for ${slug}`,
  build: (slug) => `implement the next task with the maverick-build skill (maverick subtask next ${slug})`,
  verify: (slug) => `verify and review with the maverick-review skill (maverick verify ${slug})`,
  security: (slug) => `run the security gate with the maverick-review skill (maverick security ${slug})`,
  review: () => `review with the maverick-review skill, then record the human decision in REVIEW.md`,
  pr: (slug, meta) => meta.pullRequest?.opened ? `merge the pull request (${meta.pullRequest.url}), then finish the task: maverick done ${slug}` : `open the pull request: maverick flow run pr ${slug} drafts it, waits for its approval and opens it; then maverick done ${slug}`,
  done: (slug) => `nothing: the task is finished (maverick reopen ${slug} to work on it again)`
};
var DECISION = /- \[[xX]\] (?:approve|approve with follow-up|request changes)/;
var readMeta = async (dir) => {
  try {
    return JSON.parse(await readFile7(join7(dir, "TASK.json"), "utf8"));
  } catch {
    return {};
  }
};
async function taskStage(dir, preset, slug = "") {
  const artifacts = {}, meta = await readMeta(dir);
  for (const item of ARTIFACTS) artifacts[item.id] = await exists(join7(dir, item.file));
  const graph = await loadGraph(dir);
  const tasks = { total: graph.items.length, done: graph.items.filter((item) => item.status === "done").length };
  const has = (file) => exists(join7(dir, file));
  const review = await has("REVIEW.md") ? await readFile7(join7(dir, "REVIEW.md"), "utf8") : "";
  let stage;
  const planning = planningStages(preset).find((id) => id === "tasks" ? !tasks.total : !artifacts[artifactForStage(id).id]);
  if (meta.done) stage = "done";
  else if (planning) stage = planning;
  else if (tasks.done < tasks.total) stage = "build";
  else if (!await has("EVIDENCE.md")) stage = "verify";
  else if (preset.strict && !await has("SECURITY-REPORT.md")) stage = "security";
  else if (!DECISION.test(review)) stage = "review";
  else stage = "pr";
  return { stage, next: NEXT[stage](slug, meta), artifacts, tasks };
}

// src/core/tasks.js
import { readdir as readdir4, writeFile as writeFile3 } from "fs/promises";
import { join as join8 } from "path";
function taskPath(cwd, config, slug) {
  requireSlug(slug);
  return join8(cwd, config.taskRoot, slug);
}
async function taskMeta(dir) {
  return await exists(join8(dir, "TASK.json")) ? readJson(join8(dir, "TASK.json")) : {};
}
async function writeTaskMeta(dir, meta) {
  await writeFile3(join8(dir, "TASK.json"), pretty(meta));
}
async function taskPreset(dir) {
  return (await taskMeta(dir)).workflow || "standard";
}
async function listTasks(cwd, config) {
  config ||= await loadConfig(cwd);
  const base = join8(cwd, config.taskRoot);
  if (!await exists(base)) return [];
  const tasks = [];
  for (const entry of (await readdir4(base, { withFileTypes: true })).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join8(base, entry.name), preset = requirePreset(await taskPreset(dir)), state = await taskStage(dir, preset, entry.name);
    tasks.push({ task: entry.name, workflow: preset.id, stage: state.stage, tasks: state.tasks, next: state.next, stages: preset.stages });
  }
  return tasks;
}
async function getTask(cwd, slug) {
  const config = await loadConfig(cwd), dir = taskPath(cwd, config, slug);
  if (!await exists(dir)) {
    const known = (await listTasks(cwd, config)).map((task) => task.task);
    throw new Error(`task not found: ${rel(cwd, dir)} in ${cwd}; ${known.length ? `tasks here: ${known.join(", ")}` : "this project has no tasks yet"}. Run it from the project that owns the task, or start one with maverick new "<idea>"`);
  }
  const meta = { idea: slug.replace(/-/g, " "), ...await taskMeta(dir) };
  return { config, dir, meta, preset: requirePreset(meta.workflow || "standard") };
}

export {
  colorEnabled,
  style,
  wordmark,
  packageRoot,
  packageVersion,
  IGNORED_DIRS,
  exists,
  readJson,
  readText,
  parseJson,
  pretty,
  rel,
  brandOutput,
  output,
  captureOutput,
  brand,
  replaceVars,
  sectionPresent,
  sectionBody,
  hasMeaningfulContent,
  requireSlug,
  parseOptions,
  splitCommand,
  commandAvailable,
  changedFilesFromDiff,
  distance,
  closest,
  PRESET_IDS,
  ARTIFACTS,
  PLANNING_STAGES,
  presets,
  getPreset,
  requirePreset,
  stagesForPreset,
  planningStages,
  artifactForStage,
  CHECK_KINDS,
  detectStack,
  selectVerificationCommands,
  defaultConfig,
  globalConfigPath,
  resolveConfig,
  loadConfig,
  ENTRY_FILES,
  sha256,
  parseFrontmatter,
  renderFrontmatter,
  loadCapability,
  maverickHome,
  repoKey,
  homePath,
  overlaps,
  STATUSES,
  COMPLEXITY,
  MANIFEST,
  withGraphLock,
  harnessWrite,
  writtenByHarness,
  checklist,
  checkboxOnlyChange,
  loadGraph,
  refreshManifest,
  addSubtask,
  setStatus,
  STAGE_SKILLS,
  taskStage,
  taskPath,
  taskMeta,
  writeTaskMeta,
  taskPreset,
  listTasks,
  getTask
};
