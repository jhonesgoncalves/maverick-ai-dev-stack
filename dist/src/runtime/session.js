import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commandAvailable, exists } from '../core/util.js';
import { runHooks } from './hooks.js';
import { parseResultBlock } from './prompt.js';
import { runProcess } from './process.js';
import { resolveBin } from './providers.js';

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

/** Transcripts can contain tool output (and therefore secrets), so they are git-ignored by default. */
async function transcriptFile(dir, providerId) {
  await mkdir(dir, { recursive: true });
  if (!await exists(join(dir, '.gitignore'))) await writeFile(join(dir, '.gitignore'), '# Agent transcripts may contain tool output and secrets.\n*\n!.gitignore\n');
  return join(dir, `${stamp()}-${providerId}.jsonl`);
}

/** The price of a model (or a provider's default model) in `runtime.prices`, USD per million tokens. */
export function priceFor(config = {}, provider, model) {
  const prices = config.runtime?.prices || {};
  return (model && prices[model]) || prices[typeof provider === 'string' ? provider : provider?.id] || null;
}

/** Cost of a run from its tokens: (input − cached) × input + cached × cachedInput + output × output, per million. */
export function estimateCost(usage, price) {
  if (!usage || !price) return undefined;
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (fresh * price.input + usage.cachedInputTokens * (price.cachedInput ?? price.input) + usage.outputTokens * price.output) / 1e6;
}

/** The environment an agent runs with: the user's, without the sealed-test key. */
export function agentEnv(extra = {}) {
  const { MAVERICK_SEAL_KEY: _key, MAVERICK_PROOF_KEY: _proof, ...env } = process.env;
  return { ...env, ...extra };
}

/**
 * Runs one agent turn headlessly and normalises its output into Maverick events:
 * session, text, tool, result, error. Hooks guard the run; the transcript is written as
 * the run happens. The agent never gets a shell from Maverick: argv only.
 * `workdir` is where the agent works (a loop's worktree, a judge's export); `cwd` stays the
 * project, for hooks and binaries. `meta` (role, loop, iteration) is recorded with the run.
 * `transcriptDir` overrides the task's `runs/` (a sealer's transcript stays in the vault).
 * Cost is what the provider reports, else an estimate from its tokens and `runtime.prices`.
 */
export async function runAgent({ cwd, workdir = cwd, config, taskDir, task, provider, model, effort, permission, commands = [], prompt, timeoutMs, signal, meta, transcriptDir, onEvent = () => {} }) {
  const bin = resolveBin(provider, config, cwd);
  if (!commandAvailable(bin, cwd)) throw new Error(`${provider.name} is not installed (${bin} not found on PATH)`);
  const before = await runHooks(cwd, config, 'before-agent-run', { task, provider: provider.id, model, effort, permission, prompt });
  if (!before.allowed) throw new Error(before.reason);
  const finalPrompt = [prompt, ...before.appendPrompt].join('\n\n');
  const { args, input } = provider.invocation({ prompt: finalPrompt, model, effort, permission, commands });
  const transcript = await transcriptFile(transcriptDir || join(taskDir, 'runs'), provider.id);
  const events = [], state = {};
  // Writes are chained so transcript lines keep event order even when events arrive in bursts.
  let writing = Promise.resolve();
  const record = event => {
    events.push(event); onEvent(event);
    const line = `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`;
    writing = writing.then(() => appendFile(transcript, line));
    return writing;
  };
  await record({ type: 'start', provider: provider.id, model: model || null, effort: effort || null, permission, argv: [bin, ...args.map(arg => (arg === finalPrompt ? '<prompt>' : arg))], ...(meta && { ...meta }) });
  const pending = [];
  const processResult = await runProcess({
    bin, args, cwd: workdir, input, signal, timeoutMs, env: agentEnv(),
    onLine: line => { for (const event of provider.parse(line, state)) pending.push(record(event)); }
  });
  await Promise.all(pending);
  for (const event of provider.finish?.(state) || []) await record(event);
  const resultEvent = events.findLast(event => event.type === 'result');
  const text = resultEvent?.text ?? events.filter(event => event.type === 'text').map(event => event.text).join('\n');
  const problems = [
    processResult.error && `could not start ${bin}: ${processResult.error}`,
    processResult.timedOut && `timed out after ${Math.round(timeoutMs / 1000)}s`,
    processResult.aborted && 'aborted',
    processResult.code !== 0 && !processResult.timedOut && !processResult.aborted && !processResult.error && `${bin} exited ${processResult.code}${processResult.stderr.trim() ? `: ${processResult.stderr.trim().split('\n').slice(-2).join(' ')}` : ''}`,
    resultEvent?.ok === false && (resultEvent.error || 'the agent reported an error')
  ].filter(Boolean);
  const usage = resultEvent?.usage || null, estimate = typeof resultEvent?.cost === 'number' ? undefined : estimateCost(usage, priceFor(config, provider, model));
  const summary = {
    ok: !problems.length, problems, exitCode: processResult.code, durationMs: processResult.durationMs,
    sessionId: events.find(event => event.type === 'session')?.id, cost: resultEvent?.cost ?? estimate, ...(estimate !== undefined && { costEstimated: true }), usage, text,
    result: parseResultBlock(text), transcript, tools: events.filter(event => event.type === 'tool').length
  };
  await record({ type: 'end', ok: summary.ok, problems, exitCode: summary.exitCode, durationMs: summary.durationMs, status: summary.result?.status || null, ...(usage && { usage }), ...(typeof summary.cost === 'number' && { costUsd: summary.cost, ...(summary.costEstimated && { costEstimated: true }) }) });
  const after = await runHooks(cwd, config, 'after-agent-run', { task, provider: provider.id, ok: summary.ok, status: summary.result?.status, summary: summary.result?.summary, transcript });
  summary.warnings = after.warnings;
  return summary;
}
