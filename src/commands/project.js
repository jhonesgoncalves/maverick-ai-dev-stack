import { lstat, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ADAPTERS, detectAdapters, layoutFor, SHARED } from '../capabilities/adapters.js';
import { checkDrift, LOCK_PATH, readLock } from '../capabilities/engine.js';
import { defaultConfig, globalConfigPath, loadConfig, resolveConfig } from '../core/config.js';
import { PRESET_IDS } from '../core/presets.js';
import { languageName, languageRule, normalizeLanguage, projectLanguage } from '../core/language.js';
import { installFlowSkills, installedAgents } from './new.js';
import { inspectProject, renderProjectMap } from '../core/project-tools.js';
import { selectVerificationCommands } from '../core/stack.js';
import { listTasks } from '../core/tasks.js';
import { style } from '../core/style.js';
import { brand, commandAvailable, exists, output, packageVersion, pretty, rel, splitCommand } from '../core/util.js';

/** A language suggestion from the environment, e.g. LANG=pt_BR.UTF-8 → pt-BR. */
function environmentLanguage() {
  try { return normalizeLanguage((process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').split('.')[0]); } catch { return 'en'; }
}

const ALIASES = { claude: 'claude-code', 'claude-code': 'claude-code', openai: 'codex', 'github-copilot': 'copilot', devin: 'windsurf', 'google-antigravity': 'antigravity', 'open-code': 'opencode' };
/** Tools that do not read AGENTS.md on their own get their instruction file linked to it. */
const INSTRUCTION_LINKS = { 'claude-code': 'CLAUDE.md', gemini: 'GEMINI.md' };

/** Parses "1,3", "claude,kiro" or "all" into adapter ids; unknown entries are an error. */
export function parseAgents(answer) {
  const values = String(answer).split(/[\s,]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
  if (values.includes('all')) return ADAPTERS.map(adapter => adapter.id);
  const ids = values.map(value => (/^\d+$/.test(value) ? ADAPTERS[Number(value) - 1]?.id : ALIASES[value] || value));
  const unknown = values.filter((value, index) => !ADAPTERS.some(adapter => adapter.id === ids[index]));
  if (unknown.length) throw new Error(`unknown agent ${unknown.join(', ')}; use ${ADAPTERS.map(adapter => adapter.id).join(', ')} or all`);
  return [...new Set(ids)];
}

/** Tools already configured in the repository or installed on this machine: the default answer. */
async function suggestedAgents(cwd, config) {
  const found = new Set([...(await detectAdapters(cwd)).map(adapter => adapter.id), ...installedAgents(cwd, config).map(agent => agent.id)]);
  return ADAPTERS.filter(adapter => found.has(adapter.id)).map(adapter => adapter.id);
}

/**
 * The init interview: what the project is, which AI agents work on it, the languages, the
 * workflow and the verification commands. In a terminal it is an Ink wizard (checkboxes and
 * lists); every answer also has a flag, so scripts and CI skip the questions entirely.
 */
async function interview(cwd, map, options) {
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes && !process.env.CI;
  const flag = key => (typeof options[key] === 'string' ? options[key] : undefined);
  const suggested = await suggestedAgents(cwd, defaultConfig), detected = map.commands.map(item => item.command);
  const given = {
    name: flag('name'), description: flag('description'), agents: flag('agents') === undefined ? undefined : parseAgents(flag('agents')),
    docs: flag('docsLanguage'), code: flag('codeLanguage'), workflow: flag('workflow'),
    verify: flag('verify') === undefined ? undefined : flag('verify').split(';').map(item => item.trim()).filter(Boolean)
  };
  let answers = { name: map.name || 'my-project', description: '', agents: suggested, docs: 'en', code: 'en', workflow: defaultConfig.workflow.default, verify: detected };
  if (interactive) {
    const { wizardSteps } = await import('../ui/init-wizard.js');
    const { runInitWizard } = await import('../ui/screens/InitScreen.js');
    const skip = Object.keys(given).filter(key => given[key] !== undefined);
    const steps = wizardSteps({ name: answers.name, adapters: ADAPTERS, suggested, docs: environmentLanguage(), commands: detected, skip });
    const chosen = await runInitWizard({ steps, detected: [map.language, map.framework].filter(value => value && value !== 'unknown').join(' · ') });
    if (!chosen) throw new Error('init cancelled; nothing was written');
    answers = { ...answers, ...chosen };
  }
  answers = { ...answers, ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)) };
  if (!PRESET_IDS.includes(answers.workflow)) throw new Error(`unknown workflow ${answers.workflow}; use ${PRESET_IDS.join(' or ')}`);
  const same = answers.verify.length === detected.length && answers.verify.every((command, at) => command === detected[at]);
  return {
    name: answers.name.trim(), description: answers.description.trim(), agents: answers.agents, workflow: answers.workflow,
    language: { docs: normalizeLanguage(answers.docs), code: normalizeLanguage(answers.code) },
    commands: same ? undefined : answers.verify
  };
}

function renderAgentsFile(answers, map) {
  const commands = answers.commands?.map(command => `- \`${command}\``) || map.commands.map(item => `- ${item.name}: \`${item.command}\`${item.cwd ? ` (in \`${item.cwd}/\`)` : ''}`);
  return `# ${answers.name}\n\n${answers.description || 'Describe what this project does and for whom.'}\n\n## Stack\n- Languages: ${map.language}\n- Frameworks: ${map.framework || 'not detected'}\n- Package managers: ${map.packageManagers?.join(', ') || 'not detected'}\n\n## Verification\n${commands.join('\n') || '- Declare the commands in `.maverick/config.json` under `verification.commands`.'}\n\n## How we work\nThis project uses Maverick AI. Start every change with \`maverick new "<idea>"\` and follow the flow skills (\`maverick-new\`, \`maverick-build\`, \`maverick-review\`, \`maverick-ship\`).\nShared skills, agents and commands live in \`${SHARED.root}/\` and are linked into each AI tool; change them there, or with \`maverick add\`.\n\n- ${languageRule(answers.language)}\n`;
}

/**
 * Makes AGENTS.md the one instruction file and links CLAUDE.md / GEMINI.md to it. An existing
 * CLAUDE.md or GEMINI.md becomes AGENTS.md when there is none; one identical to AGENTS.md is
 * replaced by the link; one with different content is left alone, never overwritten.
 */
async function writeInstructions(cwd, answers, map) {
  const lines = [], main = join(cwd, 'AGENTS.md');
  const files = [...new Set(answers.agents.map(id => INSTRUCTION_LINKS[id]).filter(Boolean))];
  if (!await exists(main)) {
    const existing = [];
    for (const file of files) if ((await lstat(join(cwd, file)).catch(() => null))?.isFile()) existing.push(file);
    if (existing.length) { await rename(join(cwd, existing[0]), main); lines.push(`✓ ${existing[0]} moved to AGENTS.md, so every agent reads the same instructions`); }
    else { await writeFile(main, renderAgentsFile(answers, map)); lines.push('✓ AGENTS.md written from the interview'); }
  }
  for (const file of files) {
    const path = join(cwd, file), stat = await lstat(path).catch(() => null);
    if (stat?.isSymbolicLink()) { if (await readlink(path) !== 'AGENTS.md') lines.push(`· ${file} links elsewhere; left as is`); continue; }
    if (stat) {
      if (!(await readFile(path)).equals(await readFile(main))) { lines.push(`· ${file} differs from AGENTS.md; left as is. Merge it into AGENTS.md, delete it and run maverick init --agents ${answers.agents.join(',')} to link it`); continue; }
      await rm(path);
    }
    try { await symlink('AGENTS.md', path, 'file'); lines.push(`✓ ${file} ⇢ AGENTS.md`); } catch (error) { lines.push(`WARN could not link ${file} to AGENTS.md: ${error.code || error.message}`); }
  }
  return lines;
}

async function installFor(cwd, config, agents) {
  if (!agents.length) return ['No AI agent chosen; add them later with: maverick init --agents claude-code,kiro'];
  const result = await installFlowSkills(cwd, config, agents.join(','));
  const where = layoutFor(config) === 'linked' ? ` (${SHARED.root}/skills, linked into each tool)` : '';
  return [`✓ flow skills ${result.installed.length ? 'installed' : 'already installed'} for ${agents.join(', ')}${where}`, ...result.warnings.map(warning => `WARN ${warning}`)];
}

/** `maverick init --agents kiro` on an initialized project adds agents without asking again. */
async function addAgents(cwd, path, options) {
  const current = JSON.parse(await readFile(path, 'utf8')), agents = parseAgents(options.agents);
  const targets = [...new Set([...(current.capabilities?.targets || []), ...agents])];
  const next = { ...current, capabilities: { ...current.capabilities, targets } };
  await writeFile(path, pretty(next));
  const config = await loadConfig(cwd), lines = [`${brand()} / INIT\n✓ agents: ${targets.join(', ')}`];
  if (!options.noSkills) lines.push(...await installFor(cwd, config, targets));
  if (!options.noInstructions) lines.push(...await writeInstructions(cwd, { name: current.project?.name || 'Project', description: current.project?.description, agents, language: projectLanguage(config), commands: undefined }, await inspectProject(cwd)));
  output(lines.join('\n'));
}

async function initProject(cwd, options = {}) {
  const dir = join(cwd, '.maverick'), path = join(dir, 'config.json');
  if (await exists(path)) {
    if (typeof options.agents === 'string') return addAgents(cwd, path, options);
    throw new Error(`configuration already exists: ${rel(cwd, path)}; add agents with maverick init --agents <ids>, change the languages with maverick language`);
  }
  const map = await inspectProject(cwd), answers = await interview(cwd, map, options);
  await mkdir(dir, { recursive: true });
  const config = {
    ...defaultConfig, language: answers.language, workflow: { default: answers.workflow },
    project: { name: answers.name, ...(answers.description && { description: answers.description }), language: map.languages[0] || '', framework: map.frameworks[0] || '' },
    ...(answers.description && { authoring: { context: answers.description } }),
    ...(answers.commands && { verification: { commands: answers.commands } }),
    capabilities: { targets: answers.agents, layout: layoutFor({}) }
  };
  await writeFile(path, pretty(config));
  const lines = [`${brand()}\n✓ project initialized: ${rel(cwd, path)}${map.languages.length ? `\nDetected stack: ${map.language}` : ''}\nDocuments: ${languageName(answers.language.docs)} · code: ${languageName(answers.language.code)} · workflow: ${answers.workflow}`];
  // The flow runs inside the agents, so its skills are installed for every agent chosen.
  if (!options.noSkills) lines.push(...await installFor(cwd, config, answers.agents));
  if (!options.noInstructions) lines.push(...await writeInstructions(cwd, answers, map));
  lines.push('Next: maverick new "<what you want to build>"');
  output(lines.join('\n'));
}

/** Shows or sets the two project languages: `maverick language pt-BR en`, or --docs / --code. */
async function languageCommand(cwd, [docsArg, codeArg], options = {}) {
  const path = join(cwd, '.maverick', 'config.json');
  const current = await exists(path) ? JSON.parse(await readFile(path, 'utf8')) : { version: 1 };
  const docs = typeof options.docs === 'string' ? options.docs : docsArg, code = typeof options.code === 'string' ? options.code : codeArg;
  if (docs || code) {
    const language = { ...projectLanguage(current), ...(docs && { docs: normalizeLanguage(docs) }), ...(code && { code: normalizeLanguage(code) }) };
    await mkdir(join(cwd, '.maverick'), { recursive: true });
    await writeFile(path, pretty({ ...current, language }));
    current.language = language;
  }
  const language = projectLanguage((await loadConfig(cwd)));
  if (options.json) return output(JSON.stringify({ ...language, rule: languageRule(language) }, null, 2));
  output(`${brand()} / LANGUAGE\n${docs || code ? '✓ saved to .maverick/config.json\n' : ''}Documents (PRD, spec, tasks, review): ${languageName(language.docs)}\nCode (identifiers, comments, tests, commits): ${languageName(language.code)}\nChange with: maverick language <docs> [code], e.g. maverick language pt-BR en`);
}

async function mapProject(cwd, options = {}) {
  const map = await inspectProject(cwd), dir = join(cwd, '.maverick', 'context'), path = join(dir, 'PROJECT_MAP.md');
  await mkdir(dir, { recursive: true }); await writeFile(path, renderProjectMap(map));
  if (options.json) return output(JSON.stringify({ ...map, path: rel(cwd, path) }, null, 2));
  output(`${brand()} / MAP\n✓ project map: ${rel(cwd, path)}\nDetected ${map.commands.length} verification command(s) and ${map.directories.length} top-level area(s).`);
}

async function showStack(cwd, options = {}) {
  const [map, config] = await Promise.all([inspectProject(cwd), loadConfig(cwd)]);
  const selected = selectVerificationCommands(map.stack, config);
  if (options.json) return output(JSON.stringify({ ...map.stack, verification: selected }, null, 2));
  const stack = map.stack, pad = (value, width) => String(value).padEnd(width);
  const lines = [`${brand()} / STACK`, '', `Languages:  ${map.language}`, `Frameworks: ${map.framework || 'not detected'}`, '', 'Ecosystems:'];
  lines.push(...(stack.ecosystems.map(item => `  ${pad(item.id, 9)} ${pad(item.packageManager, 12)} ${item.manifests.join(', ')}`)), ...(stack.ecosystems.length ? [] : ['  none detected at the root']));
  if (stack.runners.length) lines.push('', 'Task runners:', ...stack.runners.map(item => `  ${pad(item.id, 9)} ${item.file}`));
  if (stack.subprojects.length) lines.push('', 'Subprojects:', ...stack.subprojects.map(item => `  ${pad(`${item.path}/`, 18)} ${item.ecosystems.map(e => e.id).concat(item.runners.map(r => r.id)).join(', ')}`));
  lines.push('', 'Verification (maverick verify):', ...(selected.map(item => `  ${pad(item.name, 10)} ${item.command}${item.cwd ? `  (in ${item.cwd}/)` : ''}  [${item.source}]`)));
  if (!selected.length) lines.push('  none — declare verification.commands in .maverick/config.json');
  output(lines.join('\n'));
}

async function configCommand(cwd, action = 'show', options = {}) {
  if (action === 'path') {
    const project = join(cwd, '.maverick', 'config.json');
    return output(options.json ? JSON.stringify({ project: rel(cwd, project), global: globalConfigPath() }) : `project: ${rel(cwd, project)}\nglobal:  ${globalConfigPath()}`);
  }
  if (!['show', 'validate'].includes(action)) throw new Error('use config show, config validate, or config path');
  const { config, sources } = await resolveConfig(cwd);
  if (action === 'validate') return output(options.json ? JSON.stringify({ valid: true, sources }) : `${brand()} / CONFIG\nPASS configuration is valid\nLayers: ${sources.map(source => source.path ? `${source.scope} (${source.path})` : source.scope).join(' < ')}`);
  output(options.json ? JSON.stringify({ config, sources }, null, 2) : `${brand()} / CONFIG\nLayers: ${sources.map(source => source.path ? `${source.scope} (${source.path})` : source.scope).join(' < ')}\n\n${pretty(config)}`);
}

async function status(cwd, options = {}) {
  const tasks = await listTasks(cwd);
  if (options.json) return output(JSON.stringify(tasks.map(({ stages: _stages, ...task }) => task), null, 2));
  if (!tasks.length) return output(`${brand()} / STATUS\nNo tasks yet. Start one with: maverick new "<what you want to build>"`);
  output([`${brand()} / STATUS`, '', ...tasks.flatMap(task => [...renderTaskStatus(task), '']), style.gray(`${tasks.length} task(s) · --json for machine-readable output`)].join('\n'));
}

/** One task as a block: name and workflow, the stage pipeline (done ✔, current highlighted, upcoming dim) and the next step. */
function renderTaskStatus(task) {
  const current = task.stages.indexOf(task.stage);
  const step = (stage, index) => index < current ? `${style.green('✔')} ${style.gray(stage)}` : index === current ? style.brand(`● ${stage.toUpperCase()}`) : style.dim(`○ ${stage}`);
  const progress = task.tasks.total ? `  ${style.amber(`${task.tasks.done}/${task.tasks.total} tasks`)}` : '';
  return [
    `${style.text(task.task)}  ${style.gray(task.workflow)}${progress}`,
    `  ${task.stages.map(step).join(style.gray('  ›  '))}`,
    `  ${style.gray('Next:')} ${task.next.replace(/\bmaverick(?: (?:[a-z<[][^\s;,)]*|--[\w-]+))+/g, hint => style.cyan(hint))}`
  ];
}

function gitAvailable() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
// A project inside a larger repository (a monorepo package, an example) has no .git of its own.
function insideGitRepository(cwd) { try { return execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true'; } catch { return false; } }

async function doctor(cwd, options = {}) {
  let config, configError;
  try { config = await loadConfig(cwd); } catch (error) { configError = error.message; }
  const map = await inspectProject(cwd);
  const commands = selectVerificationCommands(map.stack, config || {});
  const checks = [
    ['Node >= 20', Number(process.versions.node.split('.')[0]) >= 20],
    ['Git available', gitAvailable()],
    ['Git repository', insideGitRepository(cwd)],
    ['Configuration valid', !configError, configError],
    ['Stack detected', map.languages.length > 0, map.languages.length ? map.language : 'no known manifests at the root or first-level folders'],
    ['Repository instructions', map.instructions.length > 0],
    ['Verification commands', commands.length > 0]
  ];
  if (await exists(join(cwd, LOCK_PATH))) {
    const drifted = (await checkDrift(cwd, await readLock(cwd))).filter(item => item.issues.length);
    checks.push(['Capabilities match lockfile', !drifted.length, drifted.length ? `${drifted.map(item => item.ref).join(', ')} changed; run maverick installed` : undefined]);
  }
  // Each distinct toolchain binary must be installed for `verify` to succeed.
  const binaries = [...new Set(commands.map(item => { try { return splitCommand(item.command)[0]; } catch { return null; } }).filter(Boolean))];
  for (const bin of binaries) {
    const where = commands.find(item => item.command.startsWith(bin))?.cwd;
    checks.push([`Toolchain: ${bin}`, commandAvailable(bin, where ? join(cwd, where) : cwd), 'not found on PATH']);
  }
  const fixes = checks.filter(([, ok]) => !ok).map(([name, , detail]) => `Add or configure: ${name}${detail ? ` (${detail})` : ''}`);
  if (options.json) return output(JSON.stringify({ checks: checks.map(([name, ok, detail]) => ({ name, ok, ...(detail && { detail }) })), fixes }, null, 2));
  for (const [name, ok, detail] of checks) output(`${ok ? 'PASS' : 'WARN'} ${name}${detail && (name === 'Stack detected' || !ok) ? ` — ${detail}` : ''}`);
  if (options.fix) output(`Suggested fixes:\n${fixes.map(fix => `- ${fix}`).join('\n') || '- No fixes needed.'}`);
  output(`Default workflow: ${config?.workflow.default || 'unknown'}\nNo telemetry is collected by Maverick.`);
}

async function lens(cwd, options = {}) {
  const { startLens } = await import('../lens/server.js');
  const port = Number(options.port || 4173), host = options.host || '127.0.0.1';
  const server = await startLens({ cwd, host, port, watch: !options.noWatch });
  const address = `http://${host}:${port}`;
  if (options.json) output(JSON.stringify({ address, host, port, watch: !options.noWatch }));
  else output(`${brand()} / LENS\n\n✓ project indexed\n✓ tasks indexed\n✓ specs indexed\n✓ docs indexed\n✓ git state indexed\n\nOpen:\n${address}\n\nLocal only. No project data is uploaded.`);
  if (options.open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    try { execFileSync(opener, process.platform === 'win32' ? ['/c', 'start', address] : [address], { stdio: 'ignore' }); } catch { if (options.debug) output('Could not open browser automatically.'); }
  }
  const close = () => server.close(); process.once('SIGINT', close); process.once('SIGTERM', close);
}

function info(options = {}) {
  if (options.json) return output(JSON.stringify({ name: 'maverick-ai-dev-stack', version: packageVersion }));
  output(`${brand()} / INFO\nVersion ${packageVersion}\nAI-powered developer workspace. Understand. Build. Debug. Ship.\nA vendor-neutral engineering workflow. No telemetry by default.`);
}

export const projectCommands = [
  { id: 'lens', description: 'Open Maverick Lens, the local project-intelligence view.', aliases: ['dashboard', 'dash'], usage: 'lens --open', run: ({ cwd, options }) => lens(cwd, options) },
  { id: 'init', description: 'Interview the project, then set up Maverick and the flow skills for every AI agent (shared in .agents/, linked into each tool).', aliases: [], usage: 'init [--agents claude-code,kiro,codex] [--description "..."] [--docs-language pt-BR] [--code-language en] [--workflow strict] [--verify "npm test"] [--no-skills] [--no-instructions] [--yes]', run: ({ cwd, options }) => initProject(cwd, options) },
  { id: 'language', description: 'Show or set the language of the flow documents and of the code.', aliases: ['lang'], usage: 'language [<docs> [<code>]] [--docs pt-BR] [--code en]', run: ({ cwd, rest, options }) => languageCommand(cwd, rest, options) },
  { id: 'map', description: 'Build a repository context map.', aliases: [], usage: 'map [--json]', run: ({ cwd, options }) => mapProject(cwd, options) },
  { id: 'stack', description: 'Detect languages, frameworks, and verification commands.', aliases: [], usage: 'stack [--json]', run: ({ cwd, options }) => showStack(cwd, options) },
  { id: 'config', description: 'Show, validate, or locate layered configuration.', aliases: [], usage: 'config show|validate|path', run: ({ cwd, arg, options }) => configCommand(cwd, arg, options) },
  { id: 'doctor', description: 'Inspect local setup, toolchains, and project checks.', aliases: [], usage: 'doctor [--fix]', run: ({ cwd, options }) => doctor(cwd, options) },
  { id: 'status', description: 'Show task stage and pending gates.', aliases: [], usage: 'status [--json]', run: ({ cwd, options }) => status(cwd, options) },
  { id: 'info', description: 'Show Maverick information.', aliases: ['version', '--version', '-v'], usage: 'info', run: ({ options }) => info(options) }
];
