import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commandAvailable, exists } from '../core/util.js';
import { runHooks } from './hooks.js';
import { parseResultBlock } from './prompt.js';
import { runProcess } from './process.js';
import { resolveBin } from './providers.js';

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

/** Transcripts can contain tool output (and therefore secrets), so they are git-ignored by default. */
async function transcriptFile(taskDir, providerId) {
  const dir = join(taskDir, 'runs');
  await mkdir(dir, { recursive: true });
  if (!await exists(join(dir, '.gitignore'))) await writeFile(join(dir, '.gitignore'), '# Agent transcripts may contain tool output and secrets.\n*\n!.gitignore\n');
  return join(dir, `${stamp()}-${providerId}.jsonl`);
}

/**
 * Runs one agent turn headlessly and normalises its output into Maverick events:
 * session, text, tool, result, error. Hooks guard the run; the transcript is written as
 * the run happens. The agent never gets a shell from Maverick: argv only.
 */
export async function runAgent({ cwd, config, taskDir, task, provider, model, permission, prompt, timeoutMs, signal, onEvent = () => {} }) {
  const bin = resolveBin(provider, config, cwd);
  if (!commandAvailable(bin, cwd)) throw new Error(`${provider.name} is not installed (${bin} not found on PATH)`);
  const before = await runHooks(cwd, config, 'before-agent-run', { task, provider: provider.id, model, permission, prompt });
  if (!before.allowed) throw new Error(before.reason);
  const finalPrompt = [prompt, ...before.appendPrompt].join('\n\n');
  const { args, input } = provider.invocation({ prompt: finalPrompt, model, permission });
  const transcript = await transcriptFile(taskDir, provider.id);
  const events = [], state = {};
  // Writes are chained so transcript lines keep event order even when events arrive in bursts.
  let writing = Promise.resolve();
  const record = event => {
    events.push(event); onEvent(event);
    const line = `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`;
    writing = writing.then(() => appendFile(transcript, line));
    return writing;
  };
  await record({ type: 'start', provider: provider.id, model: model || null, permission, argv: [bin, ...args.map(arg => (arg === finalPrompt ? '<prompt>' : arg))] });
  const pending = [];
  const processResult = await runProcess({
    bin, args, cwd, input, signal, timeoutMs,
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
  const summary = {
    ok: !problems.length, problems, exitCode: processResult.code, durationMs: processResult.durationMs,
    sessionId: events.find(event => event.type === 'session')?.id, cost: resultEvent?.cost, text,
    result: parseResultBlock(text), transcript, tools: events.filter(event => event.type === 'tool').length
  };
  await record({ type: 'end', ok: summary.ok, problems, exitCode: summary.exitCode, durationMs: summary.durationMs, status: summary.result?.status || null });
  const after = await runHooks(cwd, config, 'after-agent-run', { task, provider: provider.id, ok: summary.ok, status: summary.result?.status, summary: summary.result?.summary, transcript });
  summary.warnings = after.warnings;
  return summary;
}
