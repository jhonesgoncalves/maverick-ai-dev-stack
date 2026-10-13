import {
  EFFORTS,
  INTEGRITY_LEVELS,
  LOOP_LADDER_STEPS
} from "./chunk-5ZWVM3IA.js";

// src/loop/model.js
import { randomBytes } from "crypto";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

// src/loop/feedback.js
var FEEDBACK_LEVELS = ["detailed", "criteria", "generic"];
var DEFAULT_FEEDBACK = "criteria";
var PUBLIC = /* @__PURE__ */ new Set(["blast-radius-exceeded"]);
var WEAKENED = "a check was weakened, or a protected file or the repository changed; the changes were undone";
var WORSE = "the change made a check worse or broke a loop rule; the changes were undone";
var findingCause = (item) => ({ source: "integrity", kind: item.kind, text: `${item.kind}: ${item.file ? `${item.file} \u2014 ` : ""}${item.message}` });
var regressionCause = (item) => ({ source: "ratchet", kind: item.kind, text: `${item.kind}: ${item.detail}` });
function visibleReasons({ causes, reasons = [] } = {}, policy = DEFAULT_FEEDBACK) {
  if (policy === "detailed") return causes ? causes.map((cause) => cause.text) : reasons;
  if (!causes) return reasons.length ? [WORSE] : [];
  if (policy === "generic") return causes.length ? [WORSE] : [];
  const hidden = causes.some((cause) => cause.source === "integrity" && !PUBLIC.has(cause.kind));
  return [...causes.filter((cause) => cause.source !== "integrity" || PUBLIC.has(cause.kind)).map((cause) => cause.text), ...hidden ? [WEAKENED] : []];
}
var showFiles = (causes, policy) => policy === "detailed" || policy === "criteria" && Boolean(causes) && !causes.some((cause) => cause.source === "integrity" && !PUBLIC.has(cause.kind));
function judgeLines({ issues = [], unmet = [] } = {}, policy = DEFAULT_FEEDBACK) {
  if (policy === "detailed") return issues;
  if (policy === "generic") return ["the independent judge did not accept the change; make every criterion demonstrable in the code and its tests, not only claimed"];
  return unmet.length ? unmet.map((id) => `${id}: the change does not demonstrate this criterion yet`) : ["the change does not meet its criteria as a whole yet; re-read them and make each one demonstrable"];
}
function gateIssues(result, gate = {}, policy = DEFAULT_FEEDBACK) {
  const issues = result.issues || [];
  if (policy === "detailed" || !issues.length) return issues;
  if (gate.type === "maverick" && gate.run === "integrity") return [WEAKENED.replace("; the changes were undone", "")];
  if (gate.type === "judge") return judgeLines({ issues, unmet: (result.keys || []).filter((key) => /^[A-Z]+-\d+$/.test(key)) }, policy);
  if (policy === "generic" && gate.type === "maverick" && gate.run === "ablation") return ["a new test passes without the change, so it cannot fail"];
  return issues;
}

// src/loop/model.js
var LOOP_SCHEMA = "maverick.loop/v1";
var LOOP_OUTCOMES = ["running", "done", "budget-exceeded", "stalled-escalated", "disputed", "needs-human", "holdout-gap", "aborted", "integrity-violation"];
var LOOP_RESUMABLE = ["aborted", "budget-exceeded"];
var LOOP_HUMAN = ["stalled-escalated", "disputed", "needs-human", "holdout-gap", "integrity-violation"];
var LOOP_SEALED = ["auto", "required", "off"];
var LOOP_DEFAULTS = {
  flow: "loop",
  providers: [],
  isolation: "in-place",
  worktreeDir: null,
  setup: [],
  setupTimeoutMinutes: 20,
  budgets: { maxIterations: 10, maxMinutes: 120, maxCostUsd: null, maxTokens: null, forecast: "p90" },
  stall: { window: null, churnLines: 300, rollbackStreak: 3, overclaims: 2 },
  yield: { enabled: false, window: 4, metric: "tokens", floor: 0.01 },
  escalation: ["retry-with-diagnosis", "raise-effort", "switch-provider", "human"],
  maxEffort: "xhigh",
  // Secrets are never part of a change an agent makes on its own.
  protectedPaths: ["**/.env", "**/.env.*"],
  blastRadius: { maxFiles: 25, maxLines: 1500 },
  integrity: { level: "standard", severity: {}, allow: [] },
  ratchet: { newFailures: "count", recheck: 1 },
  gateTimeoutMinutes: 20,
  stopPollMs: 500,
  judge: { enabled: false, prefer: [], isolation: "export" },
  // What the next agent learns from a rejection or a verdict: see src/loop/feedback.js.
  feedback: DEFAULT_FEEDBACK,
  // A task's sealed tests decide its loop when they are ready (auto), always (required: the loop refuses without them) or never (off).
  sealed: "auto"
};
var number = (value) => value === void 0 || value === null || value === true || value === "" ? void 0 : Number(value);
function loopSettings(config = {}, flow, flags = {}) {
  const loop = config.loop || {}, d = LOOP_DEFAULTS;
  const integrity = typeof loop.integrity === "string" ? { level: loop.integrity } : loop.integrity || {};
  const budgets = { ...d.budgets, ...loop.budgets };
  for (const [flag, key] of [["maxIterations", "maxIterations"], ["maxMinutes", "maxMinutes"], ["maxCost", "maxCostUsd"], ["maxTokens", "maxTokens"]]) {
    const value = number(flags[flag]);
    if (value === void 0) continue;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a positive number`);
    budgets[key] = ["maxIterations", "maxTokens"].includes(key) ? Math.floor(value) : value;
  }
  const escalation = (loop.escalation || d.escalation).filter((step) => LOOP_LADDER_STEPS.includes(step));
  if (escalation.at(-1) !== "human") escalation.push("human");
  const level = typeof flags.integrity === "string" ? flags.integrity : integrity.level || d.integrity.level;
  if (!INTEGRITY_LEVELS.includes(level)) throw new Error(`integrity level must be one of ${INTEGRITY_LEVELS.join(", ")}`);
  const isolation = flags.worktree ? "worktree" : flags.inPlace ? "in-place" : loop.isolation || d.isolation;
  const feedback = typeof flags.feedback === "string" ? flags.feedback : loop.feedback || d.feedback;
  if (!FEEDBACK_LEVELS.includes(feedback)) throw new Error(`--feedback must be one of ${FEEDBACK_LEVELS.join(", ")}`);
  const sealed = typeof flags.sealed === "string" ? flags.sealed : loop.sealed || d.sealed;
  if (!LOOP_SEALED.includes(sealed)) throw new Error(`--sealed must be one of ${LOOP_SEALED.join(", ")}`);
  return {
    flow: typeof flags.flow === "string" ? flags.flow : loop.flow || d.flow,
    providers: loop.providers || d.providers,
    isolation,
    worktreeDir: loop.worktreeDir || d.worktreeDir,
    setup: loop.setup || d.setup,
    setupTimeoutMinutes: loop.setupTimeoutMinutes || d.setupTimeoutMinutes,
    budgets,
    stall: { ...d.stall, ...loop.stall, window: loop.stall?.window || flow?.contract?.noProgressWindow || 2 },
    yield: { ...d.yield, ...loop.yield },
    escalation,
    maxEffort: EFFORTS.includes(loop.maxEffort) ? loop.maxEffort : d.maxEffort,
    protectedPaths: loop.protectedPaths || d.protectedPaths,
    blastRadius: { ...d.blastRadius, ...loop.blastRadius },
    integrity: { level, severity: integrity.severity || {}, allow: integrity.allow || [] },
    ratchet: { ...d.ratchet, ...loop.ratchet },
    gateTimeoutMinutes: loop.gateTimeoutMinutes || d.gateTimeoutMinutes,
    stopPollMs: loop.stopPollMs || d.stopPollMs,
    judge: { ...d.judge, ...loop.judge, ...flags.judge && { enabled: true } },
    feedback,
    sealed
  };
}
var LANE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
function loopPaths(taskDir, loopId, lane = null) {
  const root = join(taskDir, "loops"), dir = loopId ? join(root, loopId) : null;
  return {
    root,
    dir,
    taskLock: join(root, lane ? `lock-${lane}` : "lock"),
    ...dir && { state: join(dir, "state.json"), ledger: join(dir, "ledger.jsonl"), stop: join(dir, "stop.json"), gitIndex: join(dir, "git-index"), inflight: join(dir, "inflight"), rejected: join(dir, "rejected") }
  };
}
function newLoopId(now = /* @__PURE__ */ new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}
var LOOP_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;
async function loopIds(taskDir) {
  return (await readdir(join(taskDir, "loops"), { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && LOOP_ID.test(entry.name)).map((entry) => entry.name).sort().reverse();
}
async function isTaskLoop(taskDir, loopId) {
  const state = await readFile(join(taskDir, "loops", loopId, "state.json"), "utf8").then(JSON.parse).catch(() => null);
  return Boolean(state) && !state.arena && !state.fork;
}
async function newestTaskLoop(taskDir) {
  for (const id of await loopIds(taskDir)) if (await isTaskLoop(taskDir, id)) return id;
  return null;
}
var NEXT_STEP = {
  running: "The loop is running. Watch it with maverick loop status, or stop it with maverick loop stop.",
  done: "Every subtask is done and every blocking gate passes. Review the change, then run the ship flow for the human review.",
  "budget-exceeded": "The budget ran out, or the next iteration would exceed it. Raise the budget (--max-iterations, --max-minutes, --max-cost, --max-tokens) and run the loop again.",
  "stalled-escalated": 'The loop stopped making progress and ran out of escalation steps. Read LOOP-ESCALATION.md, then resume with --resume --note "<your guidance>", or start over with --new.',
  disputed: 'The agent disputes a check instead of changing it. Decide the dispute (fix the check, or tell the agent it is right), then resume with --resume --note "<decision>".',
  "needs-human": 'The agent or the harness needs a decision. Read LOOP-ESCALATION.md, then resume with --resume --note "<answer>".',
  aborted: "The loop was stopped. Run it again to continue from the last accepted checkpoint.",
  "holdout-gap": 'Every visible check passes, but the sealed tests the builder never saw do not. Read them in your terminal with maverick seal status --reveal: if they are right, resume with --resume --note "<the missing behavior, not the test>"; if one is wrong, seal the task again; to finish without them, resume with --sealed off.',
  "integrity-violation": "Something outside the agent's remit changed (history, refs or the ledger). Run maverick loop verify, inspect the repository, then start over with --new."
};

export {
  findingCause,
  regressionCause,
  visibleReasons,
  showFiles,
  judgeLines,
  gateIssues,
  LOOP_SCHEMA,
  LOOP_OUTCOMES,
  LOOP_RESUMABLE,
  LOOP_HUMAN,
  LOOP_SEALED,
  LOOP_DEFAULTS,
  loopSettings,
  LANE_ID,
  loopPaths,
  newLoopId,
  LOOP_ID,
  loopIds,
  isTaskLoop,
  newestTaskLoop,
  NEXT_STEP
};
