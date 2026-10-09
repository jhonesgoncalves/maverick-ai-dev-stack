import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadGraph, MANIFEST, refreshManifest } from '../subtasks/graph.js';
import { fold, headingAliases } from './language.js';
import { exists } from './util.js';

// Brings a task created by an older Maverick to the current format, without touching its content:
// in each task file the Acceptance Criteria, Steps and Verification lists become checklists, and
// `_tasks.md` is rewritten as a checklist of the tasks. Running it twice changes nothing.

const CHECKLIST_SECTIONS = ['Acceptance Criteria', 'Steps', 'Verification'].map(name => headingAliases(name));
const LIST_ITEM = /^([-*]|\d+[.)]) +(?!\[[ xX]\] )(.+)$/;

/** Turns top-level list items of the checklist sections into `- [ ]` items (`- [x]` when the task is done). */
export function toChecklists(body, { done = false } = {}) {
  let inChecklist = false, fence = false, converted = 0;
  const lines = String(body).split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading) { inChecklist = CHECKLIST_SECTIONS.some(aliases => aliases.includes(fold(heading[1]))); return line; }
    const item = inChecklist && line.match(LIST_ITEM);
    if (!item) return line;
    converted++;
    return `- [${done ? 'x' : ' '}] ${item[2]}`;
  });
  return { body: lines.join('\n'), converted };
}

/** Plans (and unless `dryRun`, applies) the migration of one task. Returns what changed per file. */
export async function migrateTask(dir, slug, { dryRun = false } = {}) {
  const graph = await loadGraph(dir), changes = [];
  if (!graph.exists) return { changes, subtasks: 0 };
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  for (const item of graph.items) {
    const path = join(dir, 'subtasks', item.file), text = await readFile(path, 'utf8');
    const { body, converted } = toChecklists(text, { done: item.status === 'done' });
    if (!converted) continue;
    changes.push({ file: `subtasks/${item.file}`, converted, status: item.status });
    if (!dryRun) await writeFile(path, body);
  }
  const manifest = join(dir, 'subtasks', MANIFEST), before = await exists(manifest) ? await readFile(manifest, 'utf8') : '';
  if (!/^- \[[ x]\] \d{2,3} /m.test(before)) {
    changes.push({ file: `subtasks/${MANIFEST}`, converted: graph.items.length, status: 'checklist of tasks' });
    if (!dryRun) await refreshManifest(dir, slug);
  }
  return { changes, subtasks: graph.items.length };
}
