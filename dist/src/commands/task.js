import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { taskStage } from '../core/pipeline.js';
import { ARTIFACTS, planningStages } from '../core/presets.js';
import { lintTask } from '../core/quality.js';
import { getTask } from '../core/tasks.js';
import { brand, exists, output, rel } from '../core/util.js';
import { loadGraph } from '../subtasks/graph.js';

async function taskPacket(cwd, slug, options = {}) {
  const { dir, preset, meta } = await getTask(cwd, slug);
  const mapPath = join(cwd, '.maverick', 'context', 'PROJECT_MAP.md'), contents = [];
  if (await exists(mapPath)) contents.push(`## PROJECT_MAP.md\n\n${await readFile(mapPath, 'utf8')}`);
  for (const { file } of ARTIFACTS) if (await exists(join(dir, file))) contents.push(`## ${file}\n\n${await readFile(join(dir, file), 'utf8')}`);
  const graph = await loadGraph(dir);
  if (graph.items.length) contents.push(`## Tasks\n\n${graph.items.map(item => `- ${item.id} ${item.title} (${item.status}${item.dependsOn.length ? `, after ${item.dependsOn.join(', ')}` : ''})`).join('\n')}`);
  const path = join(dir, 'TASK-PACKET.md');
  await writeFile(path, `# Maverick Task Packet\n\nIdea: ${meta.idea || slug}\nWorkflow: ${preset.name}\nAgent: ${options.agent || 'generic'}\n\nFollow repository instructions, stay within the PRD and technical spec, run relevant verification, and leave findings for human review.\n\n${contents.join('\n\n')}`);
  output(options.json ? JSON.stringify({ workflow: preset.id, agent: options.agent || 'generic', path: rel(cwd, path) }) : `${brand()} / PACKET\n✓ agent packet: ${rel(cwd, path)}\nAgent: ${options.agent || 'generic'}`);
}

async function validate(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const status = await taskStage(dir, preset, slug);
  // Without --stage, check only the planning stages the task has reached: stages it has not
  // started yet would fail as "not written yet" and bury the issues of the current one.
  const current = planningStages(preset).includes(status.stage) ? status.stage : undefined;
  const stage = typeof options.stage === 'string' ? options.stage : options.all ? undefined : current;
  const results = await lintTask(cwd, dir, { strict: Boolean(options.strict), stage, preset });
  const errors = results.filter(item => item.status === 'FAIL').length, warnings = results.length - errors;
  if (options.json) output(JSON.stringify({ workflow: preset.id, stage: status.stage, checked: stage || 'all', valid: !errors, errors, warnings, results }, null, 2));
  else {
    output(`${brand()} / VALIDATE${options.strict ? ' (strict)' : ''}\nWorkflow: ${preset.name} · checked: ${stage ? `up to ${stage.toUpperCase()}` : planningStages(preset).map(item => item.toUpperCase()).join(', ')}`);
    results.forEach(r => output(`${r.status} ${r.file}: ${r.message}`));
    if (!errors) output(`PASS${warnings ? ` (${warnings} warning(s))` : ''}. Next: ${status.next}`);
  }
  if (errors) throw new Error(`${errors} validation error(s)`);
}

export const taskCommands = [
  { id: 'packet', description: 'Compile a focused agent packet.', aliases: ['run'], usage: 'packet <task> --agent <name>', run: ({ cwd, arg, options }) => taskPacket(cwd, arg, options) },
  { id: 'validate', description: 'Validate the PRD, behavioral spec (spec-driven), technical spec and tasks up to the task\'s current stage (--all for every stage): headings, criteria ids, scenarios, real paths and coverage.', aliases: [], usage: 'validate <task> [--stage prd|spec|techspec|tasks|--all] [--strict] [--json]', run: ({ cwd, arg, options }) => validate(cwd, arg, options) }
];
