#!/usr/bin/env node

// src/cli/app.tsx
import { render } from "ink";

// src/ui/screens/HomeScreen.tsx
import { useState } from "react";
import { Box as Box2, Text as Text3, useApp, useInput } from "ink";

// src/ui/components/Brand.tsx
import { Text } from "ink";

// src/ui/theme.ts
var theme = { brand: "#FF6A00" };

// src/ui/components/Brand.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Brand() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { color: process.env.NO_COLOR ? void 0 : theme.brand, children: "\u2694 MAVERICK" }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\\nAI DEV STACK" })
  ] });
}

// src/ui/components/WorkflowStepper.tsx
import { Box, Text as Text2 } from "ink";

// src/core/presets.js
var PRESET_IDS = ["lightweight", "standard", "spec-driven", "strict-review"];
var artifact = (id, file, template, sections) => ({ id, file, template, sections });
var common = {
  task: artifact("TASK", "TASK.md", "task-brief.md", ["Problem", "Goal", "Acceptance Criteria", "In Scope", "Out of Scope", "Verification"]),
  context: artifact("CONTEXT", "CONTEXT.md", "context-pack.md", ["Architecture Summary", "Relevant Paths", "Constraints", "Do Not Touch", "Commands"]),
  plan: artifact("PLAN", "PLAN.md", "plan.md", ["Approach", "Files", "Steps", "Tests"]),
  review: artifact("REVIEW", "REVIEW.md", "review.md", ["Scope", "Behavior", "Tests", "Security", "Decision"]),
  pr: artifact("PR", "PR.md", "pr-description.md", ["Summary", "What Changed", "How Verified", "Human Review"]),
  spec: artifact("SPEC", "SPEC.md", "spec.md", ["Problem", "Desired Behavior", "Functional Requirements", "Non-Functional Requirements", "Acceptance Criteria", "Domain Rules", "Constraints", "Edge Cases", "Out of Scope", "Open Questions", "Risks"]),
  risk: artifact("RISK", "RISK.md", "risk.md", ["Risk Assessment", "Mitigations", "Rollback", "Approval"])
};
var presets = {
  lightweight: { id: "lightweight", name: "Lightweight", description: "Small, low-risk changes.", bestFor: "Small, obvious changes with a narrow scope.", artifacts: [common.task, common.context, common.review], stages: ["brief", "context", "build", "verify", "review"] },
  standard: { id: "standard", name: "Standard", description: "Default engineering workflow.", bestFor: "Normal features and changes in an existing codebase.", artifacts: [common.task, common.context, common.plan, common.review, common.pr], stages: ["brief", "context", "plan", "build", "verify", "review", "pr"] },
  "spec-driven": { id: "spec-driven", name: "Spec Driven", description: "Specification-first workflow for ambiguous or complex work.", bestFor: "Complex or ambiguous features.", artifacts: [common.spec, common.task, common.context, common.plan, common.review, common.pr], stages: ["discover", "spec", "context", "plan", "build", "verify", "review", "pr"] },
  "strict-review": { id: "strict-review", name: "Strict Review", description: "Extra verification for high-risk changes.", bestFor: "High-risk, security-sensitive, data, payment, migration, or shared-infrastructure work.", artifacts: [common.task, common.context, common.plan, common.review, common.pr], stages: ["brief", "context", "plan", "build", "verify", "security", "review", "pr"], strict: true }
};
function getPreset(id = "standard") {
  return presets[id];
}
function requirePreset(id) {
  const preset = getPreset(id);
  if (!preset) throw new Error(`invalid preset "${id}"; choose: ${PRESET_IDS.join(", ")}`);
  return preset;
}
function stagesForPreset(id) {
  return requirePreset(id).stages;
}

// src/ui/components/WorkflowStepper.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function WorkflowStepper({ preset = "standard", activeStage }) {
  const stages = stagesForPreset(preset);
  return /* @__PURE__ */ jsx2(Box, { flexDirection: "column", children: stages.map((stage, index) => /* @__PURE__ */ jsxs2(Text2, { children: [
    String(index + 1).padStart(2, "0"),
    " ",
    stage === activeStage ? "\u25CF" : "\u25CB",
    " ",
    stage.toUpperCase()
  ] }, stage)) });
}

// src/ui/screens/HomeScreen.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var choices = ["Create a task", "Continue a task", "Review a change", "Validate artifacts", "Project doctor", "Help"];
function HomeScreen() {
  const [selected, setSelected] = useState(0);
  const { exit } = useApp();
  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    if (key.upArrow) setSelected((v) => Math.max(0, v - 1));
    if (key.downArrow) setSelected((v) => Math.min(choices.length - 1, v + 1));
  });
  return /* @__PURE__ */ jsxs3(Box2, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx3(Brand, {}),
    /* @__PURE__ */ jsx3(Text3, { children: "\\n\\nContext before code.\\n" }),
    /* @__PURE__ */ jsx3(WorkflowStepper, {}),
    /* @__PURE__ */ jsx3(Text3, { children: "\\nWhat do you want to do?\\n" }),
    choices.map((choice, index) => /* @__PURE__ */ jsxs3(Text3, { children: [
      index === selected ? "\u203A " : "  ",
      choice
    ] }, choice)),
    /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: "\\n\u2191\u2193 navigate   enter select   q quit" })
  ] });
}

// src/cli.js
import { mkdir as mkdir2, readFile as readFile2, writeFile as writeFile2, access as access2, copyFile, readdir as readdir2 } from "fs/promises";
import { resolve, dirname, join as join2, relative as relative2 } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createInterface } from "readline/promises";

// src/core/preset-suggestion.js
function recommendPreset({ risk, type, complexity, openQuestions = 0, estimatedFiles } = {}) {
  if (risk === "high") return { preset: "strict-review", reason: "High-risk changes need explicit verification, security review, and rollback evidence." };
  if (type === "migration" || type === "security") return { preset: "strict-review", reason: `${type === "migration" ? "Migrations" : "Security-sensitive changes"} need rollback and extra verification.` };
  if (complexity === "high" && Number(openQuestions) > 0) return { preset: "spec-driven", reason: "High complexity with open questions benefits from a shared specification." };
  if (risk === "low" && Number(estimatedFiles) <= 2) return { preset: "lightweight", reason: "Low risk and a small file footprint support a lightweight workflow." };
  return { preset: "standard", reason: "Standard is the default workflow for routine engineering changes." };
}

// src/core/project-tools.js
import { access, mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join, relative } from "path";
import { spawn } from "child_process";
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
function commandFor(pkg, name) {
  return pkg?.scripts?.[name] ? `npm run ${name}` : null;
}
async function inspectProject(cwd) {
  const packagePath = join(cwd, "package.json");
  const pkg = await exists(packagePath) ? await readJson(packagePath) : null;
  const entries = await readdir(cwd, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).filter((name) => !["node_modules", ".git", ".maverick", "dist", "build", "coverage"].includes(name)).sort();
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const manifests = ["package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "Gemfile"].filter((name) => files.includes(name));
  const commands = ["test", "lint", "typecheck", "build"].map((name) => ({ name, command: commandFor(pkg, name) })).filter((item) => item.command);
  const candidates = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", "CONTRIBUTING.md"];
  const instructions = (await Promise.all(candidates.map(async (name) => await exists(join(cwd, name)) ? name : null))).filter(Boolean);
  return { name: pkg?.name || cwd.split(/[\\/]/).pop(), manifests, directories, files: files.slice(0, 40), scripts: pkg?.scripts || {}, commands, instructions, language: pkg ? "JavaScript/TypeScript" : "unknown", framework: pkg?.dependencies?.react ? "React" : void 0 };
}
function renderProjectMap(map) {
  const commands = map.commands.length ? map.commands.map((item) => `- ${item.name}: \`${item.command}\``).join("\n") : "- No standard npm verification commands detected.";
  return `# Project Map

Generated by Maverick. Refresh with \`maverick map\`.

## Stack
- Project: ${map.name}
- Language: ${map.language}
- Framework: ${map.framework || "not detected"}
- Manifests: ${map.manifests.join(", ") || "none detected"}

## Top-level areas
${map.directories.map((name) => `- \`${name}/\``).join("\n") || "- none"}

## Verification commands
${commands}

## Repository instructions
${map.instructions.map((name) => `- \`${name}\``).join("\n") || "- none detected"}

## Context guidance
Read the nearest instruction file and only the paths relevant to the task before editing.
`;
}
async function executeCommand(cwd, command) {
  const [bin, ...args2] = command.split(" ");
  return new Promise((resolve2) => {
    const child = spawn(bin, args2, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output2 = "";
    child.stdout.on("data", (chunk) => {
      output2 += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output2 += chunk;
    });
    child.on("error", (error) => resolve2({ command, ok: false, code: null, output: error.message }));
    child.on("close", (code) => resolve2({ command, ok: code === 0, code, output: output2.slice(-12e3) }));
  });
}
async function gitDiff(cwd, against = "HEAD") {
  const result = await executeCommand(cwd, `git diff ${against} --`);
  return result.ok ? result.output : "";
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
  const path = join(dir, "EVIDENCE.md");
  await writeFile(path, body);
  return path;
}
async function findReferences(cwd, target, maxResults = 40) {
  const needle = target.split("/").pop().replace(/\.[^.]+$/, "");
  const ignored = /* @__PURE__ */ new Set(["node_modules", ".git", ".maverick", "dist", "build", "coverage"]);
  const results = [];
  async function visit(directory) {
    if (results.length >= maxResults) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (results.length >= maxResults || ignored.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        try {
          const text = await readFile(path, "utf8");
          if (text.includes(needle)) results.push(relative(cwd, path));
        } catch {
        }
      }
    }
  }
  await visit(cwd);
  return results;
}

// src/cli.js
var __dirname = dirname(fileURLToPath(import.meta.url));
var root = resolve(__dirname, "..");
var slugOk = /^[a-z0-9][a-z0-9-]{1,80}$/;
var defaultConfig = { version: 1, project: { name: "", language: "", framework: "" }, workflow: { requirePlan: true, requireReview: true, requireTests: true, defaultPreset: "standard" }, adapter: "generic", taskRoot: ".maverick/tasks", requiredTaskSections: ["Problem", "Goal", "Acceptance Criteria", "In Scope", "Out of Scope", "Verification"], requiredContextSections: ["Architecture Summary", "Relevant Paths", "Constraints", "Do Not Touch", "Commands"] };
async function exists2(path) {
  try {
    await access2(path);
    return true;
  } catch {
    return false;
  }
}
async function json(path) {
  return JSON.parse(await readFile2(path, "utf8"));
}
function pretty(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function rel(cwd, path) {
  return relative2(cwd, path) || ".";
}
function output(message) {
  console.log(message);
}
function brand() {
  return process.env.NO_COLOR ? "\u2694 MAVERICK" : "\x1B[38;5;208m\u2694 MAVERICK\x1B[0m";
}
function mergeConfig(config = {}) {
  return { ...defaultConfig, ...config, project: { ...defaultConfig.project, ...config.project }, workflow: { ...defaultConfig.workflow, ...config.workflow } };
}
async function loadConfig(cwd) {
  const canonical = join2(cwd, ".maverick", "config.json"), legacy = join2(cwd, "maverick.config.json");
  if (await exists2(canonical)) return mergeConfig(await json(canonical));
  if (await exists2(legacy)) return mergeConfig(await json(legacy));
  return mergeConfig();
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
function parseOptions(args2) {
  const positional = [], options = {};
  for (let i = 0; i < args2.length; i++) {
    if (args2[i].startsWith("--")) {
      const key = args2[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = args2[i + 1]?.startsWith("--") || args2[i + 1] === void 0 ? true : args2[++i];
    } else positional.push(args2[i]);
  }
  return { positional, options };
}
function help() {
  output(`MAVERICK AI DEV STACK

Usage: maverick <command> [task] [--preset <preset>]

Commands:
  init                              Initialize .maverick/config.json
  task <slug> [--preset <preset>]  Create task artefacts
  map                               Build repository context map
  packet | run <task> --agent name  Compile a focused agent task packet
  checkpoint <task>                 Save current diff and Git state
  verify <task> [--json]            Run detected checks; save EVIDENCE.md
  security <task>                   Scan changed diff for high-signal risks
  deps <task>                       Report dependency and lockfile changes
  review <task> --diff [--against]  Review changed files against task scope
  pr <task>                         Generate evidence-backed PR draft
  status [--json]                   Show task stage and pending gates
  presets [show <preset>]           List or inspect workflow presets
  suggest [--risk high]             Recommend a preset from local rules
  validate <slug> [--json]          Validate task artefacts and sections
  doctor [--fix] | info | version

Preset values: ${PRESET_IDS.join(", ")}
Standard is the default. Every preset includes human review.`);
}
async function chooseDefaultPreset() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "standard";
  output("Choose your default workflow\n1. Standard \u2014 Default engineering workflow.\n2. Lightweight \u2014 Small, low-risk changes.\n3. Spec Driven \u2014 Specification-first for complex work.\n4. Strict Review \u2014 Extra verification for high-risk changes.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Choice [1]: ");
  prompt.close();
  return { 1: "standard", 2: "lightweight", 3: "spec-driven", 4: "strict-review" }[answer.trim() || "1"] || "standard";
}
async function initProject(cwd) {
  const dir = join2(cwd, ".maverick"), path = join2(dir, "config.json");
  if (await exists2(path)) throw new Error(`configuration already exists: ${rel(cwd, path)}`);
  const preset = await chooseDefaultPreset();
  await mkdir2(dir, { recursive: true });
  const name = cwd.split(/[\\/]/).filter(Boolean).pop() || "my-project";
  await writeFile2(path, pretty({ ...defaultConfig, workflow: { ...defaultConfig.workflow, defaultPreset: preset }, project: { ...defaultConfig.project, name } }));
  output(`${brand()}
\u2713 project initialized: ${rel(cwd, path)}
Default preset: ${getPreset(preset).name}`);
}
async function taskPath(cwd, config, slug) {
  requireSlug(slug);
  return join2(cwd, config.taskRoot, slug);
}
async function taskPreset(dir, config) {
  const meta = join2(dir, "TASK.json");
  if (await exists2(meta)) return (await json(meta)).preset || config.workflow.defaultPreset;
  const file = join2(dir, "TASK.md");
  if (await exists2(file)) {
    const match = (await readFile2(file, "utf8")).match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    const preset = match?.[1].match(/^preset:\s*([^\s#]+)\s*$/m)?.[1];
    if (preset) return preset;
  }
  return config.workflow.defaultPreset || "standard";
}
async function createTask(cwd, slug, options = {}) {
  const config = await loadConfig(cwd), preset = requirePreset(options.preset || config.workflow.defaultPreset || "standard"), dir = await taskPath(cwd, config, slug);
  if (await exists2(dir)) throw new Error(`task already exists: ${rel(cwd, dir)}; choose another slug or remove it deliberately`);
  await mkdir2(dir, { recursive: true });
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), artifacts = [...preset.artifacts];
  if ((options.riskDoc || config.workflow.riskDocumentation) && preset.strict) artifacts.push({ id: "RISK", file: "RISK.md", template: "risk.md", sections: ["Risk Assessment", "Mitigations", "Rollback", "Approval"] });
  for (const item of artifacts) await writeFile2(join2(dir, item.file), replaceVars(await readFile2(join2(root, "templates", item.template), "utf8"), { TASK_SLUG: slug, DATE: today }));
  await writeFile2(join2(dir, "TASK.json"), pretty({ preset: preset.id, createdAt: today }));
  output(`${brand()}
\u2713 task created: ${rel(cwd, dir)}
Preset: ${preset.name}
Stages: ${preset.stages.map((s) => s.toUpperCase()).join(" \u2192 ")}`);
}
async function getTask(cwd, slug) {
  const config = await loadConfig(cwd), dir = await taskPath(cwd, config, slug);
  if (!await exists2(dir)) throw new Error(`task not found: ${rel(cwd, dir)}; run maverick task ${slug} first`);
  return { config, dir, preset: requirePreset(await taskPreset(dir, config)) };
}
async function showArtifact(cwd, slug, filename, label) {
  const { dir } = await getTask(cwd, slug), path = join2(dir, filename);
  output(`${label}: ${rel(cwd, path)}${await exists2(path) ? "" : " (not included by this preset)"}`);
}
async function mapProject(cwd, options = {}) {
  const map = await inspectProject(cwd), dir = join2(cwd, ".maverick", "context"), path = join2(dir, "PROJECT_MAP.md");
  await mkdir2(dir, { recursive: true });
  await writeFile2(path, renderProjectMap(map));
  if (options.json) return output(JSON.stringify({ ...map, path: rel(cwd, path) }, null, 2));
  output(`${brand()} / MAP
\u2713 project map: ${rel(cwd, path)}
Detected ${map.commands.length} verification command(s) and ${map.directories.length} top-level area(s).`);
}
async function taskPacket(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const mapPath = join2(cwd, ".maverick", "context", "PROJECT_MAP.md");
  const contents = [];
  for (const file of ["SPEC.md", "TASK.md", "CONTEXT.md", "PLAN.md"]) if (await exists2(join2(dir, file))) contents.push(`## ${file}

${await readFile2(join2(dir, file), "utf8")}`);
  if (await exists2(mapPath)) contents.unshift(`## PROJECT_MAP.md

${await readFile2(mapPath, "utf8")}`);
  const path = join2(dir, "TASK-PACKET.md");
  await writeFile2(path, `# Maverick Task Packet

Preset: ${preset.name}
Agent: ${options.agent || "generic"}

Follow repository instructions, stay in scope, run relevant verification, and leave findings for human review.

${contents.join("\n\n")}`);
  output(options.json ? JSON.stringify({ preset: preset.id, agent: options.agent || "generic", path: rel(cwd, path) }) : `${brand()} / PACKET
\u2713 agent packet: ${rel(cwd, path)}
Agent: ${options.agent || "generic"}`);
}
async function verifyTask(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const map = await inspectProject(cwd);
  const configured = config.defaultVerification || [];
  const commands = map.commands.map((item) => item.command).filter((command) => !configured.length || configured.some((name) => command.endsWith(name)));
  const selected = commands.length ? commands : map.commands.map((item) => item.command);
  const results = [];
  for (const command of selected) results.push(await executeCommand(cwd, command));
  const evidence = await writeEvidence(dir, slug, results);
  const payload = { ok: results.every((result) => result.ok), results: results.map((result) => ({ command: result.command, ok: result.ok, code: result.code })), evidence: rel(cwd, evidence) };
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
  const diff = await gitDiff(cwd, options.against || "HEAD");
  const files = [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]))];
  const findings = [];
  if (!diff) findings.push("No git diff found against the selected base.");
  if (files.some((file) => /(^|\/)(\.env|secrets?|credentials?)/i.test(file))) findings.push("Security: sensitive-looking path changed; confirm secrets and PII were not included.");
  if (files.some((file) => /(?:package-lock|yarn\.lock|pnpm-lock|requirements\.txt|Cargo\.lock)/.test(file))) findings.push("Dependencies: lockfile changed; review new packages, licenses, and vulnerabilities.");
  if (preset.strict && !await exists2(join2(dir, "EVIDENCE.md"))) findings.push("Strict Review: test evidence is missing; run maverick verify first.");
  const path = join2(dir, "REVIEW-FINDINGS.md");
  await writeFile2(path, `# Diff Review Findings \u2014 ${slug}

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
  const path = join2(dir, "CHECKPOINT.md");
  await writeFile2(path, `# Checkpoint \u2014 ${slug}

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
  const task = await readFile2(join2(dir, "TASK.md"), "utf8");
  const diff = await gitDiff(cwd, options.against || "HEAD");
  const changed = [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]))];
  const expected = (task.match(/^## Expected Changed Files\n([\s\S]*?)(?=^## |$)/m)?.[1].match(/`([^`]+)`/g) || []).map((value) => value.slice(1, -1)).filter((value) => !/FILL ME/i.test(value));
  const outsideScope = expected.length ? changed.filter((file) => !expected.includes(file)) : [];
  const maxFiles = config.maxChangedFilesGuideline || 8;
  const findings = [changed.length > maxFiles ? `Change budget exceeded: ${changed.length}/${maxFiles} files.` : null, ...outsideScope.map((file) => `Not listed in Expected Changed Files: ${file}`)].filter(Boolean);
  const report = join2(dir, "SCOPE-GUARD.md");
  await writeFile2(report, `# Scope Guard \u2014 ${slug}

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
async function learn(cwd, slug, options = {}) {
  await getTask(cwd, slug);
  if (!options.rule || options.rule === true) throw new Error('provide a rule with --rule "..."');
  const dir = join2(cwd, ".maverick"), path = join2(dir, "LEARNINGS.md");
  await mkdir2(dir, { recursive: true });
  const existing = await exists2(path) ? await readFile2(path, "utf8") : "# Maverick Learnings\n\nProposed reusable rules. Promote only after team review.\n";
  await writeFile2(path, `${existing}
- [ ] ${options.rule}
  - Source task: \`${slug}\`
`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), rule: options.rule }) : `${brand()} / LEARN
\u2713 proposed rule saved: ${rel(cwd, path)}`);
}
async function handoff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const present = {};
  for (const file of ["EVIDENCE.md", "REVIEW-FINDINGS.md", "SECURITY-REPORT.md", "DEPENDENCY-REVIEW.md", "SCOPE-GUARD.md", "CHECKPOINT.md"]) present[file] = await exists2(join2(dir, file));
  const task = await readFile2(join2(dir, "TASK.md"), "utf8");
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || "See TASK.md.";
  const remaining = Object.entries(present).filter(([, value]) => !value).map(([file]) => file);
  const path = join2(dir, "HANDOFF.md");
  await writeFile2(path, `# Handoff \u2014 ${slug}

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
async function readiness(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const required = ["EVIDENCE.md", "REVIEW-FINDINGS.md", "SECURITY-REPORT.md", "DEPENDENCY-REVIEW.md", "SCOPE-GUARD.md"];
  if (preset.strict) required.push("CHECKPOINT.md");
  const available = [];
  const missing = [];
  for (const file of required) (await exists2(join2(dir, file)) ? available : missing).push(file);
  const review = await exists2(join2(dir, "REVIEW.md")) ? await readFile2(join2(dir, "REVIEW.md"), "utf8") : "";
  const decisionMade = /- \[[xX]\] (?:approve|approve with follow-up|request changes)/.test(review);
  if (!decisionMade) missing.push("Human decision in REVIEW.md");
  const ready = missing.length === 0;
  const path = join2(dir, "MERGE-READINESS.md");
  await writeFile2(path, `# Merge Readiness \u2014 ${slug}

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
  const dir = join2(cwd, ".maverick"), path = join2(dir, "policy.json");
  if (action === "init") {
    if (await exists2(path)) throw new Error(`policy already exists: ${rel(cwd, path)}`);
    await mkdir2(dir, { recursive: true });
    await writeFile2(path, await readFile2(join2(root, "templates", "policy.json"), "utf8"));
    return output(`${brand()} / POLICY
\u2713 policy created: ${rel(cwd, path)}`);
  }
  if (!await exists2(path)) throw new Error("policy not found; run maverick policy init");
  const rules = await json(path);
  if (action === "show") return output(options.json ? JSON.stringify(rules, null, 2) : `${brand()} / POLICY
${pretty(rules)}`);
  if (action !== "check") throw new Error("use policy init, policy show, or policy check <task>");
  const { dir: taskDir, preset } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || "HEAD");
  const changed = [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]))];
  const sensitive = changed.filter((file) => rules.sensitivePaths.some((prefix) => file.includes(prefix)));
  const findings = [];
  if (changed.length > (rules.maxChangedFiles || Infinity)) findings.push(`Changed ${changed.length} files; policy maximum is ${rules.maxChangedFiles}.`);
  if (sensitive.length && preset.id !== rules.requiredPresetForSensitivePaths) findings.push(`Sensitive paths require preset ${rules.requiredPresetForSensitivePaths}: ${sensitive.join(", ")}.`);
  const report = join2(taskDir, "POLICY-CHECK.md");
  await writeFile2(report, `# Policy Check \u2014 ${slug}

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
async function adapter(cwd, action, name, options = {}) {
  const adapters = { codex: ["adapters/codex/AGENTS.md.example", "AGENTS.md"], "claude-code": ["adapters/claude-code/CLAUDE.md.example", "CLAUDE.md"], cursor: ["adapters/cursor/maverick.mdc.example", ".cursor/rules/maverick.mdc"], generic: ["adapters/generic/ROLE_PROMPT.txt", ".maverick/ROLE_PROMPT.txt"] };
  if (action === "list") return output(options.json ? JSON.stringify(Object.keys(adapters)) : `${brand()} / ADAPTERS
${Object.keys(adapters).join("\n")}`);
  if (action !== "install" || !adapters[name]) throw new Error(`use adapter list or adapter install <${Object.keys(adapters).join("|")}>`);
  const [source, target] = adapters[name], destination = join2(cwd, target);
  if (await exists2(destination)) throw new Error(`adapter target already exists: ${rel(cwd, destination)}`);
  await mkdir2(dirname(destination), { recursive: true });
  await copyFile(join2(root, source), destination);
  output(options.json ? JSON.stringify({ adapter: name, path: rel(cwd, destination) }) : `${brand()} / ADAPTER
\u2713 ${name}: ${rel(cwd, destination)}`);
}
async function ci(cwd, provider, slug, options = {}) {
  if (provider !== "github") throw new Error("only the github CI generator is currently available");
  await getTask(cwd, slug);
  const destination = join2(cwd, ".github", "workflows", `maverick-${slug}.yml`);
  if (await exists2(destination)) throw new Error(`CI workflow already exists: ${rel(cwd, destination)}`);
  await mkdir2(dirname(destination), { recursive: true });
  const content = replaceVars(await readFile2(join2(root, "templates", "github-actions-maverick.yml"), "utf8"), { TASK_SLUG: slug });
  await writeFile2(destination, content);
  output(options.json ? JSON.stringify({ provider, task: slug, path: rel(cwd, destination) }) : `${brand()} / CI
\u2713 GitHub Actions workflow: ${rel(cwd, destination)}`);
}
async function securityScan(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || "HEAD");
  const rules = [{ name: "Private key material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }, { name: "Likely cloud/API secret assignment", pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"\s]{12,}/i }, { name: "Potentially unsafe dynamic execution", pattern: /(?:eval\(|child_process\.exec\(|shell:\s*true)/ }];
  const findings = rules.filter((rule) => rule.pattern.test(diff)).map((rule) => rule.name);
  const path = join2(dir, "SECURITY-REPORT.md");
  await writeFile2(path, `# Security Scan \u2014 ${slug}

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
  const diff = await gitDiff(cwd, options.against || "HEAD");
  const lockfiles = [...new Set([...diff.matchAll(/^\+\+\+ b\/(.*(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|poetry\.lock|Cargo\.lock))$/gm)].map((match) => match[1]))];
  const manifests = [...new Set([...diff.matchAll(/^\+\+\+ b\/(.*(?:package\.json|pyproject\.toml|go\.mod|Cargo\.toml))$/gm)].map((match) => match[1]))];
  const path = join2(dir, "DEPENDENCY-REVIEW.md");
  await writeFile2(path, `# Dependency Review \u2014 ${slug}

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
async function draftPr(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const task = await readFile2(join2(dir, "TASK.md"), "utf8");
  const evidence = await exists2(join2(dir, "EVIDENCE.md")) ? await readFile2(join2(dir, "EVIDENCE.md"), "utf8") : "Verification evidence has not been captured.";
  const findings = await exists2(join2(dir, "REVIEW-FINDINGS.md")) ? "Diff review report is available in REVIEW-FINDINGS.md." : "Diff review has not been run.";
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || "See TASK.md.";
  const path = join2(dir, "PR-DRAFT.md");
  await writeFile2(path, `# PR Draft \u2014 ${slug}

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
function validatorArtifacts(preset, riskDoc) {
  const items = preset.artifacts.map((item) => ({ ...item, sections: preset.strict && item.id === "TASK" ? [...item.sections, "Risk", "Expected Changed Files", "Actual Changed Files"] : preset.strict && item.id === "PLAN" ? [...item.sections, "Rollback"] : preset.strict && item.id === "REVIEW" ? ["Scope", "Behavior", "Tests", "Security", "Reliability", "Observability", "Dependencies", "Rollback", "Maintainability", "Final Decision"] : item.sections }));
  return riskDoc ? [...items, { id: "RISK", file: "RISK.md", sections: ["Risk Assessment", "Mitigations", "Rollback", "Approval"] }] : items;
}
async function validate(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  let errors = 0, warnings = 0;
  const results = [];
  for (const item of validatorArtifacts(preset, await exists2(join2(dir, "RISK.md")))) {
    const path = join2(dir, item.file);
    if (!await exists2(path)) {
      results.push({ file: item.file, status: "FAIL", message: "missing" });
      errors++;
      continue;
    }
    const text = await readFile2(path, "utf8");
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
async function status(cwd, options = {}) {
  const config = await loadConfig(cwd), base = join2(cwd, config.taskRoot);
  if (!await exists2(base)) return output(options.json ? "[]" : "No tasks yet. Run maverick task add-your-feature.");
  const tasks = [];
  for (const entry of (await readdir2(base, { withFileTypes: true })).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join2(base, entry.name), preset = await taskPreset(dir, config);
    const evidence = await exists2(join2(dir, "EVIDENCE.md")), findings = await exists2(join2(dir, "REVIEW-FINDINGS.md"));
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
  const config = await loadConfig(cwd), map = await inspectProject(cwd);
  const checks = [["Node >= 20", Number(process.versions.node.split(".")[0]) >= 20], ["Git available", gitAvailable()], ["Git repository", await exists2(join2(cwd, ".git"))], ["Repository instructions", map.instructions.length > 0], ["Verification scripts", map.commands.length > 0]];
  const fixes = checks.filter(([, ok]) => !ok).map(([name]) => `Add or configure: ${name}`);
  if (options.json) return output(JSON.stringify({ checks: checks.map(([name, ok]) => ({ name, ok })), fixes }, null, 2));
  for (const [name, ok] of checks) output(`${ok ? "PASS" : "WARN"} ${name}`);
  if (options.fix) output(`Suggested fixes:
${fixes.map((fix) => `- ${fix}`).join("\n") || "- No fixes needed."}`);
  output(`Default preset: ${config.workflow.defaultPreset}
No telemetry is collected by Maverick.`);
}
function info() {
  output("Maverick AI Dev Stack\nVersion 1.0.0\nA vendor-neutral engineering workflow. No telemetry by default.");
}
async function main(args2, cwd = process.cwd()) {
  const { positional, options } = parseOptions(args2), [command, arg, third] = positional;
  if (!command || ["help", "--help", "-h"].includes(command)) return help();
  if (command === "init") return arg ? createTask(cwd, arg, options) : initProject(cwd);
  if (["task", "create"].includes(command)) return createTask(cwd, arg, options);
  if (command === "map") return mapProject(cwd, options);
  if (command === "packet" || command === "run") return taskPacket(cwd, arg, options);
  if (command === "checkpoint") return checkpoint(cwd, arg, options);
  if (command === "impact") return impact(cwd, arg, options);
  if (command === "guard") return guardScope(cwd, arg, options);
  if (command === "learn") return learn(cwd, arg, options);
  if (command === "handoff") return handoff(cwd, arg, options);
  if (command === "readiness") return readiness(cwd, arg, options);
  if (command === "policy") return policy(cwd, arg, third, options);
  if (command === "adapter") return adapter(cwd, arg, third, options);
  if (command === "ci") return ci(cwd, arg, third, options);
  if (command === "verify") return verifyTask(cwd, arg, options);
  if (command === "security") return securityScan(cwd, arg, options);
  if (command === "deps") return dependencyReview(cwd, arg, options);
  if (command === "pr") return draftPr(cwd, arg, options);
  if (command === "presets") return showPresets(arg === "show" ? third : void 0);
  if (command === "suggest") {
    const rec = recommendPreset(options);
    return output(options.json ? JSON.stringify(rec) : `Recommended preset: ${getPreset(rec.preset).name}
Reason: ${rec.reason}`);
  }
  if (command === "validate") return validate(cwd, arg, options);
  if (command === "context") return showArtifact(cwd, arg, "CONTEXT.md", "Context");
  if (command === "plan") return showArtifact(cwd, arg, "PLAN.md", "Plan");
  if (command === "review") return options.diff ? reviewDiff(cwd, arg, options) : showArtifact(cwd, arg, "REVIEW.md", "Review");
  if (command === "doctor") return doctor(cwd, options);
  if (command === "status") return status(cwd, options);
  if (["info", "version", "--version", "-v"].includes(command)) return info();
  throw new Error(`unknown command: ${command}; run maverick help`);
}

// src/cli/app.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
var args = process.argv.slice(2);
if (args.length === 0 && process.stdin.isTTY && !process.env.CI && !args.includes("--json")) render(/* @__PURE__ */ jsx4(HomeScreen, {}));
else main(args).catch((error) => {
  console.error(`maverick: ${error.message}`);
  process.exitCode = 1;
});
