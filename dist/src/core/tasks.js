import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { taskStage } from './pipeline.js';
import { requirePreset } from './presets.js';
import { exists, readJson, rel, requireSlug } from './util.js';

export function taskPath(cwd, config, slug) { requireSlug(slug); return join(cwd, config.taskRoot, slug); }

/** The task's metadata (idea, workflow, creation date). Empty when TASK.json is missing. */
export async function taskMeta(dir) { return await exists(join(dir, 'TASK.json')) ? readJson(join(dir, 'TASK.json')) : {}; }

export async function taskPreset(dir) { return (await taskMeta(dir)).workflow || 'standard'; }

/** Every task of the project, sorted by slug, with its workflow, current stage, subtask progress and next step. */
export async function listTasks(cwd, config) {
  config ||= await loadConfig(cwd);
  const base = join(cwd, config.taskRoot);
  if (!await exists(base)) return [];
  const tasks = [];
  for (const entry of (await readdir(base, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(base, entry.name), preset = requirePreset(await taskPreset(dir)), state = await taskStage(dir, preset, entry.name);
    tasks.push({ task: entry.name, workflow: preset.id, stage: state.stage, tasks: state.tasks, next: state.next, stages: preset.stages });
  }
  return tasks;
}

/** Loads an existing task. Every task-scoped command starts here. */
export async function getTask(cwd, slug) {
  const config = await loadConfig(cwd), dir = taskPath(cwd, config, slug);
  if (!await exists(dir)) {
    const known = (await listTasks(cwd, config)).map(task => task.task);
    throw new Error(`task not found: ${rel(cwd, dir)} in ${cwd}; ${known.length ? `tasks here: ${known.join(', ')}` : 'this project has no tasks yet'}. Run it from the project that owns the task, or start one with maverick new "<idea>"`);
  }
  // A task without a recorded idea (created by hand) is described by its slug.
  const meta = { idea: slug.replace(/-/g, ' '), ...await taskMeta(dir) };
  return { config, dir, meta, preset: requirePreset(meta.workflow || 'standard') };
}
