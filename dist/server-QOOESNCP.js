import {
  IGNORED_DIRS,
  commandRegistry,
  inspectProject,
  loadConfig,
  loadGraph,
  packageVersion
} from "./chunk-KH3FF5VE.js";
import {
  presets,
  requirePreset
} from "./chunk-YM2BQGIU.js";

// src/dashboard/server.js
import { createServer } from "http";
import { readFile as readFile2 } from "fs/promises";
import { URL } from "url";
import { clearTimeout, setTimeout } from "timers";

// src/core/lens-index.js
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join, relative, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

// src/core/imports.js
var all = (text2, pattern, group = 1) => [...text2.matchAll(pattern)].map((match) => match[group]).filter(Boolean);
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
  JavaScript: (text2) => all(text2, /(?:from\s*|import\s*\(\s*|require\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm),
  Python: (text2) => [...text2.matchAll(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm)].flatMap((match) => match[1] ? [match[1]] : match[2].split(",").map((name) => name.trim())),
  Go: (text2) => [
    ...all(text2, /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm),
    ...[...text2.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)].flatMap((block) => all(block[1], /"([^"]+)"/g))
  ],
  Rust: (text2) => [...all(text2, /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/gm), ...all(text2, /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm).map((name) => `mod:${name}`)],
  Java: (text2) => all(text2, /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;?/gm),
  "C#": (text2) => all(text2, /^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/gm),
  "F#": (text2) => all(text2, /^\s*open\s+([\w.]+)/gm),
  Ruby: (text2) => [...text2.matchAll(/^\s*(require_relative|require)\s*\(?\s*['"]([^'"]+)['"]/gm)].map((match) => match[1] === "require_relative" && !match[2].startsWith(".") ? `./${match[2]}` : match[2]),
  PHP: (text2) => [...all(text2, /^\s*use\s+([\w\\]+)/gm), ...all(text2, /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g)],
  Elixir: (text2) => all(text2, /^\s*(?:alias|import|use|require)\s+([\w.]+)/gm),
  Dart: (text2) => all(text2, /^\s*(?:import|export)\s+['"]([^'"]+)['"]/gm),
  Swift: (text2) => all(text2, /^\s*import\s+(?:class\s+|struct\s+|enum\s+|func\s+)?([\w.]+)/gm),
  "C/C++": (text2) => all(text2, /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)
};
EXTRACTORS.TypeScript = EXTRACTORS.JavaScript;
EXTRACTORS.Kotlin = EXTRACTORS.Java;
function languageForPath(path) {
  const extension = path.match(/\.[^./\\]+$/)?.[0]?.toLowerCase();
  return extension ? SOURCE_LANGUAGES[extension] : void 0;
}
function extractImports(language, text2) {
  const extractor = EXTRACTORS[language];
  return extractor ? [...new Set(extractor(text2))] : [];
}
function isLocalImport(language, specifier, { goModulePath } = {}) {
  if (specifier.startsWith(".")) return true;
  if (language === "Go" && goModulePath) return specifier === goModulePath || specifier.startsWith(`${goModulePath}/`);
  if (language === "Rust") return /^(crate|self|super)(::|$)/.test(specifier) || specifier.startsWith("mod:");
  return false;
}

// src/core/lens-index.js
var exec = promisify(execFile);
async function text(p) {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}
async function entries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
function section(body, heading) {
  const match = body.match(new RegExp(`^#{1,4}\\s+${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=^#{1,4}\\s|$)`, "mi"));
  return match?.[1].trim() || "";
}
function title(body, fallback) {
  return body.match(/^#\s+(.+)$/m)?.[1]?.replace(/—.*$/, "").trim() || fallback;
}
async function walk(root, visitor, depth = 0) {
  if (depth > 8) return;
  for (const entry of await entries(root)) {
    if (IGNORED_DIRS.has(entry.name) && entry.name !== ".maverick" || entry.name === "cache" && root.endsWith(".maverick")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) await walk(path, visitor, depth + 1);
    else if (entry.isFile()) await visitor(path, entry);
  }
}
async function git(cwd, args) {
  try {
    return (await exec("git", args, { cwd })).stdout.trim();
  } catch {
    return "";
  }
}
async function subtaskSummary(dir) {
  try {
    const graph = await loadGraph(dir);
    return { total: graph.items.length, done: graph.items.filter((item) => item.status === "done").length, ready: graph.items.filter((item) => item.ready).map((item) => item.id), problems: graph.problems.length };
  } catch {
    return { total: 0, done: 0, ready: [], problems: 1 };
  }
}
async function flowSummary(dir) {
  const states = [];
  for (const entry of await entries(join(dir, "flows"))) if (entry.name.endsWith(".json")) {
    try {
      const state = JSON.parse(await text(join(dir, "flows", entry.name)));
      states.push({ flow: state.flow, status: state.status || "not run", runs: state.runs?.length || 0 });
    } catch {
    }
  }
  return states;
}
async function buildProjectIndex(cwd) {
  const root = resolve(cwd), [config, project] = await Promise.all([loadConfig(root), inspectProject(root)]);
  const taskBase = join(root, config.taskRoot);
  const tasks = [];
  for (const entry of await entries(taskBase)) if (entry.isDirectory()) {
    const dir = join(taskBase, entry.name);
    const meta = JSON.parse(await text(join(dir, "TASK.json")) || "{}");
    const taskBody = await text(join(dir, "TASK.md"));
    const preset = requirePreset(meta.preset || config.workflow.defaultPreset || "standard");
    const files = (await entries(dir)).filter((x) => x.isFile()).map((x) => x.name);
    const reports = files.filter((x) => /EVIDENCE|FINDINGS|SECURITY|DEPENDENCY|SCOPE|HANDOFF|READINESS|CHECKPOINT|POLICY/i.test(x));
    tasks.push({ id: entry.name, title: title(taskBody, entry.name), preset: preset.id, stages: preset.stages, goal: section(taskBody, "Goal"), acceptanceCriteria: section(taskBody, "Acceptance Criteria"), scope: section(taskBody, "In Scope"), outOfScope: section(taskBody, "Out of Scope"), verification: section(taskBody, "Verification"), artifacts: files, reports, validation: files.includes("EVIDENCE.md") ? "evidence captured" : "verification pending", subtasks: await subtaskSummary(dir), flows: await flowSummary(dir), updated: (await stat(dir)).mtime.toISOString() });
  }
  const docs = [];
  const modules = [];
  const adrs = [];
  const specs = [];
  await walk(root, async (path) => {
    const rel = relative(root, path);
    const language = languageForPath(path);
    if (!/\.(md|mdx|txt)$/i.test(path) && !language) return;
    const body = await text(path);
    if (/\.(md|mdx|txt)$/i.test(path)) {
      const item = { path: rel, title: title(body, rel), excerpt: body.replace(/^---[\s\S]*?---/, "").replace(/\s+/g, " ").slice(0, 220), content: body, type: /SPEC\.md$/i.test(path) ? "SPEC" : /(?:^|\/)ADR[-_]?\d|architecture.*decision/i.test(rel) ? "ADR" : /TASK\.md$/i.test(path) ? "TASK" : "DOC" };
      docs.push(item);
      if (item.type === "SPEC") specs.push({ ...item, status: /FILL ME|TODO/i.test(body) ? "draft" : "documented", acceptanceCriteria: section(body, "Acceptance Criteria"), openQuestions: section(body, "Open Questions") });
      if (item.type === "ADR") adrs.push(item);
    } else {
      const imports = extractImports(language, body);
      modules.push({ path: rel, language, kind: /test|spec/i.test(rel) ? "test" : "module", confidence: "Detected", imports });
    }
  });
  const status = await git(root, ["status", "--short"]);
  const log = await git(root, ["log", "-5", "--pretty=format:%h %s"]);
  const branch = await git(root, ["branch", "--show-current"]);
  const adapters = (await entries(join(root, "adapters"))).filter((x) => x.isDirectory()).map((x) => ({ id: x.name, status: config.adapter === x.name ? "active" : "available" }));
  const agents = (await entries(join(root, "agents"))).filter((x) => x.isFile()).map((x) => ({ name: x.name.replace(/^\d+-/, "").replace(/-agent\.md$/, "").replace(/-/g, " "), path: `agents/${x.name}` }));
  const workflows = (await entries(join(root, "workflows"))).filter((x) => x.isFile()).map((x) => ({ name: x.name.replace(/\.md$/, ""), path: `workflows/${x.name}` }));
  const lab = (await entries(join(root, "lab"))).filter((x) => x.isFile()).map((x) => ({ name: x.name, path: `lab/${x.name}` }));
  const signals = tasks.flatMap((t) => t.validation === "verification pending" ? [{ level: "warning", text: `${t.id}: verification evidence is missing.` }] : []).concat(specs.filter((s) => /FILL ME|TODO/i.test(s.openQuestions)).map((s) => ({ level: "warning", text: `${s.title}: unresolved questions.` })));
  const goModulePath = project.stack.ecosystems.find((item) => item.id === "go")?.modulePath;
  const couplings = modules.flatMap((module) => module.imports.filter((reference) => isLocalImport(module.language, reference, { goModulePath })).map((reference) => ({ from: module.path, to: reference, language: module.language, strength: "static import" })));
  const improvements = [
    ...signals.map((signal, index) => ({ id: `signal-${index}`, title: `Resolve ${signal.text.split(":")[0]}`, detail: signal.text, kind: "quality", preset: "strict-review" })),
    ...specs.filter((spec) => spec.status === "draft").map((spec) => ({ id: `spec-${spec.path.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, title: `Complete specification: ${spec.title}`, detail: "Unresolved specification content was detected.", kind: "specification", preset: "spec-driven" })),
    ...tasks.filter((task) => task.validation !== "evidence captured").map((task) => ({ id: `evidence-${task.id}`, title: `Capture verification for ${task.id}`, detail: "The task has no EVIDENCE.md yet.", kind: "verification", preset: task.preset || "standard" }))
  ].slice(0, 12);
  const capabilities = [{ id: "workflow", name: "Preset-driven task workflows", category: "workflow", description: "Task stages, subtask graphs and contract-driven flows are shared with the CLI.", status: "available", commands: ["task", "subtask", "flow", "presets", "validate"] }, { id: "project-map", name: "Project intelligence", category: "project-intelligence", description: "Languages, frameworks, verification commands, instructions and top-level areas for any stack.", status: "available", commands: ["map", "stack", "impact", "doctor"] }, { id: "review", name: "Evidence and review gates", category: "review", description: "Verification, scope, security, dependencies and merge readiness.", status: "available", commands: ["verify", "review", "guard", "security", "deps", "readiness"] }, { id: "governance", name: "Governance and handoff", category: "automation", description: "Policy, handoff, learnings, PR draft and CI generator.", status: "available", commands: ["policy", "handoff", "learn", "pr", "ci"] }, { id: "adapters", name: "AI adapters", category: "adapter", description: "Local adapter templates for supported coding tools.", status: "available", commands: ["adapter"] }, { id: "capabilities", name: "Capability manager", category: "adapter", description: "Install skills, agents, commands and MCP servers into Claude Code, Codex, Cursor, Copilot, Gemini CLI and Windsurf with a lockfile and drift detection.", status: "available", commands: ["catalog", "add", "remove", "installed", "sync"] }, { id: "lab", name: "Maverick Lab", category: "lab", description: "Experiments and measurement scorecards.", status: lab.length ? "available" : "not configured", commands: [] }];
  return { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), project: { ...project, root, version: packageVersion, activePreset: config.workflow.defaultPreset, activeAdapter: config.adapter, packageManager: project.packageManagers[0] || "unknown" }, commands: commandRegistry, presets: Object.values(presets).map((p) => ({ ...p, usageCount: tasks.filter((t) => t.preset === p.id).length, source: "built-in" })), tasks, specs, docs, adrs, modules, couplings, improvements, git: { branch: branch || "not a Git repository", changes: status.split("\n").filter(Boolean), commits: log.split("\n").filter(Boolean) }, adapters, agents, workflows, lab, capabilities, signals };
}
async function cacheProjectIndex(cwd, index) {
  const dir = join(cwd, ".maverick", "cache");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "project-index.json");
  await writeFile(path, JSON.stringify(index, null, 2));
  return path;
}

// src/dashboard/server.js
var page = new URL("./ui/index.html", import.meta.url);
var interactions = new URL("./ui/interactions.js", import.meta.url);
async function requestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function startDashboard({ cwd, host = "127.0.0.1", port = 4173, watch = true } = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("dashboard host must be loopback-only");
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error("dashboard port must be between 1 and 65535");
  let index = await buildProjectIndex(cwd);
  await cacheProjectIndex(cwd, index);
  let timer;
  const refresh = async () => {
    index = await buildProjectIndex(cwd);
    await cacheProjectIndex(cwd, index);
  };
  const server = createServer(async (req, res) => {
    if (req.url === "/api/project") return json(res, 200, index);
    if (req.url === "/api/refresh" && req.method === "POST") {
      await refresh();
      res.writeHead(204);
      return res.end();
    }
    if (req.url === "/api/improvements" && req.method === "POST") {
      const body = await requestBody(req), slug = String(body.slug || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 81);
      if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) return json(res, 400, { error: "A valid improvement title is required." });
      try {
        const { main } = await import("./cli-F3CWBSQ2.js");
        await main(["task", slug, "--preset", body.preset === "strict-review" ? "strict-review" : "spec-driven"], cwd);
        await refresh();
        return json(res, 201, { slug, preset: body.preset === "strict-review" ? "strict-review" : "spec-driven" });
      } catch (error) {
        return json(res, 409, { error: error.message });
      }
    }
    if (req.url === "/interactions.js") {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
      return res.end(await readFile2(interactions, "utf8"));
    }
    if (req.url === "/" || req.url?.startsWith("/?")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" });
      return res.end(await readFile2(page, "utf8"));
    }
    res.writeHead(404);
    res.end("Not found");
  });
  if (watch) {
    const { watch: fsWatch } = await import("fs");
    const watcher = fsWatch(cwd, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => refresh().catch(() => {
      }), 250);
    });
    server.once("close", () => watcher.close());
  }
  await new Promise((resolve2, reject) => {
    server.once("error", reject);
    server.listen(Number(port), host, resolve2);
  });
  return server;
}
export {
  startDashboard
};
