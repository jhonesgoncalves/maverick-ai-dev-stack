import {
  main
} from "./chunk-KLRW2J5D.js";
import {
  buildProjectIndex,
  cacheProjectIndex
} from "./chunk-MOWQGSW3.js";
import "./chunk-CAKACX3K.js";
import {
  ADAPTERS,
  buildDevtools,
  detectAdapters,
  postMergeIncidents,
  serializeDevtools
} from "./chunk-SXR3DEER.js";
import {
  RUBRICS,
  autoApproves,
  calibration,
  findFlow,
  interval,
  loadFlows,
  loadRubric,
  lockHolder,
  loopStatus,
  readLedger,
  readState,
  readState2,
  recordApproval,
  requestStop,
  runFlow,
  scorecard,
  sealPaths,
  sealReport,
  selectSubtask,
  startAgentRun,
  verifyLoop
} from "./chunk-VZF7QBRD.js";
import {
  LOOP_ID,
  loopIds,
  loopPaths
} from "./chunk-YS6LRZVS.js";
import "./chunk-MXEATQKY.js";
import {
  AGENT_STAGES,
  RECOMMENDED,
  STAGE_IDS,
  acIds,
  pathReferences,
  providersFor,
  resolveBin,
  resolveRun,
  runProcess,
  stageDefaults,
  stageOf
} from "./chunk-PXT62BYS.js";
import {
  STATUSES,
  captureOutput,
  commandAvailable,
  getTask,
  listTasks,
  loadConfig,
  loadGraph,
  sectionBody,
  setStatus,
  taskStage
} from "./chunk-RXZYNRDJ.js";
import {
  EFFORTS,
  PERMISSIONS
} from "./chunk-5ZWVM3IA.js";
import "./chunk-YL4AI5AN.js";

// src/lens/server.js
import { createServer } from "http";
import { randomBytes } from "crypto";
import { readFile as readFile4 } from "fs/promises";
import { join as join5 } from "path";
import { URL } from "url";
import { clearTimeout as clearTimeout2, setTimeout as setTimeout2 } from "timers";

// src/lens/api.js
import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";
var SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
var PLAN = /^(?:PRD|SPEC|TECHSPEC|TASK)\.md$/;
var read = (path) => readFile(path, "utf8").catch(() => "");
var bullets = (text2) => String(text2).split("\n").map((line) => line.match(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/)?.[1]?.trim()).filter(Boolean);
function requireSlug(value) {
  const slug = String(value || "");
  if (!SLUG.test(slug)) throw Object.assign(new Error("A valid task id is required."), { status: 400 });
  return slug;
}
var queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {
  });
  return run;
}
async function artifactList(dir) {
  const files = [];
  const add = async (path, kind) => {
    const info = await stat(path).catch(() => null);
    if (info?.isFile()) files.push({ file: relative(dir, path), kind, size: info.size, updated: info.mtime.toISOString() });
  };
  for (const name of (await readdir(dir).catch(() => [])).filter((name2) => name2.endsWith(".md")).sort()) await add(join(dir, name), PLAN.test(name) ? "plan" : name === "REVIEW.md" ? "review" : "report");
  for (const name of (await readdir(join(dir, "subtasks")).catch(() => [])).filter((name2) => name2.endsWith(".md")).sort()) await add(join(dir, "subtasks", name), "subtask");
  return files;
}
async function taskFlows(cwd, dir, preset, stage) {
  const [{ flows }, config] = await Promise.all([loadFlows(cwd), loadConfig(cwd).catch(() => null)]), result = [];
  const offered = (name) => name === "ship" || name === "spec" && preset.id === "spec-driven" || name === "pr" && ["pr", "done"].includes(stage);
  for (const flow of flows) {
    const state = await readState(dir, flow.name);
    if (!state.runs.length && !offered(flow.name)) continue;
    const gates = [...flow.gates];
    if (state.runs.at(-1)?.results.some((r) => r.id === "autonomy-judge") && !gates.some((g) => g.id === "autonomy-judge")) gates.push({ id: "autonomy-judge", type: "judge", severity: "block", description: "Independent judge required by the reviewed autonomy policy." });
    result.push({
      name: flow.name,
      description: flow.description,
      source: flow.source,
      contract: flow.contract,
      gates: gates.map((gate) => ({ id: gate.id, type: gate.type, run: gate.run, severity: gate.severity, description: gate.description, prompt: gate.prompt })),
      status: state.status || "not run",
      approvals: state.approvals || {},
      autoApprove: autoApproves(config, flow.name),
      lastRun: state.runs.at(-1) || null,
      history: state.runs.slice(-10).map((run) => ({ at: run.at, outcome: run.outcome, iteration: run.iteration }))
    });
  }
  const first = ["pr", "done"].includes(stage) && result.some((flow) => flow.name === "pr") ? "pr" : "ship";
  return result.sort((a, b) => a.name === first ? -1 : b.name === first ? 1 : a.name.localeCompare(b.name));
}
function activityOf(flows, artifacts, meta = {}) {
  const tone = { done: "ok", revise: "bad", stalled: "bad", exhausted: "bad", "awaiting-approval": "warn" };
  const items = [];
  for (const flow of flows) {
    for (const run of flow.history) items.push({ at: run.at, tone: tone[run.outcome] || "info", text: `${flow.name} flow ran`, detail: run.outcome.replace(/-/g, " ") });
    for (const [gate, approval] of Object.entries(flow.approvals)) items.push({ at: approval.at, tone: approval.decision === "approve" ? "accent" : "bad", text: `${approval.by} ${approval.decision === "approve" ? "approved" : "requested changes on"} ${gate}`, detail: approval.reason || "" });
  }
  for (const artifact of artifacts.filter((item) => item.kind !== "report")) items.push({ at: artifact.updated, tone: "info", text: `${artifact.file} updated`, detail: "" });
  if (meta.pullRequest?.at) items.push({ at: meta.pullRequest.at, tone: "ok", text: meta.pullRequest.opened ? `Pull request${meta.pullRequest.number ? ` #${meta.pullRequest.number}` : ""} opened` : `${meta.pullRequest.branch} pushed`, detail: meta.pullRequest.url || "" });
  if (meta.done?.at) items.push({ at: meta.done.at, tone: "ok", text: `${meta.done.by} finished the task`, detail: meta.done.note || "" });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}
async function taskDetail(cwd, slug) {
  const { dir, preset, meta } = await getTask(cwd, requireSlug(slug));
  const status = await taskStage(dir, preset, slug);
  const [graph, artifacts, flows] = await Promise.all([loadGraph(dir), artifactList(dir), taskFlows(cwd, dir, preset, status.stage)]);
  const [prd, spec, techspec] = await Promise.all(["PRD.md", "SPEC.md", "TECHSPEC.md"].map((file) => read(join(dir, file))));
  const tested = acIds(sectionBody(techspec, "Test Plan")), specified = acIds(spec);
  const criteria = sectionBody(prd, "Acceptance Criteria").split("\n").filter((line) => acIds(line).length).map((line) => {
    const id = acIds(line)[0];
    return { id, text: line.replace(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?/, "").replace(new RegExp(`^\\**${id}\\**\\s*[:\u2014-]?\\s*`), "").trim(), specified: specified.includes(id), tested: tested.includes(id), tasks: graph.items.filter((item) => acIds(item.body).includes(id)).map((item) => item.id) };
  });
  const subtasks = graph.items.map((item) => ({ id: item.id, file: item.file, title: item.title, status: item.status, ready: item.ready, type: item.type || null, complexity: item.complexity || null, dependsOn: item.dependsOn, checklist: { total: item.checklist.total, done: item.checklist.done }, criteria: acIds(item.body), files: pathReferences(sectionBody(item.body, "Files"), { includeNew: true }) }));
  const title = meta.idea || prd.match(/^#\s+(.+)$/m)?.[1]?.replace(/^PRD\s*[—-]\s*/, "").trim() || slug;
  return {
    id: slug,
    title,
    workflow: preset.id,
    stages: preset.stages,
    stage: status.stage,
    next: status.next,
    created: meta.createdAt || null,
    goal: sectionBody(prd, "Overview").trim(),
    goals: bullets(sectionBody(prd, "Goals")),
    nonGoals: bullets(sectionBody(prd, "Non-Goals")),
    scope: pathReferences([sectionBody(techspec, "File References"), sectionBody(techspec, "Impact")].join("\n"), { includeNew: true }),
    criteria,
    subtasks,
    subtaskProblems: graph.problems,
    statuses: STATUSES,
    artifacts,
    flows,
    evidence: artifacts.some((item) => item.file === "EVIDENCE.md"),
    activity: activityOf(flows, artifacts, meta),
    pullRequest: meta.pullRequest || null,
    done: meta.done || null
  };
}
async function taskArtifact(cwd, slug, file) {
  const { dir } = await getTask(cwd, requireSlug(slug));
  const name = String(file || "");
  if (!/^(?:subtasks\/)?[\w.-]+\.md$/.test(name) || name.includes("..")) throw Object.assign(new Error("Unknown artifact."), { status: 400 });
  const text2 = await readFile(join(dir, name), "utf8").catch(() => null);
  if (text2 === null) throw Object.assign(new Error("Artifact not found."), { status: 404 });
  return { file: name, content: text2 };
}
async function allRuns(cwd) {
  const config = await loadConfig(cwd), runs = [];
  for (const task of await listTasks(cwd, config).catch(() => [])) {
    const slug = task.task, dir = join(cwd, config.taskRoot, slug);
    for (const name of (await readdir(join(dir, "flows")).catch(() => [])).filter((file) => file.endsWith(".json"))) {
      const state = JSON.parse(await read(join(dir, "flows", name)) || "{}");
      for (const run of state.runs || []) runs.push({ task: slug, flow: state.flow || name.replace(/\.json$/, ""), at: run.at, outcome: run.outcome, iteration: run.iteration, results: (run.results || []).map((result) => ({ id: result.id, type: result.type, severity: result.severity, status: result.status, issues: result.issues || [], summary: result.summary || "" })) });
    }
  }
  return runs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
}
var TASK_COMMANDS = { validate: [], verify: [], guard: [], security: [], deps: [], readiness: [], review: ["--diff"], checkpoint: [], pr: [] };
async function runAction(cwd, main2, body) {
  const action = String(body.action || ""), task = requireSlug(body.task);
  let argv;
  if (TASK_COMMANDS[action]) argv = [action, task, ...TASK_COMMANDS[action]];
  else if (action === "subtask-set") {
    const id = String(body.id || ""), status = String(body.status || "");
    if (!/^\d{2,3}$/.test(id) || !STATUSES.includes(status)) throw Object.assign(new Error("A subtask id and a valid status are required."), { status: 400 });
    argv = ["subtask", "set", task, id, status, ...body.force && status === "done" ? ["--force"] : []];
  } else if (action === "done") {
    const text2 = (value, max) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
    const by = text2(body.by, 80), note = text2(body.note, 500);
    argv = ["done", task, ...by ? ["--by", by] : [], ...note ? ["--note", note] : [], ...body.force ? ["--force"] : []];
  } else if (action === "reopen") argv = ["reopen", task];
  else if (action === "flow-run") {
    const flow = await findFlow(cwd, String(body.flow || "ship")), { dir } = await getTask(cwd, task);
    return exclusive(async () => {
      try {
        const result = await runFlow({ cwd, task, taskDir: dir, invoke: (argv2) => main2(argv2, cwd) }, flow, { reset: Boolean(body.reset), autoApprove: body.autoApprove === true });
        return { ok: true, action, run: result.run, next: result.next, notes: result.notes };
      } catch (error) {
        return { ok: false, action, error: error.message };
      }
    });
  } else throw Object.assign(new Error(`Unknown action: ${action || "(none)"}`), { status: 400 });
  return exclusive(async () => {
    try {
      const { output } = await captureOutput(() => main2(argv, cwd));
      return { ok: true, action, command: `maverick ${argv.join(" ")}`, output };
    } catch (error) {
      return { ok: false, action, command: `maverick ${argv.join(" ")}`, output: error.output || "", error: error.message };
    }
  });
}
async function setAutoApprove(cwd, main2, body) {
  const flow = String(body.flow || "");
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(flow)) throw Object.assign(new Error("A flow name is required."), { status: 400 });
  const argv = ["flow", "auto-approve", flow, body.enabled ? "on" : "off"];
  return exclusive(async () => {
    try {
      const { output } = await captureOutput(() => main2([...argv, "--json"], cwd));
      return { ok: true, command: `maverick ${argv.join(" ")}`, ...JSON.parse(output) };
    } catch (error) {
      return { ok: false, command: `maverick ${argv.join(" ")}`, error: error.message };
    }
  });
}

// src/lens/agents.js
import { randomUUID } from "crypto";
import { readFile as readFile2, readdir as readdir2 } from "fs/promises";
import { join as join2, relative as relative2 } from "path";

// src/runtime/models.js
var cache = /* @__PURE__ */ new Map();
var TTL = 10 * 60 * 1e3;
async function listModels(provider, config, cwd) {
  const recommended = [...new Set(Object.values(RECOMMENDED[provider.id] || {}).map((entry) => entry.model).filter(Boolean))];
  const fallback = { source: "suggested", models: [.../* @__PURE__ */ new Set([...recommended, ...provider.models?.suggested || []])].map((id) => ({ id })) };
  const bin = resolveBin(provider, config, cwd);
  if (!provider.models?.list || !commandAvailable(bin, cwd)) return fallback;
  const key = `${provider.id}:${bin}:${cwd}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let text2 = "";
  const result = await runProcess({ bin, args: provider.models.list, cwd, timeoutMs: 2e4, onLine: (line) => {
    text2 += `${line}
`;
  } });
  let value = fallback;
  try {
    if (result.code === 0) {
      const models = provider.models.parse(text2);
      if (models.length) value = { source: "cli", models };
    }
  } catch {
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

// src/lens/agents.js
var fail = (message, status = 400) => Object.assign(new Error(message), { status });
var text = (value, max) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : void 0;
var parseLines = (body) => body.split("\n").filter(Boolean).map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}).filter(Boolean);
var MAX_EVENTS = 3e3;
function createAgentHub({ cwd, main: main2, broadcast = () => {
}, onFinish = () => {
} }) {
  const live = /* @__PURE__ */ new Map();
  const view = (run) => {
    const { controller, ...rest } = run;
    return { ...rest, events: void 0, eventCount: run.events.length };
  };
  async function providers() {
    const config = await loadConfig(cwd), trusted = config.runtime?.trusted || [];
    return {
      providers: providersFor(config).map((provider) => {
        const bin = resolveBin(provider, config, cwd);
        return { id: provider.id, name: provider.name, bin, installed: commandAvailable(bin, cwd), trusted: trusted.includes(provider.id), permissions: PERMISSIONS.filter((level) => provider.permissions[level] === true), efforts: provider.efforts || [], recommended: RECOMMENDED[provider.id] || {}, custom: Boolean(provider.custom) };
      }),
      stages: AGENT_STAGES,
      stageDefaults: stageDefaults(config, providersFor(config), STAGE_IDS),
      configuredStages: config.runtime?.stages || {},
      permissions: PERMISSIONS,
      efforts: EFFORTS,
      maxPermission: config.runtime?.maxPermission || "edit",
      default: config.runtime?.default || null,
      routes: config.runtime?.routes || [],
      timeoutMinutes: config.runtime?.timeoutMinutes || 30
    };
  }
  async function trust(body) {
    const provider = text(body.provider, 60), max = text(body.maxPermission, 20);
    if (!provider || !/^[a-z0-9][a-z0-9-]*$/.test(provider)) throw fail("A provider id is required.");
    if (max && !PERMISSIONS.includes(max)) throw fail(`maxPermission must be one of ${PERMISSIONS.join(", ")}`);
    const argv = ["agent", body.trusted === false ? "untrust" : "trust", provider, "--yes", ...max && body.trusted !== false ? ["--max-permission", max] : []];
    return exclusive(async () => {
      try {
        const { output } = await captureOutput(() => main2(argv, cwd));
        return { ok: true, command: `maverick ${argv.join(" ")}`, output };
      } catch (error) {
        return { ok: false, command: `maverick ${argv.join(" ")}`, output: error.output || "", error: error.message };
      }
    });
  }
  async function models(id) {
    const config = await loadConfig(cwd), provider = providersFor(config).find((item) => item.id === id);
    if (!provider) throw fail("Unknown provider.", 404);
    return { provider: provider.id, efforts: provider.efforts || [], ...await listModels(provider, config, cwd) };
  }
  async function setStage(body) {
    const stage = text(body.stage, 20);
    if (!STAGE_IDS.includes(stage)) throw fail(`stage must be one of ${STAGE_IDS.join(", ")}`);
    const provider = text(body.provider, 60), model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : void 0, effort = typeof body.effort === "string" ? body.effort.trim() : void 0;
    if (provider && !/^[a-z0-9][a-z0-9-]*$/.test(provider)) throw fail("Unknown provider.");
    if (model && !/^[\w.:/@-]+$/.test(model)) throw fail("A model id has no spaces or shell characters.");
    if (effort && !EFFORTS.includes(effort)) throw fail(`effort must be one of ${EFFORTS.join(", ")}`);
    const argv = ["agent", "stage", stage, ...body.reset ? ["--reset"] : [...provider ? ["--provider", provider] : [], ...model !== void 0 ? ["--model", model] : [], ...effort !== void 0 ? ["--effort", effort] : []], "--json"];
    return exclusive(async () => {
      try {
        const { output } = await captureOutput(() => main2(argv, cwd));
        return { ok: true, command: `maverick ${argv.slice(0, -1).join(" ")}`, data: JSON.parse(output) };
      } catch (error) {
        return { ok: false, command: `maverick ${argv.slice(0, -1).join(" ")}`, error: error.message };
      }
    });
  }
  async function start(body) {
    const task = requireSlug(body.task), { dir } = await getTask(cwd, task), config = await loadConfig(cwd);
    if ([...live.values()].some((run2) => run2.task === task && run2.status === "running")) throw fail(`An agent is already running on ${task}. Stop it or wait for it to finish.`, 409);
    const invalid = (error) => {
      throw fail(error.message);
    };
    const subtask = body.subtask ? await selectSubtask(dir, String(body.subtask)).catch(invalid) : void 0;
    const issues = Array.isArray(body.issues) ? body.issues.filter((item) => typeof item === "string").slice(0, 50).map((item) => item.slice(0, 500)) : void 0;
    const options = { provider: text(body.provider, 60), model: text(body.model, 120), effort: text(body.effort, 20), permission: text(body.permission, 20) };
    let plan;
    try {
      plan = resolveRun(config, { ...options, subtask, stage: stageOf({ issues }) }, providersFor(config));
    } catch (error) {
      invalid(error);
    }
    if (subtask?.status === "pending") await setStatus(dir, task, subtask.id, "in-progress");
    const controller = new globalThis.AbortController();
    const run = { id: randomUUID(), task, subtask: subtask?.id || null, subtaskTitle: subtask?.title || null, provider: plan.provider.id, providerName: plan.provider.name, model: plan.model || null, effort: plan.effort || null, stage: plan.stage, permission: plan.permission, kind: issues?.length ? "fix" : subtask ? "subtask" : "task", instruction: text(body.prompt, 4e3) || null, status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null, events: [], result: null, controller };
    live.set(run.id, run);
    const onEvent = (event) => {
      const item = { at: (/* @__PURE__ */ new Date()).toISOString(), ...event };
      run.events.push(item);
      if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
      broadcast("agent", { id: run.id, event: item });
    };
    startAgentRun(cwd, { slug: task, dir, config, subtask, instruction: run.instruction || void 0, issues, options, onEvent, signal: controller.signal }).then(({ run: result }) => {
      run.status = controller.signal.aborted ? "stopped" : result.ok ? "ok" : "failed";
      run.result = { ok: result.ok, problems: result.problems, warnings: result.warnings || [], status: result.result?.status || null, summary: result.result?.summary || null, questions: result.result?.questions || [], filesChanged: result.result?.filesChanged || [], disputes: result.result?.disputes || [], durationMs: result.durationMs, cost: result.cost ?? null, transcript: relative2(cwd, result.transcript) };
    }).catch((error) => {
      run.status = controller.signal.aborted ? "stopped" : "failed";
      run.result = { ok: false, problems: [error.message], warnings: [], questions: [], filesChanged: [] };
      onEvent({ type: "error", message: error.message });
    }).finally(() => {
      run.endedAt = (/* @__PURE__ */ new Date()).toISOString();
      broadcast("agent-end", { id: run.id, status: run.status });
      onFinish();
    });
    return view(run);
  }
  function stop(id) {
    const run = live.get(String(id || ""));
    if (!run) throw fail("Unknown run.", 404);
    if (run.status === "running") run.controller.abort();
    return view(run);
  }
  function get(id) {
    const run = live.get(String(id || ""));
    if (!run) throw fail("Unknown run.", 404);
    return { ...view(run), events: run.events };
  }
  async function runs() {
    const config = await loadConfig(cwd), history = [];
    const running = [...live.values()].filter((run) => run.status === "running");
    for (const { task } of await listTasks(cwd, config).catch(() => [])) {
      const dir = join2(cwd, config.taskRoot, task, "runs");
      for (const file of (await readdir2(dir).catch(() => [])).filter((name) => name.endsWith(".jsonl"))) {
        const events = parseLines(await readFile2(join2(dir, file), "utf8").catch(() => ""));
        const first = events.find((event) => event.type === "start"), end = events.findLast((event) => event.type === "end"), result = events.findLast((event) => event.type === "result");
        if (!end && running.some((run) => run.task === task && run.provider === first?.provider)) continue;
        history.push({ task, file, provider: first?.provider || file.replace(/^.*-/, "").replace(/\.jsonl$/, ""), model: first?.model || null, permission: first?.permission || null, at: first?.at || null, ok: end?.ok ?? null, status: end?.status ?? null, durationMs: end?.durationMs ?? null, cost: result?.cost ?? null, problems: end?.problems || [], tools: events.filter((event) => event.type === "tool").length });
      }
    }
    return { live: [...live.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(view), history: history.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200) };
  }
  async function transcript(task, file) {
    const slug = requireSlug(task), name = String(file || "");
    if (!/^[\w.-]+\.jsonl$/.test(name)) throw fail("Unknown transcript.");
    const { dir } = await getTask(cwd, slug);
    const body = await readFile2(join2(dir, "runs", name), "utf8").catch(() => null);
    if (body === null) throw fail("Transcript not found.", 404);
    return { task: slug, file: name, events: parseLines(body).slice(-MAX_EVENTS) };
  }
  function close() {
    for (const run of live.values()) if (run.status === "running") run.controller.abort();
  }
  return { providers, models, setStage, trust, start, stop, get, runs, transcript, close };
}

// src/lens/loops.js
import { join as join3, sep } from "path";
import { clearTimeout, setTimeout } from "timers";
var MAX_LOOPS = 100;
var MAX_ITERATIONS = 200;
var TASK = /^[a-z0-9][a-z0-9-]{1,80}$/;
var fail2 = (status, message) => Object.assign(new Error(message), { status });
function summary(task, state, live) {
  const last = state.iterations.at(-1);
  return {
    task,
    id: state.loopId,
    status: state.status,
    reason: state.reason,
    live: Boolean(live),
    mode: state.mode,
    flow: state.flow?.name,
    iteration: state.iterations.length,
    accepted: state.spent?.accepted || 0,
    maxIterations: state.budgets?.maxIterations ?? null,
    subtask: state.inFlight?.scope && state.inFlight.scope !== "goal" ? state.inFlight.scope : last?.subtask?.id || null,
    score: state.checkpoint?.score ? { passed: state.checkpoint.score.passed, blocking: state.checkpoint.score.blocking, failing: state.checkpoint.score.failingCount, subtasksDone: state.checkpoint.score.subtasksDone, subtasksTotal: state.checkpoint.score.subtasksTotal } : null,
    spent: state.spent,
    budgets: state.budgets,
    providers: [...new Set(state.iterations.map((item) => item.provider))],
    rung: state.escalation?.rung || null,
    holdout: state.sealed ? { sealId: state.sealed.sealId, feedback: state.sealed.feedback, queries: state.sealed.queries, final: state.status === "running" ? null : state.sealed.final && { passed: state.sealed.final.passed, total: state.sealed.final.total, OI: state.sealed.final.OI } } : null,
    tainted: state.checkpoint?.tainted || null,
    quarantined: (state.quarantine || []).reduce((sum, item) => sum + (item.count ?? item.notes?.length ?? 0), 0),
    startedAt: state.createdAt,
    updatedAt: state.updatedAt,
    endedAt: state.endedAt
  };
}
function createLoopHub({ cwd, broadcast, onEnd = () => {
} }) {
  const seen = /* @__PURE__ */ new Map(), timers = /* @__PURE__ */ new Map();
  const taskDir = async (task) => {
    if (!TASK.test(String(task || ""))) throw fail2(400, "A valid task id is required.");
    return (await getTask(cwd, task)).dir;
  };
  const loopId = (id) => {
    if (!LOOP_ID.test(String(id || ""))) throw fail2(400, "A valid loop id is required.");
    return id;
  };
  return {
    /** Every loop of every task, newest activity first. */
    async list() {
      const config = await loadConfig(cwd), loops = [];
      for (const { task } of await listTasks(cwd, config).catch(() => [])) {
        const dir = join3(cwd, config.taskRoot, task), holder = await lockHolder(dir);
        for (const id of (await loopIds(dir)).slice(0, 10)) {
          const state = await readState2(dir, id).catch(() => null);
          if (state) loops.push(summary(task, state, holder?.loopId === id && state.status === "running"));
        }
      }
      return { loops: loops.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_LOOPS) };
    },
    async detail(task, id) {
      const dir = await taskDir(task), info = await loopStatus(dir, loopId(id));
      if (!info) throw fail2(404, "Loop not found.");
      const { state } = info;
      const decisions = (await readLedger(loopPaths(dir, id).ledger)).filter((entry) => entry.type === "decision").slice(-50).map(({ data }) => ({ id: data.id, n: data.n, rubric: data.rubric, version: data.version, tier: data.tier, answer: data.answer, probability: data.probability, threshold: data.threshold, advisory: data.advisory, needsHuman: data.needsHuman, calibration: data.calibration, eligible: data.eligible }));
      return { task, live: Boolean(info.running), stopPending: info.stopPending, forecast: info.forecast, next: info.next, decisions, summary: summary(task, state, info.running), state: { ...state, iterations: state.iterations.slice(-MAX_ITERATIONS).map((item) => ({ ...item, findings: (item.findings || []).slice(0, 50) })) } };
    },
    async ledger(task, id) {
      return verifyLoop(cwd, await taskDir(task), loopId(id));
    },
    async stop(task, id, reason) {
      const dir = await taskDir(task), state = await readState2(dir, loopId(id));
      if (!state) throw fail2(404, "Loop not found.");
      const holder = await lockHolder(dir);
      if (state.status !== "running" || holder?.loopId !== id) throw fail2(409, "This loop is not running.");
      await requestStop(dir, { loopId: id, reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : void 0, by: "Lens" });
      return { requested: true, live: true };
    },
    /** A file under a task's loops/ changed: tell the page, and on a terminal transition refresh the project. */
    onFileChange(name) {
      const parts = String(name).split(/[\\/]/), at = parts.lastIndexOf("loops");
      if (at < 1 || !LOOP_ID.test(parts[at + 1] || "") || parts[at + 2] !== "state.json") return;
      const task = parts[at - 1], id = parts[at + 1], key = `${task}${sep}${id}`;
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(async () => {
        timers.delete(key);
        const dir = await taskDir(task).catch(() => null), state = dir && await readState2(dir, id).catch(() => null);
        if (!state) return;
        const before = seen.get(key);
        seen.set(key, state.status);
        broadcast("loop", { task, id, status: state.status, iteration: state.iterations.length, phase: state.inFlight?.phase || null });
        if (before === "running" && state.status !== "running") {
          broadcast("loop-end", { task, id, status: state.status });
          onEnd();
        }
      }, 200));
    },
    close() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }
  };
}

// src/lens/system.js
var fail3 = (message, status = 400) => Object.assign(new Error(message), { status });
var REF = /^[a-z]+\/[a-z0-9][a-z0-9._-]*$/;
var LANG = /^[a-z]{2}(?:-[A-Z]{2})?$/;
function parse(output) {
  const start = output.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}
async function json(main2, cwd, argv) {
  return exclusive(async () => {
    try {
      const { output } = await captureOutput(() => main2([...argv, "--json"], cwd));
      return { ok: true, data: parse(output), output };
    } catch (error) {
      return { ok: false, data: parse(error.output || ""), output: error.output || "", error: error.message };
    }
  });
}
async function capabilities(main2, cwd) {
  const [catalog, installed, detected] = await Promise.all([json(main2, cwd, ["catalog"]), json(main2, cwd, ["installed"]), detectAdapters(cwd).catch(() => [])]);
  const found = new Set((detected || []).map((adapter) => adapter.id || adapter));
  return {
    catalog: catalog.data || [],
    installed: Array.isArray(installed.data) ? installed.data : [],
    adapters: ADAPTERS.map((adapter) => ({ id: adapter.id, name: adapter.name, home: adapter.home, detected: found.has(adapter.id) })),
    errors: [catalog, installed].filter((result) => !result.ok).map((result) => result.error)
  };
}
async function capability(main2, cwd, ref) {
  if (!REF.test(String(ref || ""))) throw fail3("A capability reference like skill/maverick-build is required.");
  const result = await json(main2, cwd, ["catalog", "show", ref]);
  if (!result.ok) throw fail3(result.error, 404);
  return result.data;
}
async function changeCapabilities(main2, cwd, body) {
  const action = String(body.action || ""), refs = Array.isArray(body.refs) ? body.refs.map(String) : [];
  if (!["add", "remove", "sync"].includes(action)) throw fail3("action must be add, remove or sync");
  if (action !== "sync" && (!refs.length || refs.some((ref) => !REF.test(ref)))) throw fail3("Name at least one capability, like skill/maverick-build.");
  const to = Array.isArray(body.to) ? body.to.map(String) : [];
  if (to.some((id) => !ADAPTERS.some((adapter) => adapter.id === id))) throw fail3(`Unknown tool; use ${ADAPTERS.map((adapter) => adapter.id).join(", ")}`);
  const argv = [action, ...action === "sync" ? [] : refs, ...action === "add" && to.length ? ["--to", to.join(",")] : [], ...body.allowExec && action === "add" ? ["--allow-exec"] : [], ...body.force ? ["--force"] : [], body.apply ? "--yes" : "--dry-run"];
  const result = await json(main2, cwd, argv);
  return { ...result, command: `maverick ${argv.join(" ")}` };
}
async function settings(main2, cwd) {
  const [config, doctor, language, stack] = await Promise.all([json(main2, cwd, ["config", "show"]), json(main2, cwd, ["doctor"]), json(main2, cwd, ["language"]), json(main2, cwd, ["stack"])]);
  return { config: config.data, configError: config.ok ? null : config.error, doctor: doctor.data, language: language.data, stack: stack.data };
}
async function changeSettings(main2, cwd, body) {
  if (body.action === "language") {
    const docs = String(body.docs || ""), code = String(body.code || "");
    if (!LANG.test(docs) || !LANG.test(code)) throw fail3("Languages are codes like en, pt-BR or es.");
    const result = await json(main2, cwd, ["language", docs, code]);
    return { ...result, command: `maverick language ${docs} ${code}` };
  }
  if (body.action === "adapter") {
    const id = String(body.id || "");
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw fail3("An adapter id is required.");
    const result = await json(main2, cwd, ["adapter", "install", id]);
    return { ...result, command: `maverick adapter install ${id}` };
  }
  throw fail3("action must be language or adapter");
}

// src/lens/decide.js
import { readdir as readdir3, readFile as readFile3 } from "fs/promises";
import { join as join4 } from "path";
async function decisionDashboard(cwd) {
  const config = await loadConfig(cwd);
  const rubrics = await Promise.all(Object.keys(RUBRICS).map(async (id) => ({ id, ...await calibration(cwd, await loadRubric(cwd, id)) })));
  return { scorecard: await scorecard(cwd, config), rubrics };
}
async function holdoutDashboard(cwd) {
  const config = await loadConfig(cwd), tasks = [], warnings = [];
  const dirs = await readdir3(join4(cwd, config.taskRoot), { withFileTypes: true }).catch(() => []);
  for (const dir of dirs.filter((d) => d.isDirectory())) {
    try {
      const report = await sealReport({ cwd, task: dir.name, taskDir: join4(cwd, config.taskRoot, dir.name), config });
      if (!report.sealed) continue;
      const sealed = report.sealed, entries = await readLedger(sealPaths(cwd, dir.name, sealed.sealId).ledger);
      const last = entries.findLast((e) => e.type === "seal-run");
      const loopDirs = await readdir3(join4(cwd, config.taskRoot, dir.name, "loops"), { withFileTypes: true }).catch(() => []);
      const loops = await Promise.all(loopDirs.filter((d) => d.isDirectory()).map((d) => readFile3(join4(cwd, config.taskRoot, dir.name, "loops", d.name, "state.json"), "utf8").then(JSON.parse).catch(() => null)));
      const spent = loops.filter(Boolean).reduce((sum, loop) => ({ cost: sum.cost + (loop.spent?.costUsd || 0), time: sum.time + (loop.spent?.activeMs || 0), unknown: sum.unknown + (loop.spent?.costUnknown || 0) }), { cost: 0, time: 0, unknown: 0 });
      const durationMs = entries.filter((e) => e.type === "seal-run").reduce((sum, e) => sum + (e.data.durationMs || 0), 0);
      const extraCost = sealed.authoring?.costUsd != null && (sealed.review?.costUsd != null || !sealed.review) ? sealed.authoring.costUsd + (sealed.review?.costUsd || 0) : null;
      tasks.push({ task: dir.name, state: report.state, sealId: sealed.sealId, surface: sealed.surface, tests: sealed.tests, discriminating: sealed.discriminating, baseFailureRate: sealed.tests ? sealed.discriminating / sealed.tests : null, queries: report.queries, suspended: sealed.suspended?.length || 0, amended: Boolean(sealed.amendedFrom), review: sealed.review || null, approval: sealed.approval || null, ledgerValid: report.ledger.ok, S: last?.data.S ?? null, OI: last?.data.OI ?? null, durationMs, overhead: { cost: spent.cost && !spent.unknown && extraCost !== null ? extraCost / spent.cost : null, time: spent.time && sealed.authoring ? (durationMs + sealed.authoring.durationMs) / spent.time : null } });
    } catch (error) {
      warnings.push(`${dir.name}: ${error.message}`);
    }
  }
  const history = await postMergeIncidents(cwd, config.autonomy?.windowDays || 30), merged = [...new Set(history.commits.map((c) => c.task).filter(Boolean))];
  const cohorts = [true, false].map((sealed) => {
    const group = merged.filter((task) => tasks.some((t) => t.task === task) === sealed);
    return { sealed, tasks: group.length, defects: interval(group.filter((task) => history.incidents.some((i) => i.task === task)).length, group.length), observational: true };
  });
  return { tasks, warnings, cohorts, amendmentRate: tasks.length ? tasks.filter((t) => t.amended).length / tasks.length : null, targets: { baseFailureRate: 0.9, amendmentRate: 0.2, overhead: 0.15 } };
}

// src/lens/server.js
var ui = new URL("./ui/", import.meta.url);
var page = new URL("./index.html", ui);
var TYPES = { ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
var ASSET = /^\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.(?:js|css|svg)$/;
var LOOPBACK = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
async function requestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}
function json2(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
var hostOf = (value) => String(value || "").replace(/:\d+$/, "").toLowerCase();
async function startLens({ cwd, host = "127.0.0.1", port = 4173, watch = true } = {}) {
  if (!LOOPBACK.has(host)) throw new Error("Lens host must be loopback-only");
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error("Lens port must be between 1 and 65535");
  const token = randomBytes(24).toString("hex");
  let index = await buildProjectIndex(cwd);
  await cacheProjectIndex(cwd, index);
  let timer;
  let devtools = null, building = null, version = 0;
  const clients = /* @__PURE__ */ new Set();
  const broadcast = (event, data = {}) => {
    for (const client of clients) client.write(`event: ${event}
data: ${JSON.stringify({ version, ...data })}

`);
  };
  const analysis = () => {
    if (devtools) return Promise.resolve(devtools);
    if (!building) building = buildDevtools(cwd).then((report) => {
      devtools = report;
      building = null;
      return report;
    }, (error) => {
      building = null;
      throw error;
    });
    return building;
  };
  const refresh = async () => {
    index = await buildProjectIndex(cwd);
    await cacheProjectIndex(cwd, index);
    devtools = null;
    version++;
    broadcast("changed");
  };
  const agents = createAgentHub({ cwd, main, broadcast, onFinish: () => refresh().catch(() => {
  }) });
  const loops = createLoopHub({ cwd, broadcast, onEnd: () => refresh().catch(() => {
  }) });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!LOOPBACK.has(hostOf(req.headers.host))) {
      res.writeHead(421);
      return res.end("Misdirected request");
    }
    if (req.method === "POST" && (req.headers["x-lens-token"] !== token || req.headers.origin && !LOOPBACK.has(hostOf(new URL(req.headers.origin).host)))) return json2(res, 403, { error: "Missing or invalid Lens token." });
    try {
      if (url.pathname === "/api/project") return json2(res, 200, index);
      if (url.pathname === "/api/task-flow") {
        const task = String(url.searchParams.get("task") || "");
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(task)) return json2(res, 400, { error: "A valid task id is required." });
        const name = String(url.searchParams.get("flow") || "ship");
        const [flow, item] = await Promise.all([findFlow(cwd, name), getTask(cwd, task)]);
        const state = await readState(item.dir, flow.name);
        return json2(res, 200, { task, flow: { name: flow.name, description: flow.description, contract: flow.contract, gates: flow.gates }, state, lastRun: state.runs.at(-1) || null });
      }
      if (url.pathname === "/api/task") return json2(res, 200, await taskDetail(cwd, url.searchParams.get("task")));
      if (url.pathname === "/api/artifact") return json2(res, 200, await taskArtifact(cwd, url.searchParams.get("task"), url.searchParams.get("file")));
      if (url.pathname === "/api/runs") return json2(res, 200, { runs: await allRuns(cwd) });
      if (url.pathname === "/api/action" && req.method === "POST") {
        const body = await requestBody(req);
        requireSlug(body.task);
        const result = await runAction(cwd, main, body);
        await refresh();
        return json2(res, 200, result);
      }
      if (url.pathname === "/api/agents" && req.method === "GET") return json2(res, 200, await agents.providers());
      if (url.pathname === "/api/agents/runs") return json2(res, 200, await agents.runs());
      if (url.pathname === "/api/agents/run" && req.method === "GET") return json2(res, 200, agents.get(url.searchParams.get("id")));
      if (url.pathname === "/api/agents/transcript") return json2(res, 200, await agents.transcript(url.searchParams.get("task"), url.searchParams.get("file")));
      if (url.pathname === "/api/agents/run" && req.method === "POST") {
        const run = await agents.start(await requestBody(req));
        await refresh();
        return json2(res, 202, run);
      }
      if (url.pathname === "/api/agents/stop" && req.method === "POST") return json2(res, 200, agents.stop((await requestBody(req)).id));
      if (url.pathname === "/api/agents/models") return json2(res, 200, await agents.models(url.searchParams.get("provider")));
      if (url.pathname === "/api/agents/stage" && req.method === "POST") {
        const result = await agents.setStage(await requestBody(req));
        await refresh();
        return json2(res, 200, result);
      }
      if (url.pathname === "/api/agents/trust" && req.method === "POST") {
        const result = await agents.trust(await requestBody(req));
        await refresh();
        return json2(res, 200, result);
      }
      if (url.pathname === "/api/loops" && req.method === "GET") return json2(res, 200, await loops.list());
      if (url.pathname === "/api/loop" && req.method === "GET") return json2(res, 200, await loops.detail(url.searchParams.get("task"), url.searchParams.get("id")));
      if (url.pathname === "/api/loop/ledger" && req.method === "GET") return json2(res, 200, await loops.ledger(url.searchParams.get("task"), url.searchParams.get("id")));
      if (url.pathname === "/api/loops/stop" && req.method === "POST") {
        const body = await requestBody(req);
        return json2(res, 202, await loops.stop(body.task, body.id, body.reason));
      }
      if (url.pathname === "/api/capabilities" && req.method === "GET") return json2(res, 200, await capabilities(main, cwd));
      if (url.pathname === "/api/capability") return json2(res, 200, await capability(main, cwd, url.searchParams.get("ref")));
      if (url.pathname === "/api/capabilities" && req.method === "POST") {
        const result = await changeCapabilities(main, cwd, await requestBody(req));
        if (result.ok && result.data?.applied !== false) await refresh();
        return json2(res, 200, result);
      }
      if (url.pathname === "/api/scorecard" && req.method === "GET") return json2(res, 200, await decisionDashboard(cwd));
      if (url.pathname === "/api/holdouts" && req.method === "GET") return json2(res, 200, await holdoutDashboard(cwd));
      if (url.pathname === "/api/settings" && req.method === "GET") return json2(res, 200, await settings(main, cwd));
      if (url.pathname === "/api/settings" && req.method === "POST") {
        const result = await changeSettings(main, cwd, await requestBody(req));
        await refresh();
        return json2(res, 200, result);
      }
      if (url.pathname === "/api/devtools") {
        if (url.searchParams.has("refresh")) devtools = null;
        return json2(res, 200, serializeDevtools(await analysis()));
      }
      if (url.pathname === "/api/source") {
        const report = await analysis(), file = url.searchParams.get("file") || "";
        const known = report.fileIndex.has(file) || report.routes.items.some((route) => route.file === file) || report.integrations.manifests.includes(file);
        if (!known) return json2(res, 404, { error: "Unknown file." });
        const text2 = await readFile4(join5(report.root, file), "utf8").catch(() => null);
        if (text2 === null) return json2(res, 404, { error: "File not readable." });
        const lines = text2.split("\n");
        return json2(res, 200, { file, root: report.root, lines: lines.length > 4e3 ? lines.slice(0, 4e3) : lines, truncated: lines.length > 4e3, imports: report.edges.filter((edge) => edge[0] === file).map((edge) => edge[1]), importedBy: report.edges.filter((edge) => edge[1] === file).map((edge) => edge[0]) });
      }
      if (url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(`event: ready
data: ${JSON.stringify({ version })}

`);
        clients.add(res);
        req.once("close", () => clients.delete(res));
        return void 0;
      }
      if (url.pathname === "/api/refresh" && req.method === "POST") {
        await refresh();
        res.writeHead(204);
        return res.end();
      }
      if (url.pathname === "/api/improvements" && req.method === "POST") {
        const body = await requestBody(req), slug = String(body.slug || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 81);
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) return json2(res, 400, { error: "A valid improvement title is required." });
        const idea = [body.title, body.detail].filter((value) => typeof value === "string" && value.trim()).join(". ") || slug, workflow = ["strict", "spec-driven"].includes(body.preset) ? body.preset : "standard";
        try {
          await exclusive(() => main(["new", idea, "--slug", slug, "--no-launch", ...workflow === "standard" ? [] : ["--workflow", workflow]], cwd));
          await refresh();
          return json2(res, 201, { slug, preset: workflow });
        } catch (error) {
          return json2(res, 409, { error: error.message });
        }
      }
      if (url.pathname === "/api/task-flow/run" && req.method === "POST") {
        const body = await requestBody(req), task = String(body.task || ""), name = String(body.flow || "ship");
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(task)) return json2(res, 400, { error: "A valid task id is required." });
        const [flow, item] = await Promise.all([findFlow(cwd, name), getTask(cwd, task)]);
        const invoke = async (argv) => main(argv, cwd);
        const result = await exclusive(() => runFlow({ cwd, task, taskDir: item.dir, invoke }, flow, { reset: Boolean(body.reset), autoApprove: body.autoApprove === true }));
        await refresh();
        return json2(res, 200, { flow: flow.name, task, run: result.run, next: result.next, notes: result.notes });
      }
      if (url.pathname === "/api/task-flow/auto-approve" && req.method === "POST") {
        const result = await setAutoApprove(cwd, main, await requestBody(req));
        await refresh();
        return json2(res, 200, result);
      }
      if (url.pathname === "/api/task-flow/approval" && req.method === "POST") {
        const body = await requestBody(req), task = String(body.task || ""), name = String(body.flow || "ship"), gateId = String(body.gate || ""), decision = body.decision === "reject" ? "reject" : "approve";
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(task)) return json2(res, 400, { error: "A valid task id is required." });
        if (decision === "reject" && (typeof body.reason !== "string" || !body.reason.trim())) return json2(res, 400, { error: "A rejection needs a reason." });
        const [flow, item] = await Promise.all([findFlow(cwd, name), getTask(cwd, task)]);
        if (!flow.gates.some((candidate) => candidate.id === gateId && ["approval", "judge"].includes(candidate.type))) return json2(res, 404, { error: "Approval gate not found." });
        const by = typeof body.by === "string" && body.by.trim().slice(0, 80) || "human", reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : void 0;
        const invoke = async (argv) => main(argv, cwd);
        const { approval, run, next } = await exclusive(() => recordApproval({ cwd, task, taskDir: item.dir, invoke }, flow, gateId, { decision, by, reason }));
        await refresh();
        return json2(res, 200, { approval, outcome: run?.outcome || null, next });
      }
      if (req.method === "GET" && ASSET.test(url.pathname)) {
        const body = await readFile4(new URL(`.${url.pathname}`, ui)).catch(() => null);
        if (body !== null) {
          res.writeHead(200, { "content-type": TYPES[url.pathname.slice(url.pathname.lastIndexOf("."))], "cache-control": "no-store" });
          return res.end(body);
        }
      }
      if (url.pathname === "/") {
        const html = (await readFile4(page, "utf8")).replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta name="lens-token" content="${token}">`);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
        return res.end(html);
      }
      res.writeHead(404);
      res.end("Not found");
    } catch (error) {
      if (!res.headersSent) json2(res, error.status || (/not found/i.test(error.message) ? 404 : 500), { error: error.message });
    }
  });
  if (watch) {
    const { watch: fsWatch } = await import("fs");
    const watcher = fsWatch(cwd, { recursive: true }, (_event, name) => {
      if (name && /(^|[\\/])(\.git|node_modules|\.maverick[\\/]cache)([\\/]|$)/.test(String(name))) return;
      if (name && /[\\/]loops[\\/]/.test(String(name))) {
        loops.onFileChange(name);
        return;
      }
      clearTimeout2(timer);
      timer = setTimeout2(() => refresh().catch(() => {
      }), 300);
    });
    server.once("close", () => {
      watcher.close();
      for (const client of clients) client.end();
    });
  }
  server.once("close", () => {
    agents.close();
    loops.close();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(port), host, resolve);
  });
  return server;
}
export {
  startLens
};
