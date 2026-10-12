import { open, readFile } from 'node:fs/promises';
import { sha256 } from '../capabilities/model.js';
import { exists } from '../core/util.js';
import { LOOP_SCHEMA } from './model.js';

// The loop's ledger: one JSON line per event, each chained to the one before by hash. It is the
// write-ahead record of every decision (an iteration is accepted once its entry is written), and
// it makes after-the-fact edits detectable: change, drop or reorder a line and the chain breaks.
// Tamper-evident, not tamper-proof: someone who can rewrite every line can rewrite every hash.

/** JSON with object keys sorted at every level, so the same data always hashes the same. */
export function canonical(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('ledger values must be finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(item => canonical(item) ?? 'null').join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

/** The hash every chain starts from: a loop's (or, with another schema, a seal's) id under its schema. */
export const genesis = (id, schema = LOOP_SCHEMA) => sha256(`${schema}\0${id}`);
export const entryHash = (prev, body) => sha256(`${prev}${canonical(body)}`);

/** Reads every entry; a line that is not JSON is reported with its number. */
export async function readLedger(path) {
  if (!await exists(path)) return [];
  return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`ledger line ${index + 1} is not valid JSON`); }
  });
}

/**
 * An append-only ledger for one loop. Each append is one line written and synced to disk
 * before the call returns, so a crash never leaves a decision half-recorded.
 */
export async function openLedger(path, loopId, { schema } = {}) {
  const entries = await readLedger(path);
  return {
    entries,
    get head() { return entries.at(-1)?.hash || genesis(loopId, schema); },
    async append(type, data = {}) {
      const body = { v: 1, seq: entries.length, at: new Date().toISOString(), type, data };
      const entry = { ...body, prev: this.head, hash: entryHash(this.head, body) };
      const handle = await open(path, 'a');
      try { await handle.write(`${JSON.stringify(entry)}\n`); await handle.datasync(); } finally { await handle.close(); }
      entries.push(entry);
      return entry;
    }
  };
}

/** Checks sequence numbers, links and hashes from the genesis of `loopId`. */
export function verifyChain(entries, loopId, { schema } = {}) {
  const problems = [];
  let prev = genesis(loopId, schema);
  entries.forEach((entry, index) => {
    const { v, seq, at, type, data } = entry;
    if (seq !== index) problems.push({ seq: index, problem: `entry ${index} has sequence number ${seq}` });
    if (entry.prev !== prev) problems.push({ seq: index, problem: `entry ${index} does not link to the entry before it` });
    if (entryHash(entry.prev, { v, seq, at, type, data }) !== entry.hash) problems.push({ seq: index, problem: `hash mismatch at entry ${index} (${type}): its content was changed` });
    prev = entry.hash;
  });
  return { ok: !problems.length, head: entries.at(-1)?.hash || genesis(loopId, schema), problems };
}
