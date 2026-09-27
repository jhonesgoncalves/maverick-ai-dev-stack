import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { getPreset, presets, requirePreset } from '../core/presets.js';
import { recommendPreset } from '../core/preset-suggestion.js';
import { getTask, taskPath } from '../core/tasks.js';
import { brand, exists, hasMeaningfulContent, output, packageRoot, pretty, rel, replaceVars, sectionPresent } from '../core/util.js';

export async function createTask(cwd, slug, options = {}) {
  const config = await loadConfig(cwd), preset = requirePreset(options.preset || config.workflow.defaultPreset || 'standard'), dir = taskPath(cwd, config, slug);
  if (await exists(dir)) throw new Error(`task already exists: ${rel(cwd, dir)}; choose another slug or remove it deliberately`);
  await mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10), artifacts = [...preset.artifacts];
  if ((options.riskDoc || config.workflow.riskDocumentation) && preset.strict) artifacts.push({ id: 'RISK', file: 'RISK.md', template: 'risk.md', sections: ['Risk Assessment', 'Mitigations', 'Rollback', 'Approval'] });
  for (const item of artifacts) await writeFile(join(dir, item.file), replaceVars(await readFile(join(packageRoot, 'templates', item.template), 'utf8'), { TASK_SLUG: slug, DATE: today }));
  await writeFile(join(dir, 'TASK.json'), pretty({ preset: preset.id, createdAt: today }));
  output(`${brand()}\n✓ task created: ${rel(cwd, dir)}\nPreset: ${preset.name}\nStages: ${preset.stages.map(s => s.toUpperCase()).join(' → ')}`);
}

async function showArtifact(cwd, slug, filename, label) {
  const { dir } = await getTask(cwd, slug), path = join(dir, filename);
  output(`${label}: ${rel(cwd, path)}${await exists(path) ? '' : ' (not included by this preset)'}`);
}

async function taskPacket(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const mapPath = join(cwd, '.maverick', 'context', 'PROJECT_MAP.md'), contents = [];
  for (const file of ['SPEC.md', 'TASK.md', 'CONTEXT.md', 'PLAN.md']) if (await exists(join(dir, file))) contents.push(`## ${file}\n\n${await readFile(join(dir, file), 'utf8')}`);
  if (await exists(mapPath)) contents.unshift(`## PROJECT_MAP.md\n\n${await readFile(mapPath, 'utf8')}`);
  const path = join(dir, 'TASK-PACKET.md');
  await writeFile(path, `# Maverick Task Packet\n\nPreset: ${preset.name}\nAgent: ${options.agent || 'generic'}\n\nFollow repository instructions, stay in scope, run relevant verification, and leave findings for human review.\n\n${contents.join('\n\n')}`);
  output(options.json ? JSON.stringify({ preset: preset.id, agent: options.agent || 'generic', path: rel(cwd, path) }) : `${brand()} / PACKET\n✓ agent packet: ${rel(cwd, path)}\nAgent: ${options.agent || 'generic'}`);
}

function validatorArtifacts(preset, riskDoc) {
  const items = preset.artifacts.map(item => ({
    ...item,
    sections: preset.strict && item.id === 'TASK' ? [...item.sections, 'Risk', 'Expected Changed Files', 'Actual Changed Files']
      : preset.strict && item.id === 'PLAN' ? [...item.sections, 'Rollback']
        : preset.strict && item.id === 'REVIEW' ? ['Scope', 'Behavior', 'Tests', 'Security', 'Reliability', 'Observability', 'Dependencies', 'Rollback', 'Maintainability', 'Final Decision']
          : item.sections
  }));
  return riskDoc ? [...items, { id: 'RISK', file: 'RISK.md', sections: ['Risk Assessment', 'Mitigations', 'Rollback', 'Approval'] }] : items;
}

async function validate(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  let errors = 0, warnings = 0; const results = [];
  for (const item of validatorArtifacts(preset, await exists(join(dir, 'RISK.md')))) {
    const path = join(dir, item.file);
    if (!await exists(path)) { results.push({ file: item.file, status: 'FAIL', message: 'missing' }); errors++; continue; }
    const text = await readFile(path, 'utf8');
    for (const section of item.sections) if (!sectionPresent(text, section)) { results.push({ file: item.file, status: 'FAIL', message: `missing section "${section}"` }); errors++; }
    if (!hasMeaningfulContent(text)) { results.push({ file: item.file, status: 'WARN', message: 'placeholders remain' }); warnings++; }
  }
  if (options.json) output(JSON.stringify({ preset: preset.id, stages: preset.stages, valid: !errors, errors, warnings, results }, null, 2));
  else {
    output(`${brand()} / VALIDATE\nPreset: ${preset.name}`); results.forEach(r => output(`${r.status} ${r.file}: ${r.message}`));
    if (!errors) output(`PASS required artefacts and sections are present${warnings ? ` (${warnings} warning(s))` : ''}.`);
  }
  if (errors) throw new Error(`${errors} validation error(s)`);
}

function showPresets(id) {
  if (id) { const p = requirePreset(id); return output(`${brand()} / PRESET\n\nPreset:\n${p.name}\n\nArtifacts:\n${p.artifacts.map(a => a.id).join('\n')}\n\nStages:\n${p.stages.map(s => s.toUpperCase()).join(' → ')}\n\nBest for:\n${p.bestFor}`); }
  output(`${brand()} / PRESETS\n\n${Object.values(presets).map(p => `${p.id.toUpperCase()}\n${p.description}`).join('\n\n')}`);
}

function suggest(options = {}) {
  const rec = recommendPreset(options);
  output(options.json ? JSON.stringify(rec) : `Recommended preset: ${getPreset(rec.preset).name}\nReason: ${rec.reason}`);
}

export const taskCommands = [
  { id: 'task', description: 'Create preset-driven task artifacts.', aliases: ['create'], usage: 'task <slug> --preset <preset>', run: ({ cwd, arg, options }) => createTask(cwd, arg, options) },
  { id: 'packet', description: 'Compile a focused agent packet.', aliases: ['run'], usage: 'packet <task> --agent <name>', run: ({ cwd, arg, options }) => taskPacket(cwd, arg, options) },
  { id: 'presets', description: 'List or inspect workflow presets.', aliases: [], usage: 'presets [show <preset>]', run: ({ arg, third }) => showPresets(arg === 'show' ? third : undefined) },
  { id: 'suggest', description: 'Recommend a preset from local rules.', aliases: [], usage: 'suggest [--risk high]', run: ({ options }) => suggest(options) },
  { id: 'validate', description: 'Validate task artifacts and required sections.', aliases: [], usage: 'validate <task> [--json]', run: ({ cwd, arg, options }) => validate(cwd, arg, options) },
  { id: 'context', description: 'Show a task context artifact.', aliases: [], usage: 'context <task>', run: ({ cwd, arg }) => showArtifact(cwd, arg, 'CONTEXT.md', 'Context') },
  { id: 'plan', description: 'Show a task plan artifact.', aliases: [], usage: 'plan <task>', run: ({ cwd, arg }) => showArtifact(cwd, arg, 'PLAN.md', 'Plan') }
];

export { showArtifact };
