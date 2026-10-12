import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCommand, lacksGitBaseline } from '../core/project-tools.js';
import { detectStack } from '../core/stack.js';
import { getTask } from '../core/tasks.js';
import { brand, output, rel } from '../core/util.js';
import { inPlace, resolveRef, treeOf } from '../loop/git.js';
import { loopSettings } from '../loop/model.js';
import { renderAblationReport, runAblation } from '../proof/ablation.js';
import { checkArchitecture, renderArchitectureReport } from '../proof/architecture.js';

// Evidence about the checks themselves, beyond "they pass": whether the new tests can fail at
// all (ablation) and whether the change made the import structure worse (architecture). Both
// compare the working tree with `--against` (HEAD by default; a loop passes its baseline).

/**
 * Runs `fn({ base, head, diff, against })` on the change since `--against`: the working tree is
 * snapshotted through a private index, so the user's index is never touched. `null` outside git.
 */
async function withChange(cwd, options, fn) {
  if (!(await executeCommand(cwd, 'git rev-parse --is-inside-work-tree', '', 100)).ok) return null;
  if (await lacksGitBaseline(cwd)) throw new Error('git tracks no file of this project; commit it so its changes can be compared');
  const against = typeof options.against === 'string' ? options.against : 'HEAD', commit = await resolveRef(cwd, against);
  if (!commit) throw new Error(`unknown revision: ${against}`);
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-change-'));
  try {
    const tree = inPlace({ cwd, task: 'change', indexFile: join(scratch, 'index'), inflight: scratch });
    const head = await tree.snapshot(), base = await treeOf(cwd, commit);
    return await fn({ base, head, diff: await tree.diff(base, head, { patch: false, maxLines: Infinity }), against });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** `maverick ablation <task>`: each new or changed test must pass with the change and fail without it. */
async function ablation(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const settings = loopSettings(config, null, { integrity: typeof options.level === 'string' ? options.level : undefined });
  const stack = await detectStack(cwd);
  const payload = await withChange(cwd, options, async ({ base, head, diff, against }) => {
    const report = await runAblation({ cwd, taskDir: dir, config, stack, base, head, diff, settings });
    const path = join(dir, 'ABLATION.md');
    await writeFile(path, renderAblationReport(slug, report, { against }));
    return { ...report, against, path: rel(cwd, path) };
  });
  if (!payload) return output(options.json ? JSON.stringify({ ok: true, level: 'off', files: [], findings: [], stats: { tests: 0 }, note: 'not a git repository: nothing to compare' }, null, 2) : `${brand()} / ABLATION ${slug}\nNOTE not a git repository: nothing to compare`);
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    const s = payload.stats;
    output(`${brand()} / ABLATION ${slug}\nCompared with ${payload.against} · level ${payload.level}\n${s.tests ? `${s.discriminating}/${s.tests} new or changed test file(s) fail without the change${s.vacuous ? ` · ${s.vacuous} vacuous` : ''}${s.broken ? ` · ${s.broken} fail with it too` : ''}${s.unmeasured ? ` · ${s.unmeasured} not measured` : ''}` : `NOTE ${payload.note || 'no test to measure'}`}`);
    payload.findings.forEach(item => output(`${item.severity === 'block' ? 'FAIL' : 'WARN'} ${item.kind} ${item.file}: ${item.message}${item.excerpt ? ` (${item.excerpt})` : ''}`));
    payload.files.filter(file => ['broken', 'unmeasured'].includes(file.verdict)).forEach(file => output(`NOTE ${file.path}: ${file.note}`));
    output(`Report: ${payload.path}`);
  }
  if (!payload.ok) throw new Error('vacuous tests require human review');
}

/** `maverick structure <task>` (the `architecture` gate): no new import cycle, no new boundary violation, no health drop beyond the limit. */
async function structure(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const payload = await withChange(cwd, options, async ({ base, head, against }) => {
    const report = await checkArchitecture({ cwd, taskDir: dir, config, base, head });
    const path = join(dir, 'ARCHITECTURE-CHECK.md');
    await writeFile(path, renderArchitectureReport(slug, report, { against }));
    return { ...report, against, path: rel(cwd, path) };
  });
  if (!payload) return output(options.json ? JSON.stringify({ ok: true, findings: [], note: 'not a git repository: nothing to compare' }, null, 2) : `${brand()} / STRUCTURE ${slug}\nNOTE not a git repository: nothing to compare`);
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    output(`${brand()} / STRUCTURE ${slug}\nCompared with ${payload.against}${payload.base.health === null ? '' : `\nHealth ${payload.base.health} → ${payload.head.health} · cycles ${payload.base.cycles} → ${payload.head.cycles} · hubs ${payload.base.hubs} → ${payload.head.hubs}`}`);
    payload.findings.forEach(item => output(`${item.severity === 'block' ? 'FAIL' : 'WARN'} ${item.kind}: ${item.message}`));
    if (payload.note) output(`NOTE ${payload.note}`);
    output(`${payload.ok ? 'PASS no new cycle, boundary violation or health drop that the task did not declare\n' : ''}Report: ${payload.path}`);
  }
  if (!payload.ok) throw new Error('the change made the architecture worse');
}

export const proofCommands = [
  { id: 'ablation', description: 'Check that new tests can fail: each must pass with the change and fail without it.', aliases: [], usage: 'ablation <task> [--against <ref>] [--level strict|standard|off]', run: ({ cwd, arg, options }) => ablation(cwd, arg, options) },
  { id: 'structure', description: 'Ratchet the import structure: no new cycle, no new boundary violation, no health drop (the architecture gate).', aliases: [], usage: 'structure <task> [--against <ref>]', run: ({ cwd, arg, options }) => structure(cwd, arg, options) }
];
