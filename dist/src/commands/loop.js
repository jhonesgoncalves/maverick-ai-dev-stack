import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { getTask } from '../core/tasks.js';
import { brand, output, rel } from '../core/util.js';
import { cleanLoop, loopStatus, planLoop, releaseNotes, requestStop, runLoop, verifyLoop } from '../loop/engine.js';
import { readLedger } from '../loop/ledger.js';
import { loopIds, loopPaths } from '../loop/model.js';
import { harvestProposals } from '../memory/proposals.js';
import { holdoutLine } from '../sealed/run.js';
import { noteCount, scoreLine, taintLine, tokens } from '../loop/report.js';
import { dryRunPayload, printer } from './agent.js';

const str = value => (typeof value === 'string' && value ? value : undefined);
const usd = value => (typeof value === 'number' ? `$${value.toFixed(value < 1 ? 4 : 2)}` : '—');
const BOOLEAN_FLAGS = ['worktree', 'inPlace', 'resume', 'new', 'dryRun', 'json', 'quiet', 'judge', 'afterIteration', 'all', 'deleteBranch', 'yes'];

/** Prints loop events as they happen. JSON mode stays silent until the summary; quiet keeps one line per iteration. */
function reporter(cwd, options) {
  if (options.json) return () => {};
  const agent = options.quiet ? () => {} : printer(options);
  return event => {
    if (event.type === 'loop-start') {
      const { state } = event, b = state.budgets;
      output(`${brand()} / LOOP ${state.task}\nLoop ${state.loopId} · ${state.mode} · flow ${state.flow.name} · gates ${state.flow.gates.join(', ')}\nBudget: ${b.maxIterations ?? '∞'} iterations · ${b.maxMinutes ? `${b.maxMinutes} min` : '∞'} · ${b.maxCostUsd ? usd(b.maxCostUsd) : 'no cost limit'}${b.maxTokens ? ` · ${tokens(b.maxTokens)} tokens` : ''}`);
      event.warnings.forEach(message => output(`WARN ${message}`));
    } else if (event.type === 'baseline') output(`Baseline: ${scoreLine(event.score)}`);
    else if (event.type === 'resume') {
      output(`${brand()} / LOOP (resumed)${event.recovered ? `\nRecovered iteration ${event.recovered.n}: rolled back ${event.recovered.restored.length + event.recovered.deleted.length} file(s)` : ''}${event.human ? `\nYour changes while it was stopped became a checkpoint (${event.human.files} file(s))` : ''}${event.drift ? `\nDrift since the last run (recorded in the ledger): ${Object.keys(event.drift).join(', ')}` : ''}\nCheckpoint: ${scoreLine(event.score)}`);
      event.warnings.forEach(message => output(`WARN ${message}`));
    } else if (event.type === 'iteration-start') output(`\n— Iteration ${event.n} · ${event.subtask ? `subtask ${event.subtask.id} ${event.subtask.title}` : 'goal'} · ${event.provider}${event.model ? ` (${event.model}${event.effort ? `, ${event.effort}` : ''})` : event.effort ? ` (${event.effort})` : ''}${event.rung ? ` · ${event.rung}` : ''}`);
    else if (event.type === 'agent') agent(event.event);
    else if (event.type === 'verify') output(`  diff: ${event.diff.files} file(s), +${event.diff.added} −${event.diff.deleted}; Maverick is checking it…`);
    else if (event.type === 'decision') {
      const { entry } = event;
      if (entry.decision === 'accepted') output(`ACCEPTED #${entry.n}${entry.checkpoint ? ` · checkpoint ${String(entry.checkpoint.n).padStart(4, '0')}` : ' · no change to keep'}${entry.subtaskDone ? ` · subtask ${entry.subtaskDone} done` : ''} · ${scoreLine(entry.score)}${entry.agent?.costUsd != null ? ` · ${usd(entry.agent.costUsd)}` : ''}`);
      else output(`ROLLED BACK #${entry.n}\n${entry.reasons.slice(0, 6).map(reason => `     ${reason}`).join('\n')}`);
      entry.findings.filter(item => item.severity === 'warn').slice(0, 5).forEach(item => output(`WARN ${item.kind}: ${item.file ? `${item.file} — ` : ''}${item.message}`));
    } else if (event.type === 'escalation') output(`ESCALATE ${event.signals.map(signal => signal.kind).join(', ')} → ${event.rung}${Object.keys(event.change).length ? ` (${Object.entries(event.change).filter(([, value]) => value !== undefined).map(([key, value]) => `${key} ${value}`).join(', ') || 'recommended model'})` : ''}`);
    else if (event.type === 'notice') output(`${event.level === 'warn' ? 'WARN' : 'NOTE'} ${event.message}`);
    else if (event.type === 'judge') output(`JUDGE ${event.status.toUpperCase()} · ${event.summary || ''}${event.status !== 'pass' ? `\n${event.issues.slice(0, 5).map(issue => `     ${issue}`).join('\n')}` : ''}`);
  };
}

function summary(cwd, taskDir, { state, outcome, reason, next }) {
  return {
    loopId: state.loopId, task: state.task, mode: state.mode, outcome, reason, next, iterations: state.iterations.length, accepted: state.spent.accepted,
    spent: state.spent, budgets: state.budgets, checkpoint: state.checkpoint && { n: state.checkpoint.n, ref: state.checkpoint.ref, score: state.checkpoint.score },
    escalation: state.escalation, disputes: state.iterations.at(-1)?.agent?.disputes || [], questions: state.iterations.at(-1)?.agent?.questions || [],
    report: rel(cwd, join(taskDir, 'LOOP.md')), worktree: state.worktree
  };
}

async function run(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  if (options.dryRun) {
    const plan = await planLoop({ cwd, task: slug, options });
    const prompt = plan.dryRun ? dryRunPayload(cwd, (await getTask(cwd, slug)).config, plan.dryRun) : null;
    if (options.json) return output(JSON.stringify({ ...plan, dryRun: prompt }, null, 2));
    const s = plan.settings;
    output(`${brand()} / LOOP (dry run) ${slug}
Mode: ${s.isolation} · flow ${plan.flow} · gates ${plan.oracle.map(gate => `${gate.id}${gate.severity === 'warn' ? ' (warn)' : ''}`).join(', ')}${plan.excluded.length ? ` · decided separately: ${plan.excluded.join(', ')}` : ''}
Budget: ${s.budgets.maxIterations ?? '∞'} iterations · ${s.budgets.maxMinutes ? `${s.budgets.maxMinutes} min` : '∞'} · ${s.budgets.maxCostUsd ? usd(s.budgets.maxCostUsd) : 'no cost limit'}${s.budgets.maxTokens ? ` · ${tokens(s.budgets.maxTokens)} tokens` : ''} (forecast ${s.budgets.forecast})
Feedback to the agent: ${s.feedback}
Integrity: ${s.integrity.level} · blast radius ${s.blastRadius.maxFiles} files / ${s.blastRadius.maxLines} lines · protected ${s.protectedPaths.join(', ') || 'none'}
Escalation: ${s.escalation.join(' → ')}${plan.rotation.length ? ` · rotation ${plan.rotation.map(item => `${item.id}${item.ok ? '' : ' (unavailable)'}`).join(', ')}` : ''}
Judge: ${s.judge.enabled ? 'on' : 'off'}
Holdout: ${plan.holdout?.problem ? `refused — ${plan.holdout.problem}` : plan.holdout?.sealed ? `sealed suite ${plan.holdout.sealed.sealId} (${plan.holdout.sealed.tests} tests, feedback ${plan.holdout.settings.feedback}) decides done` : plan.holdout?.warning || `none${s.sealed === 'off' ? ' (--sealed off)' : ''}`}
Next: ${plan.work.mode === 'subtask' ? `subtask ${plan.work.subtask.id} ${plan.work.subtask.title}` : plan.work.mode}${plan.work.reason ? ` (${plan.work.reason})` : ''}${plan.existing ? `\nExisting loop: ${plan.existing.loopId} (${plan.existing.status})` : ''}`);
    plan.problems.forEach(problem => output(`FAIL ${problem}`));
    plan.warnings.forEach(warning => output(`WARN ${warning}`));
    if (prompt) output(`Agent: ${prompt.provider}${prompt.model ? ` (${prompt.model})` : ''} · permission ${prompt.permission}\nCommand: ${prompt.argv.join(' ')}${prompt.stdin ? ' < prompt' : ''}\n\n----- prompt -----\n${prompt.prompt}`);
    if (plan.problems.length) throw new Error(`the loop cannot start: ${plan.problems[0]}`);
    return;
  }
  const result = await runLoop({ cwd, task: slug, options, emit: reporter(cwd, options) });
  // The error ratchet: this loop's rollbacks, rejections, escalations and disputes become proposals for a human.
  const learned = await harvestProposals(cwd, { task: slug }).catch(() => null);
  const payload = { ...summary(cwd, dir, result), ...(learned && { proposals: { created: learned.created.map(item => item.id), updated: learned.updated } }) };
  if (options.json) output(JSON.stringify(payload, null, 2));
  else output(`\nOutcome: ${result.outcome.toUpperCase()}${result.reason ? ` — ${result.reason}` : ''}\n${result.next}\nSpent: ${result.state.spent.iterations} iteration(s), ${result.state.spent.accepted} accepted · ${Math.round(result.state.spent.activeMs / 60000)} min · ${usd(result.state.spent.costUsd)}${result.state.spent.costUnknown ? ` (+${result.state.spent.costUnknown} run(s) without a reported cost)` : ''}${result.state.spent.tokens ? ` · ${tokens(result.state.spent.tokens)} tokens` : ''}\n${result.state.sealed?.final && result.state.sealed.log?.at(-1)?.final ? `Holdout: ${holdoutLine(result.state.sealed.final)}\n` : ''}Report: ${payload.report}${['stalled-escalated', 'disputed', 'needs-human', 'holdout-gap', 'integrity-violation'].includes(result.outcome) ? `\nEscalation: ${rel(cwd, join(dir, 'LOOP-ESCALATION.md'))}` : ''}${learned?.created.length ? `\nLearned: ${learned.created.length} new rule proposal(s) from this loop's failures; review them with maverick proposals` : ''}`);
  // Only "done" exits zero, so scripts and agents can rely on the exit code.
  if (result.outcome !== 'done') throw new Error(`loop outcome: ${result.outcome}${result.reason ? `: ${result.reason}` : ''}`);
}

async function status(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const info = await loopStatus(dir, str(options.loop));
  if (!info) return output(options.json ? JSON.stringify({ task: slug, loop: null }) : `No loop has run for ${slug}. Try: maverick loop run ${slug} --dry-run`);
  const { state } = info, b = state.budgets, s = state.spent;
  if (options.json) return output(JSON.stringify({ task: slug, loop: state.loopId, status: state.status, reason: state.reason, running: info.running, stopPending: info.stopPending, mode: state.mode, worktree: state.worktree, checkpoint: state.checkpoint, budgets: b, spent: s, forecast: info.forecast, escalation: state.escalation, iterations: state.iterations.slice(-10), next: info.next }, null, 2));
  const fc = info.forecast?.stop ? `\nForecast: ${info.forecast.detail}` : '';
  output(`${brand()} / LOOP ${slug}
Loop ${state.loopId} · ${state.status.toUpperCase()}${info.running ? ` (pid ${info.running.pid})` : ''}${info.stopPending ? ' · stop requested' : ''}${state.reason ? ` — ${state.reason}` : ''}
Mode: ${state.mode}${state.worktree ? ` · branch ${state.worktree.branch} · ${state.worktree.path}` : ''}
Checkpoint #${state.checkpoint?.n ?? 0}: ${scoreLine(state.checkpoint?.score)}${taintLine(state.checkpoint?.tainted)}${state.quarantine?.length ? `\nQuarantined notes: ${state.quarantine.reduce((sum, item) => sum + noteCount(item), 0)} (read and release them with maverick loop release ${slug})` : ''}
Spent: ${s.iterations}/${b.maxIterations ?? '∞'} iterations (${s.accepted} accepted) · ${Math.round(s.activeMs / 60000)}/${b.maxMinutes ?? '∞'} min · ${usd(s.costUsd)}/${b.maxCostUsd ? usd(b.maxCostUsd) : '∞'}${s.costUnknown ? ` (+${s.costUnknown} without cost)` : ''} · ${tokens(s.tokens)}/${b.maxTokens ? tokens(b.maxTokens) : '∞'} tokens${fc}${state.escalation?.rung ? `\nEscalation: ${state.escalation.rung} · tried ${state.escalation.tried.join(', ')}` : ''}

${state.iterations.slice(-5).map(item => `#${String(item.n).padEnd(3)} ${(item.subtask ? item.subtask.id : 'goal').padEnd(5)} ${item.provider.padEnd(12)} ${item.decision.padEnd(9)} ${item.reasons[0] || (item.progress ? 'progress' : '')}`).join('\n') || 'No iterations yet.'}

Next: ${info.next}`);
}

async function stop(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const result = await requestStop(dir, { reason: str(options.reason), mode: options.afterIteration ? 'after-iteration' : 'now', loopId: str(options.loop) });
  output(options.json ? JSON.stringify({ requested: true, loopId: result.loopId, mode: options.afterIteration ? 'after-iteration' : 'now' }) : `${brand()} / LOOP STOP\n✓ stop requested for loop ${result.loopId} (pid ${result.holder.pid})${options.afterIteration ? ', after the current iteration' : '; the current agent run is aborted and its changes rolled back'}`);
}

async function verify(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const result = await verifyLoop(cwd, dir, str(options.loop));
  if (options.json) output(JSON.stringify(result, null, 2));
  else {
    output(`${brand()} / LOOP VERIFY ${slug}\nLoop ${result.loopId}: ${result.entries} ledger entries, ${result.checkpoints} checkpoint(s)`);
    result.problems.forEach(problem => output(`FAIL ${problem}`));
    result.warnings.forEach(warning => output(`WARN ${warning}`));
    if (result.ok) output('PASS the ledger chain is intact and every checkpoint matches it');
  }
  if (!result.ok) throw new Error(`the loop record fails verification (${result.problems.length} problem(s))`);
}

const describe = entry => {
  const d = entry.data || {};
  if (entry.type === 'iteration-start') return `#${d.n} ${d.scope === 'goal' ? 'goal' : `subtask ${d.scope}`} · ${d.provider}${d.rung ? ` · ${d.rung}` : ''}`;
  if (entry.type === 'iteration-end') return `#${d.n} ${d.decision}${d.checkpoint ? ` → ${d.checkpoint.ref}` : ''}${d.reasons?.length ? ` · ${d.reasons[0]}` : ''}`;
  if (entry.type === 'escalation') return `#${d.n} ${d.signals.join(', ')} → ${d.rung}`;
  if (entry.type === 'stop') return `${d.outcome}${d.reason ? ` · ${d.reason}` : ''}`;
  if (entry.type === 'loop-start') return `${d.mode} · flow ${d.flow?.name} · ${d.checkpoint?.ref}`;
  if (entry.type === 'subtask-done') return `subtask ${d.id}`;
  if (entry.type === 'judge') return `#${d.n} ${d.scope} ${d.status} · ${(d.verdicts || []).map(item => `${item.provider} ${item.verdict || '—'}`).join(', ')}`;
  if (entry.type === 'baseline' || entry.type === 'resume') return d.score ? `${d.score.passed}/${d.score.blocking} gates pass, ${d.score.failingCount} failing${entry.type === 'resume' && d.recovered ? ` · recovered #${d.recovered.n}` : ''}` : '';
  if (entry.type === 'rollback' || entry.type === 'flake') return JSON.stringify(d).slice(0, 100);
  if (entry.type === 'human-ack') return `${d.by}${d.note ? `: ${d.note}` : ''}`;
  if (entry.type === 'drift') return Object.keys(d).filter(key => key !== 'oracleDigest').map(key => (key === 'oracle' ? `oracle files ${d.oracle.files.slice(0, 3).join(', ')}` : key)).join(', ');
  if (entry.type === 'sealed') return `${d.scope} · query ${d.query} · ${d.total !== undefined ? `${d.passed}/${d.total}` : 'withheld'}${d.exposed !== 'none' ? ` · builder saw ${d.exposed}` : ''}`;
  if (entry.type === 'sealed-gap') return `S ${Math.round((d.S ?? 0) * 100)}%${d.OI !== null ? ` · OI ${d.OI >= 0 ? '+' : ''}${d.OI} pp` : ''}`;
  if (entry.type === 'notes-quarantined') return `#${d.n} ${d.notes} note(s) · ${d.findings.join(', ')}`;
  if (entry.type === 'notes-released') return `${d.by} · ${d.notes} note(s)${d.taintAcknowledged ? ' · taint acknowledged' : ''}`;
  return Object.keys(d).length ? JSON.stringify(d).slice(0, 100) : '';
};

async function log(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const id = str(options.loop) || (await loopIds(dir))[0];
  if (!id) throw new Error(`no loop has run for ${slug}`);
  const entries = await readLedger(loopPaths(dir, id).ledger);
  if (options.json) return output(JSON.stringify(entries, null, 2));
  output(`${brand()} / LOOP LOG ${slug} (${id})\n\n${entries.map(entry => `${String(entry.seq).padStart(3)} ${entry.at.slice(11, 19)} ${entry.type.padEnd(15)} ${describe(entry)}`).join('\n')}`);
}

async function release(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const result = await releaseNotes(cwd, dir, { loopId: str(options.loop), by: str(options.by) || process.env.USER || 'human' });
  output(options.json ? JSON.stringify(result) : `${brand()} / LOOP RELEASE\n${result.released || result.acknowledged ? `${result.notes.map(note => `  ${note}`).join('\n')}${result.notes.length ? '\n' : ''}✓ loop ${result.loopId}: ${result.released} note(s) released to LOOP-NOTES.md${result.acknowledged ? '; the checkpoint\'s taint is acknowledged' : ''}` : `Nothing to release: loop ${result.loopId} has no quarantined note and no unacknowledged taint.`}`);
}

async function confirm(question, options) {
  if (options.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('rerun with --yes to confirm');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question} [y/N] `); prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function clean(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const ids = options.all ? await loopIds(dir) : [str(options.loop) || (await loopIds(dir))[0]].filter(Boolean);
  if (!ids.length) throw new Error(`no loop has run for ${slug}`);
  if (!await confirm(`Remove the checkpoint refs${options.deleteBranch ? ', the worktree and its branch' : ' and worktree'} of ${ids.length} loop(s) of ${slug}? The ledger and state stay.`, options)) return output('Nothing changed.');
  const results = [];
  for (const id of ids) results.push(await cleanLoop(cwd, dir, { loopId: id, deleteBranch: Boolean(options.deleteBranch) }));
  output(options.json ? JSON.stringify(results) : `${brand()} / LOOP CLEAN\n${results.map(item => `✓ ${item.loopId}: ${item.refs.length} ref(s) removed${item.worktree ? `, worktree ${item.worktree.removed ? 'removed' : 'kept'}${item.worktree.branchDeleted ? ', branch deleted' : ''}` : ''}`).join('\n')}`);
}

async function loopCommand(cwd, [action, slug], options = {}) {
  const swallowed = BOOLEAN_FLAGS.find(flag => typeof options[flag] === 'string');
  if (swallowed) throw new Error(`--${swallowed.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)} takes no value: put flags after the task, e.g. maverick loop ${action || 'run'} <task> --${swallowed.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`);
  if (action === 'run') return run(cwd, slug, options);
  if (!action || action === 'status') return slug ? status(cwd, slug, options) : output('Use: maverick loop status <task>, or maverick loop run <task> --dry-run');
  if (action === 'stop') return stop(cwd, slug, options);
  if (action === 'verify') return verify(cwd, slug, options);
  if (action === 'log') return log(cwd, slug, options);
  if (action === 'clean') return clean(cwd, slug, options);
  if (action === 'release') return release(cwd, slug, options);
  throw new Error('use loop run <task>, loop status <task>, loop stop <task>, loop verify <task>, loop log <task>, loop release <task>, or loop clean <task>');
}

export const loopCommands = [
  { id: 'loop', description: 'Run an agent loop the harness decides: checkpoints, rollback, integrity guard, budgets, escalation and a verifiable ledger.', aliases: [], usage: 'loop status|run|stop|verify|log|release|clean <task> [--dry-run] [--worktree] [--max-iterations n] [--max-cost usd] [--max-tokens n] [--judge] [--feedback detailed|criteria|generic] [--sealed auto|required|off] [--resume --note "..."]', run: ({ cwd, rest, options }) => loopCommand(cwd, rest, options) }
];
