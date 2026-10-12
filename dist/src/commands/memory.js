import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homePath } from '../core/home.js';
import { loadConfig } from '../core/config.js';
import { getTask } from '../core/tasks.js';
import { brand, output, readText, rel } from '../core/util.js';
import { budgetLine, renderBudgetReport, reviewBase, reviewBudget } from '../proof/attention.js';
import { changedPaths, checkContracts, harvestContracts, listContracts, overdue, readContract, reviewContract, revokeContract } from '../memory/contracts.js';
import { acceptProposal, harvestProposals, listProposals, measureRules, rejectProposal, syncAgentsBlock } from '../memory/proposals.js';
import { renderCriterion, renderTrace, traceCriterion, traceLine } from '../memory/why.js';

// Remember: the why of every line (why), what finished tasks promised (contract), what past
// mistakes taught (proposals) and where a reviewer should look first (attention).

const text = value => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const json = value => output(JSON.stringify(value, null, 2));

/** `maverick why <file:line>`, or `maverick why <task> --ac AC-02` for the reverse walk. */
async function why(cwd, target, options = {}) {
  if (!target) throw new Error('use why <file>:<line>, or why <task> --ac <AC-01>');
  if (options.ac) {
    const trace = await traceCriterion(cwd, target, String(options.ac));
    return options.json ? json(trace) : output(`${brand()} / WHY ${trace.criterion.id}\n${renderCriterion(trace)}`);
  }
  const trace = await traceLine(cwd, target);
  options.json ? json(trace) : output(`${brand()} / WHY\n${renderTrace(trace)}`);
}

async function contract(cwd, action = 'list', target, options = {}) {
  if (action === 'list') {
    const contracts = await listContracts(cwd), shown = options.all ? contracts : contracts.filter(item => item.data.status === 'active');
    if (options.json) return json(shown.map(item => ({ id: item.id, path: item.path, ...item.data, overdue: overdue(item) })));
    return output(`${brand()} / CONTRACTS\n${shown.map(item => `${item.id.padEnd(6)} ${item.data.status === 'active' ? '' : `[${item.data.status}] `}${item.data.title}  (${item.data.task}; ${item.data.anchors.length} file(s), ${item.data.tests.length} test(s); owner ${item.data.owner || '—'}${overdue(item) ? `; review overdue since ${item.data.reviewBy}` : ''})`).join('\n') || 'No contract yet. A finished task leaves its SPEC invariants and committed sealed tests as contracts (maverick done, or maverick contract harvest <task>).'}${!options.all && shown.length < contracts.length ? `\n(${contracts.length - shown.length} revoked; --all shows them)` : ''}`);
  }
  if (action === 'show') {
    const item = await readContract(cwd, target);
    return options.json ? json({ id: item.id, path: item.path, ...item.data, body: item.body }) : output(`${brand()} / CONTRACT ${item.id}\n${item.body.trim()}\n\nFiles: ${item.data.anchors.join(', ') || '—'}\nTests: ${item.data.tests.join(', ') || '—'}\nOwner: ${item.data.owner || '—'} · review by ${item.data.reviewBy || '—'} · ${item.data.status}`);
  }
  if (action === 'harvest') {
    const { dir } = await getTask(cwd, target);
    const created = await harvestContracts({ cwd, task: target, taskDir: dir, by: text(options.by) });
    return options.json ? json({ task: target, created }) : output(`${brand()} / CONTRACTS ${target}\n${created.map(item => `✓ ${item.id} ${item.title} (${item.anchors.length} file(s), ${item.tests.length} test(s))`).join('\n') || 'No new contract: the task has no SPEC invariant, and no committed sealed test proves a criterion (or they were harvested before).'}`);
  }
  if (action === 'check') {
    // With a task, its PRD may revoke contracts; without one (CI), a touched anchor is drift.
    const against = text(options.against) || 'HEAD', task = target ? await getTask(cwd, target) : null;
    // Nothing to keep when no contract is active: skip the diff entirely.
    const files = (await listContracts(cwd)).some(item => item.data.status === 'active') ? await changedPaths(cwd, against) : [];
    const report = await checkContracts({ cwd, config: task?.config || await loadConfig(cwd), files: files || [], prd: task ? await readText(join(task.dir, 'PRD.md')) : null, strict: Boolean(options.strict), run: !options.noRun });
    const payload = { ...report, against, task: target || null, ...(!files && { note: 'not a git repository: nothing to compare' }) };
    if (options.json) json(payload);
    else {
      output(`${brand()} / CONTRACTS CHECK${target ? ` ${target}` : ''}\nCompared with ${against} · ${report.files} changed file(s) · ${report.active} active contract(s) · ${report.touched.length} touched`);
      if (payload.note) output(`NOTE ${payload.note}`);
      for (const item of report.touched) output(`${item.status === 'kept' ? 'PASS' : item.status === 'revoked-by-task' ? 'NOTE' : 'FAIL'} ${item.id} ${item.status}${item.reason ? `: ${item.reason}` : ''}`);
      report.findings.forEach(item => output(`${item.severity === 'block' ? 'FAIL' : 'WARN'} ${item.message}`));
      if (report.overdue.length) output(`NOTE review overdue: ${report.overdue.map(item => `${item.id} (${item.owner || 'no owner'})`).join(', ')}; confirm with maverick contract review <id>`);
    }
    if (!report.ok) throw new Error('the change breaks a living contract');
    return;
  }
  if (action === 'revoke') {
    const result = await revokeContract(cwd, target, { reason: text(options.reason), by: text(options.by), task: text(options.task) });
    return options.json ? json(result) : output(`${brand()} / CONTRACT\n✓ ${result.id} revoked by ${result.by}: ${result.reason}`);
  }
  if (action === 'review') {
    const result = await reviewContract(cwd, target, { by: text(options.by) });
    return options.json ? json(result) : output(`${brand()} / CONTRACT\n✓ ${result.id} still holds; next review by ${result.reviewBy}`);
  }
  throw new Error('use contract list | show <id> | harvest <task> | check [<task>] [--against <ref>] | revoke <id> --reason <why> | review <id>');
}

async function proposals(cwd, action = 'list', target, options = {}) {
  if (action === 'list') {
    const all = await listProposals(cwd), shown = options.all ? all : all.filter(item => item.status === 'open');
    if (options.json) return json(shown.map(({ body: _body, ...item }) => item));
    return output(`${brand()} / PROPOSALS\n${shown.map(item => `${item.id} [${item.status}] ${item.kind.padEnd(12)} ${item.title} · ${item.occurrences.length}× in ${new Set(item.occurrences.map(entry => entry.task)).size} task(s)${item.paths.length ? ` · ${item.paths.slice(0, 3).join(', ')}` : ''}`).join('\n') || 'No open proposal. They come from loop rollbacks, judge rejections, escalations and disputes: maverick proposals harvest.'}${!options.all && shown.length < all.length ? `\n(${all.length - shown.length} accepted or rejected; --all shows them, maverick proposals stats measures the accepted ones)` : ''}`);
  }
  if (action === 'harvest') {
    if (target) await getTask(cwd, target);
    const result = await harvestProposals(cwd, { task: target });
    return options.json ? json(result) : output(`${brand()} / PROPOSALS\n${result.created.map(item => `+ ${item.id} ${item.kind}: ${item.title}`).join('\n') || 'No new failure class.'}\n${result.updated} proposal(s) updated with new evidence. Review them: maverick proposals`);
  }
  if (action === 'accept') {
    const result = await acceptProposal(cwd, target, { text: text(options.text), paths: text(options.paths), by: text(options.by) });
    const agents = await syncAgentsBlock(cwd, { create: Boolean(options.agentsMd) });
    return options.json ? json({ ...result, agents }) : output(`${brand()} / PROPOSALS\n✓ ${result.id} accepted: ${result.rule.text}\nApplies to: ${result.rule.paths.join(', ') || 'every file'} (injected only when a subtask touches these paths)${agents ? `\nAGENTS.md: managed block updated (${agents.rules} rule(s))` : ''}`);
  }
  if (action === 'reject') {
    const result = await rejectProposal(cwd, target, { reason: text(options.reason), by: text(options.by) });
    await syncAgentsBlock(cwd);
    return options.json ? json(result) : output(`${brand()} / PROPOSALS\n✓ ${result.id} rejected`);
  }
  if (action === 'stats') {
    const rules = await measureRules(cwd);
    if (options.json) return json(rules);
    return output(`${brand()} / RULES\n${rules.map(item => `${item.id} ${item.verdict.padEnd(14)} ${item.occurrences.before}→${item.occurrences.after} recurrence(s) over ${item.loops.before}→${item.loops.after} loop(s) since ${item.since}${item.prune ? '  PRUNE? it has not reduced its failure' : ''}\n  ${item.text}`).join('\n') || 'No accepted rule yet.'}`);
  }
  throw new Error('use proposals [list] | harvest [<task>] | accept <id> [--text <rule>] [--paths <globs>] [--agents-md] | reject <id> --reason <why> | stats');
}

/** `maverick attention <task>`: where the reviewer should look first, and for how long. */
async function attention(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const budget = await reviewBudget({ cwd, task: slug, taskDir: dir, config, against: text(options.against) || await reviewBase(cwd, dir, config) });
  const path = join(dir, 'REVIEW-BUDGET.md');
  // The task's copy follows loop.feedback, since a later loop's builder can read it; the full one lives outside the tree.
  if ((config.loop?.feedback || 'criteria') === 'detailed') await writeFile(path, renderBudgetReport(slug, budget));
  else {
    const detailPath = homePath(cwd, 'reports', slug, 'REVIEW-BUDGET.md');
    await mkdir(dirname(detailPath), { recursive: true });
    await writeFile(detailPath, renderBudgetReport(slug, budget));
    await writeFile(path, renderBudgetReport(slug, budget, { detailed: false, detailPath }));
  }
  if (options.json) return json({ ...budget, path: rel(cwd, path) });
  output(`${brand()} / ATTENTION ${slug}\n${budgetLine(budget)}`);
  budget.focus.forEach(item => output(`→ ${item.file}:${item.start} (risk ${item.risk}) ${item.why.join('; ')}`));
  const open = budget.tree.filter(item => item.verdict !== 'met');
  if (open.length) output(`Criteria to check by hand: ${open.map(item => `${item.id} ${item.verdict}`).join(', ')}`);
  output(`Report: ${rel(cwd, path)}`);
}

export const memoryCommands = [
  { id: 'why', description: 'Why a line exists: its task, criterion, loop iteration, evidence, decisions and guarding contracts.', aliases: [], usage: 'why <file:line> | why <task> --ac <AC-01>', run: ({ cwd, arg, options }) => why(cwd, arg, options) },
  { id: 'contract', description: 'Living contracts left by finished tasks: list, show, harvest, check a change, revoke or review.', aliases: ['contracts'], usage: 'contract list|show <id>|harvest <task>|check [<task>] [--against <ref>]|revoke <id> --reason <why>|review <id>', run: ({ cwd, arg, third, options }) => contract(cwd, arg, third, options) },
  { id: 'proposals', description: 'Rules learned from loop failures: harvest, accept or reject, and measure whether accepted rules work.', aliases: ['proposal'], usage: 'proposals [list|harvest [<task>]|accept <id>|reject <id>|stats]', run: ({ cwd, arg, third, options }) => proposals(cwd, arg, third, options) },
  { id: 'attention', description: 'The review budget: hunks ranked by risk, a time range, and a proof tree per criterion.', aliases: ['review-budget'], usage: 'attention <task> [--against <ref>]', run: ({ cwd, arg, options }) => attention(cwd, arg, options) }
];
