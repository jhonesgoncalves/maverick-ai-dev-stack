import {
  AGENT_STAGE_IDS,
  ARTIFACTS,
  CHECK_KINDS,
  COMPLEXITY,
  EFFORTS,
  ENTRY_FILES,
  IGNORED_DIRS,
  MANIFEST,
  PERMISSIONS,
  PLANNING_STAGES,
  PRESET_IDS,
  STAGE_SKILLS,
  STATUSES,
  addSubtask,
  artifactForStage,
  brand,
  captureOutput,
  changedFilesFromDiff,
  colorEnabled,
  commandAvailable,
  defaultConfig,
  detectStack,
  exists,
  getTask,
  globalConfigPath,
  hasMeaningfulContent,
  listTasks,
  loadCapability,
  loadConfig,
  loadGraph,
  output,
  packageRoot,
  packageVersion,
  parseFrontmatter,
  planningStages,
  pretty,
  readJson,
  readText,
  refreshManifest,
  rel,
  renderFrontmatter,
  replaceVars,
  requirePreset,
  requireSlug,
  resolveConfig,
  sectionBody,
  sectionPresent,
  selectVerificationCommands,
  setStatus,
  sha256,
  splitCommand,
  style,
  taskPath,
  taskPreset,
  taskStage,
  wordmark
} from "./chunk-YKOOPOXS.js";
import {
  MUST_WORDS,
  REQUIREMENT_HEADING,
  SCENARIO_HEADING,
  THEN_WORDS,
  WHEN_WORDS,
  fold,
  heading,
  headingAliases,
  keyword,
  languageName,
  languageRule,
  normalizeLanguage,
  projectLanguage
} from "./chunk-DSSJQNFU.js";

// src/capabilities/catalog.js
import { readdir } from "fs/promises";
import { join, resolve } from "path";
var entryNames = new Set(Object.values(ENTRY_FILES));
async function capabilityDirs(root, depth = 0) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isFile() && entryNames.has(entry.name))) return [root];
  if (depth >= 4) return [];
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules").map((entry) => capabilityDirs(join(root, entry.name), depth + 1)));
  return nested.flat();
}
function catalogRoots(cwd, config = {}) {
  return [
    { source: "project", path: join(cwd, ".maverick", "capabilities") },
    ...(config.capabilities?.catalogs || []).map((path) => ({ source: `catalog:${path}`, path: resolve(cwd, path) })),
    { source: "built-in", path: join(packageRoot, "capabilities") }
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

// src/intel/graph.js
import { readFile, stat } from "fs/promises";
import { dirname, join as join3, normalize } from "path";

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
  Python: (text) => [...text.matchAll(/^[ \t]*(?:from[ \t]+([.\w]+)[ \t]+import[ \t]+(?:\(([^)]*)\)|([\w \t,]+))|import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*))/gm)].flatMap((match) => match[1] ? [match[1], ...(match[2] ?? match[3]).split(",").map((name) => name.trim().split(/\s+as\s+/)[0].trim()).filter((name) => /^\w+$/.test(name)).map((name) => `${match[1]}${/\.$/.test(match[1]) ? "" : "."}${name}`)] : match[4].split(",").map((name) => name.trim())),
  Go: (text) => [
    ...all(text, /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm),
    ...[...text.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)].flatMap((block) => all(block[1], /"([^"]+)"/g))
  ],
  Rust: (text) => [...all(text, /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/gm), ...all(text, /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm).map((name) => `mod:${name}`)],
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

// src/intel/files.js
import { readdir as readdir2 } from "fs/promises";
import { join as join2, relative, sep } from "path";
var MAX_FILES = 5e3;
var posix = (path) => path.split(sep).join("/");
var TEST_FILE = /(^|\/)(__tests__|tests?|spec|specs|e2e)\/|[._-](test|spec)\.[^/]+$|_test\.(go|py|exs)$|(^|\/)test_[^/]+\.py$|Tests?\.(java|kt|cs|swift)$/i;
async function listFiles(root, keep, { limit = MAX_FILES, depthLimit = 12 } = {}) {
  const files = [];
  async function visit(dir, depth) {
    if (depth > depthLimit || files.length >= limit) return;
    for (const entry of (await readdir2(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= limit) return;
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const path = join2(dir, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile()) {
        const file = posix(relative(root, path));
        if (keep(file)) files.push(file);
      }
    }
  }
  await visit(root, 0);
  return files;
}
function lineIndex(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) starts.push(index + 1);
  return (offset) => {
    let low = 0, high = starts.length - 1;
    while (low < high) {
      const mid = low + high + 1 >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

// src/intel/graph.js
var MAX_BYTES = 512 * 1024;
var TEST = TEST_FILE;
var sourceFiles = (root) => listFiles(root, (file) => Boolean(languageForPath(file)));
var JS_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"];
var jsCandidates = (base2) => {
  const stem2 = base2.replace(/\.(m|c)?js$|\.d\.ts$/, "");
  return [...JS_EXTENSIONS.map((ext) => base2 + ext), ...JS_EXTENSIONS.map((ext) => stem2 + ext)];
};
var clean = (path) => posix(normalize(path)).replace(/^\.\//, "").replace(/\/$/, "");
function nearest(map, file) {
  for (let dir = posix(dirname(file)); ; dir = posix(dirname(dir))) {
    const key = dir === "." ? "" : dir;
    if (map.has(key)) return map.get(key);
    if (!key) return void 0;
  }
}
var RESOLVERS = {
  JavaScript(spec, from, ctx) {
    if (spec.startsWith(".")) return first(ctx, jsCandidates(posix(normalize(join3(dirname(from), spec)))));
    const aliases = nearest(ctx.tsconfigs, from);
    if (aliases) {
      for (const [pattern, targets] of aliases.paths) {
        const star = pattern.indexOf("*"), matched = star < 0 ? spec === pattern ? "" : null : spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1)) && spec.length >= pattern.length - 1 ? spec.slice(star, spec.length - (pattern.length - star - 1)) : null;
        if (matched === null) continue;
        for (const target of targets) {
          const hit = first(ctx, jsCandidates(clean(join3(aliases.base, target.replace("*", matched)))));
          if (hit.length) return hit;
        }
      }
      if (aliases.baseUrl !== void 0) {
        const hit = first(ctx, jsCandidates(clean(join3(aliases.baseUrl, spec))));
        if (hit.length) return hit;
      }
    }
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0], pkg = ctx.workspaces.get(name);
    if (!pkg) return [];
    const rest = spec.slice(name.length).replace(/^\//, "");
    if (rest) return first(ctx, [...jsCandidates(clean(join3(pkg.dir, rest))), ...jsCandidates(clean(join3(pkg.dir, "src", rest)))]);
    return first(ctx, pkg.entries.flatMap((entry) => [...jsCandidates(clean(join3(pkg.dir, entry))), ...jsCandidates(clean(join3(pkg.dir, entry.replace(/^(\.\/)?(dist|build|lib|out|esm|cjs)\//, "src/"))))]).concat([`${pkg.dir ? `${pkg.dir}/` : ""}src/index.ts`, `${pkg.dir ? `${pkg.dir}/` : ""}src/index.tsx`, `${pkg.dir ? `${pkg.dir}/` : ""}src/index.js`, `${pkg.dir ? `${pkg.dir}/` : ""}index.ts`, `${pkg.dir ? `${pkg.dir}/` : ""}index.js`]));
  },
  Python(spec, from, ctx) {
    const dots = spec.match(/^\.*/)[0].length, rest = spec.slice(dots).replaceAll(".", "/");
    const bases = dots ? [posix(normalize(join3(dirname(from), ...Array(dots - 1).fill(".."), rest)))] : [rest, ...ctx.pythonRoots.map((root) => `${root}/${rest}`)];
    return first(ctx, bases.flatMap((base2) => [`${base2}.py`, `${base2}/__init__.py`]));
  },
  Go(spec, from, ctx) {
    const module = ctx.goModules.find((item) => spec === item.path || spec.startsWith(`${item.path}/`));
    if (!module) return [];
    const dir = clean(join3(module.dir || ".", spec.slice(module.path.length).replace(/^\//, ""))) || ".";
    return (ctx.byDir.get(dir === "" ? "." : dir) || []).filter((file) => file.endsWith(".go") && !file.endsWith("_test.go"));
  },
  Rust(spec, from, ctx) {
    if (spec.startsWith("mod:")) {
      const name = spec.slice(4), dir = posix(dirname(from)), own = from.replace(/(mod|lib|main)\.rs$/, "").replace(/\.rs$/, "/");
      return first(ctx, [`${own}${name}.rs`, `${own}${name}/mod.rs`, `${dir}/${name}.rs`, `${dir}/${name}/mod.rs`].map((path) => path.replace(/^\.\//, "")));
    }
    const parts = spec.split("::");
    const crate = parts[0] === "crate" ? nearest(ctx.crates, from) : ctx.crateNames.get(parts[0]);
    const crateRoot = crate ? `${crate.dir ? `${crate.dir}/` : ""}src/` : parts[0] === "crate" ? ctx.files.find((file) => /(^|\/)src\/(lib|main)\.rs$/.test(file))?.replace(/(lib|main)\.rs$/, "") || "src/" : null;
    if (!crateRoot) return [];
    for (let size = parts.length - 1; size >= 1; size--) {
      const path = parts.slice(1, size + 1).join("/");
      const found = first(ctx, [`${crateRoot}${path}.rs`, `${crateRoot}${path}/mod.rs`]);
      if (found.length) return found;
    }
    return parts[0] === "crate" ? [] : first(ctx, [`${crateRoot}lib.rs`]);
  },
  Java(spec, from, ctx) {
    const path = spec.replace(/\.\*$/, "").replaceAll(".", "/"), name = path.split("/").pop();
    if (spec.endsWith(".*")) return (ctx.byDir.get([...ctx.byDir.keys()].find((dir) => dir.endsWith(`/${path}`) || dir === path)) || []).filter((file) => /\.(java|kt)$/.test(file));
    return (ctx.byStem.get(name) || []).filter((file) => /\.(java|kt)$/.test(file) && (file.endsWith(`/${path}.java`) || file.endsWith(`/${path}.kt`) || file === `${path}.java` || file === `${path}.kt`));
  },
  "C#"(spec, from, ctx) {
    return (ctx.csNamespaces.get(spec) || []).filter((file) => file !== from);
  },
  Elixir(spec, from, ctx) {
    const file = ctx.elixirModules.get(spec);
    return file && file !== from ? [file] : [];
  },
  Ruby(spec, from, ctx) {
    return spec.startsWith(".") ? first(ctx, [posix(normalize(join3(dirname(from), spec))) + (spec.endsWith(".rb") ? "" : ".rb")]) : first(ctx, [`lib/${spec}.rb`, `${spec}.rb`, `app/${spec}.rb`]);
  },
  PHP(spec, from, ctx) {
    if (/\.php$/.test(spec)) return first(ctx, [posix(normalize(join3(dirname(from), spec)))]);
    for (const { prefix, dirs } of ctx.psr4) if (spec.startsWith(prefix)) {
      const hit = first(ctx, dirs.map((dir) => clean(join3(dir, `${spec.slice(prefix.length).replaceAll("\\", "/")}.php`))));
      if (hit.length) return hit;
    }
    return [];
  },
  Dart(spec, from, ctx) {
    if (spec.startsWith("package:")) {
      const [pkg, ...path] = spec.slice(8).split("/");
      const dir = ctx.dartPackages.get(pkg);
      return dir !== void 0 ? first(ctx, [clean(join3(dir, "lib", path.join("/")))]) : [];
    }
    return spec.includes(":") ? [] : first(ctx, [posix(normalize(join3(dirname(from), spec)))]);
  },
  "C/C++"(spec, from, ctx) {
    return first(ctx, [posix(normalize(join3(dirname(from), spec))), spec, ...ctx.includeDirs.map((dir) => clean(join3(dir, spec)))]);
  }
};
RESOLVERS.TypeScript = RESOLVERS.JavaScript;
RESOLVERS.Kotlin = RESOLVERS.Java;
function first(ctx, candidates) {
  const hit = candidates.find((candidate) => ctx.fileSet.has(candidate));
  return hit ? [hit] : [];
}
var parseJsonc = (text) => JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|(?<=^|[^:"'\w])\/\/[^\n]*/g, "").replace(/,(\s*[}\]])/g, "$1"));
async function tsconfigs(root, read) {
  const found = await listFiles(root, (file) => /(^|\/)(tsconfig|jsconfig)(\.[\w-]+)?\.json$/.test(file), { depthLimit: 6 });
  const parsed = /* @__PURE__ */ new Map();
  for (const file of found) {
    try {
      parsed.set(file, parseJsonc(await read(file)));
    } catch {
    }
  }
  const effective = (file, seen = /* @__PURE__ */ new Set()) => {
    const config = parsed.get(file);
    if (!config || seen.has(file)) return {};
    seen.add(file);
    const dir = posix(dirname(file)) === "." ? "" : posix(dirname(file));
    const parent = typeof config.extends === "string" && config.extends.startsWith(".") ? effective(clean(join3(dir, config.extends.endsWith(".json") ? config.extends : `${config.extends}.json`)), seen) : {};
    const options = config.compilerOptions || {};
    const baseUrl = options.baseUrl !== void 0 ? clean(join3(dir, options.baseUrl)) : parent.baseUrl;
    return options.paths ? { baseUrl, base: baseUrl ?? dir, paths: Object.entries(options.paths) } : { baseUrl, base: parent.base ?? baseUrl ?? dir, paths: parent.paths || [] };
  };
  const byDir = /* @__PURE__ */ new Map();
  for (const file of parsed.keys()) {
    if (!/(^|\/)(tsconfig|jsconfig)\.json$/.test(file)) continue;
    const config = effective(file), dir = posix(dirname(file)) === "." ? "" : posix(dirname(file));
    if (config.paths?.length || config.baseUrl !== void 0) byDir.set(dir, config);
  }
  return byDir;
}
async function projectContext(root, files, texts = /* @__PURE__ */ new Map()) {
  const read = async (path) => readFile(join3(root, path), "utf8").catch(() => "");
  const manifests = await listFiles(root, (file) => /(^|\/)(package\.json|go\.mod|Cargo\.toml|composer\.json|pubspec\.yaml)$/.test(file), { depthLimit: 6 });
  const workspaces = /* @__PURE__ */ new Map(), goModules = [], crates = /* @__PURE__ */ new Map(), crateNames = /* @__PURE__ */ new Map(), psr4 = [], dartPackages = /* @__PURE__ */ new Map();
  for (const manifest of manifests) {
    const text = await read(manifest), dir = posix(dirname(manifest)) === "." ? "" : posix(dirname(manifest)), name = manifest.split("/").pop();
    try {
      if (name === "package.json") {
        const json3 = JSON.parse(text), exported = typeof json3.exports === "string" ? json3.exports : json3.exports?.["."];
        const entries = [json3.source, typeof exported === "string" ? exported : exported?.source, exported?.import, exported?.default, exported?.require, exported?.types, json3.module, json3.main, json3.types].flat().filter((value) => typeof value === "string");
        if (json3.name && !workspaces.has(json3.name)) workspaces.set(json3.name, { dir, entries });
      } else if (name === "go.mod") {
        const path = text.match(/^module\s+(\S+)/m)?.[1];
        if (path) goModules.push({ path, dir });
      } else if (name === "Cargo.toml") {
        const crate = text.match(/^\[package\][\s\S]*?^\s*name\s*=\s*"([^"]+)"/m)?.[1];
        if (crate) {
          crates.set(dir, { name: crate, dir });
          crateNames.set(crate.replaceAll("-", "_"), { name: crate, dir });
        }
      } else if (name === "composer.json") {
        const json3 = JSON.parse(text);
        for (const [prefix, paths] of Object.entries({ ...json3.autoload?.["psr-4"], ...json3["autoload-dev"]?.["psr-4"] })) psr4.push({ prefix, dirs: [].concat(paths).map((path) => clean(join3(dir, path))) });
      } else if (name === "pubspec.yaml") {
        const pkg = text.match(/^name:\s*(\S+)/m)?.[1];
        if (pkg) dartPackages.set(pkg, dir);
      }
    } catch {
    }
  }
  goModules.sort((a, b) => b.path.length - a.path.length);
  psr4.sort((a, b) => b.prefix.length - a.prefix.length);
  const byDir = /* @__PURE__ */ new Map(), byStem = /* @__PURE__ */ new Map(), csNamespaces = /* @__PURE__ */ new Map(), elixirModules = /* @__PURE__ */ new Map();
  for (const file of files) {
    const dir = posix(dirname(file)), stem2 = file.split("/").pop().replace(/\.[^.]+$/, "");
    byDir.set(dir, [...byDir.get(dir) || [], file]);
    byStem.set(stem2, [...byStem.get(stem2) || [], file]);
    const text = texts.get(file);
    if (!text) continue;
    if (file.endsWith(".cs")) for (const match of text.matchAll(/^\s*namespace\s+([\w.]+)/gm)) csNamespaces.set(match[1], [...csNamespaces.get(match[1]) || [], file]);
    if (/\.exs?$/.test(file)) {
      for (const match of text.matchAll(/^\s*def(?:module|protocol)\s+([\w.]+)/gm)) if (!elixirModules.has(match[1])) elixirModules.set(match[1], file);
    }
  }
  const pythonRoots = ["src", "lib", "app"].filter((dir) => files.some((file) => file.startsWith(`${dir}/`) && file.endsWith(".py")));
  const includeDirs = [...byDir.keys()].filter((dir) => /(^|\/)include$/.test(dir));
  return { files, fileSet: new Set(files), goModules, crates, crateNames, workspaces, psr4, dartPackages, pythonRoots, includeDirs, byDir, byStem, csNamespaces, elixirModules, tsconfigs: await tsconfigs(root, read) };
}
function stronglyConnected(nodes, adjacency) {
  let index = 0;
  const stack = [], onStack = /* @__PURE__ */ new Set(), indices = /* @__PURE__ */ new Map(), low = /* @__PURE__ */ new Map(), components2 = [];
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
      if (component.length > 1 || (adjacency.get(node) || []).includes(node)) components2.push(component.sort());
    }
  };
  for (const node of nodes) if (!indices.has(node)) connect(node);
  return components2.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
async function createResolver(root, files, texts) {
  const ctx = await projectContext(root, files, texts);
  return (language, spec, from) => RESOLVERS[language]?.(spec, from, ctx) || [];
}
async function buildGraph(root, { sources = /* @__PURE__ */ new Map() } = {}) {
  const files = await sourceFiles(root);
  for (const file of files) {
    const info2 = await stat(join3(root, file)).catch(() => null);
    if (!info2 || info2.size > MAX_BYTES) continue;
    sources.set(file, await readFile(join3(root, file), "utf8").catch(() => ""));
  }
  const ctx = await projectContext(root, files, sources);
  const nodes = [], edges = [];
  for (const file of files) {
    if (!sources.has(file)) continue;
    const language = languageForPath(file), text = sources.get(file);
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
  return withMetrics(nodes, edges, { truncated: files.length >= MAX_FILES, files });
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
  const health = healthFor(source.length, [
    { ...HEALTH_RULES.cycle, files: source.filter((node) => inCycles.has(node.id)).map((node) => node.id) },
    { ...HEALTH_RULES.hub, files: hubs }
  ]);
  return { nodes, edges, cycles, hubs, health, out, incoming, ...extra };
}
var HEALTH_RULES = {
  cycle: { rule: "Import cycle", weight: 3, why: "Files in a cycle cannot be understood, tested or changed in isolation." },
  hub: { rule: "Hub file", weight: 2, why: "Widely used and depending on many others: every change ripples both ways." },
  boundary: { rule: "Boundary violation", weight: 3, why: "An import the architecture rules in configuration forbid." }
};
var HEALTH_FORMULA = "100 \u2212 \u03A3 max(1, round(weight \xD7 100 \xD7 share of source files affected))";
function healthFor(sourceFiles2, rules) {
  const total = Math.max(1, sourceFiles2);
  const deductions = rules.filter((rule) => rule.files.length).map((rule) => {
    const files = [...new Set(rule.files)], share2 = files.length / total, points = Math.max(1, Math.round(rule.weight * 100 * share2));
    return { rule: rule.rule, weight: rule.weight, why: rule.why, points, count: files.length, share: Number(share2.toFixed(3)), files: files.slice(0, 50), detail: `${files.length} of ${total} source files (${Math.round(share2 * 1e3) / 10}%) \xD7 weight ${rule.weight}` };
  });
  const share = (name) => deductions.find((item) => item.rule === name)?.share || 0;
  return { score: Math.max(0, 100 - deductions.reduce((sum, item) => sum + item.points, 0)), formula: HEALTH_FORMULA, sourceFiles: total, deductions, cycleShare: share(HEALTH_RULES.cycle.rule), hubShare: share(HEALTH_RULES.hub.rule) };
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
  const id2 = (name) => {
    if (!ids.has(name)) ids.set(name, `n${ids.size}`);
    return ids.get(name);
  };
  const lines = links.map((link) => `  ${id2(link.from)}["${link.from}"] -->|${link.weight}| ${id2(link.to)}["${link.to}"]`);
  return `graph LR
${lines.join("\n") || '  empty["no local imports"]'}`;
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

// src/intel/routes.js
import { readFile as readFile2 } from "fs/promises";
import { dirname as dirname2, join as join4 } from "path";
import { parse as parseYaml } from "yaml";

// src/intel/metrics.js
var HASH_COMMENTS = /* @__PURE__ */ new Set(["Python", "Ruby", "Elixir"]);
var DECISIONS = /\b(if|elif|elsif|for|foreach|while|until|unless|case|when|catch|except|rescue|guard|select)\b|&&|\|\||\?\?|\band\b|\bor\b/g;
var DEBT = /(?:\/\/|#|\/\*|\*|--|<!--|;)[ \t]*(TODO|FIXME|HACK|XXX|BUG|DEPRECATED)\b[ \t:(-]*([^\n]*?)(?:\*\/|-->)?[ \t]*$/gm;
function blank(text, language) {
  const hash = HASH_COMMENTS.has(language);
  let out = "", index = 0;
  const keepLines = (chunk) => chunk.replace(/[^\n]/g, " ");
  while (index < text.length) {
    const char = text[index], next = text[index + 1];
    if (!hash && char === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      const stop = end < 0 ? text.length : end;
      out += keepLines(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (!hash && char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += keepLines(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (hash && char === "#") {
      const end = text.indexOf("\n", index);
      const stop = end < 0 ? text.length : end;
      out += keepLines(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (hash && (text.startsWith('"""', index) || text.startsWith("'''", index))) {
      const quote = text.slice(index, index + 3), end = text.indexOf(quote, index + 3);
      const stop = end < 0 ? text.length : end + 3;
      out += keepLines(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < text.length && text[end] !== char && (char === "`" || text[end] !== "\n")) end += text[end] === "\\" ? 2 : 1;
      out += keepLines(text.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    out += char;
    index++;
  }
  return out;
}
var count = (text, pattern) => (text.match(pattern) || []).length;
function declaredTypes(code, language) {
  let abstract = 0, concrete = 0;
  switch (language) {
    case "TypeScript":
      abstract = count(code, /\b(interface\s+\w|abstract\s+class\s+\w)/g);
      concrete = count(code, /(?<!abstract\s+)\bclass\s+\w/g);
      break;
    case "JavaScript":
      concrete = count(code, /\bclass\s+\w/g);
      break;
    case "Python":
      abstract = count(code, /^\s*class\s+\w+\s*\([^)]*\b(ABC|ABCMeta|Protocol|Interface)\b/gm);
      concrete = count(code, /^\s*class\s+\w/gm) - abstract;
      break;
    case "Go":
      abstract = count(code, /\btype\s+\w+\s+interface\b/g);
      concrete = count(code, /\btype\s+\w+\s+struct\b/g);
      break;
    case "Rust":
      abstract = count(code, /\btrait\s+\w/g);
      concrete = count(code, /\b(struct|enum)\s+\w/g);
      break;
    case "Java":
    case "Kotlin":
    case "C#":
    case "PHP":
    case "Dart":
      abstract = count(code, /\b(interface|abstract\s+class|trait|sealed\s+interface|sealed\s+class|abstract\s+interface|protocol)\s+\w/g);
      concrete = count(code, /\b(class|record|struct|enum|object|data\s+class)\s+\w/g) - count(code, /\babstract\s+class\s+\w|\bsealed\s+class\s+\w/g);
      break;
    case "Swift":
      abstract = count(code, /\bprotocol\s+\w/g);
      concrete = count(code, /\b(class|struct|enum|actor)\s+\w/g);
      break;
    case "Elixir":
      abstract = count(code, /\b(defprotocol|@callback)\b/g) ? 1 : 0;
      concrete = count(code, /\bdefmodule\s+/g) - abstract;
      break;
    case "C/C++":
      abstract = /=\s*0\s*;/.test(code) ? 1 : 0;
      concrete = Math.max(0, count(code, /\b(class|struct)\s+\w+[^;]*\{/g) - abstract);
      break;
    case "Ruby":
      concrete = count(code, /^\s*class\s+\w/gm);
      abstract = count(code, /raise\s+NotImplementedError/g) ? 1 : 0;
      break;
    default:
      break;
  }
  const functions = { TypeScript: /^export\s+(?:default\s+)?(?:async\s+)?(?:function\b|const\s+\w+\s*=\s*(?:async\s*)?\(|const\s+\w+\s*=\s*(?:async\s+)?\w+\s*=>)/gm, Python: /^(?:async\s+)?def\s+\w/gm, Go: /^func\s+(?:\([^)]*\)\s*)?\w/gm, Rust: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+\w/gm, Elixir: /^\s*def\s+\w/gm, Kotlin: /^fun\s+\w/gm, Swift: /^(?:public\s+)?func\s+\w/gm }[language === "JavaScript" ? "TypeScript" : language];
  if (functions) concrete += count(code, functions);
  return { abstract: Math.max(0, abstract), concrete: Math.max(0, concrete) };
}
function fileMetrics(text, language) {
  const code = blank(text, language), lines = code.split("\n");
  let loc = 0, maxNesting = 0, unit = 0;
  const indents = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    loc++;
    const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    indents.push(indent);
  }
  const steps = /* @__PURE__ */ new Map();
  for (let index = 1; index < indents.length; index++) {
    const step = indents[index] - indents[index - 1];
    if (step > 0 && step <= 8) steps.set(step, (steps.get(step) || 0) + 1);
  }
  unit = [...steps].sort((a, b) => b[1] - a[1])[0]?.[0] || 4;
  for (const indent of indents) maxNesting = Math.max(maxNesting, Math.floor(indent / unit));
  const complexity = 1 + count(code, DECISIONS);
  const types = declaredTypes(code, language);
  const debt = [];
  for (const match of text.matchAll(DEBT)) {
    const line = text.slice(0, match.index).split("\n").length;
    debt.push({ tag: match[1].toUpperCase(), text: match[2].trim().slice(0, 160), line });
    if (debt.length >= 50) break;
  }
  return { loc, complexity, maxNesting, types, debt };
}

// src/intel/routes.js
var MAX_BYTES2 = 512 * 1024;
var VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
var VERB_SET = new Set(VERBS);
var EXTRA_FILES = /\.(vue|svelte|astro|mdx|graphql|gql|proto)$|(^|\/)[^/]*(openapi|swagger)[^/]*\.(ya?ml|json)$|(^|\/)(application|bootstrap)[^/]*\.(properties|ya?ml)$/i;
function balanced(text, open, limit = 4e3) {
  const pairs = { "(": ")", "[": "]", "{": "}" }, stack = [pairs[text[open]]];
  let quote = null;
  for (let index = open + 1; index < text.length && index < open + limit; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return index;
    }
  }
  return -1;
}
function strings(text = "") {
  return [...text.matchAll(/(?:\b[rRfFbu@$]{1,2})?(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((match) => match[2]);
}
function named(text = "", key) {
  const match = text.match(new RegExp(`(?:^|[\\s,({])['"]?${key}['"]?\\s*(?::|=>|=)\\s*`));
  if (!match) return void 0;
  const start = match.index + match[0].length, char = text[start];
  if (char === "[" || char === "{" || char === "(") {
    const end = balanced(text, start);
    return strings(text.slice(start, end > 0 ? end : void 0));
  }
  const literal = text.slice(start).match(/^(?:\b[rRfFbu@]{1,2})?(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/);
  if (literal) return [literal[2]];
  const bare = text.slice(start).match(/^[\w.:]+/);
  return bare ? [bare[0]] : [];
}
function splitTop(text) {
  const parts = [];
  let depth = 0, quote = null, last = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) depth--;
    else if (char === "," && !depth) {
      parts.push(text.slice(last, index));
      last = index + 1;
    }
  }
  parts.push(text.slice(last));
  return parts.map((part) => part.trim()).filter(Boolean);
}
function joinPath(...parts) {
  const joined = parts.filter((part) => part !== void 0 && part !== null && part !== "").map(String).join("/");
  const path = `/${joined}`.replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
  return path;
}
function pathKey(path) {
  return joinPath(path).toLowerCase().replace(/\{[^}]*\}|:[\w]+\??|<[^>]*>|\[\[?\.{0,3}[^\]]*\]\]?|\$[\w]+|\*[\w]*/g, "{}");
}
var methodsIn = (text) => [...new Set([...String(text || "").toUpperCase().matchAll(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map((match) => match[1]))];
var MODIFIERS = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|#(?!\[)[^\n]*\n)*/;
function annotationGroups(text, syntax, inCode = () => true) {
  const found = [];
  const starter = syntax === "at" ? /(^|[^\w@."'`])@([A-Za-z_][\w.]*)/g : syntax === "hash" ? /()#\[/g : /(^|\n)[ \t]*\[(?=[A-Za-z])/g;
  for (const match of text.matchAll(starter)) {
    const at = match.index + match[1].length;
    if (!inCode(at + (text[at] === "[" || text[at] === "@" || text[at] === "#" ? 0 : text.slice(at).search(/\S/)))) continue;
    if (syntax === "at") {
      let end = at + 1 + match[2].length, args = "";
      if (text[end] === "(") {
        const close = balanced(text, end);
        if (close < 0) continue;
        args = text.slice(end + 1, close);
        end = close + 1;
      }
      found.push({ at, end, items: [{ name: match[2], args }] });
    } else {
      const open = text.indexOf("[", at), close = balanced(text, open);
      if (close < 0) continue;
      const inner = text.slice(open + 1, close);
      if (syntax === "bracket" && /^\s*(assembly|module)\s*:/.test(inner)) continue;
      const items = splitTop(inner).map((part) => {
        const item = part.match(/^([A-Za-z_][\w.:]*)\s*(\(([\s\S]*)\))?\s*$/);
        return item && { name: item[1].replace(/Attribute$/, ""), args: item[3] || "" };
      });
      if (items.every(Boolean)) found.push({ at, end: close + 1, items });
    }
  }
  const groups = [];
  for (const item of found) {
    const previous = groups[groups.length - 1];
    if (previous && /^\s*$/.test(text.slice(previous.end, item.at).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""))) {
      previous.annotations.push(...item.items);
      previous.end = item.end;
    } else groups.push({ index: item.at, end: item.end, annotations: [...item.items] });
  }
  for (const group of groups) {
    const rest = text.slice(group.end, group.end + 600).replace(MODIFIERS, "");
    const head = rest.slice(0, rest.search(/[({;=]|$/));
    const kind = head.match(/\b(class|interface|object|record|struct|trait|enum|impl)\s+([A-Za-z_]\w*)/);
    group.target = kind ? { kind: "class", name: kind[2] } : { kind: "member", name: head.match(/([A-Za-z_]\w*)\s*(?:<[^>]*>\s*)?$/)?.[1] || "" };
  }
  return groups;
}
var pathsOf = (args, keys = ["path", "value"]) => {
  for (const key of keys) {
    const value = named(args, key);
    if (value?.length) return value;
  }
  const first2 = splitTop(args)[0] || "";
  if (/^[[{]?\s*["'`]/.test(first2)) return strings(first2.startsWith("{") ? "" : first2);
  return [];
};
var VERB_ANNOTATIONS = {
  ...Object.fromEntries(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head"].map((name) => [name, name.toUpperCase()])),
  All: "ANY",
  Any: "ANY",
  ...Object.fromEntries(["Get", "Post", "Put", "Patch", "Delete"].map((name) => [`${name}Mapping`, name.toUpperCase()])),
  ...Object.fromEntries(["Get", "Post", "Put", "Patch", "Delete", "Head", "Options"].map((name) => [`Http${name}`, name.toUpperCase()]))
};
var JAXRS_VERBS = new Set(VERBS);
var GUARD_ANNOTATIONS = /^(UseGuards|Authorize|AllowAnonymous|PreAuthorize|PostAuthorize|Secured|RolesAllowed|PermitAll|DenyAll|Roles|Public|IsGranted|Security|login_required|permission_required|requires_auth|jwt_required|auth_required|UseInterceptors|UsePipes|UseFilters|Throttle|SkipThrottle|UseMiddleware)$/;
var ENTRY_ANNOTATIONS = {
  EventPattern: "event",
  MessagePattern: "event",
  KafkaListener: "event",
  RabbitListener: "event",
  RabbitSubscribe: "event",
  JmsListener: "event",
  SqsListener: "event",
  SqsMessageHandler: "event",
  StreamListener: "event",
  ServiceBusListener: "event",
  Processor: "event",
  Process: "event",
  OnEvent: "event",
  EventHandler: "event",
  EventsHandler: "event",
  CommandHandler: "event",
  QueryHandler: "event",
  Cron: "job",
  Interval: "job",
  Timeout: "job",
  Scheduled: "job",
  SubscribeMessage: "websocket",
  GrpcMethod: "rpc",
  GrpcStreamMethod: "rpc",
  QueryMapping: "graphql",
  MutationMapping: "graphql",
  SubscriptionMapping: "graphql",
  SchemaMapping: "graphql"
};
function annotationRoutes(file, language, text, settings) {
  const syntax = language === "C#" ? "bracket" : language === "Rust" || language === "PHP" ? "hash" : "at";
  if (!(syntax === "at" ? text.includes("@") : syntax === "hash" ? text.includes("#[") : /^\s*\[[A-Z]/m.test(text))) return [];
  const at = lineIndex(text), routes = [];
  let owner = { name: "", prefixes: [""], version: void 0, graphql: false, guards: [], framework: "" };
  const add2 = (route, group) => routes.push({ ...route, file, language, line: at(group.index), handler: [owner.name, group.target.name].filter(Boolean).join("."), guards: [...route.kind === "http" ? owner.guards : [], ...guardsOf(group)] });
  const guardsOf = (group) => group.annotations.filter((item) => GUARD_ANNOTATIONS.test(item.name.split(".").pop())).map((item) => `${item.name}${item.args ? `(${item.args.replace(/\s+/g, " ").slice(0, 60)})` : ""}`);
  for (const group of annotationGroups(text, syntax, settings.inCode)) {
    const names = group.annotations.map((item) => item.name.split(".").pop());
    const find = (...wanted) => group.annotations.find((item) => wanted.includes(item.name.split(".").pop()));
    if (group.target.kind === "class") {
      const nest = find("Controller"), mapping2 = find("RequestMapping"), path = find("Path"), route2 = find("Route"), resolver = find("Resolver");
      const prefixes = nest ? pathsOf(nest.args) : mapping2 ? pathsOf(mapping2.args) : path ? pathsOf(path.args) : route2 ? pathsOf(route2.args) : [""];
      const version = nest ? named(nest.args, "version")?.[0] : void 0;
      const framework2 = nest ? language === "TypeScript" || language === "JavaScript" ? "NestJS" : "Micronaut" : mapping2 || find("RestController") ? "Spring" : path ? "JAX-RS" : route2 ? language === "C#" ? "ASP.NET Core" : "Symfony" : resolver ? "GraphQL" : "";
      const base2 = group.target.name.replace(/Controller$/, "");
      owner = { name: group.target.name, prefixes: (prefixes.length ? prefixes : [""]).map((prefix) => prefix.replace(/\[controller\]/gi, base2)), version, graphql: Boolean(resolver), guards: guardsOf(group), framework: framework2, gateway: find("WebSocketGateway") };
      const entry = group.annotations.find((item) => ENTRY_ANNOTATIONS[item.name.split(".").pop()] === "event");
      if (entry) add2({ kind: "event", method: "EVENT", path: strings(entry.args)[0] || named(entry.args, "topics")?.join(", ") || entry.args.replace(/\s+/g, " ").trim().slice(0, 60) || group.target.name, framework: entry.name.split(".").pop(), source: "code" }, { ...group, target: { name: "" } });
      continue;
    }
    const verb = group.annotations.find((item) => VERB_ANNOTATIONS[item.name.split(".").pop()] && !(syntax === "at" && language === "Python"));
    const jaxrs = names.find((name) => JAXRS_VERBS.has(name));
    const mapping = find("RequestMapping"), route = find("Route"), versionTag = find("Version");
    let methods = [], paths = [], framework = owner.framework;
    if (verb && syntax !== "hash") {
      methods = [VERB_ANNOTATIONS[verb.name.split(".").pop()]];
      paths = pathsOf(verb.args, ["path", "value", "template", "uri"]);
      if (!paths.length && route) paths = pathsOf(route.args, ["template", "path"]);
      framework ||= verb.name.startsWith("Http") ? "ASP.NET Core" : verb.name.endsWith("Mapping") ? "Spring" : "NestJS";
    } else if (mapping) {
      methods = methodsIn(mapping.args.match(/method\s*=\s*(\{[^}]*\}|[\w.]+)/)?.[1]);
      paths = pathsOf(mapping.args);
      framework ||= "Spring";
    } else if (jaxrs) {
      methods = [jaxrs];
      paths = find("Path") ? pathsOf(find("Path").args) : [""];
      framework ||= "JAX-RS";
    } else if (route && syntax !== "hash") {
      methods = methodsIn(named(route.args, "methods")?.join(" "));
      paths = pathsOf(route.args, ["template", "path"]);
      framework ||= "ASP.NET Core";
    } else if (syntax === "hash") {
      const rust = group.annotations.find((item) => VERB_SET.has(item.name.toUpperCase()) || item.name === "route");
      const symfony = find("Route");
      if (language === "Rust" && rust) {
        methods = rust.name === "route" ? methodsIn(named(rust.args, "method")?.join(" ")) : [rust.name.toUpperCase()];
        paths = strings(rust.args).slice(0, 1);
        framework = /rocket/.test(settings.rustDeps) ? "Rocket" : "Actix Web";
      } else if (language === "PHP" && symfony) {
        methods = methodsIn(named(symfony.args, "methods")?.join(" "));
        paths = pathsOf(symfony.args, ["path"]);
        framework = "Symfony";
      }
    } else if (language === "Python") {
      const decorator = group.annotations.find((item) => /^[\w.]+\.(get|post|put|patch|delete|options|head|route|api_route|websocket|api_view)$/.test(item.name));
      const task = group.annotations.find((item) => /(^|\.)(task|shared_task|periodic_task|actor)$/.test(item.name));
      if (decorator) {
        const [receiver, kind] = [decorator.name.split(".").slice(0, -1).join("."), decorator.name.split(".").pop()];
        const first2 = strings(splitTop(decorator.args)[0] || "")[0];
        if (first2 !== void 0 && (first2.startsWith("/") || first2 === "")) {
          methods = kind === "route" || kind === "api_route" ? methodsIn(named(decorator.args, "methods")?.join(" ")).length ? methodsIn(named(decorator.args, "methods").join(" ")) : ["GET"] : kind === "websocket" ? ["WS"] : [kind.toUpperCase()];
          paths = [joinPath(settings.pythonPrefixes?.get(receiver) || "", first2)];
          framework = /Blueprint|flask/i.test(text) ? "Flask" : /fastapi|APIRouter/i.test(text) ? "FastAPI" : /sanic/i.test(text) ? "Sanic" : /litestar|starlite/i.test(text) ? "Litestar" : "Python web";
          for (const path of paths) for (const method of methods) add2({ kind: method === "WS" ? "websocket" : "http", method, path, framework, source: "code" }, group);
          continue;
        }
      }
      if (task) {
        add2({ kind: "job", method: "TASK", path: group.target.name, framework: /celery/i.test(text) ? "Celery" : "Task queue", source: "code" }, group);
        continue;
      }
      continue;
    } else if (language === "Dart") {
      const shelf = group.annotations.find((item) => /^Route\.(get|post|put|patch|delete|head|options|all)$/.test(item.name));
      if (shelf) {
        const method = shelf.name.split(".").pop().toUpperCase();
        methods = [method === "ALL" ? "ANY" : method];
        paths = strings(shelf.args).slice(0, 1);
        framework = "shelf_router";
      }
    }
    if (methods.length || paths.length) {
      if (!methods.length) methods = ["ANY"];
      if (!paths.length) paths = [""];
      const version = versionTag ? pathsOf(versionTag.args)[0] ?? named(versionTag.args, "value")?.[0] : owner.version;
      for (const prefix of owner.prefixes) for (const raw of paths) for (const method of methods) {
        const own = String(raw).replace(/\[action\]/gi, group.target.name);
        const absolute = framework === "ASP.NET Core" && /^~?\//.test(own);
        add2({ kind: "http", method, path: settings.compose({ language, framework, prefix: absolute ? "" : prefix, path: own.replace(/^~/, ""), version, file }), framework: framework || "annotations", source: "code", ...version && { version: String(version) } }, group);
      }
      continue;
    }
    for (const item of group.annotations) {
      const name = item.name.split(".").pop(), kind = ENTRY_ANNOTATIONS[name] || (owner.graphql && /^(Query|Mutation|Subscription|ResolveField)$/.test(name) ? "graphql" : null);
      if (!kind) continue;
      const label = kind === "graphql" ? named(item.args, "name")?.[0] || group.target.name : kind === "job" ? named(item.args, "cron")?.[0] || named(item.args, "fixedRate")?.[0] || named(item.args, "fixedDelay")?.[0] || strings(item.args)[0] || item.args.trim() || group.target.name : named(item.args, "topics")?.join(", ") || named(item.args, "queues")?.join(", ") || named(item.args, "destination")?.[0] || named(item.args, "queue")?.[0] || named(item.args, "value")?.[0] || strings(item.args)[0] || item.args.replace(/\s+/g, " ").trim().slice(0, 60) || group.target.name;
      const method = { event: "EVENT", job: "CRON", websocket: "WS", rpc: "RPC", graphql: name === "Mutation" || name === "MutationMapping" ? "MUTATION" : name.startsWith("Subscription") ? "SUBSCRIPTION" : "QUERY" }[kind];
      add2({ kind, method, path: kind === "websocket" && owner.gateway ? `${named(owner.gateway.args, "namespace")?.[0] || ""} ${label}`.trim() : label, framework: name, source: "code" }, group);
      break;
    }
  }
  return routes;
}
var JS_SERVER = /['"](express|fastify|koa|@koa\/router|koa-router|hono|hono\/[\w-]+|elysia|restify|polka|h3|@hapi\/hapi|itty-router|express-promise-router|@fastify\/[\w-]+|next-connect|@trpc\/server)['"]/;
var JS_CLIENT_RECEIVER = /^(axios|http|https|request|client|api|\$http|ky|got|superagent|fetch|agent|instance|httpClient|this|supertest|cy|page|test|it|describe|map|cache|params|headers|searchParams|formData|store|storage|localStorage|sessionStorage|redis|config|env|settings|res|req|ctx|c|reply|response|window|document|location|url|history|cookies|session|queryClient|router\.query)$/;
var GO_CLIENT_RECEIVER = /^(http|client|resty|req|request|c|ctx|w|r\.URL|url|values|header|headers|q|query)$/;
function callRoutes(file, language, text, settings) {
  const at = lineIndex(text), routes = [], prefixes = /* @__PURE__ */ new Map();
  const add2 = (index, method, path, framework, extra = {}) => {
    if (settings.inCode(index)) routes.push({ kind: "http", method, path, framework, source: "code", file, language, line: at(index), ...extra });
  };
  const prefixOf = (receiver) => prefixes.get(receiver) || "";
  if (language === "JavaScript" || language === "TypeScript") {
    const server = JS_SERVER.test(text);
    for (const match of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:[\w$]+\.)?(Router|Hono|Elysia)\s*\(\s*(\{[^}]*\})?\s*\)\s*(?:\.basePath\(\s*['"`]([^'"`]+)['"`]\s*\))?/g)) prefixes.set(match[1], named(match[3] || "", "prefix")?.[0] || match[4] || "");
    for (const match of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.basePath\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), match[3]));
    const framework = /['"]fastify['"]/.test(text) ? "Fastify" : /['"]hono/.test(text) ? "Hono" : /koa/.test(text) ? "Koa" : /['"]elysia['"]/.test(text) ? "Elysia" : /['"]express/.test(text) ? "Express" : "Node router";
    const localRouters = new Set([...text.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:[\w$]+\.)?Router\s*\(/g)].map((match) => match[1]));
    for (const match of text.matchAll(/(?<![\w$.])(?:this\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|del|options|head|all)\s*\(\s*(['"`])(\/[^'"`]*|\*)\3\s*,/g)) {
      const receiver = match[1];
      if (JS_CLIENT_RECEIVER.test(receiver) && !prefixes.has(receiver) && !localRouters.has(receiver)) continue;
      if (!server && !prefixes.has(receiver) && !localRouters.has(receiver) && !/^(app|router|server|routes?|fastify|v\d+|\w+Router|\w+Routes|subApp|admin)$/.test(receiver)) continue;
      const open = text.indexOf("(", match.index + match[0].indexOf(match[2]) + match[2].length), close = balanced(text, open);
      const handlers = splitTop(text.slice(open + 1, close > 0 ? close : open + 400)).slice(1);
      const guards = handlers.slice(0, -1).filter((item) => /^[A-Za-z_$][\w$.]*(\([^)]{0,80}\))?$/.test(item)).map((item) => item.replace(/\s+/g, " "));
      const handler = handlers[handlers.length - 1]?.match(/^[A-Za-z_$][\w$.]*$/)?.[0];
      const method = match[2] === "del" ? "DELETE" : match[2] === "all" ? "ANY" : match[2].toUpperCase();
      add2(match.index, method, joinPath(prefixOf(receiver), match[4]), framework, { receiver, ...handler && { handler }, guards });
    }
    for (const match of text.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*route\(\s*(['"`])(\/[^'"`]*)\2\s*\)((?:\s*\.\s*(?:get|post|put|patch|delete|all)\s*\([^;]*?\))+)/g)) {
      for (const method of match[4].matchAll(/\.\s*(get|post|put|patch|delete|all)\s*\(/g)) add2(match.index, method[1] === "all" ? "ANY" : method[1].toUpperCase(), joinPath(prefixOf(match[1]), match[3]), framework, { receiver: match[1] });
    }
    for (const match of text.matchAll(/\.\s*route\(\s*\{/g)) {
      const open = match.index + match[0].length - 1, close = balanced(text, open), body = text.slice(open, close);
      const url = named(body, "url")?.[0] ?? named(body, "path")?.[0];
      if (url === void 0 || !url.startsWith("/")) continue;
      for (const method of methodsIn(named(body, "method")?.join(" ")) || []) add2(match.index, method, url, /hapi/.test(text) ? "hapi" : "Fastify");
    }
    for (const match of text.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\.\s*(use|route)\(\s*(['"`])(\/[^'"`]*)\3\s*,/g)) {
      const open = text.indexOf("(", match.index), close = balanced(text, open);
      const args = splitTop(text.slice(open + 1, close)).slice(1);
      for (const arg of args) {
        if (localRouters.has(arg)) {
          for (const route of routes) if (route.receiver === arg && !route.mounted) {
            route.path = joinPath(prefixOf(match[1]), match[4], route.path);
            route.mounted = true;
          }
        } else settings.mount(file, language, arg, joinPath(prefixOf(match[1]), match[4]));
      }
    }
    for (const match of text.matchAll(/\.\s*register\(\s*([^,()]+(?:\([^)]*\))?)\s*,\s*\{[^}]*prefix\s*:\s*['"`]([^'"`]+)['"`]/g)) settings.mount(file, language, match[1].trim(), match[2]);
    if (/createServer|IncomingMessage|ServerResponse/.test(text)) {
      for (const match of text.matchAll(/\b(?:[\w$]+\.)*(?:url|pathname|path)\s*(===?|\.startsWith\()\s*(['"`])(\/[^'"`]*)\2/g)) {
        const line = text.slice(text.lastIndexOf("\n", match.index) + 1, text.indexOf("\n", match.index) < 0 ? void 0 : text.indexOf("\n", match.index));
        const method = line.match(/method\s*===?\s*['"`](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)['"`]/)?.[1] || "ANY";
        add2(match.index, method, match[1] === "===" || match[1] === "==" ? match[3] : `${match[3].replace(/\/$/, "")}/*`, "Node http");
      }
    }
    for (const match of text.matchAll(/<Route\b[^>]*?\bpath=["'{`]+([^"'`}]+)/g)) add2(match.index, "PAGE", match[1].startsWith("/") ? match[1] : `/${match[1]}`, "React Router", { kind: "page" });
    if (/(createBrowserRouter|createRouter|RouterModule|Routes\b|createHashRouter|VueRouter)/.test(text)) {
      for (const match of text.matchAll(/\{\s*path\s*:\s*(['"`])([^'"`]*)\1\s*,[^{}]{0,200}?\b(component|element|loadComponent|loadChildren|redirectTo|lazy|Component|children)\b/g)) add2(match.index, "PAGE", joinPath(match[2]), /RouterModule|@angular/.test(text) ? "Angular Router" : /vue-router|VueRouter/.test(text) ? "Vue Router" : "React Router", { kind: "page" });
    }
  }
  if (language === "Go") {
    for (const match of text.matchAll(/\b(\w+)\s*:?=\s*(\w+)\.(Group|PathPrefix|Route)\(\s*"([^"]*)"\s*(?:,[^)]*)?\)(\.Subrouter\(\))?/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), match[4]));
    const framework = /gin-gonic/.test(text) ? "Gin" : /labstack\/echo/.test(text) ? "Echo" : /gofiber/.test(text) ? "Fiber" : /go-chi/.test(text) ? "chi" : /gorilla\/mux/.test(text) ? "gorilla/mux" : "net/http";
    for (const match of text.matchAll(/\b([\w.]+)\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All|Handle|HandleFunc|Match)\(\s*"([^"]+)"/g)) {
      const [receiver, call, raw] = [match[1], match[2], match[3]];
      if (GO_CLIENT_RECEIVER.test(receiver) && !(receiver === "http" && /^Handle/.test(call))) continue;
      let methods = /^(Any|All|Match)$/.test(call) ? ["ANY"] : /^Handle/.test(call) ? [] : [call.toUpperCase()], path = raw;
      const pattern = raw.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/);
      if (pattern) {
        methods = [pattern[1]];
        path = pattern[2].replace(/^[^/]*(?=\/)/, "");
      }
      if (!path.startsWith("/")) continue;
      if (!methods.length) {
        const chain = text.slice(match.index, match.index + 300).split("\n")[0];
        methods = methodsIn(chain.match(/\.Methods\(([^)]*)\)/)?.[1]);
        if (!methods.length) methods = ["ANY"];
      }
      for (const method of methods) add2(match.index, method, joinPath(prefixOf(receiver), path), framework, { receiver });
    }
  }
  if (language === "Rust") {
    for (const match of text.matchAll(/\.route\(\s*"([^"]+)"\s*,/g)) {
      const open = text.indexOf("(", match.index), close = balanced(text, open), body = text.slice(open, close);
      const methods = [...new Set([...body.matchAll(/\b(?:web::|routing::|axum::routing::)?(get|post|put|patch|delete|head|options|any)\s*\(/g)].map((item) => item[1] === "any" ? "ANY" : item[1].toUpperCase()))];
      for (const method of methods.length ? methods : ["ANY"]) add2(match.index, method, match[1], /axum/.test(text) ? "Axum" : "Actix Web");
    }
  }
  if (language === "C#") {
    for (const match of text.matchAll(/\b(\w+)\s*=\s*(\w+)\.MapGroup\(\s*"([^"]*)"\s*\)/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), match[3]));
    for (const match of text.matchAll(/\b(\w+)\.Map(Get|Post|Put|Patch|Delete|Methods|Fallback)?\(\s*"([^"]*)"/g)) {
      if (!match[2] && !/^(app|group|api|routes|endpoints|\w+Group)$/i.test(match[1]) && !prefixes.has(match[1])) continue;
      const methods = match[2] === "Methods" ? methodsIn(text.slice(match.index, match.index + 200).split("\n")[0]) : [match[2] && match[2] !== "Fallback" ? match[2].toUpperCase() : "ANY"];
      for (const method of methods.length ? methods : ["ANY"]) add2(match.index, method, joinPath(prefixOf(match[1]), match[3]), "ASP.NET Core minimal API");
    }
  }
  if (language === "Kotlin" && /routing\s*\{|Route\.|fun Route\./.test(text)) routes.push(...blockRoutes(file, language, text, { open: /\b(route|get|post|put|patch|delete|head|options)\s*\(\s*"([^"]*)"\s*\)\s*\{/g, framework: "Ktor" }));
  if (language === "PHP") {
    const base2 = /(^|\/)routes\/api\.php$/.test(file) ? "/api" : "";
    routes.push(...blockRoutes(file, language, text, { php: true, base: base2 }));
    for (const match of text.matchAll(/\$(\w+)->(get|post|put|patch|delete|options|any|map)\(\s*['"](\/[^'"]*)['"]/g)) if (match[1] !== "this" && match[1] !== "request" && match[1] !== "client" && match[1] !== "http") add2(match.index, match[2] === "any" || match[2] === "map" ? "ANY" : match[2].toUpperCase(), match[3], "Slim");
  }
  if (language === "Swift" && /import Vapor/.test(text)) {
    for (const match of text.matchAll(/\b(?:let|var)\s+(\w+)\s*=\s*(\w+)\.grouped\(([^)]*)\)/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), ...strings(match[3])));
    for (const match of text.matchAll(/\b(\w+)\.(get|post|put|patch|delete|on)\(((?:\s*"[^"]*"\s*,?|\s*":\w+"\s*,?|\s*\.?\w+\s*,?)*?)(?:\s*use\s*:|\s*\)\s*\{|\s*\{)/g)) add2(match.index, match[2] === "on" ? "ANY" : match[2].toUpperCase(), joinPath(prefixOf(match[1]), ...strings(match[3])), "Vapor");
  }
  if (language === "Dart") {
    for (const match of text.matchAll(/\b(\w+)\.(get|post|put|patch|delete|head|options|all)\(\s*['"](\/[^'"]*)['"]\s*,/g)) if (!/^(http|client|dio|_dio|api|request)$/.test(match[1])) add2(match.index, match[2] === "all" ? "ANY" : match[2].toUpperCase(), match[3], "shelf_router");
  }
  if (language === "Python") {
    for (const match of text.matchAll(/\b(\w+)\s*=\s*(?:[\w.]+\.)?(APIRouter|Blueprint|Router)\(([^)]*)\)/g)) settings.pythonPrefixes.set(match[1], named(match[3], "prefix")?.[0] || named(match[3], "url_prefix")?.[0] || "");
    if (/(^|\/)urls\.py$/.test(file) || /urlpatterns/.test(text)) {
      for (const match of text.matchAll(/\b(re_path|path|url)\(\s*r?(['"])([^'"]*)\2\s*,\s*([^,)]+(?:\([^)]*\))?)/g)) {
        const raw = match[1] === "path" ? match[3] : match[3].replace(/^\^/, "").replace(/\$$/, "");
        const include = match[4].match(/include\(\s*(?:\(\s*)?['"]([\w.]+)['"]/);
        if (include) {
          settings.mount(file, "Python", `module:${include[1]}`, raw);
          continue;
        }
        add2(match.index, "ANY", joinPath(raw.replace(/<(?:\w+:)?(\w+)>/g, ":$1")), "Django", { handler: match[4].trim().replace(/\.as_view\(\)$/, "") });
      }
    }
    for (const match of text.matchAll(/\b(\w+)\.include_router\(\s*([\w.]+)\s*(?:,([^)]*))?\)/g)) settings.mount(file, "Python", match[2].split(".")[0], joinPath(settings.pythonPrefixes.get(match[1]) || "", named(match[3] || "", "prefix")?.[0] || ""));
    for (const match of text.matchAll(/\b(\w+)\.register_blueprint\(\s*([\w.]+)\s*(?:,([^)]*))?\)/g)) settings.mount(file, "Python", match[2].split(".")[0], named(match[3] || "", "url_prefix")?.[0] || "");
    for (const match of text.matchAll(/\bweb\.(get|post|put|patch|delete|route)\(\s*['"](\/[^'"]*)['"]/g)) add2(match.index, match[1] === "route" ? "ANY" : match[1].toUpperCase(), match[2], "aiohttp");
  }
  if (language === "Ruby") routes.push(...blockRoutes(file, language, text, { ruby: true, rails: /(^|\/)config\/routes\.rb$/.test(file) || /routes\.draw/.test(text) }));
  if (language === "Elixir" && /\b(Phoenix\.Router|Plug\.Router|use \w+Web, :router)\b/.test(text)) routes.push(...blockRoutes(file, language, text, { ruby: true, phoenix: true }));
  return routes;
}
var REST_ACTIONS = [["index", "GET", ""], ["create", "POST", ""], ["new", "GET", "/new"], ["show", "GET", "/:id"], ["edit", "GET", "/:id/edit"], ["update", "PATCH", "/:id"], ["destroy", "DELETE", "/:id"]];
function blockRoutes(file, language, text, options) {
  const at = lineIndex(text), routes = [], stack = [{ prefix: options.base || "", resource: null }];
  const add2 = (index, method, path, framework, extra = {}) => routes.push({ kind: extra.kind || "http", method, path: joinPath(stack[stack.length - 1].prefix, path), framework, source: "code", file, language, line: at(index), ...extra.handler && { handler: extra.handler } });
  const lines = text.split("\n");
  let offset = 0;
  if (options.ruby) {
    const framework = options.phoenix ? "Phoenix" : options.rails ? "Rails" : "Sinatra";
    for (const line of lines) {
      const code = line.replace(/(^|\s)#(?!\{).*$/, "").trim(), index = offset;
      offset += line.length + 1;
      if (!code) continue;
      const opens = /\bdo(\s*\|[^|]*\|)?\s*$/.test(code) || /^(if|unless|case|def|class|module|begin|while|until|for|defmodule|defp?)\b/.test(code) && !/\bend$/.test(code) && !/,\s*do:/.test(code);
      let frame = null;
      const verb = code.match(/^(get|post|put|patch|delete|match|options|head|live|forward)\s*\(?\s*['":]([^'",\s]*)['"]?\s*(?:,\s*(.*?))?\s*(?:\bdo)?\s*$/);
      const resources = code.match(/^(resources|resource)\s*\(?\s*[:'"]([\w/]+)['"]?\s*(.*)$/);
      const scope = code.match(/^(namespace|scope)\s*\(?\s*(?:path:\s*)?[:'"]([\w/.-]*)['"]?/);
      const root = code.match(/^root\b\s*\(?\s*(?:to:\s*)?['"]([^'"]+)['"]/);
      if (options.rails || options.phoenix) {
        if (scope) frame = { prefix: joinPath(stack[stack.length - 1].prefix, scope[2]) };
        else if (/^member\s+do/.test(code) && stack[stack.length - 1].resource) frame = { prefix: joinPath(stack[stack.length - 1].prefix, ":id") };
        else if (/^collection\s+do/.test(code)) frame = { prefix: stack[stack.length - 1].prefix };
        else if (resources) {
          const singular = resources[1] === "resource", name = resources[2], rest = resources[3] || "";
          const symbols = (key) => [...(rest.match(new RegExp(`${key}:\\s*(\\[[^\\]]*\\]|:\\w+)`))?.[1] || "").matchAll(/:(\w+)/g)].map((item) => item[1]);
          const pick = symbols("only"), skip = symbols("except");
          for (const [action, method, suffix] of REST_ACTIONS) {
            if (singular && action === "index") continue;
            if (pick.length && !pick.includes(action) || skip.includes(action)) continue;
            add2(index, method, `${name.startsWith("/") ? name : `/${name}`}${singular ? suffix.replace("/:id", "") : suffix}`, framework, { handler: `${name}#${action}` });
          }
          if (opens) frame = { prefix: joinPath(stack[stack.length - 1].prefix, name, singular ? "" : `:${name.replace(/s$/, "")}_id`), resource: name };
        } else if (root && options.rails) add2(index, "GET", "/", framework, { handler: root[1] });
        else if (verb) {
          const [, method, path, rest = ""] = verb;
          const handler = named(rest, "to")?.[0] || strings(rest)[0] || rest.split(",").slice(0, 2).map((part) => part.trim().replace(/^:/, "")).join(".");
          const kind = method === "live" ? "page" : "http";
          const methods = method === "match" ? methodsIn(named(rest, "via")?.join(" ") || rest).length ? methodsIn(named(rest, "via")?.join(" ") || rest) : ["ANY"] : [method === "live" ? "PAGE" : method === "forward" ? "ANY" : method.toUpperCase()];
          for (const item of methods) add2(index, item, path, framework, { handler, kind });
        }
      } else if (verb && /\bdo\b/.test(code)) add2(index, verb[1].toUpperCase(), verb[2], framework);
      if (opens) stack.push(frame || { ...stack[stack.length - 1], opener: true });
      else if (/^end\b/.test(code) && stack.length > 1) stack.pop();
    }
    return routes;
  }
  const pending2 = [], depthPrefix = [{ depth: 0, prefix: stack[0].prefix }];
  let depth = 0;
  const current = () => depthPrefix[depthPrefix.length - 1].prefix;
  const scanner = options.php ? /Route::(get|post|put|patch|delete|options|any|match|resource|apiResource|prefix|group)\s*\(\s*(\[[^\]]*\]|['"][^'"]*['"])?|->(prefix)\(\s*['"]([^'"]*)['"]\s*\)|\$\w+->group\(\s*['"]([^'"]*)['"]|[{}]/g : new RegExp(`${options.open.source}|[{}]`, "g");
  for (const match of text.matchAll(scanner)) {
    const token = match[0];
    if (token === "{") {
      depth++;
      if (pending2.length) depthPrefix.push({ depth, prefix: pending2.pop() });
      continue;
    }
    if (token === "}") {
      if (depthPrefix.length > 1 && depthPrefix[depthPrefix.length - 1].depth === depth) depthPrefix.pop();
      depth--;
      continue;
    }
    if (options.php) {
      const call2 = match[1], arg = match[2];
      if (match[3]) {
        pending2.push(joinPath(current(), match[4]));
        continue;
      }
      if (match[5] !== void 0) {
        pending2.push(joinPath(current(), match[5]));
        continue;
      }
      if (call2 === "prefix") {
        pending2.push(joinPath(current(), strings(arg || "")[0] || ""));
        continue;
      }
      if (call2 === "group") {
        const prefix = named(text.slice(match.index, match.index + 300), "prefix")?.[0];
        pending2.push(joinPath(current(), prefix || ""));
        continue;
      }
      const path2 = strings(arg || "")[0];
      if (path2 === void 0) continue;
      if (call2 === "resource" || call2 === "apiResource") {
        for (const [action, method, suffix] of REST_ACTIONS) if (call2 === "resource" || !["new", "edit"].includes(action)) routes.push({ kind: "http", method, path: joinPath(current(), path2, suffix.replace("/:id", `/{${path2.replace(/s$/, "")}}`)), framework: "Laravel", source: "code", file, language, line: at(match.index), handler: `${path2}.${action === "new" ? "create" : action === "destroy" ? "destroy" : action}` });
        continue;
      }
      const methods = call2 === "match" ? methodsIn(arg) : [call2 === "any" ? "ANY" : call2.toUpperCase()];
      const target = call2 === "match" ? strings(text.slice(match.index + match[0].length, match.index + match[0].length + 200))[0] : path2;
      for (const method of methods) routes.push({ kind: "http", method, path: joinPath(current(), target), framework: "Laravel", source: "code", file, language, line: at(match.index) });
      continue;
    }
    const [call, path] = [match[1], match[2]];
    depth++;
    if (call !== "route") routes.push({ kind: "http", method: call.toUpperCase(), path: joinPath(current(), path), framework: options.framework, source: "code", file, language, line: at(match.index) });
    depthPrefix.push({ depth, prefix: joinPath(current(), path) });
  }
  return routes;
}
var segment = (part, style2) => {
  if (/^\(.*\)$/.test(part) || part.startsWith("@") || part === "_index" || part === "index") return "";
  if (style2 === "remix") return part.replace(/^\$$/, "*").replace(/^\(\$(\w+)\)$/, ":$1?").replace(/^\$(\w+)$/, ":$1").replace(/^_.*/, "");
  return part.replace(/^\[\[\.\.\.(\w+)\]\]$/, "*$1?").replace(/^\[\.\.\.(\w+)\]$/, "*$1").replace(/^\[(\w+)\]$/, ":$1").replace(/^\[\[(\w+)\]\]$/, ":$1?");
};
var fsPath = (parts, style2) => joinPath(...parts.map((part) => segment(part, style2)));
function fileSystemRoutes(files, sources) {
  const routes = [], has = (pattern) => files.some((file) => pattern.test(file));
  const exported = (file) => {
    const text = sources.get(file) || "";
    const found = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map((match) => match[1]);
    return found.length ? [...new Set(found)] : ["ANY"];
  };
  const push = (file, method, path, framework, kind = "http") => routes.push({ kind, method, path, framework, source: "filesystem", file, language: languageForPath(file) || file.split(".").pop(), line: 1 });
  const rootsWith = (config) => files.filter((file) => config.test(file)).map((file) => posix(dirname2(file))).map((dir) => dir === "." ? "" : `${dir}/`);
  for (const base2 of rootsWith(/(^|\/)next\.config\.(js|mjs|cjs|ts)$/)) {
    for (const file of files.filter((item) => item.startsWith(base2))) {
      const rest = file.slice(base2.length), app = rest.match(/^(?:src\/)?app\/(.*?)(?:^|\/)?(page|route)\.(tsx|ts|jsx|js|mdx)$/), pages = rest.match(/^(?:src\/)?pages\/(.+)\.(tsx|ts|jsx|js|mdx)$/);
      if (app) {
        const parts = app[1].split("/").filter(Boolean);
        if (app[2] === "page") push(file, "PAGE", fsPath(parts), "Next.js", "page");
        else for (const method of exported(file)) push(file, method, fsPath(parts), "Next.js");
      } else if (pages && !/(^|\/)_(app|document|error)$/.test(pages[1])) {
        const parts = pages[1].split("/");
        if (parts[0] === "api") push(file, "ANY", fsPath(parts), "Next.js");
        else push(file, "PAGE", fsPath(parts), "Next.js", "page");
      }
    }
  }
  for (const base2 of rootsWith(/(^|\/)nuxt\.config\.(js|mjs|ts)$/)) {
    for (const file of files.filter((item) => item.startsWith(base2))) {
      const rest = file.slice(base2.length), page = rest.match(/^(?:app\/)?pages\/(.+)\.vue$/), api = rest.match(/^server\/(api|routes)\/(.+?)(?:\.(get|post|put|patch|delete))?\.(ts|js)$/);
      if (page) push(file, "PAGE", fsPath(page[1].split("/")), "Nuxt", "page");
      if (api) push(file, api[3]?.toUpperCase() || "ANY", fsPath([api[1] === "api" ? "api" : "", ...api[2].split("/")]), "Nuxt");
    }
  }
  for (const base2 of rootsWith(/(^|\/)svelte\.config\.(js|mjs|ts)$/)) {
    for (const file of files.filter((item) => item.startsWith(`${base2}src/routes/`))) {
      const rest = file.slice(`${base2}src/routes/`.length), parts = rest.split("/"), name = parts.pop();
      if (/^\+page\.svelte$/.test(name)) push(file, "PAGE", fsPath(parts), "SvelteKit", "page");
      if (/^\+server\.(ts|js)$/.test(name)) for (const method of exported(file)) push(file, method, fsPath(parts), "SvelteKit");
    }
  }
  for (const base2 of rootsWith(/(^|\/)astro\.config\.(js|mjs|ts)$/)) {
    for (const file of files.filter((item) => item.startsWith(`${base2}src/pages/`))) {
      const rest = file.slice(`${base2}src/pages/`.length).replace(/\.(astro|md|mdx|ts|js|html)$/, "");
      if (/\.(ts|js)$/.test(file)) for (const method of exported(file)) push(file, method, fsPath(rest.split("/")), "Astro");
      else push(file, "PAGE", fsPath(rest.split("/")), "Astro", "page");
    }
  }
  if (has(/(^|\/)app\/root\.(tsx|jsx)$/) && has(/(^|\/)app\/routes\//)) {
    for (const file of files.filter((item) => /(^|\/)app\/routes\/[^/]+\.(tsx|ts|jsx|js)$|(^|\/)app\/routes\/[^/]+\/route\.(tsx|ts|jsx|js)$/.test(item))) {
      const name = file.replace(/^.*app\/routes\//, "").replace(/\/route\.(tsx|ts|jsx|js)$/, "").replace(/\.(tsx|ts|jsx|js)$/, "");
      push(file, "PAGE", fsPath(name.split(".").map((part) => part.replace(/_$/, "")), "remix"), "Remix / React Router", "page");
    }
  }
  if (has(/(^|\/)pubspec\.yaml$/) && has(/(^|\/)routes\/.*\.dart$/)) {
    for (const file of files.filter((item) => /^routes\/.*\.dart$/.test(item) && !/_middleware\.dart$/.test(item))) push(file, "ANY", fsPath(file.slice(7).replace(/\.dart$/, "").split("/")), "Dart Frog");
  }
  return routes;
}
function contractRoutes(file, text) {
  const routes = [], at = lineIndex(text);
  const push = (route, index = 0) => routes.push({ source: "contract", file, language: file.split(".").pop(), line: at(index), ...route });
  if (/\.(ya?ml|json)$/i.test(file) && /["']?(openapi|swagger)["']?\s*:/.test(text)) {
    let spec;
    try {
      spec = file.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
    } catch {
      return [];
    }
    const base2 = spec?.basePath || (spec?.servers?.[0]?.url || "").replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\{[^}]+\}/g, "");
    for (const [path, operations] of Object.entries(spec?.paths || {})) {
      for (const [method, operation] of Object.entries(operations || {})) {
        if (!VERB_SET.has(method.toUpperCase())) continue;
        const index = text.indexOf(path);
        push({ kind: "http", method: method.toUpperCase(), path: joinPath(path), basePath: base2 || void 0, framework: spec.openapi ? `OpenAPI ${spec.openapi}` : `Swagger ${spec.swagger}`, handler: operation?.operationId, summary: operation?.summary, guards: operation?.security || spec.security ? ["security"] : [] }, Math.max(0, index));
      }
    }
  }
  if (/\.(graphql|gql)$/i.test(file)) {
    for (const match of text.matchAll(/(?:extend\s+)?type\s+(Query|Mutation|Subscription)\s*\{/g)) {
      const open = match.index + match[0].length - 1, close = balanced(text, open), body = text.slice(open + 1, close);
      for (const field of body.matchAll(/^\s*(\w+)\s*[(:]/gm)) push({ kind: "graphql", method: match[1].toUpperCase(), path: field[1], framework: "GraphQL SDL" }, open + 1 + field.index);
    }
  }
  if (/\.proto$/i.test(file)) {
    const pkg = text.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
    for (const service of text.matchAll(/service\s+(\w+)\s*\{/g)) {
      const open = service.index + service[0].length - 1, close = balanced(text, open), body = text.slice(open + 1, close);
      for (const rpc of body.matchAll(/rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)/g)) push({ kind: "rpc", method: "RPC", path: `/${pkg ? `${pkg}.` : ""}${service[1]}/${rpc[1]}`, framework: "gRPC", handler: `${rpc[2] ? "stream " : ""}${rpc[3]} \u2192 ${rpc[4] ? "stream " : ""}${rpc[5]}` }, open + 1 + rpc.index);
    }
  }
  return routes;
}
function globalSettings(files, sources) {
  const settings = { nest: { prefix: "", exclude: [], versioning: null }, springContext: "", aspBase: "", rustDeps: "", globalGuards: /* @__PURE__ */ new Set() };
  for (const file of files) {
    const text = sources.get(file) || "";
    if (/\.(ts|js|mts|mjs)$/.test(file) && text.includes("setGlobalPrefix")) {
      const match = text.match(/setGlobalPrefix\(\s*(['"`])([^'"`]*)\1\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/);
      if (match) {
        settings.nest.prefix = match[2];
        settings.nest.exclude = strings(match[3] || "").filter((item) => item.startsWith("/") || /^[\w-]/.test(item));
      }
    }
    if (/\.(ts|js|mts|mjs)$/.test(file) && text.includes("enableVersioning")) {
      const open = text.indexOf("(", text.indexOf("enableVersioning")), args = text.slice(open + 1, balanced(text, open));
      const type = args.match(/type\s*:\s*VersioningType\.(\w+)/)?.[1] || "URI";
      const prefix = /prefix\s*:\s*false/.test(args) ? "" : named(args, "prefix")?.[0] ?? "v";
      settings.nest.versioning = { type, prefix, defaultVersion: named(args, "defaultVersion")?.[0] };
    }
    if (/(^|\/)(application|bootstrap)[^/]*\.(properties|ya?ml)$/.test(file)) settings.springContext ||= text.match(/server\.servlet\.context-path\s*[=:]\s*(\S+)/)?.[1] || text.match(/context-path\s*:\s*['"]?([^\s'"]+)/)?.[1] || "";
    if (/\.cs$/.test(file)) settings.aspBase ||= text.match(/UsePathBase\(\s*"([^"]+)"/)?.[1] || "";
    if (/(^|\/)Cargo\.toml$/.test(file)) settings.rustDeps += text;
    if (/APP_GUARD|useGlobalGuards/.test(text)) settings.globalGuards.add("NestJS");
    if (/SecurityFilterChain|@EnableWebSecurity|WebSecurityConfigurerAdapter/.test(text)) settings.globalGuards.add("Spring");
    if (/RequireAuthorization\(|FallbackPolicy|AuthorizeFilter/.test(text)) settings.globalGuards.add("ASP.NET Core");
    if (/access_control:/.test(text)) settings.globalGuards.add("Symfony");
  }
  settings.compose = ({ language, framework, prefix, path, version }) => {
    if (framework === "NestJS") {
      const versioning = settings.nest.versioning, chosen = version ?? versioning?.defaultVersion;
      const versionSegment = versioning?.type === "URI" && chosen && !/neutral/i.test(String(chosen)) ? `${versioning.prefix}${chosen}` : "";
      const local = joinPath(versionSegment, prefix, path);
      const excluded = settings.nest.exclude.some((item) => pathKey(item) === pathKey(joinPath(prefix, path)));
      return excluded ? local : joinPath(settings.nest.prefix, local);
    }
    if (language === "Java" || language === "Kotlin") return joinPath(settings.springContext, prefix, path);
    if (framework === "ASP.NET Core") return joinPath(settings.aspBase, prefix, path);
    return joinPath(prefix, path);
  };
  return settings;
}
function bindingsOf(language, text) {
  const map = /* @__PURE__ */ new Map();
  if (language === "JavaScript" || language === "TypeScript") {
    for (const match of text.matchAll(/import\s+(?:type\s+)?([\w$]+)?\s*,?\s*(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]/g)) {
      if (match[1]) map.set(match[1], match[4]);
      if (match[3]) map.set(match[3], match[4]);
      for (const name of (match[2] || "").split(",")) {
        const local = name.trim().split(/\s+as\s+/).pop();
        if (local) map.set(local, match[4]);
      }
    }
    for (const match of text.matchAll(/(?:const|let|var)\s+(?:([\w$]+)|\{([^}]*)\})\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1]) map.set(match[1], match[3]);
      for (const name of (match[2] || "").split(",")) {
        const local = name.trim().split(/\s*:\s*/).pop();
        if (local) map.set(local, match[3]);
      }
    }
  }
  if (language === "Python") {
    for (const match of text.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+\(?([\w \t,]+)\)?/gm)) for (const name of match[2].split(",")) {
      const [original, alias] = name.trim().split(/\s+as\s+/);
      if (original) map.set(alias || original, [`${match[1]}${match[1].endsWith(".") ? "" : "."}${original}`, match[1]]);
    }
    for (const match of text.matchAll(/^[ \t]*import[ \t]+([\w.]+)(?:[ \t]+as[ \t]+(\w+))?/gm)) map.set(match[2] || match[1].split(".")[0], [match[1]]);
  }
  return map;
}
async function extractRoutes(root, { sources = /* @__PURE__ */ new Map(), resolve: resolve3 } = {}) {
  const files = await listFiles(root, (file) => Boolean(languageForPath(file)) || EXTRA_FILES.test(file) || /(^|\/)(next|nuxt|svelte|astro)\.config\.[cm]?[jt]s$|(^|\/)(Cargo\.toml|pubspec\.yaml)$/.test(file));
  for (const file of files) if (!sources.has(file)) sources.set(file, await readFile2(join4(root, file), "utf8").then((text) => text.length > MAX_BYTES2 ? "" : text).catch(() => ""));
  const settings = globalSettings(files, sources), mounts = [], routes = [];
  settings.pythonPrefixes = /* @__PURE__ */ new Map();
  settings.inCode = () => true;
  settings.mount = (file, language, target, prefix) => mounts.push({ file, language, target, prefix });
  for (const file of files) {
    const language = languageForPath(file), text = sources.get(file) || "";
    if (!text) continue;
    if (!language) {
      routes.push(...contractRoutes(file, text));
      continue;
    }
    if (TEST_FILE.test(file)) continue;
    settings.pythonPrefixes = /* @__PURE__ */ new Map();
    const masked = blank(text, language);
    settings.inCode = (index) => masked[index] === text[index];
    const fromCalls = callRoutes(file, language, text, settings);
    routes.push(...annotationRoutes(file, language, text, settings), ...fromCalls);
  }
  routes.push(...fileSystemRoutes(files, sources));
  if (resolve3 && mounts.length) {
    const prefixesFor = /* @__PURE__ */ new Map();
    for (const mount of mounts) {
      const text = sources.get(mount.file) || "", bindings = bindingsOf(mount.language, text);
      let specs = [];
      const required = mount.target.match(/^require\(\s*['"]([^'"]+)['"]\s*\)/);
      if (required) specs = [required[1]];
      else if (mount.target.startsWith("module:")) specs = [mount.target.slice(7)];
      else {
        const bound = bindings.get(mount.target.split(".")[0].replace(/\(.*$/, ""));
        specs = bound ? [].concat(bound) : [];
      }
      for (const spec of specs) {
        const [target] = resolve3(mount.language, spec, mount.file);
        if (target && target !== mount.file) {
          prefixesFor.set(target, [...prefixesFor.get(target) || [], { from: mount.file, prefix: mount.prefix }]);
          break;
        }
      }
    }
    const fullPrefix = (file, seen2 = /* @__PURE__ */ new Set()) => {
      const entries = prefixesFor.get(file);
      if (!entries || seen2.has(file)) return [""];
      seen2.add(file);
      return entries.flatMap((entry) => fullPrefix(entry.from, new Set(seen2)).map((parent) => joinPath(parent, entry.prefix)));
    };
    const mounted = [];
    for (const route of routes) {
      if (route.source !== "code" || !prefixesFor.has(route.file) || route.kind !== "http") {
        mounted.push(route);
        continue;
      }
      for (const prefix of fullPrefix(route.file)) mounted.push({ ...route, path: joinPath(prefix, route.path), mountedAt: prefix });
    }
    routes.length = 0;
    routes.push(...mounted);
  }
  const seen = /* @__PURE__ */ new Set(), unique = routes.filter((route) => {
    const key = `${route.kind}|${route.method}|${route.path}|${route.file}|${route.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const route of unique) {
    route.id = `${route.method} ${route.path} @ ${route.file}:${route.line}`;
    route.guards ||= [];
    if (settings.globalGuards.has(route.framework)) route.globalGuard = true;
    delete route.receiver;
    delete route.mounted;
  }
  return unique.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path) || VERBS.indexOf(a.method) - VERBS.indexOf(b.method));
}
function routeInsights(routes) {
  const code = routes.filter((route) => route.source !== "contract" && route.kind === "http"), contract = routes.filter((route) => route.source === "contract" && route.kind === "http");
  const byKey = /* @__PURE__ */ new Map();
  for (const route of code) {
    const key = `${route.framework} ${route.method} ${pathKey(route.path)}`;
    byKey.set(key, [...byKey.get(key) || [], route]);
  }
  const duplicates = [...byKey.values()].filter((items) => items.length > 1 && new Set(items.map((item) => `${item.file}:${item.line}`)).size > 1 && items[0].method !== "ANY").map((items) => ({ method: items[0].method, path: items[0].path, locations: items.map((item) => `${item.file}:${item.line}`) }));
  let undocumented = [], unimplemented = [];
  if (contract.length) {
    const keys = (route) => {
      const base2 = route.basePath ? [pathKey(joinPath(route.basePath, route.path))] : [];
      return [...base2, pathKey(route.path)];
    };
    const implemented = new Set(code.flatMap((route) => [`${route.method} ${pathKey(route.path)}`, `ANY ${pathKey(route.path)}`]));
    const codeAny = new Set(code.filter((route) => route.method === "ANY").map((route) => pathKey(route.path)));
    const documented = new Set(contract.flatMap((route) => keys(route).map((key) => `${route.method} ${key}`)));
    const suffixMatch = (set, method, key) => [...set].some((item) => {
      const [m, p] = item.split(" ");
      return (m === method || m === "ANY") && (p.endsWith(key) || key.endsWith(p));
    });
    unimplemented = contract.filter((route) => !keys(route).some((key) => implemented.has(`${route.method} ${key}`) || codeAny.has(key) || suffixMatch(implemented, route.method, key))).map(({ method, path, file, line }) => ({ method, path, file, line }));
    const spaces = new Set(contract.flatMap((route) => keys(route).map((key) => key.split("/")[1])));
    undocumented = code.filter((route) => spaces.has(pathKey(route.path).split("/")[1]) && route.method !== "ANY" && !documented.has(`${route.method} ${pathKey(route.path)}`) && !suffixMatch(documented, route.method, pathKey(route.path))).map(({ method, path, file, line }) => ({ method, path, file, line }));
  }
  const unguarded = code.filter((route) => ["POST", "PUT", "PATCH", "DELETE"].includes(route.method) && !route.guards.length && !route.globalGuard && ["NestJS", "Spring", "ASP.NET Core", "Symfony"].includes(route.framework)).map(({ method, path, file, line }) => ({ method, path, file, line }));
  const count2 = (key) => Object.fromEntries(Object.entries(routes.reduce((acc, route) => ({ ...acc, [route[key]]: (acc[route[key]] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]));
  return { total: routes.length, byKind: count2("kind"), byMethod: count2("method"), byFramework: count2("framework"), duplicates, contract: { documented: contract.length, undocumented, unimplemented }, unguardedWrites: unguarded };
}

// src/core/project-tools.js
import { mkdir, readdir as readdir3, readFile as readFile3, writeFile } from "fs/promises";
import { join as join5, relative as relative2 } from "path";
import { spawn } from "child_process";
var INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursorrules", ".cursor/rules", ".windsurfrules", ".windsurf/rules", ".agents/rules", ".agent/rules", ".kiro/steering", "CONVENTIONS.md", "CONTRIBUTING.md"];
async function inspectProject(cwd) {
  const stack = await detectStack(cwd);
  const entries = await readdir3(cwd, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).filter((name) => !IGNORED_DIRS.has(name)).sort();
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const manifests = [...new Set(stack.ecosystems.flatMap((item) => item.manifests))];
  const instructions2 = (await Promise.all(INSTRUCTION_FILES.map(async (name) => await exists(join5(cwd, name)) ? name : null))).filter(Boolean);
  const scripts = stack.ecosystems.find((item) => item.id === "node")?.scripts || {};
  return {
    name: stack.name || cwd.split(/[\\/]/).filter(Boolean).pop(),
    manifests,
    directories,
    files: files.slice(0, 40),
    scripts,
    commands: stack.commands,
    instructions: instructions2,
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
async function executeCommand(cwd, command, subdir = "", limit = 12e3) {
  let bin, args;
  try {
    [bin, ...args] = splitCommand(command);
  } catch (error) {
    return { command, cwd: subdir, ok: false, code: null, output: error.message };
  }
  const label = subdir ? `${command} (in ${subdir}/)` : command;
  return new Promise((resolve3) => {
    const child = spawn(bin, args, { cwd: subdir ? join5(cwd, subdir) : cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output2 = "";
    child.stdout.on("data", (chunk) => {
      output2 += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output2 += chunk;
    });
    child.on("error", (error) => resolve3({ command: label, ok: false, code: null, output: error.message }));
    child.on("close", (code) => resolve3({ command: label, ok: code === 0, code, output: output2.slice(-limit) }));
  });
}
var DIFF_LIMIT = 20 * 1024 * 1024;
var UNTRACKED_TEXT_LIMIT = 256 * 1024;
async function untrackedDiff(cwd, file) {
  const header = `diff --git a/${file} b/${file}
new file mode 100644
--- /dev/null
+++ b/${file}
`;
  const buffer = await readFile3(join5(cwd, file)).catch(() => null);
  if (!buffer || buffer.length > UNTRACKED_TEXT_LIMIT || buffer.includes(0)) return header;
  const lines = buffer.toString("utf8").replace(/\n$/, "").split("\n");
  return `${header}@@ -0,0 +1,${lines.length} @@
${lines.map((line) => `+${line}`).join("\n")}
`;
}
async function gitDiff(cwd, against = "HEAD") {
  const [result, others] = await Promise.all([
    executeCommand(cwd, `git diff ${against} --relative -- . :(exclude).maverick`, "", DIFF_LIMIT),
    executeCommand(cwd, "git ls-files --others --exclude-standard -z -- . :(exclude).maverick", "", DIFF_LIMIT)
  ]);
  const tracked = result.ok ? result.output : "";
  if (!others.ok || await lacksGitBaseline(cwd)) return tracked;
  const files = others.output.split("\0").filter(Boolean);
  return tracked + (await Promise.all(files.map((file) => untrackedDiff(cwd, file)))).join("");
}
async function writeEvidence(dir, task, results) {
  await mkdir(dir, { recursive: true });
  const body = `# Verification Evidence \u2014 ${task}

Generated: ${(/* @__PURE__ */ new Date()).toISOString()}

${results.map((result) => `## ${result.ok ? "PASS" : "FAIL"} \u2014 ${result.command}
Exit code: ${result.code ?? "not started"}

\`\`\`text
${result.output || "(no output)"}
\`\`\``).join("\n\n")}
`;
  const path = join5(dir, "EVIDENCE.md");
  await writeFile(path, body);
  return path;
}
async function lacksGitBaseline(cwd) {
  const result = await executeCommand(cwd, "git ls-files -- .", "", 4096);
  return result.ok && result.output.trim() === "";
}
async function findReferences(cwd, target, maxResults = 40) {
  const needle = target.split("/").pop().replace(/\.[^.]+$/, "");
  const results = [];
  async function visit(directory) {
    if (results.length >= maxResults) return;
    for (const entry of await readdir3(directory, { withFileTypes: true })) {
      if (results.length >= maxResults || IGNORED_DIRS.has(entry.name)) continue;
      const path = join5(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        try {
          const text = await readFile3(path, "utf8");
          if (text.includes(needle)) results.push(relative2(cwd, path));
        } catch {
        }
      }
    }
  }
  await visit(cwd);
  return results;
}

// src/core/grounding.js
import { readdir as readdir4 } from "fs/promises";
var STOPWORDS = new Set(`a an and are as at be by can do for from has have how i in into is it its let make me my need new of on or our should so that the their them then there this to up use using want we when where which will with without would add adds allow allows change create creates feature implement support update user users able also any each every only same like just more most other some such than too very via through about into onto over under after before while
o os as um uma uns umas de do da dos das no na nos nas em ao aos para por pelo pela com sem que quando onde como mais menos ser estar ter fazer criar cria adicionar adiciona permitir permite deve devem pode podem precisa quero queremos seja sejam isso esse essa este esta e ou se ja nao sim tambem cada todo toda todos todas nova novo novas novos usuario usuarios funcionalidade tela sistema`.split(/\s+/));
var GENERATED = ["dist", "build", "out", "coverage", "vendor", "target", ".next", ".nuxt"];
var LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "Cargo.lock", "poetry.lock", "uv.lock", "Gemfile.lock", "composer.lock", "go.sum", "pubspec.lock", "mix.lock"];
var fold2 = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var stem = (word) => word.length > 6 ? word.slice(0, 6) : word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
function descriptionTerms(description = "") {
  const words = fold2(description).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
  return [...new Set(words.map(stem))].slice(0, 16);
}
function pathTokens(path) {
  return fold2(path.replace(/([a-z0-9])([A-Z])/g, "$1 $2")).split(/[^a-z0-9]+/).filter(Boolean);
}
var escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function scoreFile(path, text, terms, idf) {
  const tokens = pathTokens(path), fileTokens = pathTokens(path.split("/").pop()), folded = fold2(text || "");
  let score = 0;
  const reasons = [], matched = /* @__PURE__ */ new Set();
  for (const term of terms) {
    const inName = fileTokens.some((token) => token.startsWith(term)), inPath = !inName && tokens.some((token) => token.startsWith(term));
    const hits = Math.min(10, (folded.match(new RegExp(`(?<![a-z0-9])${escape(term)}`, "g")) || []).length);
    if (!inName && !inPath && !hits) continue;
    matched.add(term);
    score += idf.get(term) * ((inName ? 6 : inPath ? 3 : 0) + hits * 0.5);
    reasons.push(inName ? `name matches "${term}"` : inPath ? `path matches "${term}"` : `mentions "${term}" ${hits}\xD7`);
  }
  return { score: score * matched.size, matched: matched.size, reasons };
}
async function presentEntries(cwd, names) {
  const entries = new Set(await readdir4(cwd).catch(() => []));
  return names.filter((name) => entries.has(name));
}
async function groundChange(cwd, description, { limit = 8 } = {}) {
  const [config, project] = await Promise.all([loadConfig(cwd), inspectProject(cwd)]);
  const sources = /* @__PURE__ */ new Map(), graph = await buildGraph(cwd, { sources });
  const terms = descriptionTerms(description);
  const commands2 = selectVerificationCommands(project.stack, config).map(({ name, command, cwd: dir }) => ({ name, command, cwd: dir || "." }));
  const base2 = {
    description,
    terms,
    stack: { name: project.name, languages: project.languages, frameworks: project.frameworks, packageManagers: project.packageManagers },
    commands: commands2,
    instructions: project.instructions,
    doNotTouch: [...(await presentEntries(cwd, GENERATED)).map((name) => `${name}/`), ...await presentEntries(cwd, LOCKFILES)],
    relevant: [],
    tests: [],
    neighbors: [],
    routes: [],
    shared: []
  };
  if (!terms.length) return base2;
  const nodes = graph.nodes, df = new Map(terms.map((term) => [term, 0]));
  const folded = new Map(nodes.map((node) => [node.id, `${fold2(node.id)}
${fold2(sources.get(node.id) || "")}`]));
  for (const term of terms) for (const text of folded.values()) if (text.includes(term)) df.set(term, df.get(term) + 1);
  const idf = new Map(terms.map((term) => [term, Math.log((nodes.length + 1) / (df.get(term) + 1)) + 1]));
  const scored = nodes.map((node) => ({ node, ...scoreFile(node.id, sources.get(node.id), terms, idf) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
  const counts = await churn(cwd).catch(() => /* @__PURE__ */ new Map());
  const describe2 = ({ node, score, reasons }) => {
    const impact2 = impactOf(graph, node.id);
    const near = impact2.dependents.filter((item) => item.test && item.depth <= 2).map((item) => item.id);
    return { path: node.id, score: Number(score.toFixed(1)), reasons: reasons.slice(0, 3), fanIn: node.fanIn, dependents: impact2.dependents.length, tests: near.slice(0, 3), commits: counts.get(node.id) || 0 };
  };
  const best = scored[0]?.score || 0, strong = scored.filter((item) => item.score >= best * 0.12);
  const relevant = strong.filter((item) => !item.node.test).slice(0, limit).map(describe2);
  const chosen = new Set(relevant.map((item) => item.path));
  const tests = [.../* @__PURE__ */ new Set([...strong.filter((item) => item.node.test).slice(0, 4).map((item) => item.node.id), ...relevant.flatMap((item) => item.tests)])].slice(0, 6);
  const neighbors = [...new Set(relevant.slice(0, 3).flatMap((item) => graph.out.get(item.path) || []))].filter((path) => !chosen.has(path) && !nodes.find((node) => node.id === path)?.test).slice(0, 6);
  const shared = relevant.filter((item) => item.fanIn >= 5 || graph.hubs.includes(item.path)).map((item) => ({ path: item.path, importers: item.fanIn, dependents: item.dependents, commits: item.commits }));
  let routes = [];
  try {
    routes = (await extractRoutes(cwd, { sources })).map((route) => ({ route, hits: terms.filter((term) => pathTokens(`${route.path} ${route.handler || ""}`).some((token) => token.startsWith(term))).length + (chosen.has(route.file) ? 1 : 0) })).filter((item) => item.hits).sort((a, b) => b.hits - a.hits).slice(0, 8).map(({ route }) => ({ kind: route.kind, method: route.method, path: route.path, file: route.file, line: route.line, handler: route.handler }));
  } catch {
  }
  return { ...base2, relevant, tests, neighbors, routes, shared };
}

// src/flows/model.js
import { readdir as readdir5, readFile as readFile4 } from "fs/promises";
import { basename, join as join6 } from "path";
import { parse as parseYaml2 } from "yaml";
import { z } from "zod";
var MAVERICK_GATES = ["validate", "verify", "guard", "security", "deps", "policy", "review", "readiness"];
var TERMINAL = ["stalled", "exhausted"];
var id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "use a lowercase kebab-case id");
var base = { id, description: z.string().optional(), severity: z.enum(["block", "warn"]).default("block") };
var gate = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("check"), kinds: z.array(z.enum(CHECK_KINDS)).optional() }),
  // `stage` limits `validate` to the planning stages up to it, e.g. a spec gate before the technical spec exists.
  z.object({ ...base, type: z.literal("maverick"), run: z.enum(MAVERICK_GATES), stage: z.enum(PLANNING_STAGES).optional() }),
  z.object({ ...base, type: z.literal("command"), run: z.string().min(1), cwd: z.string().optional() }),
  z.object({ ...base, type: z.literal("artifact"), file: z.string().min(1), sections: z.array(z.string()).default([]), pattern: z.string().optional(), noPlaceholders: z.boolean().default(false) }),
  // An approval is recorded with `maverick flow approve`, or found in a task file (e.g. a checked box in REVIEW.md).
  z.object({ ...base, type: z.literal("approval"), prompt: z.string().min(1), file: z.string().optional(), pattern: z.string().optional() })
]);
var flowSchema = z.object({
  apiVersion: z.literal("maverick.flow/v1"),
  name: id,
  description: z.string().min(10),
  contract: z.object({
    goal: z.string().min(1),
    iterationCap: z.number().int().min(1).max(20).default(3),
    noProgressWindow: z.number().int().min(2).max(10).default(2)
  }),
  gates: z.array(gate).min(1)
}).superRefine((flow, ctx) => {
  const seen = /* @__PURE__ */ new Set();
  flow.gates.forEach((item, index) => {
    if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: ["gates", index, "id"], message: `duplicate gate id "${item.id}"` });
    seen.add(item.id);
  });
});
function formatIssues(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
async function loadFlowFile(path, source) {
  const text = await readFile4(path, "utf8");
  let data;
  try {
    data = parseYaml2(text);
  } catch (error) {
    throw new Error(`${path}: invalid YAML (${error.message})`);
  }
  const parsed = flowSchema.safeParse(data);
  if (!parsed.success) throw new Error(`${path}: ${formatIssues(parsed.error)}`);
  if (parsed.data.name !== basename(path).replace(/\.ya?ml$/, "")) throw new Error(`${path}: name "${parsed.data.name}" must match the file name`);
  return { ...parsed.data, source, path, integrity: sha256(text) };
}
async function loadFlows(cwd) {
  const flows = /* @__PURE__ */ new Map(), errors = [];
  for (const [source, dir] of [["project", join6(cwd, ".maverick", "flows")], ["built-in", join6(packageRoot, "flows")]]) {
    for (const file of (await readdir5(dir).catch(() => [])).filter((name) => /\.ya?ml$/.test(name)).sort()) {
      try {
        const flow = await loadFlowFile(join6(dir, file), source);
        if (!flows.has(flow.name)) flows.set(flow.name, flow);
      } catch (error) {
        errors.push({ source, file, message: error.message.replace(`${join6(dir, file)}: `, "") });
      }
    }
  }
  return { flows: [...flows.values()], errors };
}
async function findFlow(cwd, name) {
  const { flows, errors } = await loadFlows(cwd);
  const flow = flows.find((item) => item.name === name);
  if (flow) return flow;
  const broken = errors.find((error) => error.file.replace(/\.ya?ml$/, "") === name);
  if (broken) throw new Error(`flow ${name} is invalid: ${broken.message}`);
  throw new Error(`flow not found: ${name || "(none)"}; available: ${flows.map((item) => item.name).join(", ") || "none"}`);
}
function interpolate(text, vars) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => vars[key] ?? match);
}

// src/flows/engine.js
import { mkdir as mkdir2, readFile as readFile5, writeFile as writeFile2 } from "fs/promises";
import { join as join7 } from "path";
function parseJson(text) {
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
  validate: (json3) => ({ pass: json3.valid, issues: json3.results.filter((item) => item.status === "FAIL").map((item) => `${item.file}: ${item.message}`) }),
  verify: (json3) => ({ pass: json3.ok, issues: json3.results.filter((item) => !item.ok).map((item) => `failed: ${item.command}`) }),
  guard: (json3) => ({ pass: json3.ok, issues: json3.findings }),
  security: (json3) => ({ pass: !json3.findings.length, issues: json3.findings }),
  deps: (json3) => ({ pass: true, issues: [], summary: `${json3.manifests.length} manifest(s), ${json3.lockfiles.length} lockfile(s) changed` }),
  policy: (json3) => ({ pass: json3.ok, issues: json3.findings }),
  review: (json3) => ({ pass: !json3.findings.length, issues: json3.findings }),
  readiness: (json3) => ({ pass: json3.ready, issues: json3.missing.map((item) => `missing: ${item}`) })
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
function taskFile(context, gate2) {
  const file = interpolate(gate2.file, { task: context.task });
  return { file, path: file.split(/[\\/]/).includes("..") ? null : join7(context.taskDir, file) };
}
async function runArtifact(context, gate2) {
  const { file, path } = taskFile(context, gate2);
  if (!path) return { pass: false, issues: [`artifact path must stay inside the task: ${file}`] };
  if (!await exists(path)) return { pass: false, issues: [`missing ${file}`] };
  const text = await readFile5(path, "utf8"), issues = [];
  for (const section of gate2.sections) if (!sectionPresent(text, section)) issues.push(`${file}: missing section "${section}"`);
  if (gate2.pattern && !new RegExp(gate2.pattern, "m").test(text)) issues.push(`${file}: ${gate2.description || `expected /${gate2.pattern}/`}`);
  if (gate2.noPlaceholders && !hasMeaningfulContent(text)) issues.push(`${file}: placeholders remain`);
  return { pass: !issues.length, issues };
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
      return { ...base2, status: approval.decision === "approve" ? "pass" : "fail", issues: approval.decision === "approve" ? [] : [`rejected by ${approval.by}: ${approval.reason || "no reason given"}`], summary: approval.auto ? "auto-approved" : `${approval.decision} by ${approval.by}` };
    }
    let result;
    if (gate2.type === "check") result = await runChecks(context, gate2);
    else if (gate2.type === "artifact") result = await runArtifact(context, gate2);
    else if (gate2.type === "command") {
      const command = interpolate(gate2.run, { task: context.task });
      const run2 = await executeCommand(context.cwd, command, gate2.cwd || "");
      result = { pass: run2.ok, issues: run2.ok ? [] : [`${command} exited ${run2.code ?? "before starting"}`], summary: run2.output.trim().split("\n").slice(-3).join(" | ").slice(0, 300) };
    } else {
      const args = [gate2.run, context.task, "--json", ...gate2.run === "review" ? ["--diff"] : [], ...gate2.stage ? ["--stage", gate2.stage] : []];
      let captured;
      try {
        captured = (await captureOutput(() => context.invoke(args))).output;
      } catch (error) {
        captured = error.output;
        const json3 = parseJson(captured);
        if (!json3) return { ...base2, status: "fail", issues: [error.message] };
      }
      result = MAVERICK_RESULTS[gate2.run](parseJson(captured));
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
  return join7(taskDir, "flows", `${flow}.json`);
}
async function readState(taskDir, flow) {
  const path = statePath(taskDir, flow);
  if (!await exists(path)) return { flow, runs: [], approvals: {} };
  return JSON.parse(await readFile5(path, "utf8"));
}
async function writeState(taskDir, state) {
  await mkdir2(join7(taskDir, "flows"), { recursive: true });
  await writeFile2(statePath(taskDir, state.flow), pretty(state));
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
async function writeReport(context, flow, run2) {
  const reportPath = join7(context.taskDir, `FLOW-${flow.name.toUpperCase()}.md`);
  await writeFile2(reportPath, renderReport(flow, context.task, run2, flow.contract));
  return reportPath;
}
var autoApproves = (config, name) => (config?.flows?.autoApprove || []).includes(name);
var AUTO_NOTE = "> Auto-approved by Maverick";
async function mirrorDecision(context, gate2, approval) {
  if (!gate2.file || !gate2.pattern) return;
  const { path } = taskFile(context, gate2);
  if (!path || !await exists(path)) return;
  const lines = (await readFile5(path, "utf8")).split("\n"), satisfies = (line) => new RegExp(gate2.pattern).test(line);
  let next;
  if (approval.decision === "approve") {
    if (lines.some(satisfies)) return;
    const index = lines.findIndex((line) => line.includes("[ ]") && satisfies(line.replace("[ ]", "[x]")));
    if (index < 0) return;
    next = [...lines.slice(0, index), lines[index].replace("[ ]", "[x]"), ...approval.auto ? [`  ${AUTO_NOTE} (${context.flow} flow, ${approval.at.slice(0, 10)}); no human recorded this decision.`] : [], ...lines.slice(index + 1)];
  } else {
    next = lines.filter((line) => !line.includes(AUTO_NOTE)).map((line) => satisfies(line) ? line.replace(/\[[xX]\]/, "[ ]") : line);
    if (next.join("\n") === lines.join("\n")) return;
  }
  await writeFile2(path, next.join("\n"));
}
async function settle(context, flow, state) {
  const last = state.runs.at(-1), gates = new Map(flow.gates.map((gate2) => [gate2.id, gate2]));
  if (!last || state.integrity && state.integrity !== flow.integrity) return null;
  if (last.results.some((result) => result.severity === "block" && result.status === "fail" && gates.get(result.id)?.type !== "approval")) return null;
  const results = [];
  for (const result of last.results) results.push(gates.get(result.id)?.type === "approval" ? await evaluateGate(context, gates.get(result.id), state) : result);
  return { at: last.at, ...decideOutcome(results, state.runs.slice(0, -1), flow.contract), results, decidedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
async function recordApproval(context, flow, gateId, { decision = "approve", by = "human", reason, auto = false } = {}) {
  const gate2 = flow.gates.find((item) => item.id === gateId);
  if (!gate2 || gate2.type !== "approval") throw new Error(`${flow.name} has no approval gate "${gateId || ""}"; approval gates: ${flow.gates.filter((item) => item.type === "approval").map((item) => item.id).join(", ") || "none"}`);
  if (decision === "reject" && !reason) throw new Error("a rejection needs a reason");
  const approval = { decision, by, at: (/* @__PURE__ */ new Date()).toISOString(), ...reason && { reason }, ...auto && { auto: true } };
  const ctx = { ...context, flow: flow.name };
  let state = await readState(context.taskDir, flow.name);
  state = { ...state, flow: flow.name, approvals: { ...state.approvals, [gate2.id]: approval } };
  await mirrorDecision(ctx, gate2, approval);
  const run2 = await settle(ctx, flow, state);
  if (run2) state = { ...state, runs: [...state.runs.slice(0, -1), run2], status: run2.outcome };
  await writeState(context.taskDir, state);
  if (run2) await writeReport(context, flow, run2);
  return { approval, run: run2, next: run2 ? NEXT_STEP[run2.outcome] : null };
}
async function runFlow(context, flow, { reset = false, autoApprove: autoApprove2 = false } = {}) {
  let state = await readState(context.taskDir, flow.name);
  const notes = [], ctx = { ...context, flow: flow.name };
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
  for (const gate2 of flow.gates) {
    if (gate2.type === "approval" && state.approvals?.[gate2.id]?.decision === "approve") await mirrorDecision(ctx, gate2, state.approvals[gate2.id]);
    results.push(await evaluateGate(ctx, gate2, state));
  }
  let decision = decideOutcome(results, state.runs, flow.contract);
  if (decision.outcome === "awaiting-approval" && (autoApprove2 || autoApproves(await loadConfig(context.cwd).catch(() => null), flow.name))) {
    const at = (/* @__PURE__ */ new Date()).toISOString();
    for (const [index, result] of results.entries()) {
      if (result.type !== "approval" || result.status !== "pending") continue;
      const gate2 = flow.gates.find((item) => item.id === result.id), approval = { decision: "approve", by: "auto-approve", at, auto: true };
      state = { ...state, approvals: { ...state.approvals, [gate2.id]: approval } };
      await mirrorDecision(ctx, gate2, approval);
      results[index] = await evaluateGate(ctx, gate2, state);
    }
    decision = decideOutcome(results, state.runs, flow.contract);
    notes.push("every blocking check passed, so the pending approvals were auto-approved");
  }
  const run2 = { at: (/* @__PURE__ */ new Date()).toISOString(), ...decision, results };
  state = { ...state, flow: flow.name, integrity: flow.integrity, runs: [...state.runs, run2], status: run2.outcome };
  await writeState(context.taskDir, state);
  const reportPath = await writeReport(context, flow, run2);
  return { run: run2, state, notes, reportPath, next: NEXT_STEP[run2.outcome] };
}

// src/intel/devtools.js
import { resolve as resolvePath } from "path";

// src/intel/architecture.js
var ROOT = "(root)";
function components(nodes, adjacency) {
  let counter = 0;
  const index = /* @__PURE__ */ new Map(), low = /* @__PURE__ */ new Map(), onStack = /* @__PURE__ */ new Set(), stack = [], result = [];
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    index.set(start, counter);
    low.set(start, counter);
    counter++;
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1], [node] = frame, next = adjacency.get(node) || [];
      if (frame[1] < next.length) {
        const child = next[frame[1]++];
        if (!index.has(child)) {
          index.set(child, counter);
          low.set(child, counter);
          counter++;
          stack.push(child);
          onStack.add(child);
          work.push([child, 0]);
        } else if (onStack.has(child)) low.set(node, Math.min(low.get(node), index.get(child)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const members = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          members.push(member);
        } while (member !== node);
        result.push(members.sort());
      }
    }
  }
  return result;
}
function loopOf(members, adjacency) {
  const inside = new Set(members), start = members[0], previous = /* @__PURE__ */ new Map([[start, null]]), queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const next of adjacency.get(node) || []) {
      if (!inside.has(next)) continue;
      if (next === start) {
        const path = [node];
        let step = node;
        while (previous.get(step)) {
          step = previous.get(step);
          path.unshift(step);
        }
        return [...path, start];
      }
      if (!previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return [...members, start];
}
function depths(ids, adjacency) {
  const order = components(ids, adjacency), owner = /* @__PURE__ */ new Map(), depth = /* @__PURE__ */ new Map();
  order.forEach((members, position) => members.forEach((member) => owner.set(member, position)));
  order.forEach((members, position) => {
    let best = 0;
    for (const member of members) for (const next of adjacency.get(member) || []) {
      const other = owner.get(next);
      if (other !== position && other !== void 0) best = Math.max(best, depth.get(other) + 1);
    }
    depth.set(position, best);
  });
  return new Map(ids.map((id2) => [id2, depth.get(owner.get(id2)) ?? 0]));
}
var dirOf = (file) => file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
function globToRegex(glob) {
  const pattern = glob.replace(/\/$/, "/**");
  let out = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      out += pattern[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += pattern[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}
function inferComponents(files, { max, share = 0.25, patterns = [], depth } = {}) {
  max ??= Math.max(16, Math.min(48, Math.round(8 + Math.sqrt(files.length) * 0.8)));
  if (patterns.length) {
    const matchers = patterns.map(globToRegex), found = /* @__PURE__ */ new Set();
    for (const file of files) for (let dir = dirOf(file); dir; dir = dirOf(dir)) if (matchers.some((matcher) => matcher.test(dir))) {
      found.add(dir);
      break;
    }
    return [...found].sort();
  }
  if (depth) return [...new Set(files.map((file) => file.split("/").slice(0, Math.min(depth, file.split("/").length - 1)).join("/")).filter(Boolean))].sort();
  let prefixes = new Set(files.map((file) => file.includes("/") ? file.split("/")[0] : "").filter(Boolean));
  const stuck = /* @__PURE__ */ new Set(), total = files.length || 1;
  for (let guard = 0; guard < 400; guard++) {
    const owner = componentResolver(prefixes), members = new Map([...prefixes].map((prefix) => [prefix, []]));
    for (const file of files) members.get(owner(file))?.push(file);
    const candidates = [...prefixes].filter((prefix) => !stuck.has(prefix)).map((prefix) => ({ prefix, members: members.get(prefix) })).sort((a, b) => b.members.length - a.members.length);
    let changed = false;
    for (const { prefix, members: members2 } of candidates) {
      const direct = members2.some((file) => dirOf(file) === prefix);
      const children = [...new Set(members2.filter((file) => dirOf(file) !== prefix).map((file) => `${prefix}/${file.slice(prefix.length + 1).split("/")[0]}`))];
      if (children.length === 1 && !direct) {
        prefixes.delete(prefix);
        prefixes.add(children[0]);
        changed = true;
        break;
      }
      if (members2.length / total <= share || children.length < 1) {
        stuck.add(prefix);
        continue;
      }
      const room = max - prefixes.size + (direct ? 0 : 1);
      if (room < 2) {
        stuck.add(prefix);
        continue;
      }
      const size = (child) => members2.filter((file) => file.startsWith(`${child}/`)).length;
      const chosen = children.length <= room ? children : children.sort((a, b) => size(b) - size(a)).slice(0, room - 1);
      if (!direct && chosen.length === children.length) prefixes.delete(prefix);
      else stuck.add(prefix);
      for (const child of chosen) prefixes.add(child);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  prefixes = [...prefixes].sort();
  return prefixes;
}
function componentResolver(prefixes) {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  const cache = /* @__PURE__ */ new Map();
  return (file) => {
    if (cache.has(file)) return cache.get(file);
    const found = sorted.find((prefix) => file.startsWith(`${prefix}/`)) || ROOT;
    cache.set(file, found);
    return found;
  };
}
var round = (value, digits = 2) => Number(value.toFixed(digits));
function analyzeArchitecture(nodes, edges, { prefixes, rules = [] } = {}) {
  const source = nodes.filter((node) => !node.test), sourceIds = new Set(source.map((node) => node.id));
  const componentOf = componentResolver(prefixes ?? inferComponents(source.map((node) => node.id)));
  const groups = /* @__PURE__ */ new Map();
  const group = (id2) => {
    if (!groups.has(id2)) groups.set(id2, { id: id2, files: 0, tests: 0, loc: 0, complexity: 0, abstract: 0, concrete: 0, languages: {}, out: /* @__PURE__ */ new Map(), in: /* @__PURE__ */ new Map(), dependents: /* @__PURE__ */ new Set() });
    return groups.get(id2);
  };
  for (const node of nodes) {
    const item = group(componentOf(node.id));
    if (node.test) {
      item.tests++;
      continue;
    }
    item.files++;
    item.loc += node.loc || 0;
    item.complexity += node.complexity || 0;
    item.abstract += node.types?.abstract || 0;
    item.concrete += node.types?.concrete || 0;
    item.languages[node.language] = (item.languages[node.language] || 0) + 1;
  }
  const componentEdges = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (edge.dynamic || !sourceIds.has(edge.from) || !sourceIds.has(edge.to)) continue;
    const from = componentOf(edge.from), to = componentOf(edge.to);
    if (from === to) continue;
    const key = `${from}\0${to}`;
    if (!componentEdges.has(key)) componentEdges.set(key, { from, to, weight: 0, files: /* @__PURE__ */ new Set(), examples: [] });
    const link = componentEdges.get(key);
    link.weight++;
    link.files.add(edge.from);
    if (link.examples.length < 5) link.examples.push({ from: edge.from, to: edge.to });
    group(from).out.set(to, (group(from).out.get(to) || 0) + 1);
    group(to).in.set(from, (group(to).in.get(from) || 0) + 1);
    group(to).dependents.add(edge.from);
  }
  const list2 = [...groups.values()].filter((item) => item.files || item.tests).map((item) => {
    const ca = item.in.size, ce = item.out.size, types = item.abstract + item.concrete;
    const instability = ca + ce ? round(ce / (ca + ce)) : 0, abstractness = types ? round(item.abstract / types) : null;
    const distance2 = abstractness === null ? null : round(Math.abs(abstractness + instability - 1));
    const zone = distance2 === null || distance2 < 0.5 || ca + ce === 0 ? null : abstractness + instability < 1 ? "pain" : "uselessness";
    return { id: item.id, files: item.files, tests: item.tests, loc: item.loc, complexity: item.complexity, languages: item.languages, ca, ce, afferentFiles: item.dependents.size, importsIn: [...item.in.values()].reduce((a, b) => a + b, 0), importsOut: [...item.out.values()].reduce((a, b) => a + b, 0), instability, abstractness, distance: distance2, zone, types };
  }).sort((a, b) => b.files - a.files || a.id.localeCompare(b.id));
  const byId = new Map(list2.map((item) => [item.id, item]));
  const links = [...componentEdges.values()].map((link) => ({ from: link.from, to: link.to, weight: link.weight, files: link.files.size, examples: link.examples })).sort((a, b) => b.weight - a.weight);
  const adjacency = new Map(list2.map((item) => [item.id, []]));
  for (const link of links) adjacency.get(link.from)?.push(link.to);
  const cycles = components(list2.map((item) => item.id), adjacency).filter((members) => members.length > 1).map((members) => ({ members, loop: loopOf(members, adjacency) }));
  const sdp = links.map((link) => ({ ...link, delta: round((byId.get(link.to)?.instability ?? 0) - (byId.get(link.from)?.instability ?? 0)) })).filter((link) => link.delta >= 0.25 && byId.get(link.to)?.ca > 0).sort((a, b) => b.delta - a.delta || b.weight - a.weight).slice(0, 30).map(({ from, to, weight, delta, examples }) => ({ from, to, weight, delta, fromInstability: byId.get(from).instability, toInstability: byId.get(to).instability, examples }));
  const order = [...list2].sort((a, b) => a.instability - b.instability || b.ca - a.ca || a.id.localeCompare(b.id)).map((item) => item.id);
  const position = new Map(order.map((id2, index) => [id2, index]));
  const matrix = order.map(() => order.map(() => 0));
  for (const link of links) matrix[position.get(link.from)][position.get(link.to)] = link.weight;
  const compiled = rules.map((rule) => ({ ...rule, fromRe: globToRegex(rule.from), disallowRe: (rule.disallow || []).map(globToRegex), allowRe: (rule.allow || []).map(globToRegex) }));
  const violations = [];
  if (compiled.length) for (const edge of edges) {
    if (edge.dynamic) continue;
    for (const rule of compiled) if (rule.fromRe.test(edge.from) && rule.disallowRe.some((re) => re.test(edge.to)) && !rule.allowRe.some((re) => re.test(edge.to))) {
      violations.push({ from: edge.from, to: edge.to, rule: `${rule.from} \u219B ${rule.disallow.join(", ")}`, reason: rule.reason || "" });
      break;
    }
  }
  return { components: list2, links, cycles, sdp, dsm: { order, matrix }, violations, componentOf };
}

// src/intel/history.js
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
var exec2 = promisify2(execFile2);
var MAX_COMMITS = 2e3;
var MAX_FILES_PER_COMMIT = 40;
async function readHistory(cwd, { since: since2 = "12 months ago", limit = MAX_COMMITS } = {}) {
  try {
    const { stdout } = await exec2("git", ["log", `--since=${since2}`, `-n${limit}`, "--no-merges", "--name-only", "--format=%x00%h%x09%an%x09%at%x09%s"], { cwd, maxBuffer: 128 * 1024 * 1024 });
    return stdout.split("\0").filter(Boolean).map((chunk) => {
      const [header, ...rest] = chunk.split("\n"), [hash, author, time, ...subject] = header.split("	");
      return { hash, author, time: Number(time) * 1e3, subject: subject.join("	"), files: [...new Set(rest.map((line) => line.trim()).filter(Boolean))] };
    });
  } catch {
    return [];
  }
}
function changeCoupling(commits, { known, minShared = 3, minDegree = 0.3, limit = 60 } = {}) {
  const revisions = /* @__PURE__ */ new Map(), shared = /* @__PURE__ */ new Map();
  for (const commit of commits) {
    const files = commit.files.filter((file) => !known || known.has(file));
    if (files.length > MAX_FILES_PER_COMMIT) continue;
    for (const file of files) revisions.set(file, (revisions.get(file) || 0) + 1);
    for (let a = 0; a < files.length; a++) for (let b = a + 1; b < files.length; b++) {
      const key = files[a] < files[b] ? `${files[a]}\0${files[b]}` : `${files[b]}\0${files[a]}`;
      shared.set(key, (shared.get(key) || 0) + 1);
    }
  }
  const pairs = [];
  for (const [key, count2] of shared) {
    if (count2 < minShared) continue;
    const [a, b] = key.split("\0"), degree = count2 / ((revisions.get(a) + revisions.get(b)) / 2);
    if (degree >= minDegree) pairs.push({ a, b, shared: count2, degree: Number(degree.toFixed(2)) });
  }
  return pairs.sort((x, y) => y.degree * y.shared - x.degree * x.shared || x.a.localeCompare(y.a)).slice(0, limit);
}
function ownership(commits, groupOf2 = () => null) {
  const files = /* @__PURE__ */ new Map(), groups = /* @__PURE__ */ new Map(), authors = /* @__PURE__ */ new Map();
  const bump = (map, key, author) => {
    if (!map.has(key)) map.set(key, /* @__PURE__ */ new Map());
    const counts = map.get(key);
    counts.set(author, (counts.get(author) || 0) + 1);
  };
  for (const commit of commits) {
    authors.set(commit.author, (authors.get(commit.author) || 0) + 1);
    const touched = /* @__PURE__ */ new Set();
    for (const file of commit.files) {
      bump(files, file, commit.author);
      const group = groupOf2(file);
      if (group && !touched.has(group)) {
        touched.add(group);
        bump(groups, group, commit.author);
      }
    }
  }
  const summarize = (counts) => {
    const sorted = [...counts].sort((a, b) => b[1] - a[1]), total = sorted.reduce((sum, [, value]) => sum + value, 0);
    let covered = 0, busFactor = 0;
    for (const [, value] of sorted) {
      covered += value;
      busFactor++;
      if (covered > total / 2) break;
    }
    return { commits: total, authors: sorted.length, owner: sorted[0]?.[0], ownerShare: total ? Number((sorted[0][1] / total).toFixed(2)) : 0, busFactor, top: sorted.slice(0, 5).map(([name, value]) => ({ name, commits: value })) };
  };
  return {
    files: new Map([...files].map(([file, counts]) => [file, summarize(counts)])),
    groups: Object.fromEntries([...groups].map(([group, counts]) => [group, summarize(counts)])),
    contributors: [...authors].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, commits2]) => ({ name, commits: commits2 }))
  };
}
function activity(commits, weeks = 26, now = Date.now()) {
  const week = 7 * 24 * 3600 * 1e3, series = Array.from({ length: weeks }, (_, index) => ({ week: new Date(now - (weeks - 1 - index) * week).toISOString().slice(0, 10), commits: 0, files: 0 }));
  for (const commit of commits) {
    const age = Math.floor((now - commit.time) / week);
    if (age >= 0 && age < weeks) {
      const slot = series[weeks - 1 - age];
      slot.commits++;
      slot.files += commit.files.length;
    }
  }
  return series;
}
function churnOf(commits) {
  const counts = /* @__PURE__ */ new Map();
  for (const commit of commits) for (const file of commit.files) counts.set(file, (counts.get(file) || 0) + 1);
  return counts;
}

// src/intel/integrations.js
import { readFile as readFile6 } from "fs/promises";
import { join as join8 } from "path";
import { parse as parseYaml3 } from "yaml";
var INTEGRATIONS = [
  ["postgres", "PostgreSQL", "database", /^(pg|pg-promise|postgres|@neondatabase\/.+|psycopg2?(-binary)?|psycopg|asyncpg|github\.com\/(lib\/pq|jackc\/pgx.*)|org\.postgresql.*|Npgsql.*|tokio[-_]postgres|postgrex|pg_?gem|postgres_ex)$/i],
  ["mysql", "MySQL / MariaDB", "database", /^(mysql2?|mariadb|pymysql|mysqlclient|aiomysql|github\.com\/go-sql-driver\/mysql|com\.mysql.*|mysql-connector.*|MySql(Connector|\.Data).*|mysql_async|myxql)$/i],
  ["sqlite", "SQLite", "database", /^(sqlite3?|better-sqlite3|github\.com\/mattn\/go-sqlite3|org\.xerial.*|Microsoft\.Data\.Sqlite|rusqlite|exqlite|sqflite)$/i],
  ["mongodb", "MongoDB", "database", /^(mongodb|mongoose|pymongo|motor|mongoengine|go\.mongodb\.org\/mongo-driver.*|org\.mongodb.*|MongoDB\.Driver.*|mongo|mongoid|mongodb_driver|spring-boot-starter-data-mongodb)$/i],
  ["redis", "Redis", "cache", /^(redis|ioredis|@redis\/.+|aioredis|redis-py|github\.com\/(go-redis|redis)\/.+|StackExchange\.Redis|redis-rs|redix|predis\/predis|Predis.*|jedis|lettuce.*|io\.lettuce.*|redis\.clients.*|spring-boot-starter-data-redis|bullmq|bull|@nestjs\/bull.*)$/i],
  ["elasticsearch", "Elasticsearch / OpenSearch", "search", /^(@elastic\/elasticsearch|elasticsearch|@opensearch-project\/opensearch|opensearch-py|github\.com\/elastic\/go-elasticsearch.*|co\.elastic.*|org\.elasticsearch.*|Elastic\.Clients.*|NEST|searchkick|elastix)$/i],
  ["kafka", "Apache Kafka", "messaging", /^(kafkajs|@confluentinc\/.+|node-rdkafka|kafka|kafka-python|confluent[-_]kafka|aiokafka|github\.com\/(segmentio\/kafka-go|confluentinc\/.+|IBM\/sarama|Shopify\/sarama)|org\.apache\.kafka.*|org\.springframework\.kafka.*|spring-kafka|Confluent\.Kafka|rdkafka|ruby-kafka|karafka|kaffe|brod|broadway_kafka)$/i],
  ["rabbitmq", "RabbitMQ / AMQP", "messaging", /^(amqplib|amqp-connection-manager|@golevelup\/nestjs-rabbitmq|pika|aio-pika|kombu|github\.com\/(streadway\/amqp|rabbitmq\/amqp091-go)|com\.rabbitmq.*|org\.springframework\.amqp.*|spring-rabbit|RabbitMQ\.Client|lapin|bunny|sneakers|amqp|php-amqplib\/php-amqplib|PhpAmqpLib.*|broadway_rabbitmq)$/i],
  ["nats", "NATS", "messaging", /^(nats|nats\.ws|nats-py|github\.com\/nats-io\/.+|io\.nats.*|NATS\.Client|async-nats|gnat)$/i],
  ["aws", "AWS", "cloud", /^(aws-sdk|@aws-sdk\/.+|boto3|botocore|aioboto3|github\.com\/aws\/aws-sdk-go.*|software\.amazon\.awssdk.*|com\.amazonaws.*|AWSSDK\..+|aws-sdk-.+|aws_sdk_.+|ex_aws.*|aws\/aws-sdk-php|Aws.*)$/i],
  ["azure", "Azure", "cloud", /^(@azure\/.+|azure-.+|github\.com\/Azure\/.+|com\.azure.*|com\.microsoft\.azure.*|Azure\..+|Microsoft\.Azure\..+)$/i],
  ["gcp", "Google Cloud", "cloud", /^(@google-cloud\/.+|google-cloud-.+|google\.cloud.*|cloud\.google\.com\/go.*|com\.google\.cloud.*|Google\.Cloud\..+|google-cloud|googleapis)$/i],
  ["firebase", "Firebase", "cloud", /^(firebase|firebase-admin|@firebase\/.+|firebase_admin|firebase\.google\.com\/go.*|com\.google\.firebase.*|FirebaseAdmin|package:firebase_.+|firebase_.+|cloud_firestore)$/i],
  ["stripe", "Stripe", "payments", /^(stripe|@stripe\/.+|github\.com\/stripe\/stripe-go.*|com\.stripe.*|Stripe\.net|stripe-rust|async-stripe|stripity_stripe|stripe\/stripe-php|Stripe.*)$/i],
  ["openai", "OpenAI", "ai", /^(openai|@openai\/.+|github\.com\/sashabaranov\/go-openai|com\.theokanning.*|OpenAI|async-openai|ruby-openai|openai-php\/.+)$/i],
  ["anthropic", "Anthropic", "ai", /^(@anthropic-ai\/.+|anthropic|github\.com\/anthropics\/.+|com\.anthropic.*|Anthropic.*)$/i],
  ["llm", "LLM frameworks", "ai", /^(langchain|@langchain\/.+|langchain-.+|llama[-_]index|@llamaindex\/.+|ai|@ai-sdk\/.+|dev\.langchain4j.*|Microsoft\.SemanticKernel.*)$/i],
  ["sentry", "Sentry", "observability", /^(@sentry\/.+|sentry-sdk|sentry_sdk|github\.com\/getsentry\/sentry-go|io\.sentry.*|Sentry.*|sentry|sentry-ruby|sentry-rails)$/i],
  ["otel", "OpenTelemetry", "observability", /^(@opentelemetry\/.+|opentelemetry.*|go\.opentelemetry\.io\/.+|io\.opentelemetry.*|OpenTelemetry.*)$/i],
  ["datadog", "Datadog", "observability", /^(dd-trace|datadog|ddtrace|hot-shots|gopkg\.in\/DataDog\/.+|github\.com\/DataDog\/.+|com\.datadoghq.*|Datadog\..+)$/i],
  ["prometheus", "Prometheus", "observability", /^(prom-client|prometheus[-_]client|github\.com\/prometheus\/client_golang.*|io\.prometheus.*|io\.micrometer.*|prometheus-net.*|prometheus|prometheus_ex|prom_ex)$/i],
  ["elk", "Logging pipeline", "observability", /^(winston|pino|bunyan|@elastic\/ecs-.+|structlog|loguru|go\.uber\.org\/zap|github\.com\/sirupsen\/logrus|github\.com\/rs\/zerolog|ch\.qos\.logback.*|org\.apache\.logging.*|Serilog.*|NLog.*|tracing|lograge)$/i],
  ["grpc", "gRPC", "rpc", /^(@grpc\/.+|grpc|grpcio.*|google\.golang\.org\/grpc.*|io\.grpc.*|Grpc\..+|tonic|grpc_ex)$/i],
  ["graphql", "GraphQL", "api", /^(graphql|@apollo\/.+|apollo-server.*|@nestjs\/graphql|graphql-yoga|type-graphql|urql|graphene.*|strawberry(-graphql)?|ariadne|github\.com\/(99designs\/gqlgen|graph-gophers\/.+)|com\.graphql-java.*|HotChocolate.*|GraphQL.*|async-graphql|juniper|absinthe|graphql-ruby)$/i],
  ["http", "HTTP clients", "http", /^(axios|got|ky|node-fetch|undici|superagent|@nestjs\/axios|requests|httpx|aiohttp|urllib3|github\.com\/go-resty\/resty.*|com\.squareup\.okhttp.*|okhttp3?|org\.springframework\.web\.reactive.*|feign.*|io\.github\.openfeign.*|Refit|RestSharp|Flurl.*|reqwest|hyper|faraday|httparty|guzzlehttp\/guzzle|GuzzleHttp.*|tesla|finch|httpoison|req|dio|package:dio.*|package:http.*|Alamofire)$/i],
  ["orm", "ORM / query builders", "database", /^(@prisma\/client|prisma|typeorm|sequelize|drizzle-orm|knex|mikro-orm|@mikro-orm\/.+|objection|sqlalchemy|django\.db.*|peewee|tortoise(-orm)?|sqlmodel|gorm\.io\/.+|entgo\.io\/.+|github\.com\/jmoiron\/sqlx|org\.hibernate.*|jakarta\.persistence.*|javax\.persistence.*|spring-boot-starter-data-jpa|org\.jooq.*|Microsoft\.EntityFrameworkCore.*|Dapper|diesel|sea-orm|sqlx|activerecord|sequel|ecto.*|Ecto.*|doctrine\/.+|Doctrine.*|illuminate\/database|Illuminate\\\\Database.*|drift|floor)$/i],
  ["auth", "Auth & identity", "security", /^(passport.*|jsonwebtoken|jose|next-auth|@auth\/.+|@clerk\/.+|@auth0\/.+|auth0|keycloak-.+|@supabase\/supabase-js|pyjwt|jwt|authlib|python-jose|django-allauth|github\.com\/golang-jwt\/.+|org\.springframework\.security.*|spring-boot-starter-security|com\.auth0.*|io\.jsonwebtoken.*|Microsoft\.AspNetCore\.Authentication.*|Microsoft\.Identity.*|jsonwebtoken|devise|omniauth.*|guardian|ueberauth|pow|firebase_auth|tymon\/jwt-auth|laravel\/sanctum|laravel\/passport)$/i],
  ["email", "Email / messaging SaaS", "saas", /^(nodemailer|@sendgrid\/.+|sendgrid|twilio|@slack\/.+|slack[-_]sdk|resend|postmark|mailgun.*|@aws-sdk\/client-ses|github\.com\/sendgrid\/.+|com\.sendgrid.*|com\.twilio.*|Twilio|SendGrid|mail|actionmailer|swoosh|bamboo)$/i]
].map(([id2, name, category, pattern]) => ({ id: id2, name, category, pattern }));
var INFRA_IMAGES = [
  ["postgres", /postgres|postgis|timescale/],
  ["mysql", /mysql|mariadb/],
  ["mongodb", /mongo/],
  ["redis", /redis|valkey|dragonfly/],
  ["elasticsearch", /elasticsearch|opensearch|kibana/],
  ["kafka", /kafka|redpanda|zookeeper/],
  ["rabbitmq", /rabbitmq/],
  ["nats", /nats/],
  ["aws", /localstack|minio|dynamodb/],
  ["azure", /azurite|servicebus/],
  ["otel", /otel|jaeger|tempo|zipkin/],
  ["prometheus", /prometheus|grafana/]
];
var MANIFESTS = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml|Gemfile|composer\.json|[^/]+\.csproj|mix\.exs|pubspec\.yaml|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/;
function manifestDependencies(file, text) {
  const name = file.split("/").pop();
  try {
    if (name === "package.json" || name === "composer.json") {
      const json3 = JSON.parse(text);
      return Object.keys({ ...json3.dependencies, ...json3.devDependencies, ...json3.require, ...json3.peerDependencies, ...json3.optionalDependencies });
    }
    if (/^requirements.*\.txt$/.test(name)) return [...text.matchAll(/^\s*([A-Za-z0-9][\w.-]*)/gm)].map((match) => match[1]);
    if (name === "pyproject.toml" || name === "Pipfile") return [...text.matchAll(/^\s*["']?([A-Za-z0-9][\w.-]*)["']?\s*(?:[=<>~!^]|\[|["'])/gm), ...text.matchAll(/["']([A-Za-z0-9][\w.-]*)\s*(?:[=<>~!;[]|["'])/g)].map((match) => match[1]);
    if (name === "go.mod") return [...text.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w.-]+\/[^\s]+)\s+v/gm)].map((match) => match[1]);
    if (name === "pom.xml") return [...text.matchAll(/<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g)].flatMap((match) => [match[1], match[2], `${match[1]}.${match[2]}`]);
    if (/^build\.gradle/.test(name)) return [...text.matchAll(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g)].flatMap((match) => [match[1], match[2], `${match[1]}.${match[2]}`]);
    if (name === "Cargo.toml") {
      const section = text.split(/^\[/m).filter((part) => /^(dev-|build-)?dependencies/.test(part)).join("\n");
      return [...section.matchAll(/^\s*([A-Za-z0-9][\w-]*)\s*=/gm)].map((match) => match[1]);
    }
    if (name === "Gemfile") return [...text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
    if (name.endsWith(".csproj")) return [...text.matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map((match) => match[1]);
    if (name === "mix.exs") return [...text.matchAll(/\{\s*:(\w+)\s*,/g)].map((match) => match[1]);
    if (name === "pubspec.yaml") {
      const yaml = parseYaml3(text) || {};
      return Object.keys({ ...yaml.dependencies, ...yaml.dev_dependencies });
    }
    if (/compose/.test(name)) {
      const yaml = parseYaml3(text) || {};
      return Object.values(yaml.services || {}).map((service) => `image:${service?.image || ""}`);
    }
  } catch {
  }
  return [];
}
var ENV_PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  /Deno\.env\.get\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /Bun\.env\.([A-Z_][A-Z0-9_]*)/g,
  /os\.environ(?:\.get)?\s*[[(]\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /os\.getenv\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /env\.(?:str|int|bool|url|list)\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /os\.(?:Getenv|LookupEnv)\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /viper\.Get\w*\(\s*"([\w.]+)"/g,
  /System\.getenv\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /@Value\(\s*"\$\{([\w.-]+)/g,
  /Environment\.GetEnvironmentVariable\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /ENV\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g,
  /ENV\.fetch\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /\benv\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g,
  /\$_(?:ENV|SERVER)\[\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /getenv\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /(?:std::)?env::var(?:_os)?\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /\benv!\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /System\.(?:get_env|fetch_env!?)\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /Platform\.environment\[\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /environment\[\s*"([A-Z_][A-Z0-9_]*)"\s*\]/g,
  /config(?:Service)?\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g
];
var SECRET = /(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL|SIGNING|SALT|DSN)/;
var ADDRESS = /(_URL|_URI|_HOST|_ENDPOINT|_ADDR(ESS)?|_BASE|_SERVER|_DSN)$/;
var DOC_HOSTS = /(^|\.)(w3\.org|schema\.org|json-schema\.org|example\.(com|org|net)|localhost|127\.0\.0\.1|0\.0\.0\.0|github\.com|githubusercontent\.com|npmjs\.(com|org)|mozilla\.org|apache\.org|opensource\.org|creativecommons\.org|xmlsoap\.org|microsoft\.com|googleapis\.com\/auth|gnu\.org|jquery\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|shields\.io|wikipedia\.org|stackoverflow\.com|semver\.org|ietf\.org|purl\.org|swagger\.io|openapis\.org)$/i;
function serviceName(variable) {
  return variable.replace(ADDRESS, "").split("_").filter(Boolean).map((word) => /^(API|HTTP|GRPC|DB|SQL|AWS|GCP|SMTP|S3|SQS|SNS|CDN|IDP|SSO|CRM|ERP)$/.test(word) ? word : word[0] + word.slice(1).toLowerCase()).join(" ") || variable;
}
async function exampleKeys(root) {
  const keys = /* @__PURE__ */ new Set(), sources = [];
  for (const name of [".env.example", ".env.sample", ".env.template", ".env.dist", "example.env", ".env.defaults", "env.example"]) {
    const text = await readFile6(join8(root, name), "utf8").catch(() => null);
    if (text === null) continue;
    sources.push(name);
    for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/gm)) keys.add(match[1]);
  }
  return { keys, sources };
}
async function analyzeIntegrations(root, { sources, languageOf, isTest = () => false }) {
  const manifests = await listFiles(root, (file) => MANIFESTS.test(file), { depthLimit: 6 });
  const declared = /* @__PURE__ */ new Map();
  const note = (id2, manifest, pkg) => {
    if (!declared.has(id2)) declared.set(id2, { manifests: /* @__PURE__ */ new Set(), packages: /* @__PURE__ */ new Set() });
    declared.get(id2).manifests.add(manifest);
    if (pkg) declared.get(id2).packages.add(pkg);
  };
  for (const manifest of manifests) {
    const text = await readFile6(join8(root, manifest), "utf8").catch(() => "");
    for (const dependency of manifestDependencies(manifest, text)) {
      if (dependency.startsWith("image:")) {
        const image = dependency.slice(6).toLowerCase();
        for (const [id2, pattern] of INFRA_IMAGES) if (pattern.test(image)) note(id2, manifest, image);
        continue;
      }
      for (const integration of INTEGRATIONS) if (integration.pattern.test(dependency)) {
        note(integration.id, manifest, dependency);
        break;
      }
    }
  }
  const users = /* @__PURE__ */ new Map(), env = /* @__PURE__ */ new Map(), hosts = /* @__PURE__ */ new Map();
  for (const [file, text] of sources) {
    if (!text || isTest(file)) continue;
    const language = languageOf(file), at = lineIndex(text);
    for (const spec of extractImports(language, text)) {
      if (spec.startsWith(".")) continue;
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : /^[\w.-]+\.[a-z]{2,}\//.test(spec) ? spec : spec.split(/[/:]/)[0];
      for (const integration of INTEGRATIONS) {
        if (integration.pattern.test(spec) || integration.pattern.test(pkg) || language === "Python" && integration.pattern.test(spec.split(".")[0])) {
          if (!users.has(integration.id)) users.set(integration.id, /* @__PURE__ */ new Map());
          users.get(integration.id).set(file, spec);
          break;
        }
      }
    }
    for (const pattern of ENV_PATTERNS) for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (!env.has(name)) env.set(name, { name, files: /* @__PURE__ */ new Map() });
      const entry = env.get(name);
      if (!entry.files.has(file)) entry.files.set(file, at(match.index));
    }
    for (const match of text.matchAll(/\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+)?(\/[^\s'"`)]*)?/gi)) {
      const host = match[1].toLowerCase(), line = text.slice(text.lastIndexOf("\n", match.index) + 1, match.index).trim();
      if (DOC_HOSTS.test(host) || /^(\/\/|#|\*|\/\*|--|<!--)/.test(line) || /^(docs?|developers?|help|support|blog|www|learn|status)\./.test(host) || /^\/(docs?|documentation|blog|guides?|learn|reference)\b/.test(match[2] || "") || /\.(dev|example|test|invalid|local)$/.test(host)) continue;
      const context = text.slice(text.lastIndexOf("\n", match.index) + 1, text.indexOf("\n", match.index) < 0 ? void 0 : text.indexOf("\n", match.index));
      if (!/(fetch|axios|got|ky|request|http[s]?\.|client|base_?url|baseURL|endpoint|_URL|url\s*[:=]|uri\s*[:=]|host\s*[:=]|requests\.|httpx\.|HttpClient|WebClient|RestTemplate|NewRequest|reqwest|Faraday|Guzzle|Dio|URLSession|connect|dial)/i.test(context)) continue;
      if (!hosts.has(host)) hosts.set(host, { host, files: /* @__PURE__ */ new Map() });
      if (!hosts.get(host).files.has(file)) hosts.get(host).files.set(file, at(match.index));
    }
  }
  const byId = new Map(INTEGRATIONS.map((item) => [item.id, item]));
  const integrations = [.../* @__PURE__ */ new Set([...declared.keys(), ...users.keys()])].map((id2) => {
    const meta = byId.get(id2), dec = declared.get(id2), use = users.get(id2);
    return { id: id2, name: meta.name, category: meta.category, packages: [...dec?.packages || []].slice(0, 12), manifests: [...dec?.manifests || []], files: [...use?.keys() || []], declaredOnly: !use };
  }).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
  const { keys: documented, sources: exampleFiles } = await exampleKeys(root);
  const variables = [...env.values()].map((entry) => ({
    name: entry.name,
    files: [...entry.files].map(([file, line]) => ({ file, line })),
    secret: SECRET.test(entry.name),
    address: ADDRESS.test(entry.name),
    documented: exampleFiles.length ? documented.has(entry.name) : null
  })).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
  const services = [
    ...variables.filter((item) => item.address && !/^(DATABASE|DB|REDIS|MONGO\w*|POSTGRES\w*|MYSQL|KAFKA\w*|RABBIT\w*|AMQP|ELASTIC\w*|NODE|PORT|APP|PUBLIC|NEXT_PUBLIC|VITE)_/.test(item.name) && !/^(DATABASE_URL|REDIS_URL|MONGO_URL|MONGODB_URI|PORT|HOST)$/.test(item.name)).map((item) => ({ id: `env:${item.name}`, name: serviceName(item.name), via: item.name, files: item.files.map((entry) => entry.file) })),
    ...[...hosts.values()].map((entry) => ({ id: `host:${entry.host}`, name: entry.host, via: "literal URL", files: [...entry.files.keys()] }))
  ].sort((a, b) => b.files.length - a.files.length).slice(0, 60);
  return { integrations, variables, services, exampleFiles, manifests };
}

// src/intel/devtools.js
var COMPLEX = 60;
var LARGE = 800;
var NESTED = 7;
var ENTRY_NAME = /(^|\/)(index|main|app|server|cli|manage|setup|conftest|__init__|__main__|wsgi|asgi|mod|lib|build|worker|handler|lambda|function|bootstrap|program|startup|config|settings|urls|routes?|router|middleware|instrumentation|global|env|types?|constants?|polyfills?|setupTests|vite-env)\.[^/]+$|\.(config|conf|setup|d)\.[^/]+$|(^|\/)(bin|scripts?|migrations?|seeds?|fixtures?|examples?|samples?|docs?|public|static|stories|storybook|\.storybook|e2e|cypress|playwright|tools?|benchmarks?)\//i;
function findingsFor(report2) {
  const findings = [], add2 = (finding) => findings.push({ id: `${finding.category}-${findings.length}`, ...finding });
  const { graph, architecture: arch, routes, hotspots, cochange, integrations } = report2;
  for (const cycle of graph.cycles) add2({ category: "cycles", severity: cycle.members.length > 5 ? "high" : "medium", title: `Import cycle of ${cycle.members.length} files`, detail: cycle.loop.join(" \u2192 "), files: cycle.members, action: "Extract the shared part into a module both sides depend on, or invert one dependency behind an interface." });
  for (const hub of graph.hubs.slice(0, 15)) {
    const node = report2.fileIndex.get(hub);
    add2({ category: "coupling", severity: "medium", title: `Hub file ${hub}`, detail: `fan-in ${node?.fanIn}, fan-out ${node?.fanOut}: widely used and depending on many others.`, files: [hub], action: "Split responsibilities so dependents only import what they use." });
  }
  for (const cycle of arch.cycles) add2({ category: "architecture", severity: "medium", title: `Components depend on each other: ${cycle.members.join(", ")}`, detail: cycle.loop.join(" \u2192 "), files: cycle.members, action: "Pick a direction; move what the other side needs into a shared component." });
  for (const violation of arch.violations.slice(0, 40)) add2({ category: "boundaries", severity: "high", title: `Boundary violation: ${violation.rule}`, detail: `${violation.from} imports ${violation.to}${violation.reason ? ` \u2014 ${violation.reason}` : ""}`, files: [violation.from, violation.to], action: "Depend on an abstraction owned by the inner layer instead." });
  for (const link of arch.sdp.slice(0, 10)) add2({ category: "architecture", severity: "low", title: `${link.from} depends on less stable ${link.to}`, detail: `Instability ${link.fromInstability} \u2192 ${link.toInstability} (${link.weight} imports). Stable components should not depend on volatile ones.`, files: link.examples.map((example) => example.from), action: "Invert the dependency or move the used part to a more stable component." });
  for (const component of arch.components.filter((item) => item.zone === "pain" && item.ca >= 2).slice(0, 6)) add2({ category: "architecture", severity: "low", title: `${component.id} is in the zone of pain`, detail: `Concrete (A ${component.abstractness}) and depended on by ${component.ca} components (I ${component.instability}): hard to change without ripples.`, files: [], component: component.id, action: "Introduce interfaces at its boundary or reduce its dependents." });
  for (const hotspot of hotspots.slice(0, 8)) if (hotspot.complexity >= 20) add2({ category: "hotspots", severity: hotspot.score > (hotspots[0]?.score || 0) / 2 ? "high" : "medium", title: `Hotspot ${hotspot.id}`, detail: `${hotspot.commits} commits, complexity ${hotspot.complexity}, ${hotspot.fanIn} dependents: where change, complexity and coupling meet.`, files: [hotspot.id], action: "Prefer the strict workflow here, add tests before refactoring, split along the change axis." });
  for (const pair of cochange.filter((item) => item.hidden).slice(0, 10)) add2({ category: "change-coupling", severity: pair.degree >= 0.7 ? "medium" : "low", title: `Hidden coupling: ${pair.a} \u21C4 ${pair.b}`, detail: `Changed together in ${pair.shared} commits (degree ${pair.degree}) with no import between them.`, files: [pair.a, pair.b], action: "Make the dependency explicit or merge the duplicated knowledge." });
  for (const node of report2.files.filter((item) => !item.test && item.complexity >= COMPLEX).sort((a, b) => b.complexity - a.complexity).slice(0, 12)) add2({ category: "complexity", severity: node.complexity >= COMPLEX * 2 ? "medium" : "low", title: `Complex file ${node.id}`, detail: `${node.complexity} decision points in ${node.loc} lines, nesting ${node.maxNesting}.`, files: [node.id], action: "Extract functions around the deepest branches; cover them with tests first." });
  for (const node of report2.files.filter((item) => !item.test && item.loc >= LARGE).sort((a, b) => b.loc - a.loc).slice(0, 8)) add2({ category: "size", severity: "low", title: `Large file ${node.id}`, detail: `${node.loc} lines of code.`, files: [node.id], action: "Split by responsibility." });
  for (const node of report2.files.filter((item) => !item.test && item.maxNesting >= NESTED).sort((a, b) => b.maxNesting - a.maxNesting).slice(0, 6)) add2({ category: "complexity", severity: "low", title: `Deep nesting in ${node.id}`, detail: `Indentation reaches ${node.maxNesting} levels.`, files: [node.id], action: "Use early returns and extract nested blocks." });
  for (const duplicate of routes.insights.duplicates) add2({ category: "routes", severity: "high", title: `Route defined twice: ${duplicate.method} ${duplicate.path}`, detail: duplicate.locations.join(", "), files: duplicate.locations.map((location) => location.replace(/:\d+$/, "")), action: "Keep one definition; the other is shadowed or ambiguous." });
  for (const route of routes.insights.contract.unimplemented.slice(0, 15)) add2({ category: "contract", severity: "medium", title: `Documented but not found in code: ${route.method} ${route.path}`, detail: `Declared in ${route.file}:${route.line}.`, files: [route.file], action: "Implement it or remove it from the contract." });
  if (routes.insights.contract.undocumented.length) add2({ category: "contract", severity: "low", title: `${routes.insights.contract.undocumented.length} route(s) missing from the API contract`, detail: routes.insights.contract.undocumented.slice(0, 8).map((route) => `${route.method} ${route.path}`).join(", "), files: [...new Set(routes.insights.contract.undocumented.map((route) => route.file))], action: "Document them so clients and reviewers see the real surface." });
  for (const route of routes.insights.unguardedWrites.slice(0, 10)) add2({ category: "security", severity: "medium", title: `Write route without a route-level guard: ${route.method} ${route.path}`, detail: `${route.file}:${route.line}. No guard, authorize or security annotation was found on the handler or its controller, and no global guard was detected.`, files: [route.file], action: "Confirm it is intentionally public, or add the framework guard." });
  const undocumented = integrations.variables.filter((item) => item.documented === false);
  if (undocumented.length) add2({ category: "configuration", severity: "low", title: `${undocumented.length} environment variable(s) read but missing from ${integrations.exampleFiles.join(", ")}`, detail: undocumented.slice(0, 12).map((item) => item.name).join(", "), files: [...new Set(undocumented.flatMap((item) => item.files.map((entry) => entry.file)))].slice(0, 20), action: "Add them to the example file so a new developer can run the project." });
  for (const node of report2.unused.slice(0, 15)) add2({ category: "dead-code", severity: "low", title: `Possibly unused: ${node}`, detail: "No file imports it statically and it does not look like an entry point.", files: [node], action: "Check for dynamic or framework-driven loading before deleting." });
  for (const [component, owners] of Object.entries(report2.ownership.groups)) if (owners.busFactor === 1 && owners.commits >= 15 && owners.authors > 1 && owners.ownerShare >= 0.8) add2({ category: "knowledge", severity: "low", title: `Knowledge concentrated in ${component}`, detail: `${Math.round(owners.ownerShare * 100)}% of ${owners.commits} commits by one person.`, files: [], component, action: "Pair on the next change here and document the non-obvious parts." });
  const debtCount = report2.files.reduce((sum, node) => sum + node.debt.length, 0);
  if (debtCount) add2({ category: "debt", severity: "low", title: `${debtCount} TODO/FIXME/HACK marker(s)`, detail: Object.entries(report2.files.flatMap((node) => node.debt.map((item) => item.tag)).reduce((acc, tag) => ({ ...acc, [tag]: (acc[tag] || 0) + 1 }), {})).map(([tag, value]) => `${tag} ${value}`).join(" \xB7 "), files: report2.files.filter((node) => node.debt.length).sort((a, b) => b.debt.length - a.debt.length).slice(0, 10).map((node) => node.id), action: "Turn the important ones into tasks; delete the stale ones." });
  const rank2 = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => rank2[a.severity] - rank2[b.severity]);
}
async function buildDevtools(cwd, { since: since2 = "12 months ago" } = {}) {
  const root = resolvePath(cwd), started = Date.now();
  const config = await loadConfig(root).catch(() => ({}));
  const settings = config.architecture || {};
  const sources = /* @__PURE__ */ new Map(), graph = await buildGraph(root, { sources });
  const resolve3 = await createResolver(root, graph.files);
  const [routes, commits] = await Promise.all([extractRoutes(root, { sources: new Map(sources), resolve: resolve3 }), readHistory(root, { since: since2 })]);
  const churn2 = churnOf(commits);
  const staticOut = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) if (!edge.dynamic) staticOut.get(edge.from)?.push(edge.to);
  const depth = depths(graph.nodes.map((node) => node.id), staticOut);
  for (const node of graph.nodes) Object.assign(node, fileMetrics(sources.get(node.id) || "", node.language), { depth: depth.get(node.id) || 0, commits: churn2.get(node.id) || 0 });
  const prefixes = inferComponents(graph.nodes.filter((node) => !node.test).map((node) => node.id), { patterns: settings.components || [], depth: settings.depth, max: settings.maxComponents });
  const arch = analyzeArchitecture(graph.nodes, graph.edges, { prefixes, rules: settings.rules || [] });
  const history = ownership(commits, (file) => graph.out.has(file) ? arch.componentOf(file) : null);
  for (const node of graph.nodes) {
    const owner = history.files.get(node.id);
    if (owner) node.owner = { name: owner.owner, share: owner.ownerShare, authors: owner.authors };
    node.component = arch.componentOf(node.id);
  }
  const source = graph.nodes.filter((node) => !node.test), inCycles = new Set(graph.cycles.flat());
  const health = healthFor(source.length, [
    { ...HEALTH_RULES.cycle, files: source.filter((node) => inCycles.has(node.id)).map((node) => node.id) },
    { ...HEALTH_RULES.hub, files: graph.hubs },
    { ...HEALTH_RULES.boundary, files: [...new Set(arch.violations.map((item) => item.from))] }
  ]);
  const hotspots = source.filter((node) => node.commits).map((node) => ({ id: node.id, commits: node.commits, fanIn: node.fanIn, lines: node.lines, loc: node.loc, complexity: node.complexity, owner: node.owner?.name, score: Math.round(node.commits * (1 + node.fanIn) * Math.log10(10 + node.lines)) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 40);
  const known = new Set(graph.nodes.map((node) => node.id)), linked = new Set(graph.edges.map((edge) => `${edge.from}\0${edge.to}`));
  const cochange = changeCoupling(commits, { known }).map((pair) => ({ ...pair, hidden: !TEST_FILE.test(pair.a) && !TEST_FILE.test(pair.b) && !linked.has(`${pair.a}\0${pair.b}`) && !linked.has(`${pair.b}\0${pair.a}`), components: [arch.componentOf(pair.a), arch.componentOf(pair.b)] }));
  const integrations = await analyzeIntegrations(root, { sources, languageOf: languageForPath, isTest: (file) => TEST_FILE.test(file) });
  const routeFiles = new Set(routes.map((route) => route.file));
  const usersOf = /* @__PURE__ */ new Map();
  for (const integration of integrations.integrations) for (const file of integration.files) usersOf.set(file, [...usersOf.get(file) || [], integration.id]);
  for (const service of integrations.services) for (const file of service.files) usersOf.set(file, [...usersOf.get(file) || [], service.id]);
  const reachCache = /* @__PURE__ */ new Map();
  const reaches = (file) => {
    if (reachCache.has(file)) return reachCache.get(file);
    const seen = /* @__PURE__ */ new Set([file]), queue = [file], found = /* @__PURE__ */ new Set();
    while (queue.length && seen.size < 400) {
      const current = queue.shift();
      for (const id2 of usersOf.get(current) || []) found.add(id2);
      for (const next of graph.out.get(current) || []) if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
    const result = { integrations: [...found], files: seen.size - 1 };
    reachCache.set(file, result);
    return result;
  };
  for (const route of routes) {
    if (graph.out.has(route.file)) {
      const reach = reaches(route.file);
      route.reaches = reach.integrations;
      route.reachFiles = reach.files;
    }
    route.component = graph.out.has(route.file) ? arch.componentOf(route.file) : null;
  }
  const unused = source.filter((node) => node.fanIn === 0 && (graph.incoming.get(node.id) || []).length === 0 && /^(JavaScript|TypeScript|Python|Dart)$/.test(node.language) && !ENTRY_NAME.test(node.id) && !routeFiles.has(node.id) && !/\.d\.ts$/.test(node.id) && !/(^|\/)(models|views|admin|apps|serializers|tasks|signals|forms|commands|management|pages|app|routes)\//.test(node.id)).map((node) => node.id).slice(0, 80);
  const fileIndex = new Map(graph.nodes.map((node) => [node.id, node]));
  const cycles = graph.cycles.map((members) => ({ members, loop: loopOf(members, staticOut) }));
  const routeCount = routes.reduce((map, route) => map.set(route.file, (map.get(route.file) || 0) + 1), /* @__PURE__ */ new Map());
  const files = graph.nodes.map((node) => ({ id: node.id, language: node.language, test: node.test, lines: node.lines, loc: node.loc, complexity: node.complexity, maxNesting: node.maxNesting, fanIn: node.fanIn, fanOut: node.fanOut, instability: node.instability, depth: node.depth, commits: node.commits, component: node.component, owner: node.owner, types: node.types, debt: node.debt, routes: routeCount.get(node.id) || 0, integrations: usersOf.get(node.id) || [] }));
  const report2 = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    durationMs: 0,
    root,
    summary: {
      files: graph.nodes.length,
      sourceFiles: source.length,
      testFiles: graph.nodes.length - source.length,
      loc: source.reduce((sum, node) => sum + node.loc, 0),
      edges: graph.edges.length,
      languages: Object.fromEntries(Object.entries(graph.nodes.reduce((acc, node) => ({ ...acc, [node.language]: (acc[node.language] || 0) + (node.loc || 0) }), {})).sort((a, b) => b[1] - a[1])),
      components: arch.components.length,
      routes: routes.length,
      integrations: integrations.integrations.length,
      commits: commits.length,
      contributors: history.contributors.length,
      truncated: Boolean(graph.truncated)
    },
    health,
    files,
    fileIndex,
    edges: graph.edges.map((edge) => [edge.from, edge.to, edge.dynamic ? 1 : 0]),
    graph: { cycles, hubs: graph.hubs },
    architecture: { components: arch.components, links: arch.links, cycles: arch.cycles, sdp: arch.sdp, dsm: arch.dsm, violations: arch.violations, rules: settings.rules || [], inferred: !settings.components?.length },
    routes: { items: routes, insights: routeInsights(routes) },
    hotspots,
    cochange,
    integrations,
    ownership: { groups: history.groups, contributors: history.contributors },
    activity: activity(commits),
    unused,
    since: since2
  };
  report2.findings = findingsFor(report2);
  report2.durationMs = Date.now() - started;
  report2.impact = (file) => impactOf(graph, file);
  return report2;
}
function serializeDevtools(report2) {
  const copy = { ...report2 };
  delete copy.fileIndex;
  delete copy.impact;
  return copy;
}

// src/commands/agent.js
import { mkdir as mkdir4, readdir as readdir6, readFile as readFile8, writeFile as writeFile4 } from "fs/promises";
import { join as join12 } from "path";
import { createInterface } from "readline/promises";

// src/runtime/stages.js
var AGENT_STAGES = [
  { id: "prd", name: "PRD", description: "Writes PRD.md: the problem, goals and acceptance criteria." },
  { id: "spec", name: "Spec", description: "Writes SPEC.md, the behavioral contract (spec-driven workflow)." },
  { id: "techspec", name: "Tech spec", description: "Writes TECHSPEC.md: design, file references, risks and commands." },
  { id: "tasks", name: "Tasks", description: "Breaks the tech spec into the subtask graph." },
  { id: "build", name: "Build", description: "Implements a subtask or the whole task." },
  { id: "fix", name: "Fix", description: "Fixes the blocking issues of a failed flow." }
];
var STAGE_IDS = AGENT_STAGE_IDS;
var planning = (model, effort) => ({ prd: { model, effort }, spec: { model, effort }, techspec: { model, effort } });
var RECOMMENDED = {
  // Anthropic: plan with Opus at xhigh, execute with Sonnet; Sonnet 5 supports xhigh at the lowest xhigh price.
  "claude-code": { ...planning("opus", "xhigh"), tasks: { model: "opus", effort: "high" }, build: { model: "sonnet", effort: "xhigh" }, fix: { model: "sonnet", effort: "high" } },
  // OpenAI: Astra for the most demanding work, Sol as the coding workhorse; medium is the everyday level.
  codex: { ...planning("gpt-6-astra", "high"), tasks: { model: "gpt-6-astra", effort: "medium" }, build: { model: "gpt-6-sol", effort: "high" }, fix: { model: "gpt-6-sol", effort: "medium" } },
  // Antigravity encodes the thinking level in the model id, so no separate effort.
  antigravity: { ...planning("gemini-3.1-pro-high"), tasks: { model: "gemini-3.1-pro-high" }, build: { model: "gemini-3.8-flash-high" }, fix: { model: "gemini-3.8-flash-medium" } },
  gemini: { ...planning("pro"), tasks: { model: "pro" }, build: { model: "pro" }, fix: { model: "flash" } },
  kiro: { ...planning("claude-opus-5", "xhigh"), tasks: { model: "claude-opus-5", effort: "high" }, build: { model: "claude-sonnet-5", effort: "xhigh" }, fix: { model: "claude-sonnet-5", effort: "high" } }
};
function recommendedFor(provider, stage2) {
  const entry = RECOMMENDED[provider?.id]?.[stage2];
  if (!entry) return {};
  return { model: entry.model, effort: entry.effort && provider.efforts?.includes(entry.effort) ? entry.effort : void 0 };
}
function stageOf({ stage: stage2, issues } = {}) {
  if (stage2) return stage2;
  return issues?.length ? "fix" : "build";
}

// src/runtime/policy.js
var rank = (level) => PERMISSIONS.indexOf(level);
function matches(route, subtask) {
  const match = route.match || {};
  return Object.entries(match).every(([key, value]) => subtask?.[key] === value);
}
function resolveRun(config, { provider, model, effort, permission, subtask, stage: stage2 } = {}, providers = [], { checks = true } = {}) {
  const runtime = config.runtime || {};
  const route = (runtime.routes || []).find((item) => matches(item, subtask));
  const step = stage2 ? runtime.stages?.[stage2] : void 0;
  const chosen = provider || route?.provider || step?.provider || runtime.default?.provider;
  if (!chosen) throw new Error("no agent provider selected; pass --provider or set runtime.default.provider in .maverick/config.json");
  const definition = providers.find((item) => item.id === chosen);
  if (!definition) throw new Error(`unknown provider ${chosen}; available: ${providers.map((item) => item.id).join(", ")}`);
  const trusted = runtime.trusted || [];
  if (checks && !trusted.includes(chosen)) throw new Error(`provider ${chosen} is not trusted in this repository; review it, then run maverick agent trust ${chosen}`);
  const ceiling = runtime.maxPermission || "edit";
  const requested = permission || route?.permission || step?.permission || runtime.defaultPermission || (rank(ceiling) < rank("edit") ? ceiling : "edit");
  if (!PERMISSIONS.includes(requested)) throw new Error(`permission must be one of ${PERMISSIONS.join(", ")}`);
  if (checks && rank(requested) > rank(ceiling)) throw new Error(`permission ${requested} exceeds runtime.maxPermission (${ceiling}); raise it in .maverick/config.json only after review`);
  const support = definition.permissions?.[requested];
  if (checks && (support === false || typeof support === "string")) throw new Error(`${definition.name} cannot run with ${requested} permission${typeof support === "string" ? `: ${support}` : ""}`);
  const owners = [provider && { model, effort }, route?.provider === chosen && route, step && (step.provider || runtime.default?.provider) === chosen && step, runtime.default?.provider === chosen && runtime.default].filter(Boolean);
  const recommended = stage2 ? recommendedFor(definition, stage2) : {};
  const pick = (key) => (key === "model" ? model : effort) || owners.map((entry) => entry[key]).find(Boolean);
  const chosenModel = pick("model") || recommended.model;
  let chosenEffort = pick("effort") || (chosenModel === recommended.model || !pick("model") ? recommended.effort : void 0);
  if (chosenEffort && !definition.efforts?.includes(chosenEffort)) {
    if (effort) throw new Error(`${definition.name} ${definition.efforts?.length ? `accepts reasoning ${definition.efforts.join(", ")}` : "has no reasoning setting"}; got ${chosenEffort}`);
    chosenEffort = void 0;
  }
  return {
    provider: definition,
    permission: requested,
    model: chosenModel,
    effort: chosenEffort,
    stage: stage2,
    route: provider ? "flag" : route ? `route ${JSON.stringify(route.match || {})}` : step?.provider ? `stage ${stage2}` : "default"
  };
}
function stageDefaults(config, providers, stages) {
  return Object.fromEntries(stages.map((stage2) => {
    try {
      const plan = resolveRun(config, { stage: stage2 }, providers, { checks: false }), step = config.runtime?.stages?.[stage2] || {};
      return [stage2, { provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, configured: Boolean(step.provider || step.model || step.effort) }];
    } catch {
      return [stage2, { provider: null, model: null, effort: null, configured: false }];
    }
  }));
}

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
var GIT_READ = ["git status", "git diff", "git log", "git show"];
var editCommands = (commands2) => [.../* @__PURE__ */ new Set([...commands2.map((item) => item.command), ...GIT_READ])];
var toolDetail = (input) => short(input?.file_path || input?.path || input?.command || input?.pattern || input?.url || input?.description || "");
var claude = {
  id: "claude-code",
  name: "Claude Code",
  bin: "claude",
  permissions: { "read-only": true, edit: true, full: true },
  efforts: ["low", "medium", "high", "xhigh", "max"],
  editShell: "verification",
  models: { suggested: ["fable", "opus", "sonnet", "haiku", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5", "claude-haiku-4-5"] },
  interactive: ({ prompt, model, effort }) => [...model ? ["--model", model] : [], ...effort ? ["--effort", effort] : [], prompt],
  invocation({ prompt, model, effort, permission, commands: commands2 = [] }) {
    const modes = {
      // --tools is a hard allow-list; dontAsk denies anything else instead of prompting.
      "read-only": ["--permission-mode", "dontAsk", "--tools", "Read,Grep,Glob"],
      // acceptEdits still asks before Bash; the allow-list pre-approves the verification commands.
      edit: ["--permission-mode", "acceptEdits", "--allowedTools", ...editCommands(commands2).flatMap((command) => [`Bash(${command})`, `Bash(${command} *)`])],
      full: ["--permission-mode", "bypassPermissions"]
    };
    return { args: ["-p", "--output-format", "stream-json", "--verbose", ...model ? ["--model", model] : [], ...effort ? ["--effort", effort] : [], ...modes[permission]], input: prompt };
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
var codexEffort = (effort) => effort ? ["-c", `model_reasoning_effort="${effort}"`] : [];
var codex = {
  id: "codex",
  name: "OpenAI Codex",
  bin: "codex",
  permissions: { "read-only": true, edit: true, full: true },
  efforts: ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"],
  editShell: "all",
  // workspace-write runs any command inside the sandbox
  // `codex debug models` prints the catalog with the reasoning levels each model accepts.
  models: { list: ["debug", "models"], parse: (text) => (JSON.parse(text).models || []).filter((model) => model.visibility !== "hide").map((model) => ({ id: model.slug, name: model.display_name, description: model.description, efforts: (model.supported_reasoning_levels || []).map((level) => level.effort) })) },
  interactive: ({ prompt, model, effort }) => [...model ? ["-m", model] : [], ...codexEffort(effort), prompt],
  invocation({ prompt, model, effort, permission }) {
    const sandbox = { "read-only": "read-only", edit: "workspace-write", full: "danger-full-access" }[permission];
    return { args: ["exec", "--json", "--sandbox", sandbox, ...model ? ["-m", model] : [], ...codexEffort(effort), "-"], input: prompt };
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
  editShell: "verification",
  models: { suggested: ["auto", "pro", "flash", "flash-lite"] },
  interactive: ({ prompt, model }) => [...model ? ["-m", model] : [], "-i", prompt],
  invocation({ prompt, model, permission, commands: commands2 = [] }) {
    const approval = { "read-only": "plan", edit: "auto_edit", full: "yolo" }[permission];
    const allowed = permission === "edit" ? ["--allowed-tools", ...editCommands(commands2).map((command) => `run_shell_command(${command})`)] : [];
    return { args: ["-o", "stream-json", "--approval-mode", approval, ...allowed, ...model ? ["-m", model] : [], "-p", prompt] };
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
  interactive: ({ prompt, model }) => [...model ? ["--model", model] : [], prompt],
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
      const [name, call] = Object.entries(event.tool_call || {})[0] || [];
      return name ? [{ type: "tool", name: name.replace(/ToolCall$/, ""), detail: toolDetail(call?.args) }] : [];
    }
    if (event.type === "result") return [{ type: "result", ok: !event.is_error, text: event.result ?? "", error: event.is_error ? event.result : void 0 }];
    return [];
  }
};
var antigravity = {
  id: "antigravity",
  name: "Antigravity CLI",
  bin: "agy",
  permissions: { "read-only": true, edit: true, full: true },
  efforts: ["low", "medium", "high", "max"],
  // `agy models` prints one "<id>\t<name>" line per model after a progress line.
  models: { list: ["models"], parse: (text) => text.split("\n").map((line) => line.split("	")).filter(([id2, name]) => id2 && name && !/\s/.test(id2)).map(([id2, name]) => ({ id: id2, name: name.trim() })) },
  interactive: ({ prompt, model, effort }) => [...model ? ["--model", model] : [], ...effort ? ["--effort", effort] : [], "-i", prompt],
  invocation({ prompt, model, effort, permission }) {
    const mode = { "read-only": ["--mode", "plan"], edit: ["--mode", "accept-edits"], full: ["--dangerously-skip-permissions"] }[permission];
    return { args: ["--output-format", "stream-json", ...mode, ...model ? ["--model", model] : [], ...effort ? ["--effort", effort] : [], "-p", prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.event === "init") return event.conversation_id ? [{ type: "session", id: event.conversation_id }] : [];
    if (event.event === "step_update") {
      const step = event.step_update || {}, steps = state.steps ||= {}, key = step.step_index, out = [];
      const current = steps[key] ||= { text: "" };
      if (step.text_delta) current.text += step.text_delta;
      if (step.tool_info && !current.tool) {
        current.tool = true;
        out.push({ type: "tool", name: step.tool_info.name || step.tool_info.tool_name || step.step_type || "tool", detail: toolDetail(step.tool_info.args || step.tool_info.input || step.tool_info) });
      }
      if (step.state === "DONE" && current.text && !current.sent) {
        current.sent = true;
        state.last = current.text;
        out.push({ type: "text", text: current.text });
      }
      return out;
    }
    if (event.event === "result") {
      const result = event.result || {}, failed = Boolean(result.error) || /error|fail|cancel|timeout/i.test(result.status || "");
      return [{ type: "result", ok: !failed, text: result.response || state.last || "", error: failed ? result.error || result.status : void 0 }];
    }
    return [];
  }
};
var copilot = {
  id: "copilot",
  name: "GitHub Copilot CLI",
  bin: "copilot",
  permissions: { "read-only": true, edit: true, full: true },
  editShell: "verification",
  interactive: ({ prompt, model }) => [...model ? ["--model", model] : [], "-i", prompt],
  invocation({ prompt, model, permission, commands: commands2 = [] }) {
    const shell = editCommands(commands2).flatMap((command) => ["--allow-tool", `shell(${command})`, "--allow-tool", `shell(${command}:*)`]);
    const tools = { "read-only": ["--allow-tool", "read"], edit: ["--allow-tool", "read", "--allow-tool", "write", ...shell], full: ["--allow-all-tools"] }[permission];
    return { args: ["--output-format", "json", ...tools, ...model ? ["--model", model] : [], "-p", prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    const data = event.data || {};
    if (event.type === "assistant.message" && data.content) {
      state.last = data.content;
      return [{ type: "text", text: data.content }];
    }
    if (event.type === "tool.execution_start") return [{ type: "tool", name: data.toolName || data.name || "tool", detail: toolDetail(data.arguments || data.args) }];
    if (event.type === "abort") return [{ type: "error", message: data.reason || "aborted" }];
    if (event.type === "result") {
      const ok = (event.exitCode ?? 0) === 0;
      return [...event.sessionId || event.session_id ? [{ type: "session", id: event.sessionId || event.session_id }] : [], { type: "result", ok, text: state.last ?? "", error: ok ? void 0 : `exit code ${event.exitCode}` }];
    }
    return [];
  }
};
var kiro = {
  id: "kiro",
  name: "Kiro CLI",
  bin: "kiro-cli",
  permissions: { "read-only": true, edit: true, full: true },
  efforts: ["low", "medium", "high", "xhigh", "max"],
  models: { list: ["chat", "--list-models", "--format", "json"], parse: (text) => (JSON.parse(text).models || []).map((model) => ({ id: model.model_id, name: model.model_name, description: model.description })) },
  interactive: ({ prompt, model, effort }) => ["chat", ...model ? ["--model", model] : [], ...effort ? ["--effort", effort] : [], prompt],
  invocation({ prompt, model, effort, permission }) {
    const trust2 = { "read-only": ["--trust-tools=read,grep,glob"], edit: ["--trust-tools=read,grep,glob,write"], full: ["--trust-all-tools"] }[permission];
    return { args: ["chat", "--no-interactive", "--output-format", "stream-json", ...trust2, ...model ? ["--model", model] : [], ...effort ? ["--effort", effort] : []], input: prompt };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    const data = event.data || {};
    if (event.type === "metadata" && data.sessionId && !state.session) {
      state.session = data.sessionId;
      return [{ type: "session", id: data.sessionId }];
    }
    if (event.type === "sessionUpdate") {
      const update = data.update || {};
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.text) {
        state.text = `${state.text || ""}${update.content.text}`;
        return [];
      }
      if (update.sessionUpdate === "tool_call") return [{ type: "tool", name: update.kind || update.title || "tool", detail: short(update.title || toolDetail(update.rawInput)) }];
      return [];
    }
    if (event.type === "runError") return [{ type: "result", ok: false, text: state.text || "", error: data.message || "run failed" }];
    if (event.type === "runFinished") {
      const text = !data.finalTextTruncated && data.finalText ? data.finalText : state.text || "";
      return [...text ? [{ type: "text", text }] : [], { type: "result", ok: true, text }];
    }
    return [];
  }
};
var opencode = {
  id: "opencode",
  name: "OpenCode",
  bin: "opencode",
  permissions: { "read-only": "opencode run may approve shell commands even with the plan agent; use full or another provider", edit: "opencode run may approve shell commands on its own; use full or another provider", full: true },
  interactive: ({ prompt, model }) => [...model ? ["--model", model] : [], "--prompt", prompt],
  invocation({ prompt, model }) {
    return { args: ["run", "--format", "json", "--agent", "build", ...model ? ["--model", model] : [], prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    const part = event.part || {}, out = [];
    if (event.sessionID && !state.session) {
      state.session = event.sessionID;
      out.push({ type: "session", id: event.sessionID });
    }
    if (event.type === "text" && part.text) {
      state.last = part.text;
      out.push({ type: "text", text: part.text });
    }
    if (event.type === "tool_use") out.push({ type: "tool", name: part.tool || "tool", detail: toolDetail(part.state?.input) });
    if (event.type === "step_finish" && typeof part.cost === "number") state.cost = (state.cost || 0) + part.cost;
    if (event.type === "error") {
      state.error = event.error?.data?.message || event.error?.message || event.error?.name || "error";
      out.push({ type: "error", message: state.error });
    }
    return out;
  },
  finish(state) {
    return [{ type: "result", ok: !state.error, text: state.last ?? "", cost: state.cost, error: state.error }];
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
function shellFor(provider, permission) {
  if (permission === "read-only") return "none";
  if (permission === "full") return "all";
  return provider.editShell || (provider.custom ? "all" : "none");
}
var BUILTIN_PROVIDERS = [claude, codex, cursor, gemini, antigravity, copilot, kiro, opencode];
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
import { readFile as readFile7 } from "fs/promises";
import { join as join9 } from "path";
import { z as z2 } from "zod";
var HEADLESS_RULES = `You are running non-interactively under Maverick. Follow these rules:
- Work only inside this repository and only within the task scope below. PRD.md (what), SPEC.md when present (the exact behavior and contracts) and TECHSPEC.md (how) are the scope contract.
- Do not commit, push, open pull requests, publish packages, or change CI/CD, credentials, or secrets. A human does that after review.
- Do not add dependencies or change public contracts unless the task explicitly allows it.
- If you are blocked or need a decision, stop and ask in the result block instead of guessing.
- Report the real results of every verification command you run; never claim a check passed that you did not run.
- End your final message with exactly one fenced block in this format:

\`\`\`maverick-result
{"status": "done" | "blocked" | "needs-input", "summary": "one or two sentences", "questions": [], "filesChanged": []}
\`\`\``;
var resultSchema = z2.object({
  status: z2.enum(["done", "blocked", "needs-input"]),
  summary: z2.string().default(""),
  questions: z2.array(z2.string()).default([]),
  filesChanged: z2.array(z2.string()).default([])
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
var TASK_FILES = ["PRD.md", "SPEC.md", "TECHSPEC.md"];
async function buildPrompt({ taskDir, task, subtask, subtaskFile, instruction, issues = [], commands: commands2 = [], shell = "all" }) {
  const sections = [HEADLESS_RULES, `# Task: ${task}`];
  const list2 = commands2.map((item) => `- \`${item.command}\`${item.cwd ? ` (in \`${item.cwd}/\`)` : ""}`).join("\n");
  if (shell === "verification") sections.push(`## Verification commands

In this run you can run these commands, with extra arguments (for example a single test file), and read-only git (\`git status\`, \`git diff\`, \`git log\`, \`git show\`). Any other shell command is denied, so use these instead of calling tools directly (\`npm run test -- <file>\`, not \`npx jest <file>\`). Run the relevant ones before finishing:

${list2 || "- none detected; say so in the result"}`);
  else if (shell === "none") sections.push(`## Verification commands

This run cannot execute shell commands, so do not try. Maverick runs verification after you finish; make the change complete and name in the summary what should be checked.${list2 ? `

The project's checks:

${list2}` : ""}`);
  else sections.push(`## Verification commands

Run the relevant ones before finishing:

${list2 || "- none detected; find the project's test command"}`);
  for (const file of TASK_FILES) {
    const path = join9(taskDir, file);
    if (await exists(path)) sections.push(`## ${file}

${(await readFile7(path, "utf8")).trim()}`);
  }
  const record = subtaskFile ? `

The checklist lives in \`${subtaskFile}\` and is your progress record. As each item becomes true (a criterion met, a step done, a test written and passing), change its \`- [ ]\` to \`- [x]\` in that file, one at a time, never in a batch at the end and never before it is true. Leave an item unchecked when you did not do it or could not verify it, and say why in the result. Do not edit anything else in the file.` : "";
  if (subtask) sections.push(`## Current subtask ${subtask.id}: ${subtask.title}

Work only on this subtask. Its dependencies (${subtask.dependsOn.join(", ") || "none"}) are done.${record}

${subtask.body.trim()}`);
  if (issues.length) sections.push(`## Blocking issues to fix

The last verification run failed. Fix these without widening scope, then re-run the checks:

${issues.map((issue) => `- ${issue}`).join("\n")}`);
  sections.push(`## Instruction

${instruction || (subtask ? `Implement subtask ${subtask.id}.` : "Implement the task criterion by criterion.")}`);
  return sections.join("\n\n");
}

// src/runtime/session.js
import { appendFile, mkdir as mkdir3, writeFile as writeFile3 } from "fs/promises";
import { join as join11 } from "path";

// src/runtime/hooks.js
import { join as join10 } from "path";

// src/runtime/process.js
import { spawn as spawn2 } from "child_process";
import { clearTimeout, setTimeout } from "timers";
function runProcess({ bin, args = [], cwd, input, env, timeoutMs = 0, signal, onLine = () => {
}, onStderr = () => {
} }) {
  return new Promise((resolve3) => {
    const started = Date.now();
    let child;
    try {
      child = spawn2(bin, args, { cwd, env: env || process.env, shell: false, stdio: [input === void 0 ? "ignore" : "pipe", "pipe", "pipe"] });
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
        onLine(line);
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
    const result = argv ? await runProcess({ bin: argv[0], args: argv.slice(1), cwd: hook.cwd ? join10(cwd, hook.cwd) : cwd, input: JSON.stringify({ event, ...payload }), timeoutMs: hook.timeoutMs || 3e4, onLine: (line) => {
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

// src/runtime/session.js
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}
async function transcriptFile(taskDir, providerId) {
  const dir = join11(taskDir, "runs");
  await mkdir3(dir, { recursive: true });
  if (!await exists(join11(dir, ".gitignore"))) await writeFile3(join11(dir, ".gitignore"), "# Agent transcripts may contain tool output and secrets.\n*\n!.gitignore\n");
  return join11(dir, `${stamp()}-${providerId}.jsonl`);
}
async function runAgent({ cwd, config, taskDir, task, provider, model, effort, permission, commands: commands2 = [], prompt, timeoutMs, signal, onEvent = () => {
} }) {
  const bin = resolveBin(provider, config, cwd);
  if (!commandAvailable(bin, cwd)) throw new Error(`${provider.name} is not installed (${bin} not found on PATH)`);
  const before = await runHooks(cwd, config, "before-agent-run", { task, provider: provider.id, model, effort, permission, prompt });
  if (!before.allowed) throw new Error(before.reason);
  const finalPrompt = [prompt, ...before.appendPrompt].join("\n\n");
  const { args, input } = provider.invocation({ prompt: finalPrompt, model, effort, permission, commands: commands2 });
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
  await record({ type: "start", provider: provider.id, model: model || null, effort: effort || null, permission, argv: [bin, ...args.map((arg) => arg === finalPrompt ? "<prompt>" : arg)] });
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
async function startAgentRun(cwd, { slug, dir, config, subtask, instruction, issues, options, onEvent, signal }) {
  const plan = resolveRun(config, { provider: str(options.provider) || str(options.agent), model: str(options.model), effort: str(options.effort), permission: str(options.permission), subtask, stage: stageOf({ issues }) }, providersFor(config));
  const commands2 = selectVerificationCommands(await detectStack(cwd), config);
  const subtaskFile = subtask ? rel(cwd, join12(dir, "subtasks", subtask.file)) : void 0;
  const prompt = await buildPrompt({ taskDir: dir, task: slug, subtask, subtaskFile, instruction, issues, commands: commands2, shell: shellFor(plan.provider, plan.permission) });
  const timeoutMs = Math.round((Number(options.timeout) || config.runtime?.timeoutMinutes || 30) * 6e4);
  if (options.dryRun) return { dryRun: true, plan, prompt, invocation: plan.provider.invocation({ prompt: "<prompt>", model: plan.model, effort: plan.effort, permission: plan.permission, commands: commands2 }) };
  const controller = new globalThis.AbortController(), abort = () => controller.abort();
  process.once("SIGINT", abort);
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  try {
    const run2 = await runAgent({ cwd, config, taskDir: dir, task: slug, provider: plan.provider, model: plan.model, effort: plan.effort, permission: plan.permission, commands: commands2, prompt, timeoutMs, signal: controller.signal, onEvent });
    return { plan, run: run2 };
  } finally {
    process.removeListener("SIGINT", abort);
    signal?.removeEventListener("abort", abort);
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
    if (options.json) return output(JSON.stringify({ provider: plan2.provider.id, model: plan2.model || null, effort: plan2.effort || null, stage: plan2.stage, permission: plan2.permission, route: plan2.route, argv, stdin: invocation.input !== void 0, prompt }, null, 2));
    return output(`${brand()} / AGENT (dry run)
Provider: ${plan2.provider.name} (${plan2.route})
Model: ${plan2.model || "provider default"}
Reasoning: ${plan2.effort || "provider default"}
Stage: ${plan2.stage}
Permission: ${plan2.permission}
Command: ${argv.join(" ")}${invocation.input !== void 0 ? " < prompt" : ""}

----- prompt -----
${prompt}`);
  }
  const { plan, run: result } = outcome;
  const payload = { provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, permission: plan.permission, ok: result.ok, problems: result.problems, status: result.result?.status || null, summary: result.result?.summary || null, questions: result.result?.questions || [], filesChanged: result.result?.filesChanged || [], sessionId: result.sessionId || null, durationMs: result.durationMs, cost: result.cost ?? null, subtask: subtask?.id || null, transcript: rel(cwd, result.transcript), warnings: result.warnings };
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
  const path = join12(cwd, ".maverick", "config.json");
  const current = await exists(path) ? JSON.parse(await readFile8(path, "utf8")) : { version: 1 };
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
  await mkdir4(join12(cwd, ".maverick"), { recursive: true });
  await writeFile4(path, pretty({ ...current, runtime }));
  output(options.json ? JSON.stringify({ trusted: runtime.trusted, maxPermission: ceiling, default: runtime.default || null }) : `${brand()} / AGENT
\u2713 ${add2 ? "trusted" : "untrusted"} ${id2}; runtime written to ${rel(cwd, path)}
Max permission: ${ceiling}. Commit this file so the team reviews the decision.`);
}
async function stage(cwd, id2, options) {
  const config = await loadConfig(cwd), providers = providersFor(config);
  if (!id2) {
    const defaults = stageDefaults(config, providers, STAGE_IDS);
    if (options.json) return output(JSON.stringify({ stages: AGENT_STAGES.map((item) => ({ ...item, ...defaults[item.id] })) }, null, 2));
    return output(`${brand()} / AGENT STAGES

${AGENT_STAGES.map((item) => {
      const value2 = defaults[item.id];
      return `${item.id.padEnd(10)}${String(value2.provider || "not set").padEnd(13)}${String(value2.model || "provider default").padEnd(22)}${(value2.effort || "\u2014").padEnd(8)}${value2.configured ? "configured" : "recommended"}`;
    }).join("\n")}

Change one with: maverick agent stage <stage> --provider <id> --model <model> --effort <level>`);
  }
  if (!STAGE_IDS.includes(id2)) throw new Error(`stage must be one of ${STAGE_IDS.join(", ")}`);
  const provider = str(options.provider) || str(options.agent), model = str(options.model), effort = str(options.effort);
  const definition = provider && providers.find((item) => item.id === provider);
  if (provider && !definition) throw new Error(`unknown provider ${provider}; available: ${providers.map((item) => item.id).join(", ")}`);
  if (effort && !EFFORTS.includes(effort)) throw new Error(`--effort must be one of ${EFFORTS.join(", ")}`);
  const target = definition || providers.find((item) => item.id === (config.runtime?.stages?.[id2]?.provider || config.runtime?.default?.provider));
  if (effort && target && !target.efforts?.includes(effort)) throw new Error(`${target.name} ${target.efforts?.length ? `accepts reasoning ${target.efforts.join(", ")}` : "has no reasoning setting"}`);
  const path = join12(cwd, ".maverick", "config.json");
  const current = await exists(path) ? JSON.parse(await readFile8(path, "utf8")) : { version: 1 };
  const runtime = { ...current.runtime }, stages = { ...runtime.stages };
  if (options.reset) delete stages[id2];
  else {
    const entry = { ...stages[id2], ...provider && { provider }, ...model && { model }, ...effort && { effort } };
    if (provider && stages[id2]?.provider !== provider) {
      if (!model) delete entry.model;
      if (!effort) delete entry.effort;
    }
    if (options.model === "") delete entry.model;
    if (options.effort === "") delete entry.effort;
    if (!Object.keys(entry).length) throw new Error("pass --provider, --model or --effort, or --reset");
    stages[id2] = entry;
  }
  if (Object.keys(stages).length) runtime.stages = stages;
  else delete runtime.stages;
  await mkdir4(join12(cwd, ".maverick"), { recursive: true });
  await writeFile4(path, pretty({ ...current, runtime }));
  const value = stageDefaults(await loadConfig(cwd), providers, [id2])[id2];
  output(options.json ? JSON.stringify({ stage: id2, ...value }) : `${brand()} / AGENT
\u2713 ${id2}: ${value.provider || "no agent"} \xB7 ${value.model || "provider default"} \xB7 ${value.effort || "default reasoning"}${options.reset ? " (back to the recommendation)" : ""}
Written to ${rel(cwd, path)}.`);
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
  const files = (await readdir6(join12(dir, "runs")).catch(() => [])).filter((file) => file.endsWith(".jsonl")).sort();
  const items = [];
  for (const file of files) {
    const events = (await readFile8(join12(dir, "runs", file), "utf8")).split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const start = events.find((event) => event.type === "start"), end = events.findLast((event) => event.type === "end");
    items.push({ file: rel(cwd, join12(dir, "runs", file)), provider: start?.provider, at: start?.at, ok: end?.ok ?? null, status: end?.status ?? null, durationMs: end?.durationMs ?? null });
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
  if (action === "stage" || action === "stages") return stage(cwd, target, options);
  throw new Error("use agent list, agent trust <provider>, agent untrust <provider>, agent stage [<stage>], agent run <task>, or agent runs <task>");
}
var agentCommands = [
  { id: "agent", description: "Run trusted AI coding agents headlessly with scoped permissions.", aliases: [], usage: "agent list|trust|untrust|stage [<stage>]|run <task>|runs <task>", run: ({ cwd, rest, options }) => agentCommand(cwd, rest, options) }
];

// src/commands/capabilities.js
import { createInterface as createInterface2 } from "readline/promises";

// src/capabilities/adapters.js
import { join as join13 } from "path";
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
var KIRO_TOOLS = { read: ["read"], edit: ["write"], shell: ["shell"], web: ["web_search", "web_fetch"] };
var SHARED = { id: "agents", root: ".agents" };
function sharedOutputs(capability) {
  if (capability.kind === "skill") return skillOutputs(capability, `${SHARED.root}/skills`);
  if (capability.kind === "agent") return [{ type: "file", path: `${SHARED.root}/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, tools: capability.tools, model: capability.model }, capability.body) }];
  if (capability.kind === "command") return [{ type: "file", path: `${SHARED.root}/commands/${capability.name}.md`, content: renderFrontmatter({ description: capability.description, "argument-hint": capability["argument-hint"] }, capability.body) }];
  return [];
}
var ADAPTERS = [
  {
    id: "claude-code",
    name: "Claude Code",
    home: ".claude/",
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
    home: ".agents/ \xB7 .codex/",
    detect: ["AGENTS.md", ".codex", ".agents"],
    supports: (kind, capability) => kind === "command" ? "Codex has no project-level custom commands (prompts are user-level and deprecated); install the matching skill instead" : kind === "mcp" && !capability?.server?.command ? "Maverick only writes stdio MCP servers to .codex/config.toml; add remote servers manually" : true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".agents/skills");
      if (capability.kind === "mcp") return [{ type: "json-key", path: ".codex/config.toml", pointer: ["mcp_servers", capability.name], value: stdioOrRemote(capability.server) }];
      const lines = [`name = ${JSON.stringify(capability.name)}`, `description = ${JSON.stringify(capability.description)}`, ...capability.model ? [`model = ${JSON.stringify(capability.model)}`] : [], `developer_instructions = ${tomlString(capability.body.trim() + "\n")}`];
      return [{ type: "file", path: `.codex/agents/${capability.name}.toml`, content: `${lines.join("\n")}
` }];
    }
  },
  {
    id: "cursor",
    name: "Cursor",
    home: ".cursor/",
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
    home: ".github/",
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
    home: ".gemini/",
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
    // Antigravity reads workspace skills from `.agents/skills` (the shared store) and retires
    // workflows in favor of skills on 2026-11-01; MCP servers and agents are user-level only.
    id: "antigravity",
    name: "Google Antigravity",
    home: ".agents/",
    detect: [".agents/rules", ".agent/rules", ".agent/workflows"],
    supports: (kind) => kind === "command" ? "Antigravity is replacing workflows with skills; install the matching skill instead" : kind === "agent" ? "Antigravity has no project-level subagents" : kind === "mcp" ? "Antigravity only reads MCP servers from user-level configuration" : true,
    render: (capability) => skillOutputs(capability, ".agents/skills")
  },
  {
    id: "windsurf",
    name: "Windsurf / Devin Desktop",
    home: ".windsurf/",
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
  },
  {
    id: "kiro",
    name: "Kiro",
    home: ".kiro/",
    detect: [".kiro"],
    supports: (kind) => kind === "command" ? "Kiro has no project-level custom commands; install the matching skill instead" : true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".kiro/skills");
      if (capability.kind === "agent") return [{ type: "file", path: `.kiro/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, tools: capability.tools?.flatMap((tool) => KIRO_TOOLS[tool]) }, capability.body) }];
      const remote = (server) => ({ url: server.url, ...Object.keys(server.headers).length && { headers: server.headers } });
      return [{ type: "json-key", path: ".kiro/settings/mcp.json", pointer: ["mcpServers", capability.name], value: stdioOrRemote(capability.server, { remote }) }];
    }
  },
  {
    id: "opencode",
    name: "OpenCode",
    home: ".opencode/",
    detect: ["opencode.json", ".opencode"],
    supports: () => true,
    render(capability) {
      if (capability.kind === "skill") return skillOutputs(capability, ".opencode/skills");
      if (capability.kind === "agent") return [{ type: "file", path: `.opencode/agents/${capability.name}.md`, content: renderFrontmatter({ description: capability.description, mode: "subagent" }, capability.body) }];
      if (capability.kind === "command") return [{ type: "file", path: `.opencode/commands/${capability.name}.md`, content: renderFrontmatter({ description: capability.description }, argumentsAs(capability.body, "$ARGUMENTS")) }];
      const { server } = capability;
      const value = server.command ? { type: "local", command: [server.command, ...server.args], ...Object.keys(server.env).length && { environment: server.env } } : { type: "remote", url: server.url, ...Object.keys(server.headers).length && { headers: server.headers } };
      return [{ type: "json-key", path: "opencode.json", pointer: ["mcp", capability.name], value }];
    }
  }
];
var ADAPTER_IDS = ADAPTERS.map((adapter2) => adapter2.id);
function layoutFor(config = {}) {
  return config.capabilities?.layout || (process.platform === "win32" ? "copy" : "linked");
}
async function detectAdapters(cwd) {
  const detected = [];
  for (const adapter2 of ADAPTERS) if ((await Promise.all(adapter2.detect.map((path) => exists(join13(cwd, path))))).some(Boolean)) detected.push(adapter2);
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
import { lstat, mkdir as mkdir5, readdir as readdir7, readFile as readFile9, readlink, realpath, rm, rmdir, symlink, writeFile as writeFile5 } from "fs/promises";
import { basename as basename2, dirname as dirname3, isAbsolute, join as join14, normalize as normalize3, relative as relative3, resolve as resolve2, sep as sep2 } from "path";

// src/capabilities/structured.js
var getAt = (object, pointer) => pointer.reduce((node, key) => node && typeof node === "object" ? node[key] : void 0, object);
var hashValue = (value) => sha256(JSON.stringify(value));
var json2 = {
  parse(text, path) {
    if (text === null || !text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`cannot merge into ${path}: it is not plain JSON (comments are not supported)`);
    }
  },
  read(text, pointer, path) {
    const value = getAt(json2.parse(text, path), pointer);
    return value === void 0 ? void 0 : hashValue(value);
  },
  write(text, pointer, value, path) {
    const document = json2.parse(text, path);
    let node = document;
    for (const key of pointer.slice(0, -1)) {
      if (!node[key] || typeof node[key] !== "object") node[key] = {};
      node = node[key];
    }
    node[pointer.at(-1)] = value;
    return pretty(document);
  },
  remove(text, pointer, path) {
    const document = json2.parse(text, path), parent = getAt(document, pointer.slice(0, -1));
    if (parent && typeof parent === "object") delete parent[pointer.at(-1)];
    return pretty(document);
  },
  fingerprint: (_pointer, value) => hashValue(value)
};
var bareKey = (key) => /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
var scalar = (value) => Array.isArray(value) ? `[${value.map(scalar).join(", ")}]` : typeof value === "string" ? JSON.stringify(value) : String(value);
var HEADER = /^\s*\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/;
var ARRAY_HEADER = /^\s*\[\[/;
var headerName = (line) => line.match(HEADER)?.[1].split(".").map((part) => part.trim().replace(/^"(.*)"$/, "$1")).join(".");
function renderTable(name, value) {
  const plain = Object.entries(value).filter(([, item]) => item === null || typeof item !== "object" || Array.isArray(item));
  const nested = Object.entries(value).filter(([, item]) => item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length);
  const lines = [`[${name.split(".").map(bareKey).join(".")}]`, ...plain.filter(([, item]) => item !== null).map(([key, item]) => `${bareKey(key)} = ${scalar(item)}`)];
  return [lines.join("\n"), ...nested.map(([key, item]) => renderTable(`${name}.${key}`, item))].join("\n\n");
}
function findBlock(lines, name) {
  const start = lines.findIndex((line) => headerName(line) === name);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !ARRAY_HEADER.test(lines[end]) && !(HEADER.test(lines[end]) && headerName(lines[end]) !== name && !headerName(lines[end]).startsWith(`${name}.`))) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return { start, end };
}
function assertSafe(lines, pointer, path) {
  const [root, child] = pointer;
  let current = "";
  for (const line of lines) {
    if (HEADER.test(line) || ARRAY_HEADER.test(line)) {
      current = headerName(line) || "";
      continue;
    }
    const key = line.match(/^\s*("[^"]+"|[A-Za-z0-9_-]+)\s*[.=]/)?.[1]?.replace(/"/g, "");
    if (!key) continue;
    if (current === "" && key === root || current === root && key === child) throw new Error(`cannot merge into ${path}: ${pointer.join(".")} is defined with dotted keys or an inline table; edit it manually`);
  }
}
var normalize2 = (block) => block.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).join("\n");
var toml = {
  read(text, pointer, path) {
    if (!text) return void 0;
    const lines = text.split("\n");
    assertSafe(lines, pointer, path);
    const block = findBlock(lines, pointer.join("."));
    return block ? sha256(normalize2(lines.slice(block.start, block.end).join("\n"))) : void 0;
  },
  write(text, pointer, value, path) {
    const lines = (text || "").split("\n");
    assertSafe(lines, pointer, path);
    const rendered = renderTable(pointer.join("."), value), block = findBlock(lines, pointer.join("."));
    if (block) return [...lines.slice(0, block.start), rendered, ...lines.slice(block.end)].join("\n");
    const base2 = (text || "").replace(/\s*$/, "");
    return `${base2 ? `${base2}

` : ""}${rendered}
`;
  },
  remove(text, pointer) {
    const lines = (text || "").split("\n"), block = findBlock(lines, pointer.join("."));
    if (!block) return text;
    return [...lines.slice(0, block.start), ...lines.slice(block.end)].join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "\n");
  },
  fingerprint: (pointer, value) => sha256(normalize2(renderTable(pointer.join("."), value)))
};
function formatFor(path) {
  return /\.toml$/i.test(path) ? toml : json2;
}

// src/capabilities/engine.js
var LOCK_PATH = ".maverick/capabilities.lock.json";
function resolveInside(cwd, path) {
  const normalized = normalize3(path);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep2}`)) throw new Error(`refusing to write outside the project: ${path}`);
  return join14(cwd, normalized);
}
var keyId = (path, pointer) => `${path}#${pointer.join(".")}`;
var toBuffer = (content) => Buffer.isBuffer(content) ? content : Buffer.from(content);
var linkTo = (from, to) => relative3(dirname3(from), to).split(sep2).join("/");
async function snapshot(cwd, path) {
  const parts = normalize3(path).split(sep2);
  for (let depth = 1; depth < parts.length; depth++) {
    if ((await lstat(join14(cwd, ...parts.slice(0, depth))).catch(() => null))?.isSymbolicLink()) return null;
  }
  const full = resolveInside(cwd, path), stat2 = await lstat(full).catch(() => null);
  if (!stat2) return null;
  if (stat2.isSymbolicLink()) return { link: (await readlink(full)).split(sep2).join("/") };
  return stat2.isDirectory() ? { dir: true } : readFile9(full);
}
async function readLock(cwd) {
  const path = join14(cwd, LOCK_PATH);
  if (!await exists(path)) return { version: 1, capabilities: {} };
  try {
    return JSON.parse(await readFile9(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid lockfile ${LOCK_PATH}: ${error.message}`);
  }
}
async function writeLock(cwd, lock) {
  const sorted = { version: 1, capabilities: Object.fromEntries(Object.entries(lock.capabilities).sort(([a], [b]) => a.localeCompare(b))) };
  await mkdir5(dirname3(join14(cwd, LOCK_PATH)), { recursive: true });
  await writeFile5(join14(cwd, LOCK_PATH), pretty(sorted));
}
async function listTree(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir7(dir, { withFileTypes: true }).catch(() => [])) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await listTree(join14(dir, entry.name), path));
    else found.push(path);
  }
  return found;
}
function ownership2(lock) {
  const owners = /* @__PURE__ */ new Map();
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    for (const target of Object.values(entry.targets || {})) {
      for (const file of target.files || []) owners.set(file.path, ref);
      for (const key of target.keys || []) owners.set(keyId(key.path, key.pointer), ref);
      for (const link of target.links || []) owners.set(link.path, ref);
    }
  }
  return owners;
}
async function readText2(cwd, path) {
  const full = resolveInside(cwd, path);
  return await exists(full) ? readFile9(full, "utf8") : null;
}
var DISPOSABLE = /* @__PURE__ */ new Set([".DS_Store", "Thumbs.db"]);
async function adoptFolder(cwd, root, target, owners, installing, adopted) {
  const changes = [], conflicts = [], sharedRoot = `${SHARED.root}/skills`;
  for (const file of await listTree(resolveInside(cwd, root))) {
    const path = `${root}/${file}`, name = file.split("/")[0], current = await snapshot(cwd, path);
    const drop = () => changes.push({ target, type: current?.link ? "link" : "file", op: "delete", path });
    if (DISPOSABLE.has(basename2(file))) {
      drop();
      continue;
    }
    if (current?.link) {
      if (current.link === linkTo(`${root}/${name}`, `${sharedRoot}/${name}`)) drop();
      else conflicts.push({ target, path, reason: "is a link Maverick did not create; remove it to link the skills folder" });
      continue;
    }
    const shared = `${sharedRoot}/${file}`, existing = await snapshot(cwd, shared), mine = owners.has(path);
    if (installing.has(name)) {
      if (mine) drop();
      else conflicts.push({ target, path, reason: `is not part of the ${name} skill Maverick installs; move it out first` });
      continue;
    }
    const incoming = existing || adopted.get(shared);
    if (incoming) {
      if (mine || Buffer.isBuffer(incoming) && incoming.equals(current)) drop();
      else conflicts.push({ target, path, reason: `a different ${shared} exists; keep one of them` });
      continue;
    }
    adopted.set(shared, current);
    changes.push({ target: SHARED.id, type: "file", op: "create", path: shared, content: current, sha256: sha256(current), adopt: true });
    drop();
  }
  return { changes, conflicts };
}
async function planInstall(cwd, capability, adapters, lock, { force = false, layout = "copy" } = {}) {
  const owners = ownership2(lock), changes = [], skipped = [], conflicts = [], outputsByTarget = {}, targets = [], adoptions = /* @__PURE__ */ new Map();
  for (const adapter2 of adapters) {
    if (capability.targets && !capability.targets.includes(adapter2.id)) {
      skipped.push({ target: adapter2.id, reason: `the capability is limited to ${capability.targets.join(", ")}` });
      continue;
    }
    const support = adapter2.supports(capability.kind, capability);
    if (support !== true) {
      skipped.push({ target: adapter2.id, reason: support || `${adapter2.name} does not support ${capability.kind} capabilities at project level` });
      continue;
    }
    outputsByTarget[adapter2.id] = adapter2.render(capability);
    targets.push(adapter2.id);
  }
  const shared = layout === "linked" && targets.length ? sharedOutputs(capability) : [];
  const emitted = /* @__PURE__ */ new Set();
  for (const target of targets) outputsByTarget[target] = outputsByTarget[target].filter((output2) => output2.type !== "file" || !emitted.has(output2.path) && emitted.add(output2.path));
  if (shared.length) {
    const sharedPaths = new Set(shared.map((item) => item.path));
    const twin = (output2) => shared.find((item) => basename2(item.path) === basename2(output2.path) && toBuffer(item.content).equals(toBuffer(output2.content)));
    for (const target of targets) {
      const outputs = outputsByTarget[target].filter((output2) => !sharedPaths.has(output2.path));
      const entry = capability.kind === "skill" && outputs.find((output2) => output2.path.endsWith(`/${capability.name}/SKILL.md`));
      if (entry) {
        const root = dirname3(entry.path.slice(0, -"/SKILL.md".length));
        const rest = outputs.filter((output2) => !output2.path.startsWith(`${root}/`));
        outputsByTarget[target] = [...rest, { type: "link", path: root, target: linkTo(root, `${SHARED.root}/skills`), dir: true, shared: true }];
        continue;
      }
      outputsByTarget[target] = outputs.map((output2) => {
        const source = output2.type === "file" && twin(output2);
        return source ? { type: "link", path: output2.path, target: linkTo(output2.path, source.path) } : output2;
      });
    }
    outputsByTarget[SHARED.id] = shared;
  }
  for (const [target, outputs] of Object.entries(outputsByTarget)) {
    for (const output2 of outputs) {
      const owner = owners.get(output2.type === "json-key" ? keyId(output2.path, output2.pointer) : output2.path);
      if (output2.type === "link") {
        const current = await snapshot(cwd, output2.path);
        const op = !current ? "create" : current.link === output2.target ? "unchanged" : "update";
        if (current?.dir && output2.shared) {
          const adopted = await adoptFolder(cwd, output2.path, target, owners, new Set(shared.map((item) => item.path.split("/")[2])), adoptions);
          changes.push(...adopted.changes);
          conflicts.push(...adopted.conflicts);
        } else if (current?.dir) {
          const foreign = (await listTree(resolveInside(cwd, output2.path))).map((file) => `${output2.path}/${file}`).filter((file) => owners.get(file) !== capability.ref);
          if (foreign.length) conflicts.push({ target, path: output2.path, reason: `is a folder with files Maverick does not manage (${foreign.slice(0, 3).join(", ")}${foreign.length > 3 ? ", \u2026" : ""})` });
        } else if (current && op !== "unchanged" && (output2.shared ? !current.link || !owners.has(output2.path) : owner !== capability.ref)) conflicts.push({ target, path: output2.path, reason: owner ? `owned by ${owner}` : "exists and is not managed by Maverick" });
        changes.push({ target, type: "link", op, path: output2.path, link: output2.target, ...output2.dir && { dir: true }, ...output2.shared && { shared: true } });
      } else if (output2.type === "file") {
        const content = toBuffer(output2.content), hash = sha256(content), current = await snapshot(cwd, output2.path);
        const op = !current ? "create" : Buffer.isBuffer(current) && sha256(current) === hash ? "unchanged" : "update";
        if (current && owner !== capability.ref && op !== "unchanged") conflicts.push({ target, path: output2.path, reason: owner ? `owned by ${owner}` : "exists and is not managed by Maverick" });
        changes.push({ target, type: "file", op, path: output2.path, content, sha256: hash });
      } else {
        const format = formatFor(output2.path), expected = format.fingerprint(output2.pointer, output2.value);
        const current = format.read(await readText2(cwd, output2.path), output2.pointer, output2.path);
        const op = current === void 0 ? "create" : current === expected ? "unchanged" : "update";
        if (current !== void 0 && owner !== capability.ref && op !== "unchanged") conflicts.push({ target, path: `${output2.path} \u2192 ${output2.pointer.join(".")}`, reason: owner ? `owned by ${owner}` : "key exists and is not managed by Maverick" });
        changes.push({ target, type: "json-key", op, path: output2.path, pointer: output2.pointer, value: output2.value, sha256: expected });
      }
    }
  }
  const produced = new Set(changes.filter((change) => change.type !== "json-key").map((change) => change.path));
  for (const [target, recorded] of Object.entries(lock.capabilities[capability.ref]?.targets || {})) {
    if (!outputsByTarget[target]) continue;
    for (const file of recorded.files || []) if (!produced.has(file.path)) changes.push({ target, type: "file", op: "delete", path: file.path });
    for (const link of recorded.links || []) if (!produced.has(link.path)) changes.push({ target, type: "link", op: "delete", path: link.path });
    for (const key of recorded.keys || []) if (!changes.some((change) => change.type === "json-key" && keyId(change.path, change.pointer) === keyId(key.path, key.pointer))) changes.push({ target, type: "json-key", op: "delete", path: key.path, pointer: key.pointer });
  }
  return { capability, targets, changes, skipped, conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}
async function planRemove(cwd, ref, lock, { force = false, removing = [ref] } = {}) {
  const entry = lock.capabilities[ref];
  if (!entry) throw new Error(`${ref} is not installed; run maverick installed to list installed capabilities`);
  const changes = [], conflicts = [];
  for (const [target, recorded] of Object.entries(entry.targets || {})) {
    for (const file of recorded.files || []) {
      const full = resolveInside(cwd, file.path);
      if (!await exists(full)) continue;
      if (sha256(await readFile9(full)) !== file.sha256) conflicts.push({ target, path: file.path, reason: "edited since install" });
      changes.push({ target, type: "file", op: "delete", path: file.path });
    }
    for (const key of recorded.keys || []) {
      const current = formatFor(key.path).read(await readText2(cwd, key.path), key.pointer, key.path);
      if (current === void 0) continue;
      if (current !== key.sha256) conflicts.push({ target, path: `${key.path} \u2192 ${key.pointer.join(".")}`, reason: "edited since install" });
      changes.push({ target, type: "json-key", op: "delete", path: key.path, pointer: key.pointer });
    }
    for (const link of recorded.links || []) {
      const current = await snapshot(cwd, link.path);
      if (!current) continue;
      if (link.shared && Object.entries(lock.capabilities).some(([other, item]) => !removing.includes(other) && Object.values(item.targets || {}).some((t) => t.links?.some((l) => l.path === link.path)))) continue;
      if (link.shared && await keepsOwnSkills(cwd, lock, removing)) continue;
      if (current.link !== link.target) conflicts.push({ target, path: link.path, reason: "replaced since install" });
      changes.push({ target, type: "link", op: "delete", path: link.path });
    }
  }
  return { ref, changes, skipped: [], conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}
async function keepsOwnSkills(cwd, lock, removing) {
  const leaving = new Set(removing.flatMap((ref) => Object.values(lock.capabilities[ref]?.targets || {}).flatMap((target) => (target.files || []).map((file) => file.path))));
  return (await listTree(resolveInside(cwd, `${SHARED.root}/skills`))).some((file) => !leaving.has(`${SHARED.root}/skills/${file}`) && !DISPOSABLE.has(basename2(file)));
}
async function removeEmptyParents(cwd, path) {
  for (let dir = dirname3(path); relative3(cwd, dir) && !relative3(cwd, dir).startsWith(".."); dir = dirname3(dir)) {
    if ((await readdir7(dir).catch(() => ["x"])).length) return;
    await rmdir(dir).catch(() => {
    });
  }
}
async function applyChanges(cwd, changes) {
  const staged = /* @__PURE__ */ new Map(), originals = /* @__PURE__ */ new Map();
  const load = async (path) => {
    if (!staged.has(path)) {
      const current = await snapshot(cwd, path);
      originals.set(path, current);
      staged.set(path, current);
    }
    return staged.get(path);
  };
  for (const change of changes.filter((item) => item.op !== "unchanged")) {
    if (change.type !== "json-key") {
      await load(change.path);
      staged.set(change.path, change.op === "delete" ? null : change.type === "link" ? { link: change.link, dir: Boolean(change.dir) } : change.content);
      continue;
    }
    const current = await load(change.path), full = resolveInside(cwd, change.path);
    const text = Buffer.isBuffer(current) ? current.toString("utf8") : current?.link ? await readFile9(full, "utf8").catch(() => null) : null, format = formatFor(change.path);
    staged.set(change.path, Buffer.from(change.op === "delete" ? format.remove(text, change.pointer, change.path) : format.write(text, change.pointer, change.value, change.path)));
  }
  const same = (a, b) => a === null || b === null ? a === b : Buffer.isBuffer(a) ? Buffer.isBuffer(b) && a.equals(b) : a.link !== void 0 && a.link === b.link;
  const rank2 = (content) => content === null ? 0 : Buffer.isBuffer(content) ? 1 : 2;
  const place = async (full, content, { through = false } = {}) => {
    if (content === null) {
      await rm(full, { force: true });
      await removeEmptyParents(cwd, full);
      return;
    }
    await mkdir5(dirname3(full), { recursive: true });
    if (Buffer.isBuffer(content) && through) return writeFile5(full, content);
    await rm(full, { force: true });
    if (Buffer.isBuffer(content)) return writeFile5(full, content);
    if (content.dir && process.platform === "win32") await symlink(resolve2(dirname3(full), content.link), full, "junction");
    else await symlink(content.link, full, content.dir ? "dir" : "file");
  };
  const keyed = new Set(changes.filter((change) => change.type === "json-key").map((change) => change.path));
  const written = [];
  try {
    for (const [path, content] of [...staged].sort(([, a], [, b]) => rank2(a) - rank2(b))) {
      if (same(content, originals.get(path))) continue;
      written.push(path);
      await place(resolveInside(cwd, path), content, { through: keyed.has(path) });
    }
  } catch (error) {
    for (const path of written.reverse()) {
      const original = originals.get(path);
      await place(resolveInside(cwd, path), original?.dir && original.link === void 0 ? null : original, { through: keyed.has(path) }).catch(() => {
      });
    }
    throw new Error(`could not apply changes (all files restored): ${error.message}`);
  }
}
function lockEntry(plan, { allowExec = false } = {}) {
  const targets = Object.fromEntries((plan.targets || []).map((id2) => [id2, { files: [], keys: [] }]));
  for (const change of plan.changes.filter((item) => item.op !== "delete" && !item.adopt)) {
    const target = targets[change.target] ||= { files: [], keys: [] };
    if (change.type === "file") target.files.push({ path: change.path, sha256: change.sha256 });
    else if (change.type === "link") (target.links ||= []).push({ path: change.path, target: change.link, ...change.dir && { dir: true }, ...change.shared && { shared: true } });
    else target.keys.push({ path: change.path, pointer: change.pointer, sha256: change.sha256 });
  }
  const { capability } = plan;
  return { kind: capability.kind, version: capability.version, source: capability.source, integrity: capability.integrity, ...allowExec && { allowExec: true }, installedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), targets };
}
async function sameTarget(cwd, link) {
  const full = resolveInside(cwd, link.path);
  const [actual, expected] = await Promise.all([realpath(full).catch(() => null), realpath(resolve2(dirname3(full), link.target)).catch(() => null)]);
  return Boolean(actual) && actual === expected;
}
async function checkDrift(cwd, lock) {
  const report2 = [];
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    const issues = [];
    for (const [target, recorded] of Object.entries(entry.targets || {})) {
      for (const file of recorded.files || []) {
        const full = resolveInside(cwd, file.path);
        if (!await exists(full)) issues.push({ target, path: file.path, status: "missing" });
        else if (sha256(await readFile9(full)) !== file.sha256) issues.push({ target, path: file.path, status: "modified" });
      }
      for (const key of recorded.keys || []) {
        let current;
        try {
          current = formatFor(key.path).read(await readText2(cwd, key.path), key.pointer, key.path);
        } catch {
          current = void 0;
        }
        if (current === void 0) issues.push({ target, path: `${key.path} \u2192 ${key.pointer.join(".")}`, status: "missing" });
        else if (current !== key.sha256) issues.push({ target, path: `${key.path} \u2192 ${key.pointer.join(".")}`, status: "modified" });
      }
      for (const link of recorded.links || []) {
        const current = await snapshot(cwd, link.path);
        if (!current && await sameTarget(cwd, link)) continue;
        if (!current) issues.push({ target, path: link.path, status: "missing" });
        else if (current.link !== link.target) issues.push({ target, path: link.path, status: "modified" });
      }
    }
    report2.push({ ref, version: entry.version, source: entry.source, targets: Object.keys(entry.targets || {}), issues });
  }
  return report2;
}

// src/core/migrate.js
import { readFile as readFile10, writeFile as writeFile6 } from "fs/promises";
import { join as join15 } from "path";
var CHECKLIST_SECTIONS = ["Acceptance Criteria", "Steps", "Verification"].map((name) => headingAliases(name));
var LIST_ITEM = /^([-*]|\d+[.)]) +(?!\[[ xX]\] )(.+)$/;
function toChecklists(body, { done = false } = {}) {
  let inChecklist = false, fence = false, converted = 0;
  const lines = String(body).split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return line;
    }
    if (fence) return line;
    const heading2 = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading2) {
      inChecklist = CHECKLIST_SECTIONS.some((aliases) => aliases.includes(fold(heading2[1])));
      return line;
    }
    const item = inChecklist && line.match(LIST_ITEM);
    if (!item) return line;
    converted++;
    return `- [${done ? "x" : " "}] ${item[2]}`;
  });
  return { body: lines.join("\n"), converted };
}
async function migrateTask(dir, slug, { dryRun = false } = {}) {
  const graph = await loadGraph(dir), changes = [];
  if (!graph.exists) return { changes, subtasks: 0 };
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join("; ")}`);
  for (const item of graph.items) {
    const path = join15(dir, "subtasks", item.file), text = await readFile10(path, "utf8");
    const { body, converted } = toChecklists(text, { done: item.status === "done" });
    if (!converted) continue;
    changes.push({ file: `subtasks/${item.file}`, converted, status: item.status });
    if (!dryRun) await writeFile6(path, body);
  }
  const manifest = join15(dir, "subtasks", MANIFEST), before = await exists(manifest) ? await readFile10(manifest, "utf8") : "";
  if (!/^- \[[ x]\] \d{2,3} /m.test(before)) {
    changes.push({ file: `subtasks/${MANIFEST}`, converted: graph.items.length, status: "checklist of tasks" });
    if (!dryRun) await refreshManifest(dir, slug);
  }
  return { changes, subtasks: graph.items.length };
}

// src/commands/new.js
import { spawn as spawn3 } from "child_process";
import { mkdir as mkdir6, readFile as readFile13, rm as rm2, writeFile as writeFile7 } from "fs/promises";
import { join as join18 } from "path";

// src/core/generation.js
import { readdir as readdir8, readFile as readFile11 } from "fs/promises";
import { join as join16 } from "path";
function workflowForIdea(idea = "") {
  const text = idea.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\b(migrat|auth|login|password|senha|token|permiss|payment|pagamento|billing|cobranc|secur|seguranc|encrypt|cripto|gdpr|lgpd|pii|delete|exclu|drop)/.test(text)) return "strict";
  return /\b(apis?\b|endpoints?|webhooks?|integra|contract|contrato|protoc|openapi|graphql|grpc|sdk\b|spec-driven|sdd\b)/.test(text) ? "spec-driven" : "standard";
}
var SMALL_WORDS = new Set("a an and or of to for in on with the at by from o os as um uma uns umas de do da dos das no na nos nas em para por pelo pela com e ou ao aos que".split(" "));
function slugFromIdea(idea = "") {
  const words = idea.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word && !SMALL_WORDS.has(word));
  let slug = "";
  for (const word of words) {
    if (`${slug}-${word}`.length > 48) break;
    slug = slug ? `${slug}-${word}` : word;
    if (slug.split("-").length >= 6) break;
  }
  return slug.length >= 2 ? slug : "new-task";
}
async function stageSkill(stage2) {
  const dir = join16(packageRoot, "capabilities", "skills", STAGE_SKILLS[stage2]);
  const body = parseFrontmatter(await readFile11(join16(dir, "SKILL.md"), "utf8")).body.trim();
  const references = [];
  for (const file of (await readdir8(join16(dir, "references")).catch(() => [])).filter((name) => name.endsWith(".md")).sort()) references.push({ file: `references/${file}`, text: (await readFile11(join16(dir, "references", file), "utf8")).trim() });
  return { name: STAGE_SKILLS[stage2], body, references };
}
function groundingSummary(ground) {
  if (!ground) return "No grounding: search the repository yourself.";
  return [
    `Stack: ${ground.stack.languages.join(", ") || "unknown"}${ground.stack.frameworks.length ? ` \xB7 ${ground.stack.frameworks.join(", ")}` : ""}`,
    `Verification commands: ${ground.commands.map((item) => `\`${item.command}\`${item.cwd !== "." ? ` (in ${item.cwd})` : ""}`).join(", ") || "none detected"}`,
    `Instruction files: ${ground.instructions.join(", ") || "none"}`,
    "Relevant files (ranked by match with the idea, then by how widely they are imported):",
    ...ground.relevant.length ? ground.relevant.map((item) => `- ${item.path} \u2014 ${item.reasons.join("; ")}; imported by ${item.fanIn}; ${item.commits} recent commit(s)`) : ["- none matched"],
    ...ground.neighbors.length ? ["Their dependencies:", ...ground.neighbors.map((path) => `- ${path}`)] : [],
    ...ground.tests.length ? ["Tests near them:", ...ground.tests.map((path) => `- ${path}`)] : [],
    ...ground.routes.length ? ["Matching entry points:", ...ground.routes.map((route) => `- ${route.method || route.kind} ${route.path} \u2192 ${route.file}:${route.line}`)] : [],
    ...ground.shared.length ? ["Widely shared (changes ripple):", ...ground.shared.map((item) => `- ${item.path} (imported by ${item.importers})`)] : [],
    ...ground.doNotTouch.length ? [`Generated or lock files: ${ground.doNotTouch.join(", ")}`] : []
  ].join("\n");
}
var OUTPUT = {
  prd: 'Return the complete PRD inside one tag, with no code fence around the tag:\n\n<maverick-file name="PRD.md">\n# PRD \u2014 <title>\n\u2026\n</maverick-file>',
  spec: 'Return the complete behavioral spec inside one tag, with no code fence around the tag:\n\n<maverick-file name="SPEC.md">\n# Spec \u2014 <title>\n\u2026\n</maverick-file>',
  techspec: 'Return the complete technical spec inside one tag, with no code fence around the tag:\n\n<maverick-file name="TECHSPEC.md">\n# Technical Spec \u2014 <title>\n\u2026\n</maverick-file>',
  tasks: 'Return the tasks in dependency order, each in its own tag, with the body in the task format. `after` lists the ids of earlier tasks it depends on (comma separated, empty when none). `type` is a short kebab-case area such as backend, frontend, data or docs. `complexity` is low, medium or high:\n\n<maverick-subtask id="01" title="Short imperative title" type="backend" complexity="medium" after="">\n# Short imperative title\n\u2026\n</maverick-subtask>'
};
function buildStagePrompt({ slug, stage: stage2, idea, workflow, answers = [], ground, skill, upstream = [], current = "", findings = [], sections = [], authoring = {}, language }) {
  const rules = authoring.rules?.[stage2.toUpperCase()] || [];
  return [
    `You are running the ${skill.name} skill for the Maverick task "${slug}" non-interactively. Follow the skill below, with these differences:
- You cannot ask the user. Where the skill says to ask, take your recommended option and record it under Open Questions as "question \u2192 assumption taken". Put the questions that would change scope, behavior or the acceptance criteria in "questions" of the result block, with status "needs-input".
- You cannot write files or run commands that change anything. Read and search the repository freely. Maverick writes what you return and runs the validation, so skip the steps that run maverick commands: their output is already below.
- Planning only: never change source code, tests or configuration.`,
    language ? `# Language

${language.rule}
Use exactly these headings: ${sections.join(", ")}. Requirement blocks are \`### ${language.keywords.requirement}:\` with \`#### ${language.keywords.scenario}:\`, stating what the system ${language.keywords.must} do, with **${language.keywords.when}** and **${language.keywords.then}** lines. Keep the ids (US-01, AC-01, SC-01, UT-01) as they are.` : "",
    `# The task

Idea: ${idea.trim()}
Workflow: ${workflow}${answers.length ? `

Answers from the user (they override earlier assumptions):
${answers.map((answer) => `- ${answer}`).join("\n")}` : ""}`,
    authoring.context ? `# Project context (constraints for you, not content to copy)

${authoring.context.trim()}` : "",
    `# What maverick instructions returns

${groundingSummary(ground)}${sections.length ? `

Required headings: ${sections.join(", ")}` : ""}${rules.length ? `

Project rules for this stage:
${rules.map((rule) => `- ${rule}`).join("\n")}` : ""}`,
    ...upstream.map((item) => `# ${item.file} (earlier stage; read it in full)

${item.text.trim()}`),
    current ? `# Current ${stage2 === "tasks" ? "tasks" : "version"} (revise it: keep what is still right, including human edits)

${current.trim()}` : "",
    findings.length ? `# Validation failures to fix

${findings.map((item) => `- ${item.file}: ${item.message}`).join("\n")}` : "",
    `# Skill: ${skill.name}

${skill.body}`,
    ...skill.references.map((item) => `# Skill reference: ${item.file}

${item.text}`),
    `# Output format

${OUTPUT[stage2]}

End your message with exactly one fenced block:

\`\`\`maverick-result
{"status": "done" | "needs-input" | "blocked", "summary": "one or two sentences", "questions": [], "filesChanged": []}
\`\`\``
  ].filter(Boolean).join("\n\n");
}
var attributes = (text) => Object.fromEntries([...text.matchAll(/([a-z-]+)="([^"]*)"/gi)].map((match) => [match[1].toLowerCase(), match[2]]));
var unwrap = (body) => {
  const trimmed = body.trim(), match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return `${(match ? match[1] : trimmed).trim()}
`;
};
function parseGeneration(text = "", allowedFiles = []) {
  const files = {}, subtasks = [], rejected = [];
  for (const [, name, body] of text.matchAll(/<maverick-file\s+name="([^"]+)"\s*>([\s\S]*?)<\/maverick-file>/g)) {
    if (!allowedFiles.includes(name)) {
      rejected.push(`file ${name} is not produced by this stage`);
      continue;
    }
    if (!body.trim()) {
      rejected.push(`file ${name} is empty`);
      continue;
    }
    files[name] = unwrap(body);
  }
  const declared = /* @__PURE__ */ new Set();
  for (const [, attrs, body] of text.matchAll(/<maverick-subtask\s+([^>]*)>([\s\S]*?)<\/maverick-subtask>/g)) {
    const { id: id2 = String(subtasks.length + 1).padStart(2, "0"), title = "", type, complexity, after = "" } = attributes(attrs);
    const deps = after.split(/[\s,]+/).filter(Boolean), missing = deps.find((dep) => !declared.has(dep));
    const problem = !title.trim() ? "has no title" : type && !/^[a-z0-9-]+$/.test(type) ? `has an invalid type "${type}"` : complexity && !COMPLEXITY.includes(complexity) ? `has an invalid complexity "${complexity}"` : missing ? `depends on ${missing}, which is not an earlier task` : null;
    if (problem) {
      rejected.push(`task ${id2} ${problem}`);
      continue;
    }
    declared.add(id2);
    subtasks.push({ id: id2, title: title.trim(), type: type || void 0, complexity: complexity || void 0, after: deps, body: unwrap(body) });
  }
  return { files, subtasks, rejected };
}

// src/core/quality.js
import { readFile as readFile12 } from "fs/promises";
import { join as join17 } from "path";
var AC = /\bAC-(\d{2,3})\b/g;
var normal = (match) => `AC-${match[1].padStart(2, "0")}`;
var acIds = (text) => [...new Set([...String(text).matchAll(AC)].map(normal))];
function pathReferences(text, { includeNew = false } = {}) {
  const refs = [];
  for (const line of String(text).split("\n")) {
    if (!includeNew && /\(new\)|\bnew file\b|\bto be created\b|\bcreated (?:in|by) (?:task|step)\b|\(nov[oa]\)|criad[oa] n[ao] task/i.test(line)) continue;
    for (const [, raw] of line.matchAll(/`([^`\s]+)`/g)) {
      const path = raw.replace(/:\d+(?:-\d+)?$/, "").replace(/\/$/, "").replace(/^\.\//, "");
      if (!path || /[*<>{}$|()]|^[-/~]|:\/\/|^FILL/i.test(path) || /^AC-\d+/.test(path)) continue;
      if (raw.includes("/") || /\.[a-z0-9]{1,8}$/i.test(path)) refs.push(path);
    }
  }
  return [...new Set(refs)];
}
function requirementFindings(text, section = "Requirements") {
  const blocks = sectionBody(text, section).split(REQUIREMENT_HEADING).slice(1), findings = [];
  if (!blocks.length) return [{ level: "fail", message: `${section} has no "### Requirement:" blocks; write each behavior as a requirement with scenarios` }];
  for (const block of blocks) {
    const name = block.split("\n")[0].trim() || "(unnamed)", [statement, ...scenarios] = block.split(SCENARIO_HEADING);
    if (!MUST_WORDS.test(statement)) findings.push({ level: "warn", message: `requirement "${name}" does not state what the system SHALL or MUST do` });
    if (!scenarios.length) findings.push({ level: "fail", message: `requirement "${name}" has no "#### Scenario:"` });
    for (const scenario of scenarios) if (!WHEN_WORDS.test(scenario) || !THEN_WORDS.test(scenario)) findings.push({ level: "fail", message: `a scenario of "${name}" needs WHEN and THEN lines` });
  }
  return findings;
}
function stagesUpTo(preset, stage2) {
  const all2 = planningStages(preset);
  if (!stage2) return all2;
  const index = all2.indexOf(stage2);
  if (index < 0) throw new Error(`stage must be one of ${all2.join(", ")} for the ${preset.id} workflow`);
  return all2.slice(0, index + 1);
}
async function lintTask(cwd, dir, { strict = false, stage: stage2, preset } = {}) {
  const stages = stagesUpTo(preset || requirePreset(await taskPreset(dir)), stage2), results = [];
  const add2 = (file, level, message) => results.push({ file, status: level === "fail" || strict && level === "warn" ? "FAIL" : "WARN", message });
  const read = async (file) => await exists(join17(dir, file)) ? readFile12(join17(dir, file), "utf8") : null;
  const texts = Object.fromEntries(await Promise.all(ARTIFACTS.map(async (item) => [item.id, await read(item.file)])));
  const skill = { prd: "maverick-prd", spec: "maverick-spec", techspec: "maverick-techspec", tasks: "maverick-tasks" };
  for (const item of ARTIFACTS.filter((entry) => stages.includes(entry.stage))) {
    const text = texts[item.id];
    if (text === null) {
      add2(item.file, "fail", `not written yet; run the ${skill[item.stage]} skill`);
      continue;
    }
    for (const section of item.sections) if (!sectionPresent(text, section)) add2(item.file, "fail", `missing section "${section}"`);
    if (!hasMeaningfulContent(text)) add2(item.file, "fail", "placeholders (TODO, TBD, FILL ME) remain");
  }
  const prd = texts.PRD, criteria = prd ? acIds(sectionBody(prd, "Acceptance Criteria")) : [];
  if (prd) {
    const listed = [...sectionBody(prd, "Acceptance Criteria").matchAll(AC)].map(normal);
    if (!listed.length) add2("PRD.md", "fail", 'acceptance criteria have no stable ids; write them as "- [ ] AC-01: Given \u2026, when \u2026, then \u2026"');
    for (const id2 of new Set(listed.filter((value, index) => listed.indexOf(value) !== index))) add2("PRD.md", "fail", `${id2} is defined more than once`);
    if (!/^###\s+(?:US|HU)-\d+/m.test(sectionBody(prd, "User Stories"))) add2("PRD.md", "warn", 'User Stories has no "### US-01: \u2026" stories');
    for (const finding of requirementFindings(prd)) add2("PRD.md", finding.level, finding.message);
  }
  const behavior = stages.includes("spec") ? texts.SPEC : null;
  if (behavior) {
    for (const finding of requirementFindings(behavior, "Behavior")) add2("SPEC.md", finding.level, finding.message);
    if (!/```/.test(sectionBody(behavior, "Contracts"))) add2("SPEC.md", "warn", "Contracts has no code block; write the request, response, event or function shapes exactly");
    if (!/\S/.test(sectionBody(behavior, "Invariants"))) add2("SPEC.md", "warn", 'Invariants is empty; list what must always hold, or write "None"');
    for (const id2 of acIds(behavior)) if (criteria.length && !criteria.includes(id2)) add2("SPEC.md", "fail", `references ${id2}, which PRD.md does not define`);
    const traced = acIds(sectionBody(behavior, "Traceability"));
    for (const id2 of criteria.filter((id3) => !traced.includes(id3))) add2("SPEC.md", "warn", `Traceability does not map ${id2} to a scenario or contract`);
  }
  const spec = stages.includes("techspec") ? texts.TECHSPEC : null;
  if (spec) {
    const refs = pathReferences(["File References", "Impact", "Do Not Touch"].map((name) => sectionBody(spec, name)).join("\n"));
    for (const path of refs) if (!await exists(join17(cwd, path))) add2("TECHSPEC.md", "warn", `references \`${path}\`, which does not exist; fix the path or mark the line (new)`);
    if (!refs.length) add2("TECHSPEC.md", "warn", "File References lists no real paths");
    const tested = acIds(sectionBody(spec, "Test Plan"));
    for (const id2 of acIds(spec)) if (criteria.length && !criteria.includes(id2)) add2("TECHSPEC.md", "fail", `references ${id2}, which PRD.md does not define`);
    for (const id2 of criteria.filter((id3) => !tested.includes(id3))) add2("TECHSPEC.md", "warn", `the Test Plan has no test for ${id2}`);
  }
  if (stages.includes("tasks")) {
    const graph = await loadGraph(dir);
    if (!graph.items.length && !graph.problems.length) add2("subtasks/_tasks.md", "fail", "no tasks yet; run the maverick-tasks skill");
    for (const problem of graph.problems) add2("subtasks/_tasks.md", "fail", problem);
    if (graph.items.length > 10) add2("subtasks/_tasks.md", "advice", `${graph.items.length} tasks; a typical feature needs 3-7, merge the ones that share a boundary`);
    const covered = /* @__PURE__ */ new Set();
    for (const item of graph.items) {
      const file = `subtasks/${item.file}`, ids = acIds(item.body);
      ids.forEach((id2) => covered.add(id2));
      if (!hasMeaningfulContent(item.body)) add2(file, "fail", "placeholders (TODO, TBD, FILL ME) remain");
      if (criteria.length && !ids.length) add2(file, "warn", "does not say which acceptance criteria it satisfies");
      for (const id2 of ids) if (criteria.length && !criteria.includes(id2)) add2(file, "fail", `references ${id2}, which PRD.md does not define`);
      if (!sectionPresent(item.body, "Verification")) add2(file, "warn", 'has no "## Verification" section');
      for (const section of ["Steps", "Verification"]) if (sectionPresent(item.body, section) && !/^\s*[-*] \[[ xX]\] /m.test(sectionBody(item.body, section))) add2(file, "warn", `write "## ${section}" as a checklist ("- [ ] \u2026") so the build can check each item`);
      if (item.status === "done" && item.checklist.open.length) add2(file, "fail", `is marked done with ${item.checklist.open.length} unchecked item(s): ${item.checklist.open.map((entry) => entry.text).join("; ")}`);
      for (const path of pathReferences(sectionBody(item.body, "Files"))) if (!await exists(join17(cwd, path))) add2(file, "warn", `references \`${path}\`, which does not exist; fix the path or mark the line (new)`);
    }
    if (graph.items.length) for (const id2 of criteria.filter((id3) => !covered.has(id3))) add2("subtasks/_tasks.md", "warn", `${id2} is not covered by any task`);
  }
  return results;
}

// src/commands/new.js
var str2 = (value) => typeof value === "string" && value.trim() ? value.trim() : void 0;
var INTERACTIVE_ORDER = ["claude-code", "codex", "cursor", "gemini", "antigravity", "copilot", "kiro", "opencode"];
var FLOW_SKILLS = ["maverick-new", "maverick-prd", "maverick-spec", "maverick-techspec", "maverick-tasks", "maverick-build", "maverick-review", "maverick-ship", "maverick-status", "maverick-sync"];
var FLOW_CAPABILITIES = FLOW_SKILLS.map((name) => `skill/${name}`);
var SKILL_FOR_STAGE = { prd: "maverick-new", spec: "maverick-new", techspec: "maverick-new", tasks: "maverick-new", build: "maverick-build", verify: "maverick-review", security: "maverick-review", review: "maverick-review", pr: "maverick-ship" };
var artifactFor = artifactForStage;
var TASK_SECTIONS = ["Goal", "Acceptance Criteria", "Files", "Steps", "Verification"];
var stageKeywords = (docs) => ({ requirement: keyword("requirement", docs), scenario: keyword("scenario", docs), must: keyword("must", docs), when: keyword("when", docs), then: keyword("then", docs) });
var stageLine = (preset, current) => planningStages(preset).map((stage2) => stage2 === current ? `[${stage2.toUpperCase()}]` : stage2.toUpperCase()).join(" \u2192 ");
async function uniqueSlug(cwd, config, base2) {
  for (let index = 1; ; index++) {
    const slug = index === 1 ? base2 : `${base2}-${index}`;
    if (!await exists(taskPath(cwd, config, slug))) return slug;
  }
}
async function installFlowSkills(cwd, config, target) {
  const [lock, catalog, adapters] = await Promise.all([readLock(cwd), loadCatalog(cwd, config), resolveTargets(cwd, config, target)]);
  const plans = [], warnings = [];
  for (const reference of FLOW_CAPABILITIES) {
    const plan = await planInstall(cwd, findCapability(catalog, reference), adapters, lock, { layout: layoutFor(config) });
    if (plan.conflicts.length) {
      warnings.push(`${reference}: ${plan.conflicts.map((item) => `${item.path} (${item.reason})`).join("; ")}`);
      continue;
    }
    if (plan.changes.some((change) => change.op !== "unchanged")) plans.push(plan);
  }
  if (plans.length) {
    await applyChanges(cwd, plans.flatMap((plan) => plan.changes));
    for (const plan of plans) lock.capabilities[plan.capability.ref] = lockEntry(plan);
    await writeLock(cwd, lock);
  }
  return { installed: plans.map((plan) => plan.capability.ref), warnings };
}
function installedAgents(cwd, config) {
  return providersFor(config).filter((provider) => provider.interactive && commandAvailable(resolveBin(provider, config, cwd), cwd));
}
function pickInteractiveAgent(cwd, config, requested) {
  const providers = providersFor(config).filter((provider) => provider.interactive);
  if (requested) {
    const provider = providers.find((item) => item.id === requested);
    if (!provider) throw new Error(`${requested} cannot be opened interactively; choose ${providers.map((item) => item.id).join(", ")}`);
    if (!commandAvailable(resolveBin(provider, config, cwd), cwd)) throw new Error(`${provider.name} is not installed (${resolveBin(provider, config, cwd)} not found on PATH)`);
    return provider;
  }
  const order = [config.runtime?.default?.provider, ...INTERACTIVE_ORDER].filter(Boolean);
  return order.map((id2) => providers.find((item) => item.id === id2)).find((provider) => provider && commandAvailable(resolveBin(provider, config, cwd), cwd));
}
function openAgent(bin, args, cwd) {
  return new Promise((resolve3, reject) => {
    const child = spawn3(bin, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => resolve3(code));
  });
}
async function newTask(cwd, idea, options = {}) {
  const config = await loadConfig(cwd), text = str2(idea);
  const interactive = Boolean(options.launch) || !options.noLaunch && !options.json && !options.headless && process.stdin.isTTY && process.stdout.isTTY && !process.env.CI;
  if (!text) {
    if (!interactive) throw new Error('describe what to build: maverick new "add pagination to the orders list"');
    return launch(cwd, config, str2(options.agent), 'Use the maverick-new skill. Ask me what I want to build, then create the task with maverick new "<idea>" and plan it with me.');
  }
  let slug, reason, resumed = false;
  if (/^[a-z0-9][a-z0-9-]{1,80}$/.test(text) && await exists(taskPath(cwd, config, text))) {
    slug = text;
    resumed = true;
  } else {
    slug = str2(options.slug) || await uniqueSlug(cwd, config, slugFromIdea(text));
    requireSlug(slug);
    if (await exists(taskPath(cwd, config, slug))) throw new Error(`task already exists: ${rel(cwd, taskPath(cwd, config, slug))}; resume it with maverick new ${slug}`);
    const chosen = options.strict ? "strict" : options.spec ? "spec-driven" : str2(options.workflow) && requirePreset(str2(options.workflow)).id;
    const suggested = workflowForIdea(text), upgrade = suggested === "strict" || suggested === "spec-driven" && config.workflow.default === "standard";
    const workflow = chosen || (upgrade ? suggested : config.workflow.default);
    reason = options.strict ? "chosen with --strict" : options.spec ? "chosen with --spec" : chosen ? "chosen with --workflow" : !upgrade ? "" : suggested === "strict" ? "the idea touches security, data, payments or migrations" : "the idea defines an API, integration or shared contract; pass --workflow standard to skip SPEC.md";
    await mkdir6(taskPath(cwd, config, slug), { recursive: true });
    await writeFile7(join18(taskPath(cwd, config, slug), "TASK.json"), pretty({ idea: text, workflow, createdAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) }));
  }
  const { dir, meta, preset } = await getTask(cwd, slug), status2 = await taskStage(dir, preset, slug);
  const ground = await groundChange(cwd, meta.idea || "");
  if (options.headless) return generate(cwd, slug, void 0, options);
  if (options.json) return output(JSON.stringify({ task: slug, created: !resumed, idea: meta.idea, workflow: preset.id, stage: status2.stage, next: status2.next, grounding: { relevant: ground.relevant.map((item) => item.path), tests: ground.tests, routes: ground.routes.length } }, null, 2));
  output(`${brand()} / NEW
${resumed ? "\u21BB resuming" : "\u2713 task created"}: ${slug}  (${rel(cwd, dir)})
Idea: ${meta.idea}
Workflow: ${preset.name}${reason ? ` (${reason})` : ""}
Pipeline: ${stageLine(preset, status2.stage)}${planningStages(preset).includes(status2.stage) ? "" : ` \u2192 ${status2.stage.toUpperCase()}`}
Grounded in: ${ground.relevant.slice(0, 3).map((item) => item.path).join(", ") || "no matching files"}${ground.relevant.length > 3 ? ` (+${ground.relevant.length - 3} more)` : ""}`);
  if (!interactive) return output(`
Next: ${status2.next}
In your agent, use the ${SKILL_FOR_STAGE[status2.stage]} skill for ${slug}; for a headless run: maverick generate ${slug} --agent <trusted-provider>`);
  const skill = SKILL_FOR_STAGE[status2.stage];
  await launch(cwd, config, str2(options.agent), `Use the ${skill} skill for the Maverick task "${slug}": ${meta.idea}
It is at the ${status2.stage} stage. Start with: maverick instructions ${slug} --json`);
  const after = await taskStage(dir, preset, slug);
  output(`
${brand()} / NEW
Task ${slug} is at ${after.stage.toUpperCase()}.
Next: ${after.next}
Continue in your agent with: maverick new ${slug}`);
}
async function launch(cwd, config, requested, prompt) {
  const agent = pickInteractiveAgent(cwd, config, requested);
  if (!agent) return output("\nNo AI coding agent was found on PATH (claude, codex, cursor-agent or gemini).\nInstall one and run this again, or plan headlessly: maverick generate <task> --agent <trusted-provider>");
  const skills = await installFlowSkills(cwd, config, agent.id);
  if (skills.installed.length) output(`\u2713 installed for ${agent.name}: ${skills.installed.map((ref) => ref.replace("skill/", "")).join(", ")}`);
  skills.warnings.forEach((warning) => output(`WARN ${warning}`));
  const language = projectLanguage(config);
  output(`
\u25B6 opening ${agent.name}. The rest of the flow happens there: plan (maverick-new), build (maverick-build), review (maverick-review) and ship (maverick-ship).
  Documents in ${languageName(language.docs)} \xB7 code in ${languageName(language.code)} (change with: maverick language)
`);
  const prd = resolveRun(config, { stage: "prd", provider: agent.id }, providersFor(config), { checks: false });
  await openAgent(resolveBin(agent, config, cwd), agent.interactive({ prompt, model: prd.model, effort: prd.effort }), cwd);
  return agent;
}
async function upstreamFor(dir, preset, stage2) {
  const stages = planningStages(preset), files = preset.artifacts.filter((item) => stages.indexOf(item.stage) < stages.indexOf(stage2));
  return (await Promise.all(files.map(async (item) => ({ file: item.file, text: await readFile13(join18(dir, item.file), "utf8").catch(() => "") })))).filter((item) => item.text);
}
async function currentFor(dir, stage2) {
  if (stage2 !== "tasks") return readFile13(join18(dir, artifactFor(stage2).file), "utf8").catch(() => "");
  const graph = await loadGraph(dir);
  return graph.items.map((item) => `<maverick-subtask id="${item.id}" title="${item.title}" after="${item.dependsOn.join(",")}">
${item.body.trim()}
</maverick-subtask>`).join("\n\n");
}
async function writeTasks(dir, slug, subtasks) {
  if (!subtasks.length) return { written: 0 };
  const graph = await loadGraph(dir);
  if (graph.items.some((item) => item.status !== "pending")) return { written: 0, skipped: "existing tasks have started; they were kept" };
  if (graph.exists) await rm2(join18(dir, "subtasks"), { recursive: true, force: true });
  const ids = /* @__PURE__ */ new Map();
  for (const item of subtasks) ids.set(item.id, (await addSubtask(dir, slug, { title: item.title, type: item.type, complexity: item.complexity, after: item.after.map((dep) => ids.get(dep)), body: item.body })).id);
  return { written: subtasks.length };
}
var ownFindings = (findings, stage2) => findings.filter((item) => item.status === "FAIL" && (stage2 === "tasks" ? item.file.startsWith("subtasks/") : item.file === artifactFor(stage2).file));
async function generate(cwd, slug, onlyStage, options = {}) {
  const { dir, meta, preset, config } = await getTask(cwd, slug);
  const planning2 = planningStages(preset);
  if (onlyStage && !planning2.includes(onlyStage)) throw new Error(`stage must be one of ${planning2.join(", ")} for the ${preset.id} workflow`);
  const status2 = await taskStage(dir, preset, slug);
  if (!onlyStage && !planning2.includes(status2.stage)) throw new Error(`planning is complete (stage ${status2.stage}); pass a stage to revise it: maverick generate ${slug} ${planning2.join("|")}`);
  const planFor = (stage2) => resolveRun(config, { provider: str2(options.agent) || str2(options.provider), model: str2(options.model), effort: str2(options.effort), permission: "read-only", stage: stage2 }, providersFor(config));
  const plan = planFor(onlyStage || status2.stage);
  const newAnswer = str2(options.answers), answers = [...meta.answers || [], ...newAnswer ? [newAnswer] : []];
  if (newAnswer && !options.dryRun) await writeFile7(join18(dir, "TASK.json"), pretty({ ...meta, answers }));
  const ground = await groundChange(cwd, meta.idea || ""), timeoutMs = Math.round((Number(options.timeout) || config.runtime?.timeoutMinutes || 30) * 6e4);
  const stages = onlyStage ? [onlyStage] : planning2.slice(planning2.indexOf(status2.stage)), report2 = [], questions = [];
  if (!options.json && !options.dryRun) output(`${brand()} / GENERATE
Task: ${slug} \xB7 ${plan.provider.name} (read-only)
Stages: ${stages.map((stage2) => stage2.toUpperCase()).join(" \u2192 ")}`);
  for (const stage2 of stages) {
    const skill = await stageSkill(stage2), artifact = artifactFor(stage2), stagePlan = planFor(stage2);
    let findings = [], result, parsed, written;
    for (let attempt = 0; attempt <= (Number(options.retries ?? 1) || 0); attempt++) {
      const language = projectLanguage(config);
      const prompt = buildStagePrompt({ slug, stage: stage2, idea: meta.idea || "", workflow: preset.id, answers, ground, skill, upstream: await upstreamFor(dir, preset, stage2), current: await currentFor(dir, stage2), findings, sections: (artifact?.sections || TASK_SECTIONS).map((name) => heading(name, language.docs)), authoring: config.authoring, language: { ...language, rule: languageRule(language), keywords: stageKeywords(language.docs) } });
      if (options.dryRun) return output(options.json ? JSON.stringify({ provider: plan.provider.id, stage: stage2, prompt }, null, 2) : `${brand()} / GENERATE (dry run)
Provider: ${plan.provider.name} \xB7 read-only \xB7 stage ${stage2}

----- prompt -----
${prompt}`);
      if (!options.json) output(`
\u25B6 ${stage2.toUpperCase()}${attempt ? " (fixing validation failures)" : ""} with ${skill.name} \xB7 ${stagePlan.provider.name}${stagePlan.model ? ` ${stagePlan.model}` : ""}${stagePlan.effort ? ` (${stagePlan.effort})` : ""}`);
      const controller = new globalThis.AbortController(), abort = () => controller.abort();
      process.once("SIGINT", abort);
      try {
        result = await runAgent({ cwd, config, taskDir: dir, task: slug, provider: stagePlan.provider, model: stagePlan.model, effort: stagePlan.effort, permission: stagePlan.permission, prompt, timeoutMs, signal: controller.signal, onEvent: printer({ ...options, quiet: true }) });
      } finally {
        process.removeListener("SIGINT", abort);
      }
      if (!result.ok) throw new Error(`${stage2} generation failed: ${result.problems.join("; ")}`);
      parsed = parseGeneration(result.text, artifact ? [artifact.file] : []);
      for (const [file, body] of Object.entries(parsed.files)) await writeFile7(join18(dir, file), body);
      written = stage2 === "tasks" ? await writeTasks(dir, slug, parsed.subtasks) : { written: Object.keys(parsed.files).length };
      if (!written.written && !written.skipped) throw new Error(`the agent returned no ${stage2 === "tasks" ? "tasks" : artifact.file}; see ${rel(cwd, result.transcript)}`);
      findings = ownFindings(await lintTask(cwd, dir, { stage: stage2, strict: true, preset }), stage2);
      if (!findings.length) break;
    }
    questions.push(...(result.result?.questions || []).map((question) => `${stage2}: ${question}`));
    report2.push({ stage: stage2, written: written.written, skipped: written.skipped, rejected: parsed.rejected, failures: findings.map((item) => `${item.file}: ${item.message}`), summary: result.result?.summary || "", transcript: rel(cwd, result.transcript) });
    if (!options.json) output(`${findings.length ? "!" : "\u2713"} ${stage2 === "tasks" ? `${written.written} task(s)${written.skipped ? ` (${written.skipped})` : ""}` : artifact.file}${result.result?.summary ? ` \u2014 ${result.result.summary}` : ""}${[...parsed.rejected.map((item) => `
  rejected ${item}`), ...findings.map((item) => `
  FAIL ${item.file}: ${item.message}`)].join("")}`);
    if (findings.length) break;
  }
  if (questions.length && !options.dryRun) await writeFile7(join18(dir, "TASK.json"), pretty({ ...(await getTask(cwd, slug)).meta, pendingQuestions: questions }));
  const after = await taskStage(dir, preset, slug);
  if (options.json) return output(JSON.stringify({ task: slug, provider: plan.provider.id, stages: report2, questions, stage: after.stage, next: after.next }, null, 2));
  const lines = [];
  if (questions.length) lines.push("\nAssumptions were taken for these questions; answer them to refine:", ...questions.map((question, index) => `  ${index + 1}. ${question}`), `  maverick generate ${slug} <stage> --agent ${plan.provider.id} --answers "1) \u2026 2) \u2026"`);
  lines.push(`
Stage: ${after.stage.toUpperCase()} \xB7 Next: ${after.next}`);
  output(lines.join("\n"));
  if (report2.some((item) => item.failures.length)) throw new Error("generation stopped on validation failures; fix them or rerun the stage");
}
async function instructions(cwd, slug, onlyStage, options = {}) {
  const { dir, meta, preset, config } = await getTask(cwd, slug);
  const stage2 = onlyStage ? String(onlyStage).toLowerCase() : void 0;
  const planning2 = planningStages(preset);
  if (stage2 && !planning2.includes(stage2)) throw new Error(`stage must be one of ${planning2.join(", ")} for the ${preset.id} workflow`);
  const status2 = await taskStage(dir, preset, slug), ground = await groundChange(cwd, meta.idea || "");
  const focus = stage2 || (planning2.includes(status2.stage) ? status2.stage : void 0);
  const findings = await lintTask(cwd, dir, { stage: focus, preset });
  const language = projectLanguage(config), graph = await loadGraph(dir);
  const stages = planning2.map((id2) => {
    const artifact = artifactFor(id2);
    return { id: id2, skill: STAGE_SKILLS[id2], path: rel(cwd, join18(dir, artifact?.file || "subtasks")), done: id2 === "tasks" ? status2.tasks.total > 0 : status2.artifacts[artifact.id], sections: (artifact?.sections || TASK_SECTIONS).map((name) => heading(name, language.docs)) };
  });
  const payload = {
    task: slug,
    idea: meta.idea || "",
    workflow: preset.id,
    answers: meta.answers || [],
    stage: status2.stage,
    skill: SKILL_FOR_STAGE[status2.stage],
    next: status2.next,
    language: { ...language, rule: languageRule(language), keywords: stageKeywords(language.docs) },
    focus: focus ? stages.find((item) => item.id === focus) : null,
    stages,
    upstream: focus ? (await upstreamFor(dir, preset, focus)).map((item) => rel(cwd, join18(dir, item.file))) : [],
    tasks: { ...status2.tasks, ready: graph.items.filter((item) => item.ready).map((item) => ({ id: item.id, title: item.title, path: rel(cwd, join18(dir, "subtasks", item.file)) })), inProgress: graph.items.filter((item) => item.status === "in-progress").map((item) => item.id) },
    grounding: ground,
    findings,
    authoring: config.authoring || {},
    validate: `maverick validate ${slug}${focus ? ` --stage ${focus}` : ""}`
  };
  if (options.json) return output(JSON.stringify(payload, null, 2));
  const lines = [`${brand()} / INSTRUCTIONS \u2014 ${slug}`, `Idea: ${payload.idea}`, `Workflow: ${preset.name} \xB7 Pipeline: ${stageLine(preset, status2.stage)} \xB7 Skill now: ${payload.skill}`, `Language: documents ${languageName(language.docs)} \xB7 code ${languageName(language.code)}`, ""];
  for (const item of stages) lines.push(`${item.done ? "\u2713" : "\xB7"} ${item.id.toUpperCase().padEnd(9)} ${item.skill.padEnd(18)} ${item.path}`);
  if (payload.focus) lines.push("", `Now: ${payload.focus.id.toUpperCase()} with the ${payload.focus.skill} skill \u2192 ${payload.focus.path}`, `Required headings: ${payload.focus.sections.join(", ")}`);
  if (payload.upstream.length) lines.push(`Read first: ${payload.upstream.join(", ")}`);
  if (ground.relevant.length) lines.push("", "Start reading from:", ...ground.relevant.slice(0, 6).map((item) => `  ${item.path} \u2014 ${item.reasons.join("; ")}`));
  if (findings.length) lines.push("", "Findings:", ...findings.slice(0, 10).map((item) => `  ${item.status} ${item.file}: ${item.message}`));
  lines.push("", `Validate with: ${payload.validate}`, "JSON for agents: add --json");
  output(lines.join("\n"));
}
var newCommands = [
  { id: "new", description: "Start the flow in your AI agent: from an idea (or a task slug to resume) to PRD, behavioral spec (spec-driven), technical spec, tasks, build, review and ship.", aliases: ["start", "open"], usage: 'new ["<idea>" | <task>] [--agent <provider>] [--strict | --spec | --workflow <standard|spec-driven|strict>] [--slug <slug>] [--no-launch] [--headless]', run: ({ cwd, arg, options }) => newTask(cwd, arg, options) },
  { id: "instructions", description: "The idea, current stage, required headings, grounding and findings for a stage skill.", aliases: [], usage: "instructions <task> [prd|spec|techspec|tasks] [--json]", run: ({ cwd, arg, third, options }) => instructions(cwd, arg, third, options) },
  { id: "generate", description: "Run the planning stage skills headlessly with a trusted, read-only agent.", aliases: [], usage: 'generate <task> [prd|spec|techspec|tasks] --agent <provider> [--answers "\u2026"] [--dry-run]', run: ({ cwd, arg, third, options }) => generate(cwd, arg, third, options) }
];

// src/commands/capabilities.js
var MARK = { create: "+", update: "~", delete: "-", unchanged: "=" };
var describe = (change) => change.type === "json-key" ? `${change.path} \u2192 ${change.pointer.join(".")}` : change.type === "link" && change.link ? `${change.path} \u21E2 ${change.link}` : change.path;
var changeKey = (change) => `${change.op}\0${change.type}\0${describe(change)}`;
function renderPlans(title, plans) {
  const lines = [`${brand()} / ${title}`], seen = /* @__PURE__ */ new Set();
  for (const plan of plans) {
    lines.push("", plan.capability ? `${plan.capability.ref} ${plan.capability.version} (${plan.capability.source})` : plan.ref);
    for (const change of plan.changes) {
      if (seen.has(changeKey(change))) continue;
      seen.add(changeKey(change));
      lines.push(`  ${MARK[change.op]} ${change.target.padEnd(12)} ${describe(change)}`);
    }
    for (const skip of plan.skipped) lines.push(`  \xB7 ${skip.target.padEnd(12)} skipped: ${skip.reason}`);
    for (const conflict of plan.conflicts) lines.push(`  ! ${conflict.target.padEnd(12)} ${conflict.path}: ${conflict.reason}`);
    for (const forced of plan.forced) lines.push(`  ! ${forced.target.padEnd(12)} ${forced.path}: ${forced.reason} (overwriting: --force)`);
  }
  return lines.join("\n");
}
var pending = (plans) => [...new Map(plans.flatMap((plan) => plan.changes).filter((change) => change.op !== "unchanged").map((change) => [changeKey(change), change])).values()];
async function confirm2(title, plans, options) {
  const summary = plans.map((plan) => ({ ref: plan.capability?.ref || plan.ref, changes: plan.changes.map(({ target, op, type, path, pointer }) => ({ target, op, type, path, ...pointer && { pointer } })), skipped: plan.skipped, conflicts: plan.conflicts }));
  if (!options.json) output(renderPlans(title, plans));
  const conflicts = plans.flatMap((plan) => plan.conflicts);
  if (conflicts.length) {
    if (options.json) output(JSON.stringify({ applied: false, plans: summary }, null, 2));
    throw new Error(`${conflicts.length} conflict(s): ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join("; ")}; review them, or rerun with --force to overwrite`);
  }
  const count2 = pending(plans).length;
  const finish = (applied) => {
    if (options.json) output(JSON.stringify({ applied, dryRun: Boolean(options.dryRun), plans: summary }, null, 2));
    return applied;
  };
  if (!count2) {
    if (!options.json) output("\nAlready up to date.");
    return finish(false);
  }
  if (options.dryRun) {
    if (!options.json) output(`
${count2} change(s) planned. Dry run: nothing was written.`);
    return finish(false);
  }
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY || options.json) throw new Error(`${count2} change(s) planned; rerun with --yes to apply or --dry-run to preview`);
    const prompt = createInterface2({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`
Apply ${count2} change(s)? [y/N] `);
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
    const plan = await planInstall(cwd, capability, adapters, lock, { force: options.force, layout: layoutFor(config) });
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
  const removing = references.map((reference) => {
    const refs = Object.keys(lock.capabilities).filter((ref) => ref === reference || ref.split("/")[1] === reference);
    if (refs.length > 1) throw new Error(`"${reference}" is ambiguous; use one of: ${refs.join(", ")}`);
    return refs[0] || reference;
  });
  for (const ref of removing) plans.push(await planRemove(cwd, ref, lock, { force: options.force, removing }));
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
  if (options.json) return output(JSON.stringify(results.map(({ ref, kind, name, version, description, source, tags }) => ({ ref, kind, name, version, description, source, tags })), null, 2));
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
  const catalog = await loadCatalog(cwd, config), plans = [], notes = [], updates = [];
  const layout = layoutFor(config), update = !options.noUpdate;
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    const capability = catalog.capabilities.find((item) => item.ref === ref);
    if (!capability) {
      notes.push(`${ref}: source not found in any catalog; left as is`);
      continue;
    }
    const changed = capability.integrity !== entry.integrity;
    if (changed && !update) {
      notes.push(`${ref}: ${entry.version} \u2192 ${capability.version} available; run maverick sync to update`);
      continue;
    }
    if (changed) updates.push(`${ref} ${entry.version} \u2192 ${capability.version}`);
    const adapters = ADAPTERS.filter((adapter2) => Object.keys(entry.targets).includes(adapter2.id));
    plans.push(await planInstall(cwd, capability, adapters, lock, { force: options.force, layout }));
  }
  const flowTargets = Object.keys(lock.capabilities["skill/maverick-new"]?.targets || {});
  if (update && flowTargets.length) {
    for (const name of FLOW_SKILLS.filter((item) => !lock.capabilities[`skill/${item}`])) {
      const capability = catalog.capabilities.find((item) => item.ref === `skill/${name}`);
      if (!capability) continue;
      updates.push(`skill/${name} ${capability.version} (new)`);
      plans.push(await planInstall(cwd, capability, ADAPTERS.filter((adapter2) => flowTargets.includes(adapter2.id)), lock, { force: options.force, layout }));
    }
  }
  if (!options.json) {
    notes.forEach((note) => output(`NOTE ${note}`));
    updates.forEach((item) => output(`UPDATE ${item}`));
  }
  if (!plans.length) return output(options.json ? JSON.stringify({ applied: false, notes, updates }) : "Nothing to sync.");
  if (!await confirm2("SYNC", plans, options)) return;
  await applyChanges(cwd, plans.flatMap((plan) => plan.changes));
  for (const plan of plans) {
    const previous = lock.capabilities[plan.capability.ref];
    lock.capabilities[plan.capability.ref] = { ...lockEntry(plan, { allowExec: Boolean(previous?.allowExec) }), ...previous && { installedAt: previous.installedAt } };
  }
  await writeLock(cwd, lock);
  if (!options.json) output(`
\u2713 ${updates.length ? `${updates.length} capability(ies) updated; ` : ""}managed files match the lockfile`);
}
async function syncTask(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug), result = await migrateTask(dir, slug, { dryRun: Boolean(options.dryRun) });
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]), catalog = await loadCatalog(cwd, config);
  const stale = FLOW_SKILLS.filter((name) => {
    const entry = lock.capabilities[`skill/${name}`], current = catalog.capabilities.find((item) => item.ref === `skill/${name}`);
    return entry && current && entry.integrity !== current.integrity;
  });
  if (options.json) return output(JSON.stringify({ task: slug, dryRun: Boolean(options.dryRun), changes: result.changes, staleSkills: stale }, null, 2));
  const lines = [`${brand()} / SYNC ${slug}`, ""];
  if (!result.subtasks) lines.push("No subtasks yet: nothing to migrate. The maverick-tasks skill writes them in the current format.");
  else if (!result.changes.length) lines.push(`\u2713 ${result.subtasks} subtask(s) already in the current format`);
  else lines.push(...result.changes.map((change) => `${options.dryRun ? "~" : "\u2713"} ${change.file}: ${change.converted} item(s) \u2192 checklist${change.status === "done" ? " (checked: the task is done)" : ""}`), "", options.dryRun ? "Dry run: nothing was written." : "Items of unfinished tasks start unchecked; check the ones the code already satisfies, or let the maverick-sync skill do it.");
  if (stale.length) lines.push("", `NOTE ${stale.length} flow skill(s) are out of date (${stale.join(", ")}); update them with maverick sync`);
  output(lines.join("\n"));
}
var capabilityCommands = [
  { id: "catalog", description: "Browse, search, show, or validate available capabilities.", aliases: [], usage: "catalog [search <text>|show <name>|validate]", run: ({ cwd, arg, third, options }) => catalogCommand(cwd, arg, third, options) },
  { id: "add", description: "Install skills, agents, commands, or MCP servers into AI tools.", aliases: [], usage: "add <capability...> [--to <tools>] [--dry-run]", run: ({ cwd, rest, options }) => add(cwd, rest, options) },
  { id: "remove", description: "Uninstall capabilities and their managed files.", aliases: [], usage: "remove <capability...> [--dry-run]", run: ({ cwd, rest, options }) => remove(cwd, rest, options) },
  { id: "installed", description: "List installed capabilities, drift, and updates.", aliases: [], usage: "installed [--json]", run: ({ cwd, options }) => installed(cwd, options) },
  { id: "sync", description: "Update installed skills and capabilities to the catalog, restore drifted files, or bring a task to the current format.", aliases: [], usage: "sync [<task>] [--dry-run] [--yes] [--no-update] [--force]", run: ({ cwd, arg, options }) => arg ? syncTask(cwd, arg, options) : sync(cwd, options) }
];

// src/commands/delivery.js
import { copyFile, mkdir as mkdir7, readFile as readFile14, writeFile as writeFile8 } from "fs/promises";
import { dirname as dirname4, join as join19 } from "path";

// src/core/instruction-adapters.js
var INSTRUCTION_ADAPTERS = [
  { id: "claude-code", name: "Claude Code", source: "adapters/claude-code/CLAUDE.md.example", target: "CLAUDE.md" },
  { id: "codex", name: "OpenAI Codex", source: "adapters/codex/AGENTS.md.example", target: "AGENTS.md" },
  { id: "cursor", name: "Cursor", source: "adapters/cursor/maverick.mdc.example", target: ".cursor/rules/maverick.mdc" },
  { id: "copilot", name: "GitHub Copilot", source: "adapters/copilot/copilot-instructions.md.example", target: ".github/copilot-instructions.md" },
  { id: "gemini", name: "Gemini CLI", source: "adapters/gemini/GEMINI.md.example", target: "GEMINI.md" },
  { id: "antigravity", name: "Google Antigravity", source: "adapters/antigravity/maverick.md.example", target: ".agents/rules/maverick.md" },
  { id: "windsurf", name: "Windsurf / Devin Desktop", source: "adapters/windsurf/maverick.md.example", target: ".windsurf/rules/maverick.md" },
  { id: "kiro", name: "Kiro", source: "adapters/kiro/maverick.md.example", target: ".kiro/steering/maverick.md" },
  { id: "opencode", name: "OpenCode", source: "adapters/codex/AGENTS.md.example", target: "AGENTS.md" },
  { id: "generic", name: "Any other tool", source: "adapters/generic/ROLE_PROMPT.txt", target: ".maverick/ROLE_PROMPT.txt" }
];
var instructionAdapter = (id2) => INSTRUCTION_ADAPTERS.find((adapter2) => adapter2.id === id2);

// src/commands/delivery.js
async function learn(cwd, slug, options = {}) {
  await getTask(cwd, slug);
  if (!options.rule || options.rule === true) throw new Error('provide a rule with --rule "..."');
  const dir = join19(cwd, ".maverick"), path = join19(dir, "LEARNINGS.md");
  await mkdir7(dir, { recursive: true });
  const existing = await exists(path) ? await readFile14(path, "utf8") : "# Maverick Learnings\n\nProposed reusable rules. Promote only after team review.\n";
  await writeFile8(path, `${existing}
- [ ] ${options.rule}
  - Source task: \`${slug}\`
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), rule: options.rule }) : `${brand()} / LEARN
\u2713 proposed rule saved: ${rel(cwd, path)}`);
}
async function taskGoal(dir) {
  return sectionBody(await readText(join19(dir, "PRD.md")), "Overview").split("\n\n")[0] || "See PRD.md.";
}
async function handoff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), present = {};
  for (const file of ["EVIDENCE.md", "REVIEW-FINDINGS.md", "SECURITY-REPORT.md", "DEPENDENCY-REVIEW.md", "SCOPE-GUARD.md", "CHECKPOINT.md"]) present[file] = await exists(join19(dir, file));
  const goal = await taskGoal(dir);
  const remaining = Object.entries(present).filter(([, value]) => !value).map(([file]) => file), path = join19(dir, "HANDOFF.md");
  await writeFile8(path, `# Handoff \u2014 ${slug}

## Goal
${goal}

## Workflow
Workflow: ${preset.name}

## Completed evidence
${Object.entries(present).filter(([, value]) => value).map(([file]) => `- \`${file}\``).join("\n") || "- none"}

## Still needed
${remaining.map((file) => `- \`${file}\``).join("\n") || "- Complete human review and PR decision."}

## Next owner
Name/agent: ${options.to || "unassigned"}

## Notes
Read PRD.md, SPEC.md (spec-driven), TECHSPEC.md, the tasks in subtasks/ and the reports listed above before continuing.
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), remaining }) : `${brand()} / HANDOFF
\u2713 handoff: ${rel(cwd, path)}
Remaining reports: ${remaining.length}`);
}
async function adapter(cwd, action, name, options = {}) {
  const ids = INSTRUCTION_ADAPTERS.map((item) => item.id);
  if (action === "list") return output(options.json ? JSON.stringify(ids) : `${brand()} / ADAPTERS
${INSTRUCTION_ADAPTERS.map((item) => `${item.id.padEnd(13)}${item.target}`).join("\n")}`);
  const entry = instructionAdapter(name);
  if (action !== "install" || !entry) throw new Error(`use adapter list or adapter install <${ids.join("|")}>`);
  const destination = join19(cwd, entry.target);
  if (await exists(destination)) throw new Error(`adapter target already exists: ${rel(cwd, destination)}`);
  await mkdir7(dirname4(destination), { recursive: true });
  await copyFile(join19(packageRoot, entry.source), destination);
  output(options.json ? JSON.stringify({ adapter: name, path: rel(cwd, destination) }) : `${brand()} / ADAPTER
\u2713 ${name}: ${rel(cwd, destination)}`);
}
async function ci(cwd, provider, slug, options = {}) {
  if (provider !== "github") throw new Error("only the github CI generator is currently available");
  await getTask(cwd, slug);
  const destination = join19(cwd, ".github", "workflows", `maverick-${slug}.yml`);
  if (await exists(destination)) throw new Error(`CI workflow already exists: ${rel(cwd, destination)}`);
  await mkdir7(dirname4(destination), { recursive: true });
  await writeFile8(destination, replaceVars(await readFile14(join19(packageRoot, "templates", "github-actions-maverick.yml"), "utf8"), { TASK_SLUG: slug }));
  output(options.json ? JSON.stringify({ provider, task: slug, path: rel(cwd, destination) }) : `${brand()} / CI
\u2713 GitHub Actions workflow: ${rel(cwd, destination)}`);
}
async function draftPr(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const evidence = await exists(join19(dir, "EVIDENCE.md")) ? await readFile14(join19(dir, "EVIDENCE.md"), "utf8") : "Verification evidence has not been captured.";
  const findings = await exists(join19(dir, "REVIEW-FINDINGS.md")) ? "Diff review report is available in REVIEW-FINDINGS.md." : "Diff review has not been run.";
  const goal = await taskGoal(dir), path = join19(dir, "PR-DRAFT.md");
  await writeFile8(path, `# PR Draft \u2014 ${slug}

## Summary
${goal}

## Workflow
Workflow: ${preset.name}

## Verification
${evidence.includes("## PASS") ? "Automated verification evidence captured in EVIDENCE.md." : evidence}

## Review
${findings}

## Risks / rollback
${sectionBody(await readText(join19(dir, "TECHSPEC.md")), "Risks and Rollback") || "See TECHSPEC.md."}

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
import { mkdir as mkdir8, readFile as readFile15, readdir as readdir9, writeFile as writeFile9 } from "fs/promises";
import { join as join20 } from "path";
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
async function autoApprove(cwd, [name, state], options) {
  if (name) await findFlow(cwd, name);
  if (name && !["on", "off"].includes(state)) throw new Error(`use flow auto-approve ${name} on|off`);
  const path = join20(cwd, ".maverick", "config.json");
  if (name) {
    const current = await exists(path) ? JSON.parse(await readFile15(path, "utf8")) : { version: 1 };
    const names = new Set(current.flows?.autoApprove || []);
    if (state === "on") names.add(name);
    else names.delete(name);
    const flows2 = { ...current.flows, autoApprove: [...names].sort() };
    if (!flows2.autoApprove.length) delete flows2.autoApprove;
    const next = { ...current, flows: flows2 };
    if (!Object.keys(flows2).length) delete next.flows;
    await mkdir8(join20(cwd, ".maverick"), { recursive: true });
    await writeFile9(path, pretty(next));
  }
  const config = await loadConfig(cwd), { flows } = await loadFlows(cwd), enabled = flows.map((flow) => flow.name).filter((flow) => autoApproves(config, flow));
  if (options.json) return output(JSON.stringify({ autoApprove: enabled }));
  if (name) return output(`${brand()} / FLOW AUTO-APPROVE
\u2713 ${name}: auto-approval ${state}; written to ${rel(cwd, path)}
${state === "on" ? "Pending approvals are approved once every blocking check passes. Commit this file so the team reviews the decision." : "A human records every approval again."}`);
  return output(`${brand()} / FLOW AUTO-APPROVE
${enabled.length ? enabled.map((flow) => `${flow.padEnd(14)}on`).join("\n") : "No flow approves itself: a human records every approval."}

Change with: maverick flow auto-approve <flow> on|off, or once with: maverick flow run <flow> <task> --auto-approve`);
}
async function flowCommand(cwd, [action, ...args], options = {}) {
  if (!action || action === "list") {
    const { flows, errors } = await loadFlows(cwd);
    if (options.json) return output(JSON.stringify({ flows: flows.map(({ name, description, source, contract, gates }) => ({ name, description, source, contract, gates: gates.map((gate2) => gate2.id) })), errors }, null, 2));
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
    const [name, slug] = args, flow = await findFlow(cwd, name), { dir } = await getTask(cwd, slug), config = await loadConfig(cwd);
    const invoke = async (argv) => (await import("./cli-DTJYT7AP.js")).main(argv, cwd);
    const agentRuns = [];
    const autoApprove2 = Boolean(options.autoApprove);
    let result = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow, { reset: Boolean(options.reset), autoApprove: autoApprove2 });
    report(cwd, flow, slug, result, options);
    await afterFlowHook(cwd, config, flow, slug, result);
    while (options.agent && result.run.outcome === "revise") {
      const issues = result.run.results.filter((item) => item.severity === "block" && item.status === "fail").flatMap((item) => item.issues.map((issue) => `${item.id}: ${issue}`));
      if (!options.json) output(`
${brand()} / AGENT FIX (iteration ${result.run.iteration}/${flow.contract.iterationCap})`);
      const { run: agent } = await startAgentRun(cwd, { slug, dir, config, issues, instruction: `Fix the blocking issues so the "${flow.name}" flow passes. Goal: ${interpolate(flow.contract.goal, { task: slug })}`, options, onEvent: printer(options) });
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
      result = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow, { autoApprove: autoApprove2 });
      report(cwd, flow, slug, result, options);
      await afterFlowHook(cwd, config, flow, slug, result);
    }
    if (options.json) output(JSON.stringify({ flow: flow.name, task: slug, outcome: result.run.outcome, iteration: result.run.iteration, iterationCap: flow.contract.iterationCap, next: result.next, notes: result.notes, report: rel(cwd, result.reportPath), gates: result.run.results, agentRuns }, null, 2));
    if (result.run.outcome !== "done") throw new Error(`flow ${flow.name} outcome: ${result.run.outcome}`);
    return;
  }
  if (action === "status") {
    const [slug] = args, { dir } = await getTask(cwd, slug);
    const files = (await readdir9(join20(dir, "flows")).catch(() => [])).filter((file) => file.endsWith(".json"));
    const states = await Promise.all(files.map((file) => readState(dir, file.replace(/\.json$/, ""))));
    const summary = states.map((state) => ({ flow: state.flow, status: state.status || "not run", runs: state.runs.length, lastRun: state.runs.at(-1)?.at, approvals: state.approvals }));
    if (options.json) return output(JSON.stringify(summary, null, 2));
    return output(summary.length ? summary.map((item) => `${item.flow.padEnd(14)}${item.status.padEnd(18)}${item.runs} run(s)${item.lastRun ? `, last ${item.lastRun}` : ""}`).join("\n") : `No flows have run for ${slug}. Try: maverick flow run ship ${slug}`);
  }
  if (action === "approve") {
    const [name, slug, gateId] = args, flow = await findFlow(cwd, name), { dir } = await getTask(cwd, slug);
    if (options.reject && (!options.reason || options.reason === true)) throw new Error('explain the rejection with --reason "..."');
    const { approval, run: run2, next } = await recordApproval({ cwd, task: slug, taskDir: dir }, flow, gateId, { decision: options.reject ? "reject" : "approve", by: typeof options.by === "string" ? options.by : process.env.USER || "human", ...typeof options.reason === "string" && { reason: options.reason } });
    if (options.json) return output(JSON.stringify({ ...approval, outcome: run2?.outcome || null }));
    return output(`${brand()} / FLOW APPROVAL
\u2713 ${gateId}: ${approval.decision} by ${approval.by}
${run2 ? `Outcome: ${run2.outcome.toUpperCase()}
${next}` : `Run maverick flow run ${flow.name} ${slug} to re-evaluate.`}`);
  }
  if (action === "auto-approve") return autoApprove(cwd, args, options);
  throw new Error("use flow list, flow show <flow>, flow validate, flow run <flow> <task> [--auto-approve], flow status <task>, flow approve <flow> <task> <gate>, or flow auto-approve [<flow> on|off]");
}
var progress = (item) => item.checklist?.total ? `  ${item.checklist.done}/${item.checklist.total}` : "";
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
File: ${rel(cwd, join20(dir, "subtasks", created.file))}`);
  }
  if (action === "set") {
    const [id2, status2] = args;
    const item = await setStatus(dir, slug, (id2 || "").padStart(2, "0"), status2, { force: Boolean(options.force) });
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
    const lines = [...inProgress.flatMap((item) => [`IN PROGRESS ${item.id} ${item.title}${progress(item)}`, ...item.checklist.open.map((entry) => `              - [ ] ${entry.section ? `${entry.section}: ` : ""}${entry.text}`)]), ...ready.map((item) => `READY       ${item.id} ${item.title}${item.type ? ` [${item.type}]` : ""}`)];
    return output(lines.join("\n") || "Nothing is ready: remaining subtasks are blocked or waiting on dependencies.");
  }
  const counts = Object.fromEntries(STATUSES.map((status2) => [status2, graph.items.filter((item) => item.status === status2).length]));
  if (options.json) return output(JSON.stringify({ counts, items: graph.items.map(({ body: _body, ...item }) => item) }, null, 2));
  if (!graph.items.length) return output(`No subtasks yet. Add one with: maverick subtask add ${slug} "<title>"`);
  output(`${brand()} / SUBTASKS ${slug}

${graph.items.map((item) => `${item.id}  ${item.status.padEnd(12)}${item.ready ? "\u25B6 " : "  "}${item.title}${progress(item)}${item.dependsOn.length ? `  (after ${item.dependsOn.join(", ")})` : ""}${item.type ? ` [${item.type}]` : ""}`).join("\n")}

${counts.done}/${graph.items.length} done \xB7 \u25B6 ready to start`);
}
var flowCommands = [
  { id: "flow", description: "Run contract-driven flows with typed gates, iteration caps, and stall detection.", aliases: [], usage: "flow list|show|validate|run <flow> <task> [--auto-approve]|status <task>|approve|auto-approve [<flow> on|off]", run: ({ cwd, rest, options }) => flowCommand(cwd, rest, options) },
  { id: "subtask", description: "Break a task into a dependency graph of subtasks.", aliases: [], usage: "subtask add|list|next|set|validate <task> [set: <id> <status> [--force]]", run: ({ cwd, rest, options }) => subtaskCommand(cwd, rest, options) }
];

// src/commands/gates.js
import { mkdir as mkdir9, readFile as readFile16, writeFile as writeFile10 } from "fs/promises";
import { join as join21 } from "path";
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
  const { dir, preset, config } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || "HEAD"), files = changedFilesFromDiff(diff), findings = [];
  if (await lacksGitBaseline(cwd)) findings.push("No git baseline: git tracks no file in this project; commit it before the task starts so the diff shows only the task.");
  else if (!diff) findings.push("No git diff found against the selected base.");
  if (files.some((file) => /(^|\/)(\.env|secrets?|credentials?)/i.test(file))) findings.push("Security: sensitive-looking path changed; confirm secrets and PII were not included.");
  if (files.some((file) => LOCKFILE.test(file))) findings.push("Dependencies: lockfile changed; review new packages, licenses, and vulnerabilities.");
  if (preset.strict && !await exists(join21(dir, "EVIDENCE.md"))) findings.push("Strict workflow: test evidence is missing; run maverick verify first.");
  const graph = files.length ? await buildGraph(cwd) : null;
  const radius = graph ? files.map((file) => ({ file, ...impactOf(graph, file) })).filter((item) => item.known && item.dependents.length).sort((a, b) => b.dependents.length - a.dependents.length) : [];
  const path = join21(dir, "REVIEW-FINDINGS.md"), created = await ensureReview(dir, slug, config);
  await writeFile10(path, `# Diff Review Findings \u2014 ${slug}

Base: ${options.against || "HEAD"}
Changed files:
${files.map((file) => `- \`${file}\``).join("\n") || "- none"}

## Findings
${findings.map((finding) => `- ${finding}`).join("\n") || "- No automated findings. Complete the human review in REVIEW.md."}

## Blast radius
${radius.map((item) => `- \`${item.file}\`: ${item.direct.length} direct / ${item.dependents.length} transitive dependents; tests: ${item.tests.slice(0, 5).map((test) => `\`${test}\``).join(", ") || "none"}`).join("\n") || "- Changed files have no local dependents."}
`);
  output(options.json ? JSON.stringify({ files, findings, path: rel(cwd, path), review: rel(cwd, join21(dir, "REVIEW.md")) }, null, 2) : `${brand()} / REVIEW
Changed files: ${files.length}
Findings: ${findings.length}
Report: ${rel(cwd, path)}
${created ? "\u2713 written" : "Decide in"}: ${rel(cwd, join21(dir, "REVIEW.md"))}`);
}
var REVIEW_TEXT = {
  en: { criteria: "The change does what PRD.md describes.", tasks: "Every planned change is present.", checks: ["Scope: the diff stays within TECHSPEC.md File References, with no drive-by refactors.", "Tests: new behavior is tested, and no test was weakened to pass.", "Security: inputs are validated, authorization is preserved, and no secrets or PII were added.", "Dependencies: new, updated or removed packages are justified.", "Rollback: the plan in TECHSPEC.md still holds."], findings: "Read REVIEW-FINDINGS.md, then record what matters here.", decision: ["approve", "approve with follow-up", "request changes"], explain: "In your own words, why this change is safe to merge." },
  "pt-BR": { criteria: "A mudan\xE7a faz o que o PRD.md descreve.", tasks: "Toda mudan\xE7a planejada est\xE1 presente.", checks: ["Escopo: o diff fica dentro das Refer\xEAncias de Arquivos do TECHSPEC.md, sem refatora\xE7\xF5es de passagem.", "Testes: o comportamento novo est\xE1 testado e nenhum teste foi enfraquecido para passar.", "Seguran\xE7a: entradas s\xE3o validadas, a autoriza\xE7\xE3o \xE9 preservada e nenhum segredo ou dado pessoal foi adicionado.", "Depend\xEAncias: pacotes novos, atualizados ou removidos est\xE3o justificados.", "Rollback: o plano do TECHSPEC.md continua v\xE1lido."], findings: "Leia o REVIEW-FINDINGS.md e registre aqui o que importa.", decision: ["approve (aprovar)", "approve with follow-up (aprovar com ressalvas)", "request changes (pedir mudan\xE7as)"], explain: "Com suas palavras, por que esta mudan\xE7a \xE9 segura para o merge." },
  es: { criteria: "El cambio hace lo que describe PRD.md.", tasks: "Cada cambio planificado est\xE1 presente.", checks: ["Alcance: el diff se mantiene dentro de las Referencias de Archivos de TECHSPEC.md, sin refactorizaciones de paso.", "Pruebas: el comportamiento nuevo est\xE1 probado y ninguna prueba se debilit\xF3 para pasar.", "Seguridad: las entradas se validan, la autorizaci\xF3n se preserva y no se a\xF1adieron secretos ni datos personales.", "Dependencias: los paquetes nuevos, actualizados o eliminados est\xE1n justificados.", "Rollback: el plan de TECHSPEC.md sigue siendo v\xE1lido."], findings: "Lee REVIEW-FINDINGS.md y registra aqu\xED lo importante.", decision: ["approve (aprobar)", "approve with follow-up (aprobar con seguimiento)", "request changes (pedir cambios)"], explain: "Con tus palabras, por qu\xE9 este cambio es seguro para el merge." }
};
async function ensureReview(dir, slug, config) {
  const path = join21(dir, "REVIEW.md");
  if (await exists(path)) return false;
  const docs = projectLanguage(config).docs, text = REVIEW_TEXT[docs.startsWith("pt") ? "pt-BR" : docs.startsWith("es") ? "es" : "en"], h = (name) => heading(name, docs);
  const prd = await readText(join21(dir, "PRD.md")), graph = await loadGraph(dir);
  const criteria = sectionBody(prd, "Acceptance Criteria").split("\n").filter((line) => acIds(line).length).map((line) => `- [ ] ${line.replace(/^\s*-\s*(\[[ xX]\]\s*)?/, "")}`);
  const tasks = graph.items.map((item) => `- [ ] ${item.id} ${item.title} (${item.status})`);
  await writeFile10(path, `# Review \u2014 ${slug}

## ${h("Acceptance Criteria")}
${criteria.join("\n") || `- [ ] ${text.criteria}`}

## ${h("Tasks")}
${tasks.join("\n") || `- [ ] ${text.tasks}`}

## ${h("Checks")}
${text.checks.map((check) => `- [ ] ${check}`).join("\n")}

## ${h("Findings")}
${text.findings}

## ${h("Decision")}
${text.decision.map((option) => `- [ ] ${option}`).join("\n")}

## ${h("Human Explanation")}
${text.explain}
`);
  return true;
}
async function checkpoint(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const [status2, diff] = await Promise.all([executeCommand(cwd, "git status --short -- ."), gitDiff(cwd, options.against || "HEAD")]);
  const path = join21(dir, "CHECKPOINT.md");
  await writeFile10(path, `# Checkpoint \u2014 ${slug}

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
  const sources = /* @__PURE__ */ new Map(), graph = await buildGraph(cwd, { sources }), result = impactOf(graph, target);
  const touched = /* @__PURE__ */ new Set([target, ...result.dependents.map((item) => item.id)]);
  const routes = result.known ? (await extractRoutes(cwd, { sources: new Map(sources), resolve: await createResolver(cwd, graph.files, sources) })).filter((route) => touched.has(route.file)) : [];
  const references = result.known ? [] : await findReferences(cwd, target);
  const payload = { path: target, inGraph: result.known, direct: result.direct, dependents: result.dependents, tests: result.tests, routes: routes.map(({ kind, method, path: path2, file, line }) => ({ kind, method, path: path2, file, line })), references, count: result.known ? result.dependents.length : references.length, truncated: !result.known && references.length === 40 };
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

Entry points affected: ${routes.length}
${routes.slice(0, 20).map((route) => `- ${route.method} ${route.path} (${route.file}:${route.line})`).join("\n") || "- none"}${routes.length > 20 ? `
\u2026 ${routes.length - 20} more` : ""}

Tests to run:
${result.tests.map((file) => `- ${file}`).join("\n") || "- none import it; consider adding one"}`);
}
async function guardScope(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const spec = await readText(join21(dir, "TECHSPEC.md")), graph = await loadGraph(dir);
  const [diff, noBaseline] = await Promise.all([gitDiff(cwd, options.against || "HEAD"), lacksGitBaseline(cwd)]), changed = changedFilesFromDiff(diff);
  const expected = [...new Set(pathReferences([sectionBody(spec, "File References"), sectionBody(spec, "Impact"), ...graph.items.map((item) => sectionBody(item.body, "Files"))].join("\n"), { includeNew: true }))];
  const outsideScope = expected.length ? changed.filter((file) => !expected.includes(file)) : [];
  const maxFiles = config.maxChangedFilesGuideline || 8;
  const findings = [noBaseline ? "No git baseline: git tracks no file in this project, so its changes cannot be told apart. Commit the project (or run it from its own repository) before the task starts." : null, changed.length > maxFiles ? `Change budget exceeded: ${changed.length}/${maxFiles} files.` : null, ...outsideScope.map((file) => `Not in TECHSPEC.md File References or any task: ${file}`)].filter(Boolean);
  const report2 = join21(dir, "SCOPE-GUARD.md");
  await writeFile10(report2, `# Scope Guard \u2014 ${slug}

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
  await writeFile10(path, `# Merge Readiness \u2014 ${slug}

Workflow: ${preset.name}
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
    await writeFile10(path, await readFile16(join21(packageRoot, "templates", "policy.json"), "utf8"));
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
  if (sensitive.length && preset.id !== rules.requiredWorkflowForSensitivePaths) findings.push(`Sensitive paths require the ${rules.requiredWorkflowForSensitivePaths} workflow: ${sensitive.join(", ")}.`);
  const report2 = join21(taskDir, "POLICY-CHECK.md");
  await writeFile10(report2, `# Policy Check \u2014 ${slug}

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
  await writeFile10(path, `# Security Scan \u2014 ${slug}

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
  await writeFile10(path, `# Dependency Review \u2014 ${slug}

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
async function showReview(cwd, slug) {
  const { dir, config } = await getTask(cwd, slug), created = await ensureReview(dir, slug, config);
  output(`Review: ${rel(cwd, join21(dir, "REVIEW.md"))}${created ? " (written from PRD.md and the tasks)" : ""}`);
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
  { id: "review", description: "Show review or review a diff.", aliases: [], usage: "review <task> --diff", run: ({ cwd, arg, options }) => options.diff ? reviewDiff(cwd, arg, options) : showReview(cwd, arg) }
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
  const lines = [`${brand()} / GRAPH`, "", `Files: ${summary.files} (${summary.tests} test) \xB7 local import edges: ${summary.edges}${summary.dynamicEdges ? ` (${summary.dynamicEdges} lazy)` : ""}`, `Languages: ${languages.map(([name, count2]) => `${name} ${count2}`).join(", ") || "none detected"}`, `Health: ${graph.health.score}/100 = ${graph.health.formula}`];
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

Score = commits \xD7 (1 + fan-in) \xD7 log10(10 + lines). Prefer the strict workflow (maverick new --strict) for changes here.`);
}
var pad = (value, size) => String(value ?? "\u2014").padEnd(size);
var lpad = (value, size) => String(value ?? "\u2014").padStart(size);
async function routesCommand(cwd, options = {}) {
  const report2 = await buildDevtools(cwd);
  const q = typeof options.grep === "string" ? options.grep.toLowerCase() : "";
  const routes = report2.routes.items.filter((route) => (!options.kind || route.kind === options.kind) && (!options.method || route.method === String(options.method).toUpperCase()) && (!q || `${route.method} ${route.path} ${route.handler || ""} ${route.file}`.toLowerCase().includes(q)));
  if (options.json) return output(JSON.stringify({ total: routes.length, insights: report2.routes.insights, routes: routes.map(({ kind, method, path, framework, source, handler, file, line, guards, version, reaches }) => ({ kind, method, path, framework, source, handler, file, line, guards, version, reaches })) }, null, 2));
  const ins = report2.routes.insights;
  const lines = [`${brand()} / ROUTES`, "", `${routes.length} entry point(s) \xB7 ${Object.entries(ins.byKind).map(([kind, count2]) => `${count2} ${kind}`).join(" \xB7 ") || "none found"}`, `Frameworks: ${Object.entries(ins.byFramework).map(([name, count2]) => `${name} ${count2}`).join(", ") || "\u2014"}`, ""];
  for (const route of routes.slice(0, Number(options.limit) || 400)) lines.push(`${pad(route.method, 9)} ${pad(route.path, 44)} ${route.guards?.length ? "\u{1F512} " : ""}${route.file}:${route.line}${route.handler ? `  ${route.handler}` : ""}`);
  if (ins.duplicates.length) lines.push("", "Defined twice:", ...ins.duplicates.map((item) => `  ${item.method} ${item.path} \u2014 ${item.locations.join(", ")}`));
  if (ins.contract.documented) lines.push("", `Contract: ${ins.contract.documented} documented \xB7 ${ins.contract.unimplemented.length} not found in code \xB7 ${ins.contract.undocumented.length} missing from the contract`);
  if (ins.unguardedWrites.length) lines.push("", `Writes without a route-level guard: ${ins.unguardedWrites.length} (verify they are meant to be public)`);
  lines.push("", "Filter with --kind http|page|event|job|graphql|rpc, --method POST or --grep users. Explore them in: maverick lens");
  output(lines.join("\n"));
}
async function couplingCommand(cwd, options = {}) {
  const report2 = await buildDevtools(cwd), arch = report2.architecture;
  if (options.json) return output(JSON.stringify({ health: report2.health, components: arch.components, links: arch.links, cycles: arch.cycles, sdp: arch.sdp, violations: arch.violations, dsm: arch.dsm }, null, 2));
  const lines = [`${brand()} / COUPLING`, "", `Components: ${arch.components.length}${arch.inferred ? " (inferred from the folder layout; set architecture.components to choose them)" : ""}`, "", `${pad("component", 38)} ${lpad("files", 5)} ${lpad("Ca", 4)} ${lpad("Ce", 4)} ${lpad("I", 5)} ${lpad("A", 5)} ${lpad("D", 5)}  zone`];
  for (const c of arch.components) lines.push(`${pad(c.id.length > 38 ? `\u2026${c.id.slice(-37)}` : c.id, 38)} ${lpad(c.files, 5)} ${lpad(c.ca, 4)} ${lpad(c.ce, 4)} ${lpad(c.instability, 5)} ${lpad(c.abstractness, 5)} ${lpad(c.distance, 5)}  ${c.zone ? `zone of ${c.zone}` : ""}`);
  lines.push("", "I = Ce / (Ca + Ce) \xB7 A = abstract types / types \xB7 D = |A + I \u2212 1| (0 is on the main sequence)");
  if (arch.cycles.length) lines.push("", "Component cycles:", ...arch.cycles.map((cycle) => `  ${cycle.loop.join(" \u2192 ")}`));
  if (arch.sdp.length) lines.push("", "Depends on a less stable component (Stable Dependencies Principle):", ...arch.sdp.slice(0, 10).map((link) => `  ${link.from} \u2192 ${link.to} (I ${link.fromInstability} \u2192 ${link.toInstability}, ${link.weight} imports)`));
  if (arch.rules.length) lines.push("", `Boundary rules: ${arch.rules.length} \xB7 violations: ${arch.violations.length}`, ...arch.violations.slice(0, 15).map((item) => `  ${item.from} \u2192 ${item.to} (${item.rule})`));
  lines.push("", `Health: ${report2.health.score}/100 = ${report2.health.formula}`, ...report2.health.deductions.map((item) => `  \u2212${item.points} ${item.rule}: ${item.detail}`));
  output(lines.join("\n"));
}
async function auditCommand(cwd, options = {}) {
  const report2 = await buildDevtools(cwd);
  const rank2 = { high: 0, medium: 1, low: 2 }, floor = rank2[options.severity] ?? 2;
  const findings = report2.findings.filter((item) => rank2[item.severity] <= floor && (!options.category || item.category === options.category));
  if (options.json) return output(JSON.stringify({ health: report2.health, findings }, null, 2));
  const lines = [`${brand()} / AUDIT`, "", `Health ${report2.health.score}/100 \xB7 ${findings.length} finding(s) \xB7 ${["high", "medium", "low"].map((level) => `${findings.filter((item) => item.severity === level).length} ${level}`).join(" \xB7 ")}`, ""];
  for (const item of findings) lines.push(`[${item.severity.toUpperCase()}] ${item.title}`, `  ${item.detail}`, ...item.action ? [`  \u2192 ${item.action}`] : [], "");
  lines.push('Turn one into a task from the Lens Findings view, or: maverick new "<fix the finding>" --strict');
  output(lines.join("\n"));
  if (options.failOn && findings.some((item) => rank2[item.severity] <= (rank2[options.failOn] ?? -1))) process.exitCode = 1;
}
async function mcpCommand(cwd) {
  const { serveMcp } = await import("./server-UBB57VVN.js");
  process.stderr.write(`maverick mcp: serving read-only project intelligence for ${cwd} over stdio
`);
  await serveMcp({ cwd });
}
var intelCommands = [
  { id: "mcp", description: "Serve read-only project intelligence to AI agents over MCP (stdio).", aliases: [], usage: "mcp", run: ({ cwd }) => mcpCommand(cwd) },
  { id: "graph", description: "Analyze the import graph: cycles, hubs, coupling, and health.", aliases: [], usage: "graph [--json] [--format mermaid|dot]", run: ({ cwd, options }) => graphCommand(cwd, options) },
  { id: "hotspots", description: "Rank files by change frequency and dependents.", aliases: [], usage: 'hotspots [--since "6 months ago"]', run: ({ cwd, options }) => hotspotsCommand(cwd, options) },
  { id: "routes", description: "List entry points in any stack: HTTP routes, pages, GraphQL, gRPC, events and jobs.", aliases: ["endpoints"], usage: "routes [--kind http] [--method GET] [--grep users] [--json]", run: ({ cwd, options }) => routesCommand(cwd, options) },
  { id: "coupling", description: "Component coupling: Ca, Ce, instability, abstractness, distance, cycles and boundary rules.", aliases: ["architecture"], usage: "coupling [--json]", run: ({ cwd, options }) => couplingCommand(cwd, options) },
  { id: "audit", description: "Architecture findings with evidence: cycles, hubs, hotspots, hidden coupling, route and contract issues.", aliases: ["findings"], usage: "audit [--severity medium] [--fail-on high] [--json]", run: ({ cwd, options }) => auditCommand(cwd, options) }
];

// src/commands/project.js
import { lstat as lstat2, mkdir as mkdir10, readFile as readFile17, readlink as readlink2, rename, rm as rm3, symlink as symlink2, writeFile as writeFile11 } from "fs/promises";
import { join as join22 } from "path";
import { execFileSync } from "child_process";
function environmentLanguage() {
  try {
    return normalizeLanguage((process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "").split(".")[0]);
  } catch {
    return "en";
  }
}
var ALIASES = { claude: "claude-code", "claude-code": "claude-code", openai: "codex", "github-copilot": "copilot", devin: "windsurf", "google-antigravity": "antigravity", "open-code": "opencode" };
var INSTRUCTION_LINKS = { "claude-code": "CLAUDE.md", gemini: "GEMINI.md" };
function parseAgents(answer) {
  const values = String(answer).split(/[\s,]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (values.includes("all")) return ADAPTERS.map((adapter2) => adapter2.id);
  const ids = values.map((value) => /^\d+$/.test(value) ? ADAPTERS[Number(value) - 1]?.id : ALIASES[value] || value);
  const unknown = values.filter((value, index) => !ADAPTERS.some((adapter2) => adapter2.id === ids[index]));
  if (unknown.length) throw new Error(`unknown agent ${unknown.join(", ")}; use ${ADAPTERS.map((adapter2) => adapter2.id).join(", ")} or all`);
  return [...new Set(ids)];
}
async function suggestedAgents(cwd, config) {
  const found = /* @__PURE__ */ new Set([...(await detectAdapters(cwd)).map((adapter2) => adapter2.id), ...installedAgents(cwd, config).map((agent) => agent.id)]);
  return ADAPTERS.filter((adapter2) => found.has(adapter2.id)).map((adapter2) => adapter2.id);
}
async function interview(cwd, map, options) {
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes && !process.env.CI;
  const flag = (key) => typeof options[key] === "string" ? options[key] : void 0;
  const suggested = await suggestedAgents(cwd, defaultConfig), detected = map.commands.map((item) => item.command);
  const given = {
    name: flag("name"),
    description: flag("description"),
    agents: flag("agents") === void 0 ? void 0 : parseAgents(flag("agents")),
    docs: flag("docsLanguage"),
    code: flag("codeLanguage"),
    workflow: flag("workflow"),
    verify: flag("verify") === void 0 ? void 0 : flag("verify").split(";").map((item) => item.trim()).filter(Boolean)
  };
  let answers = { name: map.name || "my-project", description: "", agents: suggested, docs: "en", code: "en", workflow: defaultConfig.workflow.default, verify: detected };
  if (interactive) {
    const { wizardSteps } = await import("./init-wizard-CEQKR4VP.js");
    const { runInitWizard } = await import("./InitScreen-NX4535CJ.js");
    const skip = Object.keys(given).filter((key) => given[key] !== void 0);
    const steps = wizardSteps({ name: answers.name, adapters: ADAPTERS, suggested, docs: environmentLanguage(), commands: detected, skip });
    const chosen = await runInitWizard({ steps, detected: [map.language, map.framework].filter((value) => value && value !== "unknown").join(" \xB7 ") });
    if (!chosen) throw new Error("init cancelled; nothing was written");
    answers = { ...answers, ...chosen };
  }
  answers = { ...answers, ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== void 0)) };
  if (!PRESET_IDS.includes(answers.workflow)) throw new Error(`unknown workflow ${answers.workflow}; use ${PRESET_IDS.join(" or ")}`);
  const same = answers.verify.length === detected.length && answers.verify.every((command, at) => command === detected[at]);
  return {
    name: answers.name.trim(),
    description: answers.description.trim(),
    agents: answers.agents,
    workflow: answers.workflow,
    language: { docs: normalizeLanguage(answers.docs), code: normalizeLanguage(answers.code) },
    commands: same ? void 0 : answers.verify
  };
}
function renderAgentsFile(answers, map) {
  const commands2 = answers.commands?.map((command) => `- \`${command}\``) || map.commands.map((item) => `- ${item.name}: \`${item.command}\`${item.cwd ? ` (in \`${item.cwd}/\`)` : ""}`);
  return `# ${answers.name}

${answers.description || "Describe what this project does and for whom."}

## Stack
- Languages: ${map.language}
- Frameworks: ${map.framework || "not detected"}
- Package managers: ${map.packageManagers?.join(", ") || "not detected"}

## Verification
${commands2.join("\n") || "- Declare the commands in `.maverick/config.json` under `verification.commands`."}

## How we work
This project uses Maverick AI. Start every change with \`maverick new "<idea>"\` and follow the flow skills (\`maverick-new\`, \`maverick-build\`, \`maverick-review\`, \`maverick-ship\`).
Shared skills, agents and commands live in \`${SHARED.root}/\` and are linked into each AI tool; change them there, or with \`maverick add\`.

- ${languageRule(answers.language)}
`;
}
async function writeInstructions(cwd, answers, map) {
  const lines = [], main = join22(cwd, "AGENTS.md");
  const files = [...new Set(answers.agents.map((id2) => INSTRUCTION_LINKS[id2]).filter(Boolean))];
  if (!await exists(main)) {
    const existing = [];
    for (const file of files) if ((await lstat2(join22(cwd, file)).catch(() => null))?.isFile()) existing.push(file);
    if (existing.length) {
      await rename(join22(cwd, existing[0]), main);
      lines.push(`\u2713 ${existing[0]} moved to AGENTS.md, so every agent reads the same instructions`);
    } else {
      await writeFile11(main, renderAgentsFile(answers, map));
      lines.push("\u2713 AGENTS.md written from the interview");
    }
  }
  for (const file of files) {
    const path = join22(cwd, file), stat2 = await lstat2(path).catch(() => null);
    if (stat2?.isSymbolicLink()) {
      if (await readlink2(path) !== "AGENTS.md") lines.push(`\xB7 ${file} links elsewhere; left as is`);
      continue;
    }
    if (stat2) {
      if (!(await readFile17(path)).equals(await readFile17(main))) {
        lines.push(`\xB7 ${file} differs from AGENTS.md; left as is. Merge it into AGENTS.md, delete it and run maverick init --agents ${answers.agents.join(",")} to link it`);
        continue;
      }
      await rm3(path);
    }
    try {
      await symlink2("AGENTS.md", path, "file");
      lines.push(`\u2713 ${file} \u21E2 AGENTS.md`);
    } catch (error) {
      lines.push(`WARN could not link ${file} to AGENTS.md: ${error.code || error.message}`);
    }
  }
  return lines;
}
async function installFor(cwd, config, agents) {
  if (!agents.length) return ["No AI agent chosen; add them later with: maverick init --agents claude-code,kiro"];
  const result = await installFlowSkills(cwd, config, agents.join(","));
  const where = layoutFor(config) === "linked" ? ` (${SHARED.root}/skills, linked into each tool)` : "";
  return [`\u2713 flow skills ${result.installed.length ? "installed" : "already installed"} for ${agents.join(", ")}${where}`, ...result.warnings.map((warning) => `WARN ${warning}`)];
}
async function addAgents(cwd, path, options) {
  const current = JSON.parse(await readFile17(path, "utf8")), agents = parseAgents(options.agents);
  const targets = [.../* @__PURE__ */ new Set([...current.capabilities?.targets || [], ...agents])];
  const next = { ...current, capabilities: { ...current.capabilities, targets } };
  await writeFile11(path, pretty(next));
  const config = await loadConfig(cwd), lines = [`${brand()} / INIT
\u2713 agents: ${targets.join(", ")}`];
  if (!options.noSkills) lines.push(...await installFor(cwd, config, targets));
  if (!options.noInstructions) lines.push(...await writeInstructions(cwd, { name: current.project?.name || "Project", description: current.project?.description, agents, language: projectLanguage(config), commands: void 0 }, await inspectProject(cwd)));
  output(lines.join("\n"));
}
async function initProject(cwd, options = {}) {
  const dir = join22(cwd, ".maverick"), path = join22(dir, "config.json");
  if (await exists(path)) {
    if (typeof options.agents === "string") return addAgents(cwd, path, options);
    throw new Error(`configuration already exists: ${rel(cwd, path)}; add agents with maverick init --agents <ids>, change the languages with maverick language`);
  }
  const map = await inspectProject(cwd), answers = await interview(cwd, map, options);
  await mkdir10(dir, { recursive: true });
  const config = {
    ...defaultConfig,
    language: answers.language,
    workflow: { default: answers.workflow },
    project: { name: answers.name, ...answers.description && { description: answers.description }, language: map.languages[0] || "", framework: map.frameworks[0] || "" },
    ...answers.description && { authoring: { context: answers.description } },
    ...answers.commands && { verification: { commands: answers.commands } },
    capabilities: { targets: answers.agents, layout: layoutFor({}) }
  };
  await writeFile11(path, pretty(config));
  const lines = [`${brand()}
\u2713 project initialized: ${rel(cwd, path)}${map.languages.length ? `
Detected stack: ${map.language}` : ""}
Documents: ${languageName(answers.language.docs)} \xB7 code: ${languageName(answers.language.code)} \xB7 workflow: ${answers.workflow}`];
  if (!options.noSkills) lines.push(...await installFor(cwd, config, answers.agents));
  if (!options.noInstructions) lines.push(...await writeInstructions(cwd, answers, map));
  lines.push('Next: maverick new "<what you want to build>"');
  output(lines.join("\n"));
}
async function languageCommand(cwd, [docsArg, codeArg], options = {}) {
  const path = join22(cwd, ".maverick", "config.json");
  const current = await exists(path) ? JSON.parse(await readFile17(path, "utf8")) : { version: 1 };
  const docs = typeof options.docs === "string" ? options.docs : docsArg, code = typeof options.code === "string" ? options.code : codeArg;
  if (docs || code) {
    const language2 = { ...projectLanguage(current), ...docs && { docs: normalizeLanguage(docs) }, ...code && { code: normalizeLanguage(code) } };
    await mkdir10(join22(cwd, ".maverick"), { recursive: true });
    await writeFile11(path, pretty({ ...current, language: language2 }));
    current.language = language2;
  }
  const language = projectLanguage(await loadConfig(cwd));
  if (options.json) return output(JSON.stringify({ ...language, rule: languageRule(language) }, null, 2));
  output(`${brand()} / LANGUAGE
${docs || code ? "\u2713 saved to .maverick/config.json\n" : ""}Documents (PRD, spec, tasks, review): ${languageName(language.docs)}
Code (identifiers, comments, tests, commits): ${languageName(language.code)}
Change with: maverick language <docs> [code], e.g. maverick language pt-BR en`);
}
async function mapProject(cwd, options = {}) {
  const map = await inspectProject(cwd), dir = join22(cwd, ".maverick", "context"), path = join22(dir, "PROJECT_MAP.md");
  await mkdir10(dir, { recursive: true });
  await writeFile11(path, renderProjectMap(map));
  if (options.json) return output(JSON.stringify({ ...map, path: rel(cwd, path) }, null, 2));
  output(`${brand()} / MAP
\u2713 project map: ${rel(cwd, path)}
Detected ${map.commands.length} verification command(s) and ${map.directories.length} top-level area(s).`);
}
async function showStack(cwd, options = {}) {
  const [map, config] = await Promise.all([inspectProject(cwd), loadConfig(cwd)]);
  const selected = selectVerificationCommands(map.stack, config);
  if (options.json) return output(JSON.stringify({ ...map.stack, verification: selected }, null, 2));
  const stack = map.stack, pad2 = (value, width) => String(value).padEnd(width);
  const lines = [`${brand()} / STACK`, "", `Languages:  ${map.language}`, `Frameworks: ${map.framework || "not detected"}`, "", "Ecosystems:"];
  lines.push(...stack.ecosystems.map((item) => `  ${pad2(item.id, 9)} ${pad2(item.packageManager, 12)} ${item.manifests.join(", ")}`), ...stack.ecosystems.length ? [] : ["  none detected at the root"]);
  if (stack.runners.length) lines.push("", "Task runners:", ...stack.runners.map((item) => `  ${pad2(item.id, 9)} ${item.file}`));
  if (stack.subprojects.length) lines.push("", "Subprojects:", ...stack.subprojects.map((item) => `  ${pad2(`${item.path}/`, 18)} ${item.ecosystems.map((e) => e.id).concat(item.runners.map((r) => r.id)).join(", ")}`));
  lines.push("", "Verification (maverick verify):", ...selected.map((item) => `  ${pad2(item.name, 10)} ${item.command}${item.cwd ? `  (in ${item.cwd}/)` : ""}  [${item.source}]`));
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
  const tasks = await listTasks(cwd);
  if (options.json) return output(JSON.stringify(tasks.map(({ stages: _stages, ...task }) => task), null, 2));
  if (!tasks.length) return output(`${brand()} / STATUS
No tasks yet. Start one with: maverick new "<what you want to build>"`);
  output([`${brand()} / STATUS`, "", ...tasks.flatMap((task) => [...renderTaskStatus(task), ""]), style.gray(`${tasks.length} task(s) \xB7 --json for machine-readable output`)].join("\n"));
}
function renderTaskStatus(task) {
  const current = task.stages.indexOf(task.stage);
  const step = (stage2, index) => index < current ? `${style.green("\u2714")} ${style.gray(stage2)}` : index === current ? style.brand(`\u25CF ${stage2.toUpperCase()}`) : style.dim(`\u25CB ${stage2}`);
  const progress2 = task.tasks.total ? `  ${style.amber(`${task.tasks.done}/${task.tasks.total} tasks`)}` : "";
  return [
    `${style.text(task.task)}  ${style.gray(task.workflow)}${progress2}`,
    `  ${task.stages.map(step).join(style.gray("  \u203A  "))}`,
    `  ${style.gray("Next:")} ${task.next.replace(/\bmaverick(?: (?:[a-z<[][^\s;,)]*|--[\w-]+))+/g, (hint) => style.cyan(hint))}`
  ];
}
function gitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function insideGitRepository(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() === "true";
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
    ["Git repository", insideGitRepository(cwd)],
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
  const fixes = checks.filter(([, ok]) => !ok).map(([name, , detail]) => `Add or configure: ${name}${detail ? ` (${detail})` : ""}`);
  if (options.json) return output(JSON.stringify({ checks: checks.map(([name, ok, detail]) => ({ name, ok, ...detail && { detail } })), fixes }, null, 2));
  for (const [name, ok, detail] of checks) output(`${ok ? "PASS" : "WARN"} ${name}${detail && (name === "Stack detected" || !ok) ? ` \u2014 ${detail}` : ""}`);
  if (options.fix) output(`Suggested fixes:
${fixes.map((fix) => `- ${fix}`).join("\n") || "- No fixes needed."}`);
  output(`Default workflow: ${config?.workflow.default || "unknown"}
No telemetry is collected by Maverick.`);
}
async function lens(cwd, options = {}) {
  const { startLens } = await import("./server-XEE5KW4J.js");
  const port = Number(options.port || 4173), host = options.host || "127.0.0.1";
  const server = await startLens({ cwd, host, port, watch: !options.noWatch });
  const address = `http://${host}:${port}`;
  if (options.json) output(JSON.stringify({ address, host, port, watch: !options.noWatch }));
  else output(`${brand()} / LENS

\u2713 project indexed
\u2713 tasks indexed
\u2713 specs indexed
\u2713 docs indexed
\u2713 git state indexed

Open:
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
  if (options.json) return output(JSON.stringify({ name: "@maverick-ai/cli", version: packageVersion }));
  output(`${brand()} / INFO
Version ${packageVersion}
AI-powered developer workspace. Understand. Build. Debug. Ship.
A vendor-neutral engineering workflow. No telemetry by default.`);
}
var projectCommands = [
  { id: "lens", description: "Open Maverick Lens, the local project-intelligence view.", aliases: ["dashboard", "dash"], usage: "lens --open", run: ({ cwd, options }) => lens(cwd, options) },
  { id: "init", description: "Interview the project, then set up Maverick and the flow skills for every AI agent (shared in .agents/, linked into each tool).", aliases: [], usage: 'init [--agents claude-code,kiro,codex] [--description "..."] [--docs-language pt-BR] [--code-language en] [--workflow strict] [--verify "npm test"] [--no-skills] [--no-instructions] [--yes]', run: ({ cwd, options }) => initProject(cwd, options) },
  { id: "language", description: "Show or set the language of the flow documents and of the code.", aliases: ["lang"], usage: "language [<docs> [<code>]] [--docs pt-BR] [--code en]", run: ({ cwd, rest, options }) => languageCommand(cwd, rest, options) },
  { id: "map", description: "Build a repository context map.", aliases: [], usage: "map [--json]", run: ({ cwd, options }) => mapProject(cwd, options) },
  { id: "stack", description: "Detect languages, frameworks, and verification commands.", aliases: [], usage: "stack [--json]", run: ({ cwd, options }) => showStack(cwd, options) },
  { id: "config", description: "Show, validate, or locate layered configuration.", aliases: [], usage: "config show|validate|path", run: ({ cwd, arg, options }) => configCommand(cwd, arg, options) },
  { id: "doctor", description: "Inspect local setup, toolchains, and project checks.", aliases: [], usage: "doctor [--fix]", run: ({ cwd, options }) => doctor(cwd, options) },
  { id: "status", description: "Show task stage and pending gates.", aliases: [], usage: "status [--json]", run: ({ cwd, options }) => status(cwd, options) },
  { id: "info", description: "Show Maverick information.", aliases: ["version", "--version", "-v"], usage: "info", run: ({ options }) => info(options) }
];

// src/commands/task.js
import { readFile as readFile18, writeFile as writeFile12 } from "fs/promises";
import { join as join23 } from "path";
async function taskPacket(cwd, slug, options = {}) {
  const { dir, preset, meta } = await getTask(cwd, slug);
  const mapPath = join23(cwd, ".maverick", "context", "PROJECT_MAP.md"), contents = [];
  if (await exists(mapPath)) contents.push(`## PROJECT_MAP.md

${await readFile18(mapPath, "utf8")}`);
  for (const { file } of ARTIFACTS) if (await exists(join23(dir, file))) contents.push(`## ${file}

${await readFile18(join23(dir, file), "utf8")}`);
  const graph = await loadGraph(dir);
  if (graph.items.length) contents.push(`## Tasks

${graph.items.map((item) => `- ${item.id} ${item.title} (${item.status}${item.dependsOn.length ? `, after ${item.dependsOn.join(", ")}` : ""})`).join("\n")}`);
  const path = join23(dir, "TASK-PACKET.md");
  await writeFile12(path, `# Maverick Task Packet

Idea: ${meta.idea || slug}
Workflow: ${preset.name}
Agent: ${options.agent || "generic"}

Follow repository instructions, stay within the PRD and technical spec, run relevant verification, and leave findings for human review.

${contents.join("\n\n")}`);
  output(options.json ? JSON.stringify({ workflow: preset.id, agent: options.agent || "generic", path: rel(cwd, path) }) : `${brand()} / PACKET
\u2713 agent packet: ${rel(cwd, path)}
Agent: ${options.agent || "generic"}`);
}
async function validate(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const status2 = await taskStage(dir, preset, slug);
  const current = planningStages(preset).includes(status2.stage) ? status2.stage : void 0;
  const stage2 = typeof options.stage === "string" ? options.stage : options.all ? void 0 : current;
  const results = await lintTask(cwd, dir, { strict: Boolean(options.strict), stage: stage2, preset });
  const errors = results.filter((item) => item.status === "FAIL").length, warnings = results.length - errors;
  if (options.json) output(JSON.stringify({ workflow: preset.id, stage: status2.stage, checked: stage2 || "all", valid: !errors, errors, warnings, results }, null, 2));
  else {
    output(`${brand()} / VALIDATE${options.strict ? " (strict)" : ""}
Workflow: ${preset.name} \xB7 checked: ${stage2 ? `up to ${stage2.toUpperCase()}` : planningStages(preset).map((item) => item.toUpperCase()).join(", ")}`);
    results.forEach((r) => output(`${r.status} ${r.file}: ${r.message}`));
    if (!errors) output(`PASS${warnings ? ` (${warnings} warning(s))` : ""}. Next: ${status2.next}`);
  }
  if (errors) throw new Error(`${errors} validation error(s)`);
}
var taskCommands = [
  { id: "packet", description: "Compile a focused agent packet.", aliases: ["run"], usage: "packet <task> --agent <name>", run: ({ cwd, arg, options }) => taskPacket(cwd, arg, options) },
  { id: "validate", description: "Validate the PRD, behavioral spec (spec-driven), technical spec and tasks up to the task's current stage (--all for every stage): headings, criteria ids, scenarios, real paths and coverage.", aliases: [], usage: "validate <task> [--stage prd|spec|techspec|tasks|--all] [--strict] [--json]", run: ({ cwd, arg, options }) => validate(cwd, arg, options) }
];

// src/commands/index.js
var ORDER = ["lens", "init", "language", "new", "instructions", "generate", "subtask", "flow", "agent", "map", "stack", "graph", "hotspots", "routes", "coupling", "audit", "mcp", "packet", "checkpoint", "impact", "guard", "learn", "handoff", "readiness", "policy", "adapter", "ci", "catalog", "add", "remove", "installed", "sync", "verify", "security", "deps", "pr", "validate", "review", "config", "doctor", "status", "info", "help"];
var GROUPS = [
  { id: "start", title: "Get started", commands: ["init", "language", "status", "doctor", "lens"] },
  { id: "workflow", title: "Plan & build", commands: ["new", "instructions", "generate", "validate", "subtask", "packet"] },
  { id: "gates", title: "Verify & review", commands: ["verify", "checkpoint", "guard", "security", "deps", "review", "readiness", "policy"] },
  { id: "delivery", title: "Deliver", commands: ["pr", "handoff", "learn", "ci"] },
  { id: "automation", title: "Flows & agents", commands: ["flow", "agent", "adapter", "mcp"] },
  { id: "intel", title: "Project intelligence", commands: ["map", "stack", "graph", "coupling", "routes", "hotspots", "impact", "audit"] },
  { id: "capabilities", title: "Capabilities", commands: ["catalog", "add", "remove", "installed", "sync"] },
  { id: "meta", title: "Configuration", commands: ["config", "info", "help"] }
];
var groupOf = new Map(GROUPS.flatMap((group) => group.commands.map((id2) => [id2, group.id])));
var helpCommand = { id: "help", description: "Show usage, or details for one command.", aliases: ["--help", "-h"], usage: "help [command]", run: ({ arg }) => help(arg) };
var commands = [...projectCommands, ...newCommands, ...taskCommands, ...gateCommands, ...deliveryCommands, ...capabilityCommands, ...flowCommands, ...agentCommands, ...intelCommands, helpCommand].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).map((command) => ({ ...command, group: groupOf.get(command.id) || "meta" }));
var byName = new Map(commands.flatMap((command) => [command.id, ...command.aliases].map((name) => [name, command])));
function findCommand(name) {
  return byName.get(name);
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
function suggestCommand(name) {
  const [best] = [...byName.keys()].filter((key) => !key.startsWith("-")).map((key) => ({ key, score: key.startsWith(name) ? 0 : distance(name, key) })).sort((a, b) => a.score - b.score);
  return best && best.score <= Math.max(1, Math.floor(name.length / 3)) ? byName.get(best.key).id : void 0;
}
var publicAliases = (command) => command.aliases.filter((alias) => !alias.startsWith("-"));
function commandHelp(name) {
  const command = findCommand(name);
  if (!command) {
    const guess = suggestCommand(name);
    throw new Error(`unknown command: ${name}${guess ? `; did you mean "${guess}"?` : ""}`);
  }
  const group = GROUPS.find((item) => item.id === command.group), related = group.commands.filter((id2) => id2 !== command.id);
  output([
    `${brand()} / ${command.id.toUpperCase()}`,
    "",
    command.description,
    "",
    "Usage:",
    `  maverick ${command.usage}`,
    ...publicAliases(command).length ? ["", `Aliases:    ${publicAliases(command).join(", ")}`] : [],
    `Group:      ${group.title}`,
    ...related.length ? [`Related:    ${related.join(", ")}`] : []
  ].join("\n"));
}
function help(name) {
  if (name) return commandHelp(name);
  const color = colorEnabled(), width = 30;
  const row = (command) => {
    const [head, ...tail] = command.usage.split(" "), aliases = publicAliases(command);
    const usage2 = `${style.bold(head)}${tail.length ? ` ${style.gray(tail.join(" "))}` : ""}`;
    const gap = command.usage.length < width - 1 ? " ".repeat(width - command.usage.length) : `
  ${" ".repeat(width)}`;
    return `  ${usage2}${gap}${command.description}${aliases.length ? style.dim(` (alias: ${aliases.join(", ")})`) : ""}`;
  };
  const sections = GROUPS.map((group) => `${color ? style.amber(style.bold(group.title.toUpperCase())) : `${group.title}:`}
${group.commands.map(findCommand).map(row).join("\n")}`);
  const title = color ? `${wordmark()} ${style.gray(`v${packageVersion}`)}
${style.italic(style.gray("Understand. Build. Debug. Ship."))}` : `MAVERICK AI ${packageVersion}`;
  const usage = color ? `${style.amber(style.bold("USAGE"))}
  ${style.cyan("maverick")} ${style.bold("<command>")} ${style.gray("[task] [options]")}` : "Usage: maverick <command> [task] [options]";
  const tips = [
    `${style.cyan("maverick")}                 open the interactive launcher`,
    `${style.cyan("maverick help <command>")}  details for one command`,
    `${style.gray("--json")}                   machine-readable output on most commands`,
    `${style.cyan('maverick new "<idea>"')}    start here: PRD \u2192 technical spec \u2192 tasks, written with your AI agent`
  ];
  output(`${title}

${usage}

${color ? "" : "Commands:\n\n"}${sections.join("\n\n")}

${color ? style.amber(style.bold("TIPS")) : "Tips:"}
${tips.map((tip) => `  ${tip}`).join("\n")}`);
}

export {
  AGENT_STAGES,
  STAGE_IDS,
  RECOMMENDED,
  stageOf,
  resolveRun,
  stageDefaults,
  resolveBin,
  providersFor,
  runProcess,
  selectSubtask,
  startAgentRun,
  ADAPTERS,
  detectAdapters,
  loadCatalog,
  searchCatalog,
  createResolver,
  buildGraph,
  impactOf,
  churn,
  rankHotspots,
  extractRoutes,
  inspectProject,
  groundChange,
  acIds,
  pathReferences,
  INSTRUCTION_ADAPTERS,
  loadFlows,
  findFlow,
  readState,
  autoApproves,
  recordApproval,
  runFlow,
  buildDevtools,
  serializeDevtools,
  GROUPS,
  commands,
  findCommand,
  suggestCommand
};
