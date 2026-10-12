import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { layoutFor, resolveTargets } from '../capabilities/adapters.js';
import { findCapability, loadCatalog } from '../capabilities/catalog.js';
import { applyChanges, lockEntry, planInstall, readLock, writeLock } from '../capabilities/engine.js';
import { loadConfig } from '../core/config.js';
import { buildStagePrompt, parseGeneration, slugFromIdea, stageSkill, workflowForIdea } from '../core/generation.js';
import { groundChange } from '../core/grounding.js';
import { heading, keyword, languageName, languageRule, projectLanguage } from '../core/language.js';
import { STAGE_SKILLS, taskStage } from '../core/pipeline.js';
import { artifactForStage, planningStages, requirePreset } from '../core/presets.js';
import { lintTask } from '../core/quality.js';
import { getTask, taskPath } from '../core/tasks.js';
import { brand, commandAvailable, exists, output, pretty, rel, requireSlug } from '../core/util.js';
import { resolveRun } from '../runtime/policy.js';
import { providersFor, resolveBin } from '../runtime/providers.js';
import { runAgent } from '../runtime/session.js';
import { addSubtask, loadGraph } from '../subtasks/graph.js';
import { printer } from './agent.js';

const str = value => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const INTERACTIVE_ORDER = ['claude-code', 'codex', 'cursor', 'gemini', 'antigravity', 'copilot', 'kiro', 'opencode'];
/** The whole flow as skills, so everything after `maverick new` happens inside the agent. */
export const FLOW_SKILLS = ['maverick-new', 'maverick-prd', 'maverick-spec', 'maverick-techspec', 'maverick-tasks', 'maverick-build', 'maverick-review', 'maverick-ship', 'maverick-status', 'maverick-sync', 'maverick-loop'];
const FLOW_CAPABILITIES = FLOW_SKILLS.map(name => `skill/${name}`);
/** The skill that moves a task forward from each stage. */
export const SKILL_FOR_STAGE = { prd: 'maverick-new', spec: 'maverick-new', techspec: 'maverick-new', tasks: 'maverick-new', build: 'maverick-build', verify: 'maverick-review', security: 'maverick-review', review: 'maverick-review', pr: 'maverick-ship', done: 'maverick-status' };
const artifactFor = artifactForStage;
const TASK_SECTIONS = ['Goal', 'Acceptance Criteria', 'Files', 'Steps', 'Verification'];
/** Requirement keywords to write in the docs language. */
const stageKeywords = docs => ({ requirement: keyword('requirement', docs), scenario: keyword('scenario', docs), must: keyword('must', docs), when: keyword('when', docs), then: keyword('then', docs) });
const stageLine = (preset, current) => planningStages(preset).map(stage => (stage === current ? `[${stage.toUpperCase()}]` : stage.toUpperCase())).join(' → ');

async function uniqueSlug(cwd, config, base) {
  for (let index = 1; ; index++) {
    const slug = index === 1 ? base : `${base}-${index}`;
    if (!await exists(taskPath(cwd, config, slug))) return slug;
  }
}

/** Installs the flow skills for one or more agents. Only bundled Markdown skills are installed, never code. */
export async function installFlowSkills(cwd, config, target) {
  const [lock, catalog, adapters] = await Promise.all([readLock(cwd), loadCatalog(cwd, config), resolveTargets(cwd, config, target)]);
  const plans = [], warnings = [];
  for (const reference of FLOW_CAPABILITIES) {
    const plan = await planInstall(cwd, findCapability(catalog, reference), adapters, lock, { layout: layoutFor(config) });
    if (plan.conflicts.length) { warnings.push(`${reference}: ${plan.conflicts.map(item => `${item.path} (${item.reason})`).join('; ')}`); continue; }
    if (plan.changes.some(change => change.op !== 'unchanged')) plans.push(plan);
  }
  if (plans.length) {
    await applyChanges(cwd, plans.flatMap(plan => plan.changes));
    for (const plan of plans) lock.capabilities[plan.capability.ref] = lockEntry(plan);
    await writeLock(cwd, lock);
  }
  return { installed: plans.map(plan => plan.capability.ref), warnings };
}

/** Every agent CLI installed on this machine that Maverick can open. */
export function installedAgents(cwd, config) {
  return providersFor(config).filter(provider => provider.interactive && commandAvailable(resolveBin(provider, config, cwd), cwd));
}

/** The interactive agent to open: --agent, then runtime.default, then the first one installed. */
export function pickInteractiveAgent(cwd, config, requested) {
  const providers = providersFor(config).filter(provider => provider.interactive);
  if (requested) {
    const provider = providers.find(item => item.id === requested);
    if (!provider) throw new Error(`${requested} cannot be opened interactively; choose ${providers.map(item => item.id).join(', ')}`);
    if (!commandAvailable(resolveBin(provider, config, cwd), cwd)) throw new Error(`${provider.name} is not installed (${resolveBin(provider, config, cwd)} not found on PATH)`);
    return provider;
  }
  const order = [config.runtime?.default?.provider, ...INTERACTIVE_ORDER].filter(Boolean);
  return order.map(id => providers.find(item => item.id === id)).find(provider => provider && commandAvailable(resolveBin(provider, config, cwd), cwd));
}

function openAgent(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
}

async function newTask(cwd, idea, options = {}) {
  const config = await loadConfig(cwd), text = str(idea);
  // Inside an agent's shell (no TTY) the task is only created; --launch forces opening the agent anyway.
  const interactive = Boolean(options.launch) || (!options.noLaunch && !options.json && !options.headless && process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
  if (!text) {
    if (!interactive) throw new Error('describe what to build: maverick new "add pagination to the orders list"');
    return launch(cwd, config, str(options.agent), 'Use the maverick-new skill. Ask me what I want to build, then create the task with maverick new "<idea>" and plan it with me.');
  }
  let slug, reason, resumed = false;
  // `maverick new <existing-slug>` resumes that task where it stopped.
  if (/^[a-z0-9][a-z0-9-]{1,80}$/.test(text) && await exists(taskPath(cwd, config, text))) { slug = text; resumed = true; }
  else {
    slug = str(options.slug) || await uniqueSlug(cwd, config, slugFromIdea(text));
    requireSlug(slug);
    if (await exists(taskPath(cwd, config, slug))) throw new Error(`task already exists: ${rel(cwd, taskPath(cwd, config, slug))}; resume it with maverick new ${slug}`);
    // --strict and --spec pick the workflow; otherwise high-risk ideas get strict and contract-heavy ones spec-driven.
    const chosen = options.strict ? 'strict' : options.spec ? 'spec-driven' : str(options.workflow) && requirePreset(str(options.workflow)).id;
    // A spec-driven suggestion only upgrades the standard default, never a stricter one.
    const suggested = workflowForIdea(text), upgrade = suggested === 'strict' || (suggested === 'spec-driven' && config.workflow.default === 'standard');
    const workflow = chosen || (upgrade ? suggested : config.workflow.default);
    reason = options.strict ? 'chosen with --strict' : options.spec ? 'chosen with --spec' : chosen ? 'chosen with --workflow' : !upgrade ? '' : suggested === 'strict' ? 'the idea touches security, data, payments or migrations' : 'the idea defines an API, integration or shared contract; pass --workflow standard to skip SPEC.md';
    await mkdir(taskPath(cwd, config, slug), { recursive: true });
    await writeFile(join(taskPath(cwd, config, slug), 'TASK.json'), pretty({ idea: text, workflow, createdAt: new Date().toISOString().slice(0, 10) }));
  }
  const { dir, meta, preset } = await getTask(cwd, slug), status = await taskStage(dir, preset, slug);
  const ground = await groundChange(cwd, meta.idea || '');
  if (options.headless) return generate(cwd, slug, undefined, options);
  if (options.json) return output(JSON.stringify({ task: slug, created: !resumed, idea: meta.idea, workflow: preset.id, stage: status.stage, next: status.next, grounding: { relevant: ground.relevant.map(item => item.path), tests: ground.tests, routes: ground.routes.length } }, null, 2));
  output(`${brand()} / NEW\n${resumed ? '↻ resuming' : '✓ task created'}: ${slug}  (${rel(cwd, dir)})\nIdea: ${meta.idea}\nWorkflow: ${preset.name}${reason ? ` (${reason})` : ''}\nPipeline: ${stageLine(preset, status.stage)}${planningStages(preset).includes(status.stage) ? '' : ` → ${status.stage.toUpperCase()}`}\nGrounded in: ${ground.relevant.slice(0, 3).map(item => item.path).join(', ') || 'no matching files'}${ground.relevant.length > 3 ? ` (+${ground.relevant.length - 3} more)` : ''}`);
  if (!interactive) return output(`\nNext: ${status.next}\nIn your agent, use the ${SKILL_FOR_STAGE[status.stage]} skill for ${slug}; for a headless run: maverick generate ${slug} --agent <trusted-provider>`);
  const skill = SKILL_FOR_STAGE[status.stage];
  await launch(cwd, config, str(options.agent), `Use the ${skill} skill for the Maverick task "${slug}": ${meta.idea}\nIt is at the ${status.stage} stage. Start with: maverick instructions ${slug} --json`);
  const after = await taskStage(dir, preset, slug);
  output(`\n${brand()} / NEW\nTask ${slug} is at ${after.stage.toUpperCase()}.\nNext: ${after.next}\nContinue in your agent with: maverick new ${slug}`);
}

/**
 * Opens the interactive agent with every flow skill installed. From there the whole flow
 * (plan, build, review, ship) runs inside the agent; the CLI only starts it.
 */
async function launch(cwd, config, requested, prompt) {
  const agent = pickInteractiveAgent(cwd, config, requested);
  if (!agent) return output('\nNo AI coding agent was found on PATH (claude, codex, cursor-agent or gemini).\nInstall one and run this again, or plan headlessly: maverick generate <task> --agent <trusted-provider>');
  const skills = await installFlowSkills(cwd, config, agent.id);
  if (skills.installed.length) output(`✓ installed for ${agent.name}: ${skills.installed.map(ref => ref.replace('skill/', '')).join(', ')}`);
  skills.warnings.forEach(warning => output(`WARN ${warning}`));
  const language = projectLanguage(config);
  output(`\n▶ opening ${agent.name}. The rest of the flow happens there: plan (maverick-new), build (maverick-build), review (maverick-review) and ship (maverick-ship).\n  Documents in ${languageName(language.docs)} · code in ${languageName(language.code)} (change with: maverick language)\n`);
  // The PRD step's model and reasoning, as configured for this agent or recommended for it.
  const prd = resolveRun(config, { stage: 'prd', provider: agent.id }, providersFor(config), { checks: false });
  await openAgent(resolveBin(agent, config, cwd), agent.interactive({ prompt, model: prd.model, effort: prd.effort }), cwd);
  return agent;
}

async function upstreamFor(dir, preset, stage) {
  const stages = planningStages(preset), files = preset.artifacts.filter(item => stages.indexOf(item.stage) < stages.indexOf(stage));
  return (await Promise.all(files.map(async item => ({ file: item.file, text: await readFile(join(dir, item.file), 'utf8').catch(() => '') })))).filter(item => item.text);
}

async function currentFor(dir, stage) {
  if (stage !== 'tasks') return readFile(join(dir, artifactFor(stage).file), 'utf8').catch(() => '');
  const graph = await loadGraph(dir);
  return graph.items.map(item => `<maverick-subtask id="${item.id}" title="${item.title}" after="${item.dependsOn.join(',')}">\n${item.body.trim()}\n</maverick-subtask>`).join('\n\n');
}

/** Writes the task graph a generation returned. Never replaces tasks that have started. */
async function writeTasks(dir, slug, subtasks) {
  if (!subtasks.length) return { written: 0 };
  const graph = await loadGraph(dir);
  if (graph.items.some(item => item.status !== 'pending')) return { written: 0, skipped: 'existing tasks have started; they were kept' };
  if (graph.exists) await rm(join(dir, 'subtasks'), { recursive: true, force: true });
  const ids = new Map();
  for (const item of subtasks) ids.set(item.id, (await addSubtask(dir, slug, { title: item.title, type: item.type, complexity: item.complexity, after: item.after.map(dep => ids.get(dep)), body: item.body })).id);
  return { written: subtasks.length };
}

const ownFindings = (findings, stage) => findings.filter(item => item.status === 'FAIL' && (stage === 'tasks' ? item.file.startsWith('subtasks/') : item.file === artifactFor(stage).file));

/**
 * Runs the stage skills headlessly with a trusted, read-only agent: each stage is generated,
 * written by Maverick, validated, and retried once with the failures when validation fails.
 */
async function generate(cwd, slug, onlyStage, options = {}) {
  const { dir, meta, preset, config } = await getTask(cwd, slug);
  const planning = planningStages(preset);
  if (onlyStage && !planning.includes(onlyStage)) throw new Error(`stage must be one of ${planning.join(', ')} for the ${preset.id} workflow`);
  const status = await taskStage(dir, preset, slug);
  if (!onlyStage && !planning.includes(status.stage)) throw new Error(`planning is complete (stage ${status.stage}); pass a stage to revise it: maverick generate ${slug} ${planning.join('|')}`);
  // Each stage resolves its own model and effort; the first one names the agent in the header.
  const planFor = stage => resolveRun(config, { provider: str(options.agent) || str(options.provider), model: str(options.model), effort: str(options.effort), permission: 'read-only', stage }, providersFor(config));
  const plan = planFor(onlyStage || status.stage);
  const newAnswer = str(options.answers), answers = [...(meta.answers || []), ...(newAnswer ? [newAnswer] : [])];
  if (newAnswer && !options.dryRun) await writeFile(join(dir, 'TASK.json'), pretty({ ...meta, answers }));
  const ground = await groundChange(cwd, meta.idea || ''), timeoutMs = Math.round((Number(options.timeout) || config.runtime?.timeoutMinutes || 30) * 60000);
  const stages = onlyStage ? [onlyStage] : planning.slice(planning.indexOf(status.stage)), report = [], questions = [];
  if (!options.json && !options.dryRun) output(`${brand()} / GENERATE\nTask: ${slug} · ${plan.provider.name} (read-only)\nStages: ${stages.map(stage => stage.toUpperCase()).join(' → ')}`);
  for (const stage of stages) {
    const skill = await stageSkill(stage), artifact = artifactFor(stage), stagePlan = planFor(stage);
    let findings = [], result, parsed, written;
    for (let attempt = 0; attempt <= (Number(options.retries ?? 1) || 0); attempt++) {
      const language = projectLanguage(config);
      const prompt = buildStagePrompt({ slug, stage, idea: meta.idea || '', workflow: preset.id, answers, ground, skill, upstream: await upstreamFor(dir, preset, stage), current: await currentFor(dir, stage), findings, sections: (artifact?.sections || TASK_SECTIONS).map(name => heading(name, language.docs)), authoring: config.authoring, language: { ...language, rule: languageRule(language), keywords: stageKeywords(language.docs) } });
      if (options.dryRun) return output(options.json ? JSON.stringify({ provider: plan.provider.id, stage, prompt }, null, 2) : `${brand()} / GENERATE (dry run)\nProvider: ${plan.provider.name} · read-only · stage ${stage}\n\n----- prompt -----\n${prompt}`);
      if (!options.json) output(`\n▶ ${stage.toUpperCase()}${attempt ? ' (fixing validation failures)' : ''} with ${skill.name} · ${stagePlan.provider.name}${stagePlan.model ? ` ${stagePlan.model}` : ''}${stagePlan.effort ? ` (${stagePlan.effort})` : ''}`);
      const controller = new globalThis.AbortController(), abort = () => controller.abort();
      process.once('SIGINT', abort);
      try { result = await runAgent({ cwd, config, taskDir: dir, task: slug, provider: stagePlan.provider, model: stagePlan.model, effort: stagePlan.effort, permission: stagePlan.permission, prompt, timeoutMs, signal: controller.signal, onEvent: printer({ ...options, quiet: true }) }); } finally { process.removeListener('SIGINT', abort); }
      if (!result.ok) throw new Error(`${stage} generation failed: ${result.problems.join('; ')}`);
      parsed = parseGeneration(result.text, artifact ? [artifact.file] : []);
      for (const [file, body] of Object.entries(parsed.files)) await writeFile(join(dir, file), body);
      written = stage === 'tasks' ? await writeTasks(dir, slug, parsed.subtasks) : { written: Object.keys(parsed.files).length };
      if (!written.written && !written.skipped) throw new Error(`the agent returned no ${stage === 'tasks' ? 'tasks' : artifact.file}; see ${rel(cwd, result.transcript)}`);
      // Generated artifacts are held to the strict bar: warnings a human might accept are failures to fix here.
      findings = ownFindings(await lintTask(cwd, dir, { stage, strict: true, preset }), stage);
      if (!findings.length) break;
    }
    questions.push(...(result.result?.questions || []).map(question => `${stage}: ${question}`));
    report.push({ stage, written: written.written, skipped: written.skipped, rejected: parsed.rejected, failures: findings.map(item => `${item.file}: ${item.message}`), summary: result.result?.summary || '', transcript: rel(cwd, result.transcript) });
    if (!options.json) output(`${findings.length ? '!' : '✓'} ${stage === 'tasks' ? `${written.written} task(s)${written.skipped ? ` (${written.skipped})` : ''}` : artifact.file}${result.result?.summary ? ` — ${result.result.summary}` : ''}${[...parsed.rejected.map(item => `\n  rejected ${item}`), ...findings.map(item => `\n  FAIL ${item.file}: ${item.message}`)].join('')}`);
    if (findings.length) break;
  }
  if (questions.length && !options.dryRun) await writeFile(join(dir, 'TASK.json'), pretty({ ...(await getTask(cwd, slug)).meta, pendingQuestions: questions }));
  const after = await taskStage(dir, preset, slug);
  if (options.json) return output(JSON.stringify({ task: slug, provider: plan.provider.id, stages: report, questions, stage: after.stage, next: after.next }, null, 2));
  const lines = [];
  if (questions.length) lines.push('\nAssumptions were taken for these questions; answer them to refine:', ...questions.map((question, index) => `  ${index + 1}. ${question}`), `  maverick generate ${slug} <stage> --agent ${plan.provider.id} --answers "1) … 2) …"`);
  lines.push(`\nStage: ${after.stage.toUpperCase()} · Next: ${after.next}`);
  output(lines.join('\n'));
  if (report.some(item => item.failures.length)) throw new Error('generation stopped on validation failures; fix them or rerun the stage');
}

/**
 * What an agent needs for a stage, as JSON for skills: the idea, the current stage, the
 * artifact to write and its required headings, earlier artifacts, grounding and findings.
 */
async function instructions(cwd, slug, onlyStage, options = {}) {
  const { dir, meta, preset, config } = await getTask(cwd, slug);
  const stage = onlyStage ? String(onlyStage).toLowerCase() : undefined;
  const planning = planningStages(preset);
  if (stage && !planning.includes(stage)) throw new Error(`stage must be one of ${planning.join(', ')} for the ${preset.id} workflow`);
  const status = await taskStage(dir, preset, slug), ground = await groundChange(cwd, meta.idea || '');
  const focus = stage || (planning.includes(status.stage) ? status.stage : undefined);
  const findings = await lintTask(cwd, dir, { stage: focus, preset });
  const language = projectLanguage(config), graph = await loadGraph(dir);
  const stages = planning.map(id => {
    const artifact = artifactFor(id);
    return { id, skill: STAGE_SKILLS[id], path: rel(cwd, join(dir, artifact?.file || 'subtasks')), done: id === 'tasks' ? status.tasks.total > 0 : status.artifacts[artifact.id], sections: (artifact?.sections || TASK_SECTIONS).map(name => heading(name, language.docs)) };
  });
  const payload = {
    task: slug, idea: meta.idea || '', workflow: preset.id, answers: meta.answers || [], stage: status.stage, skill: SKILL_FOR_STAGE[status.stage], next: status.next,
    language: { ...language, rule: languageRule(language), keywords: stageKeywords(language.docs) },
    focus: focus ? stages.find(item => item.id === focus) : null, stages, upstream: focus ? (await upstreamFor(dir, preset, focus)).map(item => rel(cwd, join(dir, item.file))) : [],
    tasks: { ...status.tasks, ready: graph.items.filter(item => item.ready).map(item => ({ id: item.id, title: item.title, path: rel(cwd, join(dir, 'subtasks', item.file)) })), inProgress: graph.items.filter(item => item.status === 'in-progress').map(item => item.id) },
    grounding: ground, findings, authoring: config.authoring || {}, validate: `maverick validate ${slug}${focus ? ` --stage ${focus}` : ''}`
  };
  if (options.json) return output(JSON.stringify(payload, null, 2));
  const lines = [`${brand()} / INSTRUCTIONS — ${slug}`, `Idea: ${payload.idea}`, `Workflow: ${preset.name} · Pipeline: ${stageLine(preset, status.stage)} · Skill now: ${payload.skill}`, `Language: documents ${languageName(language.docs)} · code ${languageName(language.code)}`, ''];
  for (const item of stages) lines.push(`${item.done ? '✓' : '·'} ${item.id.toUpperCase().padEnd(9)} ${item.skill.padEnd(18)} ${item.path}`);
  if (payload.focus) lines.push('', `Now: ${payload.focus.id.toUpperCase()} with the ${payload.focus.skill} skill → ${payload.focus.path}`, `Required headings: ${payload.focus.sections.join(', ')}`);
  if (payload.upstream.length) lines.push(`Read first: ${payload.upstream.join(', ')}`);
  if (ground.relevant.length) lines.push('', 'Start reading from:', ...ground.relevant.slice(0, 6).map(item => `  ${item.path} — ${item.reasons.join('; ')}`));
  if (findings.length) lines.push('', 'Findings:', ...findings.slice(0, 10).map(item => `  ${item.status} ${item.file}: ${item.message}`));
  lines.push('', `Validate with: ${payload.validate}`, 'JSON for agents: add --json');
  output(lines.join('\n'));
}

export const newCommands = [
  { id: 'new', description: 'Start the flow in your AI agent: from an idea (or a task slug to resume) to PRD, behavioral spec (spec-driven), technical spec, tasks, build, review and ship.', aliases: ['start', 'open'], usage: 'new ["<idea>" | <task>] [--agent <provider>] [--strict | --spec | --workflow <standard|spec-driven|strict>] [--slug <slug>] [--no-launch] [--headless]', run: ({ cwd, arg, options }) => newTask(cwd, arg, options) },
  { id: 'instructions', description: 'The idea, current stage, required headings, grounding and findings for a stage skill.', aliases: [], usage: 'instructions <task> [prd|spec|techspec|tasks] [--json]', run: ({ cwd, arg, third, options }) => instructions(cwd, arg, third, options) },
  { id: 'generate', description: 'Run the planning stage skills headlessly with a trusted, read-only agent.', aliases: [], usage: 'generate <task> [prd|spec|techspec|tasks] --agent <provider> [--answers "…"] [--dry-run]', run: ({ cwd, arg, third, options }) => generate(cwd, arg, third, options) }
];
