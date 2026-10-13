import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// A short exclusive lock on a file Maverick rewrites (a task's `_tasks.md`), for when several
// loops or lanes of one task write to it at once. The lock is a file created exclusively; one
// whose process is gone (on this host) is taken over. Within one call chain it is re-entrant.

const held = new AsyncLocalStorage();

const alive = holder => {
  if (!holder || holder.host !== hostname()) return Boolean(holder);
  try { process.kill(holder.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

/** Runs `fn` holding the lock `path`; waits up to `timeoutMs` for another holder to release it. */
export async function withFileLock(path, fn, { timeoutMs = 15000, retryMs = 15 } = {}) {
  if (held.getStore()?.has(path)) return fn();
  await mkdir(dirname(path), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { await writeFile(path, JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() }), { flag: 'wx' }); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
      // A lock being written has no content yet: wait for it rather than calling it stale.
      if (holder && !alive(holder)) { await rm(path, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error(`${path} is locked by pid ${holder?.pid ?? '?'}${holder?.host && holder.host !== hostname() ? ` on ${holder.host}` : ''}; try again, or remove the file if no Maverick process is running`);
      await sleep(retryMs + Math.floor(Math.random() * retryMs));
    }
  }
  const paths = new Set([...(held.getStore() || []), path]);
  try { return await held.run(paths, fn); } finally { await rm(path, { force: true }); }
}
