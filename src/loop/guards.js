import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { sha256 } from '../capabilities/model.js';
import { checkboxOnlyChange, checklist } from '../subtasks/graph.js';
import { pretty } from '../core/util.js';

// The harness protects itself. The files that define what "passing" means (the configuration
// that lists the verification commands, the flows, the task's contract) and the loop's own
// record are copied before each agent run and put back right after it, before any gate runs.
// Otherwise an agent could turn `verification.commands` into `true` and pass every check.

const TASK_FILES = ['PRD.md', 'SPEC.md', 'TECHSPEC.md', 'TASK.json', 'REVIEW.md', 'LOOP-NOTES.md'];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []), files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path)); else if (entry.isFile()) files.push(path);
  }
  return files;
}

const read = path => readFile(path).catch(() => null);

/**
 * Copies the protected set into `<inflight>/files` and records each file's hash, or that it
 * did not exist. `harness` entries (the ledger and state) are checked but never restored on a
 * rejection, because the loop itself writes them after the run.
 */
export async function backupProtected({ cwd, taskDir, loopDir, inflight, subtask }) {
  const maverick = join(cwd, '.maverick');
  const paths = [
    join(maverick, 'config.json'), join(maverick, 'policy.json'), ...await listFiles(join(maverick, 'flows')),
    ...TASK_FILES.map(name => join(taskDir, name)), ...await listFiles(join(taskDir, 'subtasks')), ...(await listFiles(join(taskDir, 'flows'))).filter(path => path.endsWith('.json'))
  ];
  const harness = [join(loopDir, 'ledger.jsonl'), join(loopDir, 'state.json')];
  const store = join(inflight, 'files');
  await rm(store, { recursive: true, force: true });
  const entries = [];
  for (const [path, isHarness] of [...paths.map(path => [path, false]), ...harness.map(path => [path, true])]) {
    const content = await read(path), rel = relative(cwd, path);
    if (content) { await mkdir(dirname(join(store, rel)), { recursive: true }); await writeFile(join(store, rel), content); }
    entries.push({ path, rel, hash: content ? sha256(content) : null, harness: isHarness });
  }
  const backup = { cwd, store, entries, flowsDir: join(maverick, 'flows'), subtaskFile: subtask ? join(taskDir, 'subtasks', subtask.file) : null };
  await writeFile(join(inflight, 'manifest.json'), pretty(backup));
  return backup;
}

async function put(backup, entry) {
  if (entry.hash === null) { await rm(entry.path, { force: true }); return; }
  await mkdir(dirname(entry.path), { recursive: true });
  await writeFile(entry.path, await readFile(join(backup.store, entry.rel)));
}

/**
 * Puts back every protected file the agent changed and reports it. The current subtask file
 * may change only by ticked boxes; `checklistDelta` is how many boxes the agent ticked.
 */
export async function checkProtected(backup) {
  const findings = [];
  let checklistDelta = 0;
  for (const entry of backup.entries) {
    const content = await read(entry.path);
    if ((content ? sha256(content) : null) === entry.hash) continue;
    if (entry.path === backup.subtaskFile && content && entry.hash) {
      const before = (await readFile(join(backup.store, entry.rel))).toString('utf8'), after = content.toString('utf8');
      if (checkboxOnlyChange(before, after)) { checklistDelta = checklist(after).done - checklist(before).done; continue; }
    }
    await put(backup, entry);
    findings.push({ severity: 'block', kind: 'protected-path-modified', file: entry.rel, message: `the agent changed ${entry.harness ? 'the loop\'s own record' : 'a file that defines the task or its checks'}; Maverick restored it` });
  }
  // A flow the agent added would shadow a built-in one on the next run.
  const known = new Set(backup.entries.map(entry => entry.path));
  for (const path of await listFiles(backup.flowsDir)) {
    if (known.has(path)) continue;
    await rm(path, { force: true });
    findings.push({ severity: 'block', kind: 'protected-path-modified', file: relative(backup.cwd, path), message: 'the agent added a flow; Maverick removed it' });
  }
  return { findings, checklistDelta };
}

/** Puts the task and configuration files back as they were before the run (on a rejection or after a crash). */
export async function restoreBackup(backup) {
  for (const entry of backup.entries) {
    if (entry.harness) continue;
    const content = await read(entry.path);
    if ((content ? sha256(content) : null) !== entry.hash) await put(backup, entry);
  }
}

export async function readBackup(inflight) {
  try { return JSON.parse(await readFile(join(inflight, 'manifest.json'), 'utf8')); } catch { return null; }
}
