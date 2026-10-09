import {
  exists,
  getPreset,
  loadConfig,
  packageVersion,
  taskPreset,
  taskStage
} from "./chunk-YKOOPOXS.js";
import "./chunk-DSSJQNFU.js";

// src/ui/snapshot.js
import { readdir, stat } from "fs/promises";
import { execFileSync } from "child_process";
import { basename, join } from "path";
function gitBranch(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 1500 }).toString().trim() || void 0;
  } catch {
    return void 0;
  }
}
async function projectSnapshot(cwd = process.cwd()) {
  const initialized = await exists(join(cwd, ".maverick", "config.json"));
  let config, configError;
  try {
    config = await loadConfig(cwd);
  } catch (error) {
    configError = error.message;
  }
  const tasks = [];
  if (config) {
    const base = join(cwd, config.taskRoot);
    try {
      for (const entry of (await readdir(base, { withFileTypes: true })).filter((item) => item.isDirectory())) {
        const dir = join(base, entry.name), preset2 = await taskPreset(dir), [info, state] = await Promise.all([stat(dir), taskStage(dir, getPreset(preset2) || getPreset("standard"), entry.name)]);
        tasks.push({ slug: entry.name, preset: preset2, updatedAt: info.mtimeMs, stage: state.stage, next: state.next });
      }
    } catch {
    }
  }
  tasks.sort((a, b) => b.updatedAt - a.updatedAt);
  const preset = config?.workflow?.default || "standard";
  return {
    cwd,
    version: packageVersion,
    initialized,
    configError,
    name: config?.project?.name || basename(cwd),
    branch: gitBranch(cwd),
    preset,
    presetName: getPreset(preset)?.name || preset,
    tasks,
    latest: tasks[0]
  };
}
export {
  projectSnapshot
};
