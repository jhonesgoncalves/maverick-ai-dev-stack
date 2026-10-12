import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { INSTRUCTION_ADAPTERS, instructionAdapter } from '../core/instruction-adapters.js';
import { taskStage } from '../core/pipeline.js';
import { openPullRequest, splitDraft } from '../core/pull-request.js';
import { getTask, taskMeta, writeTaskMeta } from '../core/tasks.js';
import { brand, exists, output, packageRoot, readText, rel, replaceVars, sectionBody } from '../core/util.js';
import { loopIds } from '../loop/model.js';
import { readState } from '../loop/engine.js';
import { readSealed } from '../sealed/model.js';
import { applyRevocations, harvestContracts } from '../memory/contracts.js';
import { budgetLine, reviewBase, reviewBudget } from '../proof/attention.js';

async function learn(cwd, slug, options = {}) {
  await getTask(cwd, slug);
  if (!options.rule || options.rule === true) throw new Error('provide a rule with --rule "..."');
  const dir = join(cwd, '.maverick'), path = join(dir, 'LEARNINGS.md');
  await mkdir(dir, { recursive: true });
  const existing = await exists(path) ? await readFile(path, 'utf8') : '# Maverick Learnings\n\nProposed reusable rules. Promote only after team review.\n';
  await writeFile(path, `${existing}\n- [ ] ${options.rule}\n  - Source task: \`${slug}\`\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), rule: options.rule }) : `${brand()} / LEARN\n✓ proposed rule saved: ${rel(cwd, path)}`);
}

/** The first paragraph of the PRD overview: what this change is for. */
async function taskGoal(dir) {
  return sectionBody(await readText(join(dir, 'PRD.md')), 'Overview').split('\n\n')[0] || 'See PRD.md.';
}

async function handoff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), present = {};
  for (const file of ['EVIDENCE.md', 'REVIEW-FINDINGS.md', 'SECURITY-REPORT.md', 'DEPENDENCY-REVIEW.md', 'SCOPE-GUARD.md', 'CHECKPOINT.md']) present[file] = await exists(join(dir, file));
  const goal = await taskGoal(dir);
  const remaining = Object.entries(present).filter(([, value]) => !value).map(([file]) => file), path = join(dir, 'HANDOFF.md');
  await writeFile(path, `# Handoff — ${slug}\n\n## Goal\n${goal}\n\n## Workflow\nWorkflow: ${preset.name}\n\n## Completed evidence\n${Object.entries(present).filter(([, value]) => value).map(([file]) => `- \`${file}\``).join('\n') || '- none'}\n\n## Still needed\n${remaining.map(file => `- \`${file}\``).join('\n') || '- Complete human review and PR decision.'}\n\n## Next owner\nName/agent: ${options.to || 'unassigned'}\n\n## Notes\nRead PRD.md, SPEC.md (spec-driven), TECHSPEC.md, the tasks in subtasks/ and the reports listed above before continuing.\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), remaining }) : `${brand()} / HANDOFF\n✓ handoff: ${rel(cwd, path)}\nRemaining reports: ${remaining.length}`);
}

async function adapter(cwd, action, name, options = {}) {
  const ids = INSTRUCTION_ADAPTERS.map(item => item.id);
  if (action === 'list') return output(options.json ? JSON.stringify(ids) : `${brand()} / ADAPTERS\n${INSTRUCTION_ADAPTERS.map(item => `${item.id.padEnd(13)}${item.target}`).join('\n')}`);
  const entry = instructionAdapter(name);
  if (action !== 'install' || !entry) throw new Error(`use adapter list or adapter install <${ids.join('|')}>`);
  const destination = join(cwd, entry.target);
  if (await exists(destination)) throw new Error(`adapter target already exists: ${rel(cwd, destination)}`);
  await mkdir(dirname(destination), { recursive: true }); await copyFile(join(packageRoot, entry.source), destination);
  output(options.json ? JSON.stringify({ adapter: name, path: rel(cwd, destination) }) : `${brand()} / ADAPTER\n✓ ${name}: ${rel(cwd, destination)}`);
}

async function ci(cwd, provider, slug, options = {}) {
  if (provider !== 'github') throw new Error('only the github CI generator is currently available');
  await getTask(cwd, slug);
  const destination = join(cwd, '.github', 'workflows', `maverick-${slug}.yml`);
  if (await exists(destination)) throw new Error(`CI workflow already exists: ${rel(cwd, destination)}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, replaceVars(await readFile(join(packageRoot, 'templates', 'github-actions-maverick.yml'), 'utf8'), { TASK_SLUG: slug }));
  output(options.json ? JSON.stringify({ provider, task: slug, path: rel(cwd, destination) }) : `${brand()} / CI\n✓ GitHub Actions workflow: ${rel(cwd, destination)}`);
}

/** What the change is called: the PRD's heading without its "PRD —" prefix, else the idea. */
async function taskTitle(dir, meta) {
  const heading = (await readText(join(dir, 'PRD.md'))).match(/^#\s+(.+)$/m)?.[1]?.replace(/^PRD\s*[—–-]\s*/i, '').trim();
  return heading || meta.idea;
}

/** PR-DRAFT's Holdout section: who wrote the hidden tests, how the last loop did against them, and what the reviewer decided. */
async function holdoutSummary(dir) {
  const sealed = await readSealed(dir);
  if (!sealed) return null;
  const [id] = await loopIds(dir), state = id ? await readState(dir, id).catch(() => null) : null, final = state?.sealed?.sealId === sealed.sealId && sealed.decision ? state.sealed.final : null;
  return `Sealed acceptance tests: ${sealed.tests} written by ${sealed.sealer.human ? `${sealed.sealer.human} (human)` : `${sealed.sealer.provider} (${sealed.sealer.family})`}, never seen by the builders (${sealed.builders.join(', ') || '—'}).${final ? `\nLast loop: ${final.passed}/${final.total} pass${final.OI !== null ? ` · overfitting index ${final.OI >= 0 ? '+' : ''}${final.OI} pp` : ''}.` : ''}\nDecision: ${sealed.decision ? `${sealed.decision.decision === 'commit' ? `committed as ${sealed.decision.protect ? 'protected ' : ''}regression tests` : 'discarded'} by ${sealed.decision.by}` : 'pending (maverick unseal)'}.`;
}

/**
 * Writes PR-DRAFT.md: its heading is the pull request's title and the rest its description, so a
 * person can edit both before approving. `--keep` keeps a draft that already exists (the pr flow
 * uses it, so a run never discards edits or an approval); on its own the command writes it again.
 */
async function draftPr(cwd, slug, options = {}) {
  const { config, dir, preset, meta } = await getTask(cwd, slug), path = join(dir, 'PR-DRAFT.md');
  if (options.keep && await exists(path)) return output(options.json ? JSON.stringify({ path: rel(cwd, path), kept: true }) : `${brand()} / PR\n✓ kept: ${rel(cwd, path)}`);
  const evidence = await exists(join(dir, 'EVIDENCE.md')) ? await readFile(join(dir, 'EVIDENCE.md'), 'utf8') : 'Verification evidence has not been captured.';
  const findings = await exists(join(dir, 'REVIEW-FINDINGS.md')) ? 'Diff review report is available in REVIEW-FINDINGS.md.' : 'Diff review has not been run.';
  const goal = await taskGoal(dir), holdout = await holdoutSummary(dir);
  // Where the reviewer should look first; a draft is still written when the budget cannot be computed.
  const budget = await reviewBase(cwd, dir, config).then(against => reviewBudget({ cwd, task: slug, taskDir: dir, config, against })).catch(() => null);
  const look = budget?.hunks ? `${budgetLine(budget)}\n${budget.focus.map(item => `- \`${item.file}:${item.start}\` — ${item.brief.join('; ')}`).join('\n')}${budget.tree.some(item => item.verdict !== 'met') ? `\n\nCriteria to check by hand: ${budget.tree.filter(item => item.verdict !== 'met').map(item => `${item.id} (${item.verdict})`).join(', ')}.` : ''}\nDetails: REVIEW-BUDGET.md (maverick attention ${slug}).` : null;
  await writeFile(path, `# ${await taskTitle(dir, meta)}\n\n## Summary\n${goal}\n\n## Workflow\nWorkflow: ${preset.name}\n\n## Verification\n${evidence.includes('## PASS') ? 'Automated verification evidence captured in EVIDENCE.md.' : evidence}${holdout ? `\n\n## Holdout\n${holdout}` : ''}${look ? `\n\n## Where to look\n${look}` : ''}\n\n## Review\n${findings}\n\n## Risks / rollback\n${sectionBody(await readText(join(dir, 'TECHSPEC.md')), 'Risks and Rollback') || 'See TECHSPEC.md.'}\n\n## Human Review\n- [ ] Scope, behavior, tests, and security-sensitive decisions reviewed.\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), kept: false }) : `${brand()} / PR\n✓ draft: ${rel(cwd, path)}`);
}

/**
 * Opens the task's pull request on the repository's provider from PR-DRAFT.md, and records it in
 * TASK.json. The pr flow runs it after the draft is approved; run directly, it is your approval.
 */
async function openPr(cwd, slug, options = {}) {
  const { config, dir, meta } = await getTask(cwd, slug), draft = join(dir, 'PR-DRAFT.md');
  const fail = message => { if (options.json) output(JSON.stringify({ ok: false, error: message })); throw new Error(message); };
  if (!await exists(draft)) return fail(`PR-DRAFT.md is missing; write it with maverick pr ${slug}, or run maverick flow run pr ${slug}`);
  const { title, body } = splitDraft(await readFile(draft, 'utf8'), await taskTitle(dir, meta));
  let result;
  try { result = await openPullRequest(cwd, { task: slug, title, body, settings: config.pr || {} }); } catch (error) { return fail(error.message); }
  await writeTaskMeta(dir, { ...await taskMeta(dir), pullRequest: { provider: result.provider, url: result.url, ...(result.number && { number: result.number }), branch: result.branch, base: result.base, opened: result.opened, at: new Date().toISOString() } });
  if (options.json) return output(JSON.stringify({ ok: true, ...result }, null, 2));
  output([
    `${brand()} / PR OPEN`,
    `Provider: ${result.providerName || 'unknown'}${result.cli && result.opened ? ` (${result.cli})` : ''} · ${result.remote} → ${result.base}`,
    `✓ branch ${result.branch}${result.createdBranch ? ' (created)' : ''}`,
    ...(result.commit ? [`✓ committed ${result.commit}: ${title}`] : []),
    `✓ pushed to ${result.remote}`,
    result.opened ? `✓ pull request${result.number ? ` #${result.number}` : ''} ${result.existing ? 'already open' : 'opened'}: ${result.url}` : `→ ${result.reason}${result.url ? `\n  Open it at: ${result.url}` : ''}`,
    `\nOnce it merges, finish the task: maverick done ${slug}`
  ].join('\n'));
}

/**
 * Finishes a task: TASK.json records who finished it and when, and its stage becomes `done`.
 * Before the PR stage that skips gates, so it takes --force; `maverick reopen` undoes it.
 */
async function finish(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), meta = await taskMeta(dir);
  if (meta.done) throw new Error(`${slug} was already finished on ${meta.done.at.slice(0, 10)}; reopen it with maverick reopen ${slug}`);
  const { stage } = await taskStage(dir, preset, slug);
  if (stage !== 'pr' && !options.force) throw new Error(`${slug} is at the ${stage.toUpperCase()} stage, not PR: its gates have not all passed. Finish it anyway with maverick done ${slug} --force`);
  const done = { at: new Date().toISOString(), by: typeof options.by === 'string' && options.by.trim() ? options.by.trim() : process.env.USER || 'human', ...(stage !== 'pr' && { stage }), ...(typeof options.note === 'string' && options.note.trim() && { note: options.note.trim() }) };
  await writeTaskMeta(dir, { ...meta, done });
  // What the task promised outlives it: SPEC invariants and committed sealed tests become living contracts.
  // Revocations the reviewer approved in the PRD take effect now, so the next change is not held to them.
  const revoked = options.noContracts ? [] : await applyRevocations(cwd, { task: slug, prd: await readText(join(dir, 'PRD.md')), by: done.by });
  const contracts = options.noContracts ? [] : await harvestContracts({ cwd, task: slug, taskDir: dir, by: done.by });
  output(options.json ? JSON.stringify({ task: slug, done, contracts: contracts.map(item => item.id), revoked: revoked.map(item => item.id) }) : `${brand()} / DONE\n✓ ${slug} finished by ${done.by}${stage !== 'pr' ? ` at the ${stage.toUpperCase()} stage` : ''}${meta.pullRequest?.url ? `\nPull request: ${meta.pullRequest.url}` : ''}${revoked.length ? `\nRevoked: ${revoked.map(item => item.id).join(', ')}` : ''}${contracts.length ? `\nContracts: ${contracts.map(item => `${item.id} ${item.title}`).join('; ')} (maverick contract list)` : ''}\nReopen with: maverick reopen ${slug}`);
}

async function reopen(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), { done, ...meta } = await taskMeta(dir);
  if (!done) throw new Error(`${slug} is not finished`);
  await writeTaskMeta(dir, meta);
  const { stage } = await taskStage(dir, preset, slug);
  output(options.json ? JSON.stringify({ task: slug, stage }) : `${brand()} / REOPEN\n✓ ${slug} reopened at the ${stage.toUpperCase()} stage`);
}

export const deliveryCommands = [
  { id: 'learn', description: 'Capture a proposed reusable engineering rule.', aliases: [], usage: 'learn <task> --rule <text>', run: ({ cwd, arg, options }) => learn(cwd, arg, options) },
  { id: 'handoff', description: 'Create a task handoff with remaining gates.', aliases: [], usage: 'handoff <task> --to <owner>', run: ({ cwd, arg, options }) => handoff(cwd, arg, options) },
  { id: 'adapter', description: 'List or install an AI adapter.', aliases: [], usage: 'adapter list|install <name>', run: ({ cwd, arg, third, options }) => adapter(cwd, arg, third, options) },
  { id: 'ci', description: 'Generate a GitHub Actions task gate.', aliases: [], usage: 'ci github <task>', run: ({ cwd, arg, third, options }) => ci(cwd, arg, third, options) },
  { id: 'pr', description: 'Write the evidence-backed PR draft, or open the pull request on the repository\'s provider (GitHub, GitLab, Azure DevOps, Bitbucket).', aliases: [], usage: 'pr <task> [--keep] | pr open <task>', run: ({ cwd, arg, third, options }) => (arg === 'open' && third ? openPr(cwd, third, options) : draftPr(cwd, arg, options)) },
  { id: 'done', description: 'Finish a task once its pull request has landed (--force before the PR stage); its invariants become living contracts.', aliases: ['finish'], usage: 'done <task> [--by <name>] [--note <text>] [--force] [--no-contracts]', run: ({ cwd, arg, options }) => finish(cwd, arg, options) },
  { id: 'reopen', description: 'Reopen a finished task.', aliases: [], usage: 'reopen <task>', run: ({ cwd, arg, options }) => reopen(cwd, arg, options) }
];
