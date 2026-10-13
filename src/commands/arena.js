import { loadConfig } from '../core/config.js';
import { getTask, listTasks } from '../core/tasks.js';
import { brand, output } from '../core/util.js';
import { arenaStats, confirmArena, listArenas, readArena, runArena, verifyArena } from '../arena/arena.js';
import { join } from 'node:path';

// `maverick arena`: the same subtask built by several providers at once, the winner chosen by
// evidence and confirmed by a human. See src/arena/arena.js.

const str = value => (typeof value === 'string' && value ? value : undefined);
const usd = value => (typeof value === 'number' ? `$${value.toFixed(value < 1 ? 4 : 2)}` : '—');

function line(item, ranking) {
  const e = item.evidence || {}, mark = ranking.winner === item.id ? '★' : ' ';
  const parts = [
    e.outcome, e.oracle ? 'oracle pass' : 'oracle fail', e.sealed ? (e.sealed.error ? 'sealed error' : e.sealed.S !== undefined ? `sealed ${Math.round(e.sealed.S * 100)}%` : 'sealed ranked') : null,
    e.integrity ? `integrity ${e.integrity.blocking} block / ${e.integrity.warnings} warn${e.integrity.tainted ? ' (tainted)' : ''}` : null,
    e.judge ? `judge ${e.judge.status}${e.judge.confidence != null ? ` ${Math.round(e.judge.confidence * 100)}%` : ''}` : null,
    e.ablation && !e.ablation.error ? `${e.ablation.vacuous} vacuous test(s)` : null,
    e.architecture && !e.architecture.error ? (e.architecture.ok ? 'architecture ok' : `architecture ${e.architecture.findings} finding(s)`) : null,
    e.diff ? `${e.diff.files} file(s), ${e.diff.lines} lines` : null, `${e.iterations ?? 0} iteration(s)`, usd(e.costUsd)
  ].filter(Boolean);
  return `${mark} ${item.id.padEnd(14)} ${parts.join(' · ')}${item.error ? `\n    ${item.error}` : ''}`;
}

function render(record) {
  const r = record.ranking;
  return `${brand()} / ARENA ${record.task} (${record.id})
Subtask ${record.subtask.id}: ${record.subtask.title}

${record.competitors.map(item => line(item, r)).join('\n')}

${r.winner ? `Winner by evidence: ${r.winner} (decided by ${r.decidedBy})` : r.tie ? 'No winner: the evidence ties; choose one with --winner' : 'No winner: no competitor finished the subtask'}${record.decision ? `\nDecision: ${record.decision.winner} by ${record.decision.by}${record.decision.agrees ? ' (agrees with the evidence)' : ` (the evidence said ${record.decision.evidenceWinner || 'none'}: ${record.decision.reason})`}` : `\nNext: maverick arena confirm ${record.task} ${record.id}${r.winner ? '' : ' --winner <id> --reason "..."'}`}`;
}

async function arena(cwd, [action, slug, id], options = {}) {
  if (action === 'run') {
    if (!slug) throw new Error('use: maverick arena run <task> --subtask 03 --providers claude-code,codex');
    const quiet = options.json || options.quiet;
    const record = await runArena({ cwd, task: slug, subtask: str(options.subtask), providers: options.providers, options, emit: event => {
      if (quiet) return;
      if (event.type === 'arena-start') output(`${brand()} / ARENA ${slug}\nSubtask ${event.subtask.id}: ${event.subtask.title} · ${event.competitors.map(item => item.provider).join(' vs ')}`);
      else if (event.type === 'decision') output(`[${event.competitor}] #${event.entry.n} ${event.entry.decision}${event.entry.reasons[0] ? ` · ${event.entry.reasons[0]}` : ''}`);
      else if (event.type === 'loop-end') output(`[${event.competitor}] ${event.outcome.toUpperCase()}${event.reason ? ` — ${event.reason}` : ''}`);
      else if (event.type === 'arena-evidence') output(`[${event.competitor}] collecting evidence: holdout, ablation, architecture, judge…`);
    } });
    return output(options.json ? JSON.stringify(record, null, 2) : `\n${render(record)}`);
  }
  if (action === 'status' || (!action && slug)) {
    const { dir } = await getTask(cwd, slug);
    const record = id ? await readArena(dir, id) : (await listArenas(dir))[0];
    if (!record) return output(options.json ? JSON.stringify({ task: slug, arena: null }) : `No arena has run for ${slug}. Try: maverick arena run ${slug} --subtask 01 --providers a,b`);
    return output(options.json ? JSON.stringify(record, null, 2) : render(record));
  }
  if (action === 'list') {
    const { dir } = await getTask(cwd, slug);
    const records = await listArenas(dir);
    return output(options.json ? JSON.stringify(records, null, 2) : `${brand()} / ARENAS ${slug}\n${records.map(item => `${item.id} · subtask ${item.subtask.id} · ${item.competitors.map(c => c.id).join(' vs ')} · ${item.decision ? `won by ${item.decision.winner}` : item.ranking.winner ? `evidence: ${item.ranking.winner}, awaiting a human` : 'no winner'}`).join('\n') || 'No arena yet.'}`);
  }
  if (action === 'confirm') {
    if (!slug || !id) throw new Error('use: maverick arena confirm <task> <arena-id> [--winner <id> --reason "..."] [--by name] [--keep]');
    const { record, decision } = await confirmArena(cwd, slug, id, { winner: str(options.winner), by: str(options.by), reason: str(options.reason), keep: Boolean(options.keep) });
    return output(options.json ? JSON.stringify({ decision, record }, null, 2) : `${brand()} / ARENA CONFIRM\n✓ ${decision.winner}'s change is applied to your working copy; subtask ${record.subtask.id} is done\n${decision.agrees ? '✓ you agreed with the evidence' : `NOTE you chose against the evidence (${decision.evidenceWinner || 'none'}): ${decision.reason}`}\nThe other attempts stay as rejected patches in their loops' ledgers.`);
  }
  if (action === 'verify') {
    const { dir } = await getTask(cwd, slug);
    const result = await verifyArena(dir, id || (await listArenas(dir))[0]?.id);
    output(options.json ? JSON.stringify(result, null, 2) : result.ok ? `${brand()} / ARENA VERIFY\nPASS the arena's ledger chain is intact` : `${brand()} / ARENA VERIFY\n${result.problems.map(item => `FAIL ${item.problem}`).join('\n')}`);
    if (!result.ok) throw new Error('the arena record fails verification');
    return;
  }
  if (action === 'stats') {
    const config = await loadConfig(cwd);
    const tasks = (await listTasks(cwd, config)).map(item => ({ task: item.task, dir: join(cwd, config.taskRoot, item.task) }));
    const stats = await arenaStats(cwd, tasks);
    return output(options.json ? JSON.stringify(stats, null, 2) : `${brand()} / ARENA STATS\n${stats.decided ? `The winner by evidence was the human's choice in ${stats.agreed} of ${stats.decided} arena(s) (${Math.round(stats.rate * 100)}%).` : 'No arena has been decided yet.'}`);
  }
  throw new Error('use arena run <task> --subtask <id> --providers a,b[,c], arena status <task> [id], arena list <task>, arena confirm <task> <id>, arena verify <task> [id], or arena stats');
}

export const arenaCommands = [
  { id: 'arena', description: 'Run one subtask with several providers at once; the winner comes from evidence (oracle, holdout, integrity, ablation, architecture, diff, an independent judge) and a human confirms it.', aliases: [], usage: 'arena run|status|list|confirm|verify|stats <task> [--subtask 03 --providers a,b,c] [--max-iterations n] [--winner id --reason "..."]', run: ({ cwd, rest, options }) => arena(cwd, rest, options) }
];
