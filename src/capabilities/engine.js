import { lstat, mkdir, readdir, readFile, readlink, realpath, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { exists, pretty } from '../core/util.js';
import { SHARED, sharedOutputs } from './adapters.js';
import { sha256 } from './model.js';
import { formatFor } from './structured.js';

export const LOCK_PATH = '.maverick/capabilities.lock.json';

/** Resolves a project-relative path and refuses anything that escapes the project. */
export function resolveInside(cwd, path) {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${sep}`)) throw new Error(`refusing to write outside the project: ${path}`);
  return join(cwd, normalized);
}

const keyId = (path, pointer) => `${path}#${pointer.join('.')}`;
const toBuffer = content => (Buffer.isBuffer(content) ? content : Buffer.from(content));
/** The link target stored in the lockfile and on disk: relative, with forward slashes. */
const linkTo = (from, to) => relative(dirname(from), to).split(sep).join('/');

/**
 * What sits at a project path without following symlinks: null, { link }, { dir: true }, or
 * the file's bytes. A path reached through a linked folder does not exist on its own (writing
 * or deleting it would change the shared copy), so it reads as null.
 */
async function snapshot(cwd, path) {
  const parts = normalize(path).split(sep);
  for (let depth = 1; depth < parts.length; depth++) {
    if ((await lstat(join(cwd, ...parts.slice(0, depth))).catch(() => null))?.isSymbolicLink()) return null;
  }
  const full = resolveInside(cwd, path), stat = await lstat(full).catch(() => null);
  if (!stat) return null;
  if (stat.isSymbolicLink()) return { link: (await readlink(full)).split(sep).join('/') };
  return stat.isDirectory() ? { dir: true } : readFile(full);
}

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

/** Every file and link under a folder, relative to it, without following links. */
async function listTree(dir, prefix = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await listTree(join(dir, entry.name), path)); else found.push(path);
  }
  return found;
}

/** Maps every file and JSON key Maverick manages to the capability that owns it. */
function ownership(lock) {
  const owners = new Map();
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    for (const target of Object.values(entry.targets || {})) {
      for (const file of target.files || []) owners.set(file.path, ref);
      for (const key of target.keys || []) owners.set(keyId(key.path, key.pointer), ref);
      for (const link of target.links || []) owners.set(link.path, ref);
    }
  }
  return owners;
}

/** Reads a file as text for key-level edits; null when it does not exist. */
async function readText(cwd, path) {
  const full = resolveInside(cwd, path);
  return await exists(full) ? readFile(full, 'utf8') : null;
}

const DISPOSABLE = new Set(['.DS_Store', 'Thumbs.db']);

/**
 * Empties a tool's skills folder so it can become a link to `.agents/skills`. Skills already
 * shared (or being installed now) are dropped from the tool's side; any other skill folder is
 * moved into `.agents/skills`, so nothing is lost. A name taken on both sides is a conflict.
 * Moved files are marked `adopt`: they belong to the project, not to the capability.
 */
async function adoptFolder(cwd, root, target, owners, installing, adopted) {
  const changes = [], conflicts = [], sharedRoot = `${SHARED.root}/skills`;
  for (const file of await listTree(resolveInside(cwd, root))) {
    const path = `${root}/${file}`, name = file.split('/')[0], current = await snapshot(cwd, path);
    const drop = () => changes.push({ target, type: current?.link ? 'link' : 'file', op: 'delete', path });
    if (DISPOSABLE.has(basename(file))) { drop(); continue; }
    if (current?.link) {
      // A per-skill link from an earlier install points at the shared copy already.
      if (current.link === linkTo(`${root}/${name}`, `${sharedRoot}/${name}`)) drop();
      else conflicts.push({ target, path, reason: 'is a link Maverick did not create; remove it to link the skills folder' });
      continue;
    }
    const shared = `${sharedRoot}/${file}`, existing = await snapshot(cwd, shared), mine = owners.has(path);
    if (installing.has(name)) {
      if (mine) drop(); else conflicts.push({ target, path, reason: `is not part of the ${name} skill Maverick installs; move it out first` });
      continue;
    }
    // Another tool's folder in this same plan may already be moving a file there.
    const incoming = existing || adopted.get(shared);
    if (incoming) {
      if (mine || (Buffer.isBuffer(incoming) && incoming.equals(current))) drop(); else conflicts.push({ target, path, reason: `a different ${shared} exists; keep one of them` });
      continue;
    }
    adopted.set(shared, current);
    changes.push({ target: SHARED.id, type: 'file', op: 'create', path: shared, content: current, sha256: sha256(current), adopt: true });
    drop();
  }
  return { changes, conflicts };
}

/**
 * Plans the installation of one capability into the given adapters. Nothing is written:
 * the result lists every change, adapters that declined the kind, and conflicts with
 * files or keys Maverick does not own (which block the install unless forced).
 * In the `linked` layout the capability is written once to `.agents/` and every tool file
 * with identical content becomes a symlink to it, so all tools share one copy.
 */
export async function planInstall(cwd, capability, adapters, lock, { force = false, layout = 'copy' } = {}) {
  const owners = ownership(lock), changes = [], skipped = [], conflicts = [], outputsByTarget = {}, targets = [], adoptions = new Map();
  for (const adapter of adapters) {
    if (capability.targets && !capability.targets.includes(adapter.id)) { skipped.push({ target: adapter.id, reason: `the capability is limited to ${capability.targets.join(', ')}` }); continue; }
    const support = adapter.supports(capability.kind, capability);
    if (support !== true) { skipped.push({ target: adapter.id, reason: support || `${adapter.name} does not support ${capability.kind} capabilities at project level` }); continue; }
    outputsByTarget[adapter.id] = adapter.render(capability);
    targets.push(adapter.id);
  }
  const shared = layout === 'linked' && targets.length ? sharedOutputs(capability) : [];
  // Tools that read the same folder (Codex and Antigravity skills in `.agents/`) get one copy.
  const emitted = new Set();
  for (const target of targets) outputsByTarget[target] = outputsByTarget[target].filter(output => output.type !== 'file' || (!emitted.has(output.path) && emitted.add(output.path)));
  if (shared.length) {
    const sharedPaths = new Set(shared.map(item => item.path));
    const twin = output => shared.find(item => basename(item.path) === basename(output.path) && toBuffer(item.content).equals(toBuffer(output.content)));
    for (const target of targets) {
      // A tool that already reads `.agents/` (Codex skills) needs nothing more.
      const outputs = outputsByTarget[target].filter(output => !sharedPaths.has(output.path));
      const entry = capability.kind === 'skill' && outputs.find(output => output.path.endsWith(`/${capability.name}/SKILL.md`));
      if (entry) {
        // The tool's whole skills folder is one link to `.agents/skills`, shared by every skill.
        const root = dirname(entry.path.slice(0, -'/SKILL.md'.length));
        const rest = outputs.filter(output => !output.path.startsWith(`${root}/`));
        outputsByTarget[target] = [...rest, { type: 'link', path: root, target: linkTo(root, `${SHARED.root}/skills`), dir: true, shared: true }];
        continue;
      }
      // Anything else identical to its shared copy becomes a file link; tool-specific formats stay files.
      outputsByTarget[target] = outputs.map(output => {
        const source = output.type === 'file' && twin(output);
        return source ? { type: 'link', path: output.path, target: linkTo(output.path, source.path) } : output;
      });
    }
    outputsByTarget[SHARED.id] = shared;
  }
  for (const [target, outputs] of Object.entries(outputsByTarget)) {
    for (const output of outputs) {
      const owner = owners.get(output.type === 'json-key' ? keyId(output.path, output.pointer) : output.path);
      if (output.type === 'link') {
        const current = await snapshot(cwd, output.path);
        const op = !current ? 'create' : current.link === output.target ? 'unchanged' : 'update';
        if (current?.dir && output.shared) {
          const adopted = await adoptFolder(cwd, output.path, target, owners, new Set(shared.map(item => item.path.split('/')[2])), adoptions);
          changes.push(...adopted.changes); conflicts.push(...adopted.conflicts);
        } else if (current?.dir) {
          // A folder from an earlier install is replaced only when every file in it is this capability's.
          const foreign = (await listTree(resolveInside(cwd, output.path))).map(file => `${output.path}/${file}`).filter(file => owners.get(file) !== capability.ref);
          if (foreign.length) conflicts.push({ target, path: output.path, reason: `is a folder with files Maverick does not manage (${foreign.slice(0, 3).join(', ')}${foreign.length > 3 ? ', …' : ''})` });
        } else if (current && op !== 'unchanged' && (output.shared ? !current.link || !owners.has(output.path) : owner !== capability.ref)) conflicts.push({ target, path: output.path, reason: owner ? `owned by ${owner}` : 'exists and is not managed by Maverick' });
        changes.push({ target, type: 'link', op, path: output.path, link: output.target, ...(output.dir && { dir: true }), ...(output.shared && { shared: true }) });
      } else if (output.type === 'file') {
        const content = toBuffer(output.content), hash = sha256(content), current = await snapshot(cwd, output.path);
        const op = !current ? 'create' : Buffer.isBuffer(current) && sha256(current) === hash ? 'unchanged' : 'update';
        if (current && owner !== capability.ref && op !== 'unchanged') conflicts.push({ target, path: output.path, reason: owner ? `owned by ${owner}` : 'exists and is not managed by Maverick' });
        changes.push({ target, type: 'file', op, path: output.path, content, sha256: hash });
      } else {
        const format = formatFor(output.path), expected = format.fingerprint(output.pointer, output.value);
        const current = format.read(await readText(cwd, output.path), output.pointer, output.path);
        const op = current === undefined ? 'create' : current === expected ? 'unchanged' : 'update';
        if (current !== undefined && owner !== capability.ref && op !== 'unchanged') conflicts.push({ target, path: `${output.path} → ${output.pointer.join('.')}`, reason: owner ? `owned by ${owner}` : 'key exists and is not managed by Maverick' });
        changes.push({ target, type: 'json-key', op, path: output.path, pointer: output.pointer, value: output.value, sha256: expected });
      }
    }
  }
  // Files, links or keys a previous version installed but this version no longer produces.
  const produced = new Set(changes.filter(change => change.type !== 'json-key').map(change => change.path));
  for (const [target, recorded] of Object.entries(lock.capabilities[capability.ref]?.targets || {})) {
    if (!outputsByTarget[target]) continue;
    for (const file of recorded.files || []) if (!produced.has(file.path)) changes.push({ target, type: 'file', op: 'delete', path: file.path });
    for (const link of recorded.links || []) if (!produced.has(link.path)) changes.push({ target, type: 'link', op: 'delete', path: link.path });
    for (const key of recorded.keys || []) if (!changes.some(change => change.type === 'json-key' && keyId(change.path, change.pointer) === keyId(key.path, key.pointer))) changes.push({ target, type: 'json-key', op: 'delete', path: key.path, pointer: key.pointer });
  }
  return { capability, targets, changes, skipped, conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}

/** Plans removal from the lockfile. Locally edited files block removal unless forced. */
export async function planRemove(cwd, ref, lock, { force = false, removing = [ref] } = {}) {
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
      const current = formatFor(key.path).read(await readText(cwd, key.path), key.pointer, key.path);
      if (current === undefined) continue;
      if (current !== key.sha256) conflicts.push({ target, path: `${key.path} → ${key.pointer.join('.')}`, reason: 'edited since install' });
      changes.push({ target, type: 'json-key', op: 'delete', path: key.path, pointer: key.pointer });
    }
    for (const link of recorded.links || []) {
      const current = await snapshot(cwd, link.path);
      if (!current) continue;
      // A shared skills-folder link stays while any other installed skill still uses it.
      if (link.shared && Object.entries(lock.capabilities).some(([other, item]) => !removing.includes(other) && Object.values(item.targets || {}).some(t => t.links?.some(l => l.path === link.path)))) continue;
      // …and while the project keeps skills of its own in `.agents/skills`.
      if (link.shared && await keepsOwnSkills(cwd, lock, removing)) continue;
      if (current.link !== link.target) conflicts.push({ target, path: link.path, reason: 'replaced since install' });
      changes.push({ target, type: 'link', op: 'delete', path: link.path });
    }
  }
  return { ref, changes, skipped: [], conflicts: force ? [] : conflicts, forced: force ? conflicts : [] };
}

async function keepsOwnSkills(cwd, lock, removing) {
  const leaving = new Set(removing.flatMap(ref => Object.values(lock.capabilities[ref]?.targets || {}).flatMap(target => (target.files || []).map(file => file.path))));
  return (await listTree(resolveInside(cwd, `${SHARED.root}/skills`))).some(file => !leaving.has(`${SHARED.root}/skills/${file}`) && !DISPOSABLE.has(basename(file)));
}

async function removeEmptyParents(cwd, path) {
  for (let dir = dirname(path); relative(cwd, dir) && !relative(cwd, dir).startsWith('..'); dir = dirname(dir)) {
    if ((await readdir(dir).catch(() => ['x'])).length) return;
    await rmdir(dir).catch(() => {});
  }
}

/**
 * Applies planned changes as one unit: all target files are computed in memory first,
 * originals are snapshotted, and any failure restores every touched file and link.
 * Deletions run first, then files, then links, so a shared file exists before it is linked.
 */
export async function applyChanges(cwd, changes) {
  const staged = new Map(), originals = new Map();
  const load = async path => {
    if (!staged.has(path)) { const current = await snapshot(cwd, path); originals.set(path, current); staged.set(path, current); }
    return staged.get(path);
  };
  for (const change of changes.filter(item => item.op !== 'unchanged')) {
    if (change.type !== 'json-key') { await load(change.path); staged.set(change.path, change.op === 'delete' ? null : change.type === 'link' ? { link: change.link, dir: Boolean(change.dir) } : change.content); continue; }
    // Key-level edits go through a symlinked config file, never replace it.
    const current = await load(change.path), full = resolveInside(cwd, change.path);
    const text = Buffer.isBuffer(current) ? current.toString('utf8') : current?.link ? await readFile(full, 'utf8').catch(() => null) : null, format = formatFor(change.path);
    staged.set(change.path, Buffer.from(change.op === 'delete' ? format.remove(text, change.pointer, change.path) : format.write(text, change.pointer, change.value, change.path)));
  }
  const same = (a, b) => (a === null || b === null ? a === b : Buffer.isBuffer(a) ? Buffer.isBuffer(b) && a.equals(b) : a.link !== undefined && a.link === b.link);
  const rank = content => (content === null ? 0 : Buffer.isBuffer(content) ? 1 : 2);
  const place = async (full, content, { through = false } = {}) => {
    if (content === null) { await rm(full, { force: true }); await removeEmptyParents(cwd, full); return; }
    await mkdir(dirname(full), { recursive: true });
    if (Buffer.isBuffer(content) && through) return writeFile(full, content);
    await rm(full, { force: true });
    if (Buffer.isBuffer(content)) return writeFile(full, content);
    // Windows junctions need no privileges but take absolute targets.
    if (content.dir && process.platform === 'win32') await symlink(resolve(dirname(full), content.link), full, 'junction');
    else await symlink(content.link, full, content.dir ? 'dir' : 'file');
  };
  const keyed = new Set(changes.filter(change => change.type === 'json-key').map(change => change.path));
  const written = [];
  try {
    for (const [path, content] of [...staged].sort(([, a], [, b]) => rank(a) - rank(b))) {
      if (same(content, originals.get(path))) continue;
      written.push(path);
      await place(resolveInside(cwd, path), content, { through: keyed.has(path) });
    }
  } catch (error) {
    for (const path of written.reverse()) {
      const original = originals.get(path);
      await place(resolveInside(cwd, path), original?.dir && original.link === undefined ? null : original, { through: keyed.has(path) }).catch(() => {});
    }
    throw new Error(`could not apply changes (all files restored): ${error.message}`);
  }
}

/** Builds the lockfile entry for an applied install plan. */
export function lockEntry(plan, { allowExec = false } = {}) {
  const targets = Object.fromEntries((plan.targets || []).map(id => [id, { files: [], keys: [] }]));
  for (const change of plan.changes.filter(item => item.op !== 'delete' && !item.adopt)) {
    const target = targets[change.target] ||= { files: [], keys: [] };
    if (change.type === 'file') target.files.push({ path: change.path, sha256: change.sha256 });
    else if (change.type === 'link') (target.links ||= []).push({ path: change.path, target: change.link, ...(change.dir && { dir: true }), ...(change.shared && { shared: true }) });
    else target.keys.push({ path: change.path, pointer: change.pointer, sha256: change.sha256 });
  }
  const { capability } = plan;
  return { kind: capability.kind, version: capability.version, source: capability.source, integrity: capability.integrity, ...(allowExec && { allowExec: true }), installedAt: new Date().toISOString().slice(0, 10), targets };
}

async function sameTarget(cwd, link) {
  const full = resolveInside(cwd, link.path);
  const [actual, expected] = await Promise.all([realpath(full).catch(() => null), realpath(resolve(dirname(full), link.target)).catch(() => null)]);
  return Boolean(actual) && actual === expected;
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
        try { current = formatFor(key.path).read(await readText(cwd, key.path), key.pointer, key.path); } catch { current = undefined; }
        if (current === undefined) issues.push({ target, path: `${key.path} → ${key.pointer.join('.')}`, status: 'missing' });
        else if (current !== key.sha256) issues.push({ target, path: `${key.path} → ${key.pointer.join('.')}`, status: 'modified' });
      }
      for (const link of recorded.links || []) {
        const current = await snapshot(cwd, link.path);
        // An older per-skill link is satisfied when a linked skills folder already reaches the same place.
        if (!current && await sameTarget(cwd, link)) continue;
        if (!current) issues.push({ target, path: link.path, status: 'missing' });
        else if (current.link !== link.target) issues.push({ target, path: link.path, status: 'modified' });
      }
    }
    report.push({ ref, version: entry.version, source: entry.source, targets: Object.keys(entry.targets || {}), issues });
  }
  return report;
}
