import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';

/**
 * Runs a binary without a shell, streaming stdout line by line. Resolves with the exit
 * status; never rejects for a non-zero exit. The timeout and abort signal kill the
 * whole child so an agent can never outlive the command that started it.
 */
export function runProcess({ bin, args = [], cwd, input, env, timeoutMs = 0, signal, onLine = () => {}, onStderr = () => {} }) {
  return new Promise(resolve => {
    const started = Date.now();
    let child;
    try { child = spawn(bin, args, { cwd, env: env || process.env, shell: false, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); } catch (error) {
      resolve({ code: null, signal: null, timedOut: false, aborted: false, error: error.message, stderr: '', durationMs: 0 });
      return;
    }
    let buffer = '', stderr = '', timedOut = false, aborted = false, settled = false;
    const kill = () => { if (child.exitCode === null) { child.kill('SIGTERM'); setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 3000).unref(); } };
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; kill(); }, timeoutMs) : null;
    const onAbort = () => { aborted = true; kill(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1); if (line) onLine(line); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); onStderr(chunk); });
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    const finish = result => {
      if (settled) return; settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (buffer.trim()) onLine(buffer.replace(/\r$/, ''));
      resolve({ ...result, timedOut, aborted, stderr, durationMs: Date.now() - started });
    };
    child.on('error', error => finish({ code: null, signal: null, error: error.message }));
    child.on('close', (code, closeSignal) => finish({ code, signal: closeSignal }));
  });
}
