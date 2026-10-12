import {
  commandRegistry
} from "./chunk-JNI3YSKA.js";
import {
  INSTRUCTION_ADAPTERS,
  buildGraph,
  churn,
  inspectProject,
  rankHotspots
} from "./chunk-KCWDTZSZ.js";
import {
  IGNORED_DIRS,
  loadConfig,
  loadGraph,
  packageVersion,
  presets,
  requirePreset,
  sectionBody,
  taskStage
} from "./chunk-TWL7K2MM.js";

// src/core/lens-index.js
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join, relative, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
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
var section = (body, heading) => sectionBody(body, heading);
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
    const dir = join(taskBase, entry.name), meta = JSON.parse(await text(join(dir, "TASK.json")) || "{}"), preset = requirePreset(meta.workflow || "standard");
    const [prd, spec] = await Promise.all([text(join(dir, "PRD.md")), text(join(dir, "TECHSPEC.md"))]);
    const files = (await entries(dir)).filter((x) => x.isFile()).map((x) => x.name), reports = files.filter((x) => /EVIDENCE|FINDINGS|SECURITY|DEPENDENCY|SCOPE|HANDOFF|READINESS|CHECKPOINT|POLICY/i.test(x));
    const state = await taskStage(dir, preset, entry.name);
    tasks.push({ id: entry.name, title: meta.idea || title(prd, entry.name), idea: meta.idea || "", preset: preset.id, stages: preset.stages, stage: state.stage, next: state.next, goal: section(prd, "Overview"), acceptanceCriteria: section(prd, "Acceptance Criteria"), scope: section(spec, "File References"), outOfScope: section(prd, "Non-Goals"), verification: section(spec, "Test Plan"), artifacts: files, reports, validation: files.includes("EVIDENCE.md") ? "evidence captured" : "verification pending", subtasks: await subtaskSummary(dir), flows: await flowSummary(dir), pullRequest: meta.pullRequest || null, done: meta.done || null, updated: (await stat(dir)).mtime.toISOString() });
  }
  const docs = [];
  const adrs = [];
  const specs = [];
  await walk(root, async (path) => {
    const rel = relative(root, path);
    if (!/\.(md|mdx|txt)$/i.test(path)) return;
    const body = await text(path);
    if (/\.(md|mdx|txt)$/i.test(path)) {
      const item = { path: rel, title: title(body, rel), excerpt: body.replace(/^---[\s\S]*?---/, "").replace(/\s+/g, " ").slice(0, 220), content: body, type: /(?:^|\/)(?:PRD|TECHSPEC|SPEC)\.md$/i.test(path) ? "SPEC" : /(?:^|\/)ADR[-_]?\d|architecture.*decision/i.test(rel) ? "ADR" : "DOC" };
      docs.push(item);
      if (item.type === "SPEC") specs.push({ ...item, status: /\b(?:FILL ME|TODO|TBD)\b/.test(body) ? "draft" : "documented", acceptanceCriteria: section(body, "Acceptance Criteria"), openQuestions: section(body, "Open Questions") });
      if (item.type === "ADR") adrs.push(item);
    }
  });
  const status = await git(root, ["status", "--short", "--", "."]);
  const log = await git(root, ["log", "-5", "--pretty=format:%h %s"]);
  const branch = await git(root, ["branch", "--show-current"]);
  const adapters = await Promise.all(INSTRUCTION_ADAPTERS.map(async (x) => ({ id: x.id, name: x.name, target: x.target, installed: Boolean(await stat(join(root, x.target)).catch(() => null)), status: config.adapter === x.id ? "active" : "available" })));
  const agents = (await entries(join(root, "agents"))).filter((x) => x.isFile()).map((x) => ({ name: x.name.replace(/^\d+-/, "").replace(/-agent\.md$/, "").replace(/-/g, " "), path: `agents/${x.name}` }));
  const workflows = (await entries(join(root, "workflows"))).filter((x) => x.isFile()).map((x) => ({ name: x.name.replace(/\.md$/, ""), path: `workflows/${x.name}` }));
  const lab = await Promise.all((await entries(join(root, "lab"))).filter((x) => x.isFile()).map(async (x) => ({ name: x.name, path: `lab/${x.name}`, content: (await text(join(root, "lab", x.name))).slice(0, 1e5) })));
  const signals = tasks.flatMap((t) => !t.done && t.validation === "verification pending" ? [{ level: "warning", text: `${t.id}: verification evidence is missing.` }] : []).concat(specs.filter((s) => /\b(?:FILL ME|TODO|TBD)\b/.test(s.openQuestions)).map((s) => ({ level: "warning", text: `${s.title}: unresolved questions.` })));
  const [graph, counts] = await Promise.all([buildGraph(root), churn(root)]);
  const modules = graph.nodes.map((node) => ({ path: node.id, language: node.language, kind: node.test ? "test" : "module", confidence: "Detected", fanIn: node.fanIn, fanOut: node.fanOut, instability: node.instability, imports: graph.out.get(node.id) }));
  const couplings = graph.edges.map((edge) => ({ from: edge.from, to: edge.to, strength: edge.dynamic ? "lazy import" : "static import" }));
  const hotspots = rankHotspots(graph, counts, 10);
  const improvements = [
    ...graph.cycles.slice(0, 3).map((cycle, index) => ({ id: `cycle-${index}`, title: `Break import cycle through ${cycle[0]}`, detail: `${cycle.length} files import each other: ${cycle.slice(0, 4).join(", ")}${cycle.length > 4 ? "\u2026" : ""}.`, kind: "architecture", preset: "strict" })),
    ...signals.map((signal, index) => ({ id: `signal-${index}`, title: `Resolve ${signal.text.split(":")[0]}`, detail: signal.text, kind: "quality", preset: "strict" })),
    ...specs.filter((spec) => spec.status === "draft").map((spec) => ({ id: `spec-${spec.path.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, title: `Complete specification: ${spec.title}`, detail: "Unresolved specification content was detected.", kind: "specification", preset: "standard" })),
    ...tasks.filter((task) => !task.done && task.validation !== "evidence captured").map((task) => ({ id: `evidence-${task.id}`, title: `Capture verification for ${task.id}`, detail: "The task has no EVIDENCE.md yet.", kind: "verification", preset: task.preset || "standard" }))
  ].slice(0, 12);
  const capabilities = [{ id: "workflow", name: "Idea to tasks pipeline", category: "workflow", description: "maverick new turns an idea into a PRD, a technical spec and a task graph with your AI agent, then builds, verifies and reviews it.", status: "available", commands: ["new", "instructions", "generate", "validate", "subtask", "flow"] }, { id: "project-map", name: "Project intelligence", category: "project-intelligence", description: "Languages, frameworks, verification commands, resolved import graph, cycles, impact, hotspots and a read-only MCP server for any stack.", status: "available", commands: ["map", "stack", "graph", "impact", "hotspots", "mcp", "doctor"] }, { id: "review", name: "Evidence and review gates", category: "review", description: "Verification, scope, security, dependencies and merge readiness.", status: "available", commands: ["verify", "review", "guard", "security", "deps", "readiness"] }, { id: "governance", name: "Governance and handoff", category: "automation", description: "Policy, handoff, learnings, PR draft and CI generator.", status: "available", commands: ["policy", "handoff", "learn", "pr", "ci"] }, { id: "adapters", name: "AI adapters", category: "adapter", description: "Local adapter templates for supported coding tools.", status: "available", commands: ["adapter"] }, { id: "agent-runtime", name: "Agent runtime", category: "automation", description: "Headless Claude Code, Codex, Cursor, Gemini CLI, Antigravity, Copilot CLI, Kiro, OpenCode or custom agents with trusted providers, permission ceilings, routing by subtask type, hooks and transcripts.", status: "available", commands: ["agent", "flow"] }, { id: "capabilities", name: "Capability manager", category: "adapter", description: "Install skills, agents, commands and MCP servers into Claude Code, Codex, Cursor, Copilot, Gemini CLI, Antigravity, Windsurf, Kiro and OpenCode with a lockfile and drift detection.", status: "available", commands: ["catalog", "add", "remove", "installed", "sync"] }, { id: "lab", name: "Maverick Lab", category: "lab", description: "Experiments and measurement scorecards.", status: lab.length ? "available" : "not configured", commands: [] }];
  return { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), project: { ...project, root, version: packageVersion, activePreset: config.workflow.default, activeAdapter: config.adapter, packageManager: project.packageManagers[0] || "unknown" }, commands: commandRegistry, presets: Object.values(presets).map((p) => ({ ...p, usageCount: tasks.filter((t) => t.preset === p.id).length, source: "built-in" })), tasks, specs, docs, adrs, modules, couplings, graph: { health: graph.health, cycles: graph.cycles, hubs: graph.hubs, hotspots, truncated: Boolean(graph.truncated) }, improvements, git: { branch: branch || "not a Git repository", changes: status.split("\n").filter(Boolean), commits: log.split("\n").filter(Boolean) }, adapters, agents, workflows, lab, capabilities, signals };
}
async function cacheProjectIndex(cwd, index) {
  const dir = join(cwd, ".maverick", "cache");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "project-index.json");
  await writeFile(path, JSON.stringify(index, null, 2));
  return path;
}

export {
  buildProjectIndex,
  cacheProjectIndex
};
