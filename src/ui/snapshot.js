import { readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { getPreset } from '../core/presets.js';
import { taskPreset } from '../core/tasks.js';
import { exists, packageVersion } from '../core/util.js';
import { taskStage } from '../core/pipeline.js';

function gitBranch(cwd) {
  try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).toString().trim() || undefined; } catch { return undefined; }
}

/** A cheap, read-only summary of the current project for the interactive launcher. Never throws. */
export async function projectSnapshot(cwd = process.cwd()) {
  const initialized = await exists(join(cwd, '.maverick', 'config.json'));
  let config, configError;
  try { config = await loadConfig(cwd); } catch (error) { configError = error.message; }
  const tasks = [];
  if (config) {
    const base = join(cwd, config.taskRoot);
    try {
      for (const entry of (await readdir(base, { withFileTypes: true })).filter(item => item.isDirectory())) {
        const dir = join(base, entry.name), preset = await taskPreset(dir), [info, state] = await Promise.all([stat(dir), taskStage(dir, getPreset(preset) || getPreset('standard'), entry.name)]);
        tasks.push({ slug: entry.name, preset, updatedAt: info.mtimeMs, stage: state.stage, next: state.next });
      }
    } catch { /* no task root yet */ }
  }
  tasks.sort((a, b) => b.updatedAt - a.updatedAt);
  const preset = config?.workflow?.default || 'standard';
  return {
    cwd, version: packageVersion, initialized, configError,
    name: config?.project?.name || basename(cwd), branch: gitBranch(cwd),
    preset, presetName: getPreset(preset)?.name || preset,
    tasks, latest: tasks[0]
  };
}
