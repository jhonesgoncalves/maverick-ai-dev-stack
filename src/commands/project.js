import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { checkDrift, LOCK_PATH, readLock } from '../capabilities/engine.js';
import { defaultConfig, globalConfigPath, loadConfig, resolveConfig } from '../core/config.js';
import { getPreset } from '../core/presets.js';
import { inspectProject, renderProjectMap } from '../core/project-tools.js';
import { selectVerificationCommands } from '../core/stack.js';
import { taskPreset } from '../core/tasks.js';
import { brand, commandAvailable, exists, output, packageVersion, pretty, rel, splitCommand } from '../core/util.js';
import { createTask } from './task.js';

async function chooseDefaultPreset() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return 'standard';
  output('Choose your default workflow\n1. Standard — Default engineering workflow.\n2. Lightweight — Small, low-risk changes.\n3. Spec Driven — Specification-first for complex work.\n4. Strict Review — Extra verification for high-risk changes.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Choice [1]: '); prompt.close();
  return ({ 1: 'standard', 2: 'lightweight', 3: 'spec-driven', 4: 'strict-review' })[answer.trim() || '1'] || 'standard';
}

async function initProject(cwd) {
  const dir = join(cwd, '.maverick'), path = join(dir, 'config.json');
  if (await exists(path)) throw new Error(`configuration already exists: ${rel(cwd, path)}`);
  const preset = await chooseDefaultPreset(), map = await inspectProject(cwd);
  await mkdir(dir, { recursive: true });
  const name = cwd.split(/[\\/]/).filter(Boolean).pop() || 'my-project';
  await writeFile(path, pretty({ ...defaultConfig, workflow: { ...defaultConfig.workflow, defaultPreset: preset }, project: { name, language: map.languages[0] || '', framework: map.frameworks[0] || '' } }));
  output(`${brand()}\n✓ project initialized: ${rel(cwd, path)}\nDefault preset: ${getPreset(preset).name}${map.languages.length ? `\nDetected stack: ${map.language}` : ''}`);
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
  const config = await loadConfig(cwd), base = join(cwd, config.taskRoot);
  if (!await exists(base)) return output(options.json ? '[]' : 'No tasks yet. Run maverick task add-your-feature.');
  const tasks = [];
  for (const entry of (await readdir(base, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(base, entry.name), preset = await taskPreset(dir, config);
    const evidence = await exists(join(dir, 'EVIDENCE.md')), findings = await exists(join(dir, 'REVIEW-FINDINGS.md'));
    tasks.push({ task: entry.name, preset, evidence, findings, next: evidence ? (findings ? 'complete human review' : 'run review --diff') : 'run verify' });
  }
  output(options.json ? JSON.stringify(tasks, null, 2) : tasks.map(task => `${task.task}\t${task.preset}\t${task.next}`).join('\n'));
}

function gitAvailable() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }

async function doctor(cwd, options = {}) {
  let config, configError;
  try { config = await loadConfig(cwd); } catch (error) { configError = error.message; }
  const map = await inspectProject(cwd);
  const commands = selectVerificationCommands(map.stack, config || {});
  const checks = [
    ['Node >= 20', Number(process.versions.node.split('.')[0]) >= 20],
    ['Git available', gitAvailable()],
    ['Git repository', await exists(join(cwd, '.git'))],
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
  output(`Default preset: ${config?.workflow.defaultPreset || 'unknown'}\nNo telemetry is collected by Maverick.`);
}

async function dashboard(cwd, options = {}) {
  const { startDashboard } = await import('../dashboard/server.js');
  const port = Number(options.port || 4173), host = options.host || '127.0.0.1';
  const server = await startDashboard({ cwd, host, port, watch: !options.noWatch });
  const address = `http://${host}:${port}`;
  if (options.json) output(JSON.stringify({ address, host, port, watch: !options.noWatch }));
  else output(`${brand()} / LENS\n\n✓ project indexed\n✓ tasks indexed\n✓ specs indexed\n✓ docs indexed\n✓ git state indexed\n\nDashboard:\n${address}\n\nLocal only. No project data is uploaded.`);
  if (options.open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    try { execFileSync(opener, process.platform === 'win32' ? ['/c', 'start', address] : [address], { stdio: 'ignore' }); } catch { if (options.debug) output('Could not open browser automatically.'); }
  }
  const close = () => server.close(); process.once('SIGINT', close); process.once('SIGTERM', close);
}

function info(options = {}) {
  if (options.json) return output(JSON.stringify({ name: 'maverick-ai-dev-stack', version: packageVersion }));
  output(`Maverick AI Dev Stack\nVersion ${packageVersion}\nA vendor-neutral engineering workflow. No telemetry by default.`);
}

export const projectCommands = [
  { id: 'dashboard', description: 'Open the local project-intelligence dashboard.', aliases: ['dash', 'lens'], usage: 'dashboard --open', run: ({ cwd, options }) => dashboard(cwd, options) },
  { id: 'init', description: 'Initialize a project or create a task with a legacy slug.', aliases: [], usage: 'init [task]', run: ({ cwd, arg, options }) => (arg ? createTask(cwd, arg, options) : initProject(cwd)) },
  { id: 'map', description: 'Build a repository context map.', aliases: [], usage: 'map [--json]', run: ({ cwd, options }) => mapProject(cwd, options) },
  { id: 'stack', description: 'Detect languages, frameworks, and verification commands.', aliases: [], usage: 'stack [--json]', run: ({ cwd, options }) => showStack(cwd, options) },
  { id: 'config', description: 'Show, validate, or locate layered configuration.', aliases: [], usage: 'config show|validate|path', run: ({ cwd, arg, options }) => configCommand(cwd, arg, options) },
  { id: 'doctor', description: 'Inspect local setup, toolchains, and project checks.', aliases: [], usage: 'doctor [--fix]', run: ({ cwd, options }) => doctor(cwd, options) },
  { id: 'status', description: 'Show task stage and pending gates.', aliases: [], usage: 'status [--json]', run: ({ cwd, options }) => status(cwd, options) },
  { id: 'info', description: 'Show Maverick information.', aliases: ['version', '--version', '-v'], usage: 'info', run: ({ options }) => info(options) }
];
