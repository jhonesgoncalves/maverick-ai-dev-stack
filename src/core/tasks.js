import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { requirePreset } from './presets.js';
import { exists, readJson, rel, requireSlug } from './util.js';

export function taskPath(cwd, config, slug) { requireSlug(slug); return join(cwd, config.taskRoot, slug); }

export async function taskPreset(dir, config) {
  const meta = join(dir, 'TASK.json');
  if (await exists(meta)) return (await readJson(meta)).preset || config.workflow.defaultPreset;
  const file = join(dir, 'TASK.md');
  if (await exists(file)) {
    const match = (await readFile(file, 'utf8')).match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    const preset = match?.[1].match(/^preset:\s*([^\s#]+)\s*$/m)?.[1];
    if (preset) return preset;
  }
  return config.workflow.defaultPreset || 'standard';
}

/** Loads an existing task. Every task-scoped command starts here. */
export async function getTask(cwd, slug) {
  const config = await loadConfig(cwd), dir = taskPath(cwd, config, slug);
  if (!await exists(dir)) throw new Error(`task not found: ${rel(cwd, dir)}; run maverick task ${slug} first`);
  return { config, dir, preset: requirePreset(await taskPreset(dir, config)) };
}
