import { createInterface } from 'node:readline/promises';
import { detectStack } from '../core/stack.js';
import { getTask } from '../core/tasks.js';
import { brand, output } from '../core/util.js';
import { holdoutLine } from '../sealed/run.js';
import { approveSeal, createSeal, planSeal, sealReport, unseal } from '../sealed/seal.js';
import { sealChangeLines, showDecide } from './decide-output.js';
import { amendSeal, reviewSeal, suspendSealTest } from '../sealed/review.js';

// `maverick seal`: acceptance tests the builder never sees. See src/sealed/model.js.

const str = value => (typeof value === 'string' && value ? value : undefined);
const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);

async function confirm(question, options) {
  if (options.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('rerun with --yes to confirm');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question} [y/N] `); prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** The sealer from flags (`--provider`, `--model`, `--effort`) over `sealed.sealer`. */
const withSealer = (config, options) => ({ ...config, sealed: { ...config.sealed, sealer: { ...config.sealed?.sealer, ...(str(options.provider) && { provider: str(options.provider) }), ...(str(options.model) && { model: str(options.model) }), ...(str(options.effort) && { effort: str(options.effort) }) } } });

async function seal(cwd, slug, options) {
  const { dir, config: base } = await getTask(cwd, slug), config = withSealer(base, options), stack = await detectStack(cwd);
  if (options.dryRun) {
    const plan = await planSeal({ cwd, task: slug, taskDir: dir, config, stack, options: { surface: options.surface, fromFile: str(options.fromFile) } });
    if (options.json) return output(JSON.stringify(plan, null, 2));
    return output(`${brand()} / SEAL (dry run) ${slug}\nSealer: ${plan.sealer.human ? 'you (--from-file)' : plan.sealer.problem ? `none — ${plan.sealer.problem}` : `${plan.sealer.provider}${plan.sealer.model ? ` (${plan.sealer.model})` : ''} · ${plan.sealer.family} · read-only`} · builders: ${plan.builders.join(', ') || 'none configured'}\nSurface: ${plan.surface} · criteria ${plan.criteria.map(item => item.id).join(', ') || 'none'}\nRunners: ${plan.runners.map(item => `${item.name} (${item.match.join(', ')})`).join('; ') || 'none detected; declare verification.runners'}${plan.prompt ? `\n\n----- prompt -----\n${plan.prompt}` : ''}`);
  }
  if (!options.json) output(`${brand()} / SEAL ${slug}\n${options.fromFile ? `Suite: ${options.fromFile} (written by a human)` : 'An independent sealer writes the acceptance tests, read-only, from the criteria…'}`);
  const { sealed, warnings, costUsd } = await createSeal({ cwd, task: slug, taskDir: dir, config, stack, options: { surface: options.surface, fromFile: str(options.fromFile) }, by: str(options.by) || process.env.USER || 'human' });
  if (options.json) return output(JSON.stringify({ sealed, warnings, costUsd }, null, 2));
  output(`Sealer: ${sealed.sealer.human ? `${sealed.sealer.human} (human)` : `${sealed.sealer.provider} (${sealed.sealer.family}) · read-only · export of base ${sealed.base.slice(0, 7)}`} · builders: ${sealed.builders.join(', ') || 'none configured'}
Surface: ${sealed.surface} · criteria ${Object.keys(sealed.criteria).join(', ')}${sealed.uncovered.length ? ` (no test for ${sealed.uncovered.join(', ')})` : ''}
✓ ${sealed.tests} sealed test(s)
Vacuity on the base: ${sealed.discriminating} fail as expected${sealed.vacuous ? ` · ${sealed.vacuous} already pass (left out of the holdout)` : ''}`);
  warnings.forEach(warning => output(`WARN ${warning}`));
  output(`✓ sealed ${sealed.sealId} · aes-256-gcm · SEALED.json written (digests and counts only)${costUsd ? ` · $${costUsd.toFixed(4)}` : ''}\nNext: read the tests with maverick seal status ${slug} --reveal, then maverick seal approve ${slug}`);
}

async function status(cwd, slug, options) {
  const { dir, config } = await getTask(cwd, slug);
  // The detail is for a person at a terminal: an agent runs commands without one.
  if (options.reveal && !(process.stdin.isTTY && process.stdout.isTTY)) throw new Error('--reveal shows the sealed tests and runs only at an interactive terminal');
  const report = await sealReport({ cwd, task: slug, taskDir: dir, config, reveal: Boolean(options.reveal) });
  if (options.json) return output(JSON.stringify(report, null, 2));
  if (report.state === 'missing') return output(`${brand()} / SEAL ${slug}\nNo sealed suite. Write one with maverick seal ${slug} (or --from-file <dir>).`);
  const s = report.sealed;
  output(`${brand()} / SEAL ${slug}
Seal ${s.sealId} · ${report.state.toUpperCase()}${report.detail ? ` — ${report.detail}` : ''}
Sealer: ${s.sealer.human ? `${s.sealer.human} (human)` : `${s.sealer.provider} (${s.sealer.family})`} · builders: ${s.builders.join(', ') || '—'} · surface ${s.surface}
Tests: ${s.tests} (${s.discriminating} fail on the base${s.vacuous ? `, ${s.vacuous} already pass` : ''}) · ${Object.entries(s.criteria).map(([id, count]) => `${id} ${count}`).join(' · ')}${s.uncovered?.length ? ` · not covered: ${s.uncovered.join(', ')}` : ''}
Approval: ${s.approval ? `${s.approval.by} on ${s.approval.at.slice(0, 10)}` : `none (maverick seal approve ${slug})`}${s.decision ? `\nDecision: ${s.decision.decision} by ${s.decision.by} on ${s.decision.at.slice(0, 10)}` : ''}
Queries: ${report.queries} · vault ledger ${report.ledger.ok ? 'intact' : `BROKEN: ${report.ledger.problems[0]}`}`);
  if (report.tampered) output(`FAIL ${report.tampered}`);
  if (report.tests) {
    if (report.last?.metrics) output(`\nLast run (${report.last.scope}${report.last.loopId ? `, loop ${report.last.loopId}` : ''}): ${holdoutLine(report.last.metrics)} · S ${percent(report.last.metrics.S)} · Sac ${percent(report.last.metrics.Sac)} · Vac ${percent(report.last.metrics.Vac)}${report.last.metrics.escape.length ? `\nEscape set (claimed by the visible evidence, not delivered): ${report.last.metrics.escape.join(', ')}` : ''}`);
    output(`\n${report.tests.map(test => `${test.id} ${test.ids.join(' ').padEnd(12)} ${test.active ? '' : '(inactive) '}base ${test.base || '—'} · last ${test.last || '—'}  ${test.file} :: ${test.name}`).join('\n')}`);
  }
}

async function approve(cwd, slug, options) {
  const { dir, config } = await getTask(cwd, slug);
  if (!await confirm(`Approve the sealed suite of ${slug}? Its tests decide when a loop is done.`, options)) return output('Nothing changed.');
  const approval = await approveSeal({ cwd, task: slug, taskDir: dir, config, by: str(options.by) || process.env.USER || 'human' });
  output(options.json ? JSON.stringify(approval) : `${brand()} / SEAL APPROVE\n✓ approved by ${approval.by}; loops of ${slug} are done only when the sealed tests pass too`);
}

async function unsealCommand(cwd, slug, options) {
  const { dir, config } = await getTask(cwd, slug);
  const decision = options.commit ? 'commit' : options.discard ? 'discard' : null;
  if (!decision || (options.commit && options.discard)) throw new Error('use unseal <task> --commit [--protect], or unseal <task> --discard');
  if (decision === 'discard' && !await confirm(`Delete the sealed suite of ${slug} from the vault? Its ledger stays.`, options)) return output('Nothing changed.');
  const result = await unseal({ cwd, task: slug, taskDir: dir, config, decision, protect: Boolean(options.protect), force: Boolean(options.force), by: str(options.by) || process.env.USER || 'human' });
  if (options.json) return output(JSON.stringify(result, null, 2));
  output(`${brand()} / UNSEAL ${slug}\n${decision === 'commit' ? `✓ ${result.files.length} file(s) written:\n${result.files.map(file => `  ${file}`).join('\n')}${result.protect ? '\n✓ added to loop.protectedPaths: a loop that edits them is rolled back' : ''}\nCommit them with the change: they guard this behavior from now on.` : '✓ the sealed suite and its results were deleted from the vault; the record stays'}\nRecorded in REVIEW.md and the seal's ledger.`);
}

const BOOLEAN_FLAGS = ['reveal', 'dryRun', 'json', 'yes', 'commit', 'discard', 'protect', 'force'];
function swallowedFlag(options, command) {
  const flag = BOOLEAN_FLAGS.find(name => typeof options[name] === 'string');
  if (flag) throw new Error(`--${flag.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)} takes no value: put flags after the task, e.g. maverick ${command} <task> --${flag.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`);
}

async function sealCommand(cwd, rest, options = {}) {
  const [first, second] = rest;
  swallowedFlag(options, ['status', 'approve', 'review', 'amend', 'suspend', 'restore'].includes(first) ? `seal ${first}` : 'seal');
  if (['review', 'amend', 'suspend', 'restore'].includes(first)) {
    const { dir: taskDir, config } = await getTask(cwd, second);
    const args = { cwd, task: second, taskDir, config, fromFile: str(options.fromFile), by: str(options.by) || process.env.USER || 'human', reason: str(options.reason), testId: rest[2], restore: first === 'restore' };
    const result = first === 'review' ? await reviewSeal(args) : first === 'amend' ? await amendSeal(args) : await suspendSealTest(args);
    showDecide(`SEAL ${first.toUpperCase()}`, result, options, sealChangeLines(first, second, result, args));
    return;
  }
  if (first === 'status') return status(cwd, second, options);
  if (first === 'approve') return approve(cwd, second, options);
  return seal(cwd, first, options);
}

export const sealCommands = [
  { id: 'seal', description: 'Seal, review and amend acceptance tests kept from the builder.', aliases: [], usage: 'seal <task> [--from-file <bundle>] [--surface spec|techspec|boundary] | seal status|approve|review <task> | seal amend <task> --from-file <bundle> --reason "..." | seal suspend|restore <task> <ST-id> --reason "..."', run: ({ cwd, rest, options }) => sealCommand(cwd, rest, options) },
  { id: 'unseal', description: 'Open a task\'s sealed tests at review: commit them as protected regression tests, or discard them.', aliases: [], usage: 'unseal <task> --commit [--protect] | --discard', run: ({ cwd, arg, options }) => { swallowedFlag(options, 'unseal'); return unsealCommand(cwd, arg, options); } }
];
