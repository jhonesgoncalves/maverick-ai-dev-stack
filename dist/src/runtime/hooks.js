import { join } from 'node:path';
import { splitCommand } from '../core/util.js';
import { runProcess } from './process.js';

export const HOOK_EVENTS = ['before-agent-run', 'after-agent-run', 'after-flow-run'];
// "before" hooks guard an action and fail closed; "after" hooks observe and fail open.
const BLOCKING = new Set(['before-agent-run']);

/**
 * Runs configured hooks for an event in declaration order. Each hook receives the event
 * as JSON on stdin. Exit 0 allows (stdout may be JSON such as {"appendPrompt": "..."}),
 * exit 2 denies with stderr as the reason. Any other failure denies a blocking event and
 * is reported as a warning for observing events.
 */
export async function runHooks(cwd, config, event, payload) {
  const hooks = (config.hooks || []).filter(hook => hook.event === event);
  const blocking = BLOCKING.has(event), outcome = { allowed: true, appendPrompt: [], warnings: [], ran: [] };
  for (const hook of hooks) {
    let argv;
    try { argv = splitCommand(hook.run); } catch (error) { argv = null; outcome.warnings.push(`${hook.run}: ${error.message}`); }
    const result = argv ? await runProcess({ bin: argv[0], args: argv.slice(1), cwd: hook.cwd ? join(cwd, hook.cwd) : cwd, input: JSON.stringify({ event, ...payload }), timeoutMs: hook.timeoutMs || 30000, onLine: line => { outcome.stdout = `${outcome.stdout || ''}${line}\n`; } }) : { code: null, error: 'invalid command' };
    outcome.ran.push({ run: hook.run, code: result.code, timedOut: result.timedOut });
    const reason = (result.stderr || '').trim().split('\n').slice(-3).join(' ') || result.error || (result.timedOut ? 'timed out' : `exited ${result.code}`);
    if (result.code === 0) {
      try { const data = JSON.parse(outcome.stdout || '{}'); if (typeof data.appendPrompt === 'string') outcome.appendPrompt.push(data.appendPrompt); } catch { /* plain output is fine */ }
      outcome.stdout = '';
      continue;
    }
    outcome.stdout = '';
    if (result.code === 2 || blocking) { outcome.allowed = false; outcome.reason = `hook "${hook.run}" ${result.code === 2 ? 'denied' : 'failed'}: ${reason}`; return outcome; }
    outcome.warnings.push(`hook "${hook.run}" failed: ${reason}`);
  }
  return outcome;
}
