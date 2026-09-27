import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { exists, pretty } from '../core/util.js';
import { sha256 } from './model.js';

export const LOCK_PATH = '.maverick/capabilities.lock.json';

/** Resolves a project-relative path and refuses anything that escapes the project. */
export function resolveInside(cwd, path) {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${sep}`)) throw new Error(`refusing to write outside the project: ${path}`);
  return join(cwd, normalized);
}

const keyId = (path, pointer) => `${path}#${pointer.join('.')}`;
const hashValue = value => sha256(JSON.stringify(value));
const toBuffer = content => (Buffer.isBuffer(content) ? content : Buffer.from(content));

export async function readLock(cwd) {
  const path = join(cwd, LOCK_PATH);
  if (!await exists(path)) return { version: 1, capabilities: {} };
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { throw new Error(`invalid lockfile ${LOCK_PATH}: ${error.message}`); }
}

export async function writeLock(cwd, lock) {
  const sorted = { version: 1, capabilities: Object.fromEntries(Object.entries(lock.capabilities).sort(([a], [b]) => a.localeCompare(b))) };
  await mkdir(dirname(join(cwd, LOCK_PATH)), { recursive: true });
  await writeFile(join(cwd, LOCK_PATH), pretty(sorted));
}

/** Maps every file and JSON key Maverick manages to the capability that owns it. */
function ownership(lock) {
  const owners = new Map();
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    for (const target of Object.values(entry.targets || {})) {
      for (const file of target.files || []) owners.set(file.path, ref);
      for (const key of target.keys || []) owners.set(keyId(key.path, key.pointer), ref);
    }
  }
  return owners;
}

async function readJsonFile(cwd, path) {
  const full = resolveInside(cwd, path);
  if (!await exists(full)) return undefined;
  const text = await readFile(full, 'utf8');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new Error(`cannot merge into ${path}: it is not plain JSON (comments are not supported)`); }
}

const getAt = (object, pointer) => pointer.reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), object);
function setAt(object, pointer, value) {
  let node = object;
  for (const key of pointer.slice(0, -1)) { if (!node[key] || typeof node[key] !== 'object') node[key] = {}; node = node[key]; }
  node[pointer.at(-1)] = value;
}
function deleteAt(object, pointer) {
  const parent = getAt(object, pointer.slice(0, -1));
  if (parent && typeof parent === 'object') delete parent[pointer.at(-1)];
}

/**
 * Plans the installation of one capability into the given adapters. Nothing is written:
 * the result lists every change, adapters that declined the kind, and conflicts with
 * files or keys Maverick does not own (which block the install unless forced).
 */
export async function planInstall(cwd, capability, adapters, lock, { force = false } = {}) {
  const owners = ownership(lock), changes = [], skipped = [], conflicts = [], outputsByTarget = {};
  for (const adapter of adapters) {
    if (capability.targets && !capability.targets.includes(adapter.id)) { skipped.push({ target: adapter.id, reason: `the capability is limited to ${capability.targets.join(', ')}` }); continue; }
    const support = adapter.supports(capability.kind);
    if (support !== true) { skipped.push({ target: adapter.id, reason: support || `${adapter.name} does not support ${capability.kind} capabilities at project level` }); continue; }
    const outputs = adapter.render(capability);
    outputsByTarget[adapter.id] = outputs;
    for (const output of outputs) {
      if (output.type === 'file') {
        const full = resolveInside(cwd, output.path), content = toBuffer(output.content), hash = sha256(content);
        const current = await exists(full) ? await readFile(full) : null, owner = owners.get(output.path);
        const op = !current ? 'create' : sha256(current) === hash ? 'unchanged' : 'update';
        if (current && owner !== capability.ref && op !== 'unchanged') conflicts.push({ target: adapter.id, path: output.path, reason: owner ? `owned by ${owner}` : 'exists and is not managed by Maverick' });
        changes.push({ target: adapter.id, type: 'file', op, path: output.path, content, sha256: hash });
      } else {
        const document = await readJsonFile(cwd, output.path), current = getAt(document, output.pointer), id = keyId(output.path, output.pointer), owner = owners.get(id);
        const op = current === undefined ? 'create' : hashValue(current) === hashValue(output.value) ? 'unchanged' : 'update';
        if (current !== undefined && owner !== capability.ref && op !== 'unchanged') conflicts.push({ target: adapter.id, path: `${output.path} → ${output.pointer.join('.')}`, reason: owner ? `owned by ${owner}` : 'key exists and is not managed by Maverick' });
        changes.push({ target: adapter.id, type: 'json-key', op, path: output.path, pointer: output.pointer, value: output.value, sha256: hashValue(output.value) });
      }
    }
  }
  // Files or keys a previous version installed but this version no longer produces.
  for (const [target, recorded] of Object.entries(lock.capabilities[capability.ref]?.targets || {})) {
    if (!outputsByTarget[target]) continue;
    for (const file of recorded.files || []) if (!changes.some(change => change.type === 'file' && change.path === file.path)) changes.push({ target, type: 'file', op: 'delete', path: file.path });
    for (const key of recorded.keys || []) if (!changes.some(change => change.type === 'json-key' && keyId(change.path, change.pointer) === keyId(key.path, key.pointer))) changes.push({ target, type: 'json-key', op: 'delete', path: key.path, pointer: key.pointer });
  }
  return { capability, changes, skipped, conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}

/** Plans removal from the lockfile. Locally edited files block removal unless forced. */
export async function planRemove(cwd, ref, lock, { force = false } = {}) {
  const entry = lock.capabilities[ref];
  if (!entry) throw new Error(`${ref} is not installed; run maverick installed to list installed capabilities`);
  const changes = [], conflicts = [];
  for (const [target, recorded] of Object.entries(entry.targets || {})) {
    for (const file of recorded.files || []) {
      const full = resolveInside(cwd, file.path);
      if (!await exists(full)) continue;
      if (sha256(await readFile(full)) !== file.sha256) conflicts.push({ target, path: file.path, reason: 'edited since install' });
      changes.push({ target, type: 'file', op: 'delete', path: file.path });
    }
    for (const key of recorded.keys || []) {
      const current = getAt(await readJsonFile(cwd, key.path), key.pointer);
      if (current === undefined) continue;
      if (hashValue(current) !== key.sha256) conflicts.push({ target, path: `${key.path} → ${key.pointer.join('.')}`, reason: 'edited since install' });
      changes.push({ target, type: 'json-key', op: 'delete', path: key.path, pointer: key.pointer });
    }
  }
  return { ref, changes, skipped: [], conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}

async function removeEmptyParents(cwd, path) {
  for (let dir = dirname(path); relative(cwd, dir) && !relative(cwd, dir).startsWith('..'); dir = dirname(dir)) {
    if ((await readdir(dir).catch(() => ['x'])).length) return;
    await rmdir(dir).catch(() => {});
  }
}

/**
 * Applies planned changes as one unit: all target files are computed in memory first,
 * originals are snapshotted, and any failure restores every touched file.
 */
export async function applyChanges(cwd, changes) {
  const staged = new Map(), originals = new Map();
  const load = async path => {
    if (!staged.has(path)) {
      const full = resolveInside(cwd, path), current = await exists(full) ? await readFile(full) : null;
      originals.set(path, current); staged.set(path, current);
    }
    return staged.get(path);
  };
  for (const change of changes.filter(item => item.op !== 'unchanged')) {
    if (change.type === 'file') { await load(change.path); staged.set(change.path, change.op === 'delete' ? null : change.content); continue; }
    const current = await load(change.path), document = current ? JSON.parse(current.toString('utf8') || '{}') : {};
    if (change.op === 'delete') deleteAt(document, change.pointer); else setAt(document, change.pointer, change.value);
    staged.set(change.path, Buffer.from(pretty(document)));
  }
  const written = [];
  try {
    for (const [path, content] of staged) {
      if (content !== null && originals.get(path) !== null && Buffer.compare(content, originals.get(path)) === 0) continue;
      const full = resolveInside(cwd, path);
      written.push(path);
      if (content === null) { await rm(full, { force: true }); await removeEmptyParents(cwd, full); } else { await mkdir(dirname(full), { recursive: true }); await writeFile(full, content); }
    }
  } catch (error) {
    for (const path of written) {
      const full = resolveInside(cwd, path), original = originals.get(path);
      if (original === null) await rm(full, { force: true }).catch(() => {}); else await writeFile(full, original).catch(() => {});
    }
    throw new Error(`could not apply changes (all files restored): ${error.message}`);
  }
}

/** Builds the lockfile entry for an applied install plan. */
export function lockEntry(plan, { allowExec = false } = {}) {
  const targets = {};
  for (const change of plan.changes.filter(item => item.op !== 'delete')) {
    const target = targets[change.target] ||= { files: [], keys: [] };
    if (change.type === 'file') target.files.push({ path: change.path, sha256: change.sha256 });
    else target.keys.push({ path: change.path, pointer: change.pointer, sha256: change.sha256 });
  }
  const { capability } = plan;
  return { kind: capability.kind, version: capability.version, source: capability.source, integrity: capability.integrity, ...(allowExec && { allowExec: true }), installedAt: new Date().toISOString().slice(0, 10), targets };
}

/** Compares every managed file and key with the hash recorded at install time. */
export async function checkDrift(cwd, lock) {
  const report = [];
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    const issues = [];
    for (const [target, recorded] of Object.entries(entry.targets || {})) {
      for (const file of recorded.files || []) {
        const full = resolveInside(cwd, file.path);
        if (!await exists(full)) issues.push({ target, path: file.path, status: 'missing' });
        else if (sha256(await readFile(full)) !== file.sha256) issues.push({ target, path: file.path, status: 'modified' });
      }
      for (const key of recorded.keys || []) {
        let current;
        try { current = getAt(await readJsonFile(cwd, key.path), key.pointer); } catch { current = undefined; }
        if (current === undefined) issues.push({ target, path: `${key.path} → ${key.pointer.join('.')}`, status: 'missing' });
        else if (hashValue(current) !== key.sha256) issues.push({ target, path: `${key.path} → ${key.pointer.join('.')}`, status: 'modified' });
      }
    }
    report.push({ ref, version: entry.version, source: entry.source, targets: Object.keys(entry.targets || {}), issues });
  }
  return report;
}
