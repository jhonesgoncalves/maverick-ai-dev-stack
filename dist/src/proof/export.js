import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { exists, IGNORED_DIRS } from '../core/util.js';
import { git } from '../loop/git.js';

// An export is one tree of the project checked out into a temporary directory outside the
// repository, without `.maverick/`. The judge reads a change there; the ablation gate runs new
// tests against the code before the change; the sealed suite runs there, so its files never
// reach the work tree. Nothing in an export is ever added to git: no object, no ref, no index.

/** Dependency folders a checkout does not contain but its tests need. */
const DEPENDENCY_DIRS = ['node_modules', '.venv', 'venv', 'vendor', '.bundle', 'deps', 'Pods', '.dart_tool'];
/** Caches tools write inside node_modules: never shared with the project, so a run leaves nothing there. */
const NODE_CACHES = new Set(['.cache', '.vite', '.vitest', '.vite-temp']);
const DEPTH = 3;

const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };

/**
 * A node_modules of the export's own: a real folder whose entries link to the project's, so a
 * tool that writes a cache writes it in the export. A workspace link (an entry that resolves
 * to a package of the project itself) points at that package in the export instead, so the
 * tests import the tree under test, never the work tree.
 */
async function linkNodeModules(project, source, target, workdir) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true }).catch(() => [])) {
    if (NODE_CACHES.has(entry.name)) continue;
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) { await linkNodeModules(project, from, to, workdir); continue; }
    const real = await realpath(from).catch(() => null);
    const local = real && inside(project, real) && !real.split(sep).includes('node_modules') ? join(workdir, relative(project, real)) : from;
    await symlink(local, to, 'dir').catch(() => {});
  }
}

/** Links the project's dependency folders into the export where the export lacks them. */
async function linkDependencies(project, workdir) {
  const linked = [], root = await realpath(project);
  const visit = async (dir, depth) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name), rel = relative(project, path), target = join(workdir, rel);
      if (DEPENDENCY_DIRS.includes(entry.name)) {
        if (await exists(dirname(target)) && !await exists(target)) {
          if (entry.name === 'node_modules') await linkNodeModules(root, path, target, workdir); else await symlink(path, target, 'dir').catch(() => {});
          linked.push(rel);
        }
        continue;
      }
      if (depth < DEPTH && !IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) await visit(path, depth + 1);
    }
  };
  await visit(project, 0);
  return linked;
}

/**
 * Writes one overlay file into the export without following links: a symlink checked out from
 * the tree (which an agent could have committed to a checkpoint) must never redirect a sealed
 * test into the project. Every existing component of the path must be a real folder.
 */
async function writeInside(workdir, path, content) {
  const target = resolve(workdir, path);
  if (!target.startsWith(workdir + sep)) throw new Error(`refusing to write ${path} outside the export`);
  let current = workdir;
  for (const part of relative(workdir, dirname(target)).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current).catch(() => null);
    if (info?.isSymbolicLink()) throw new Error(`refusing to write ${path}: ${relative(workdir, current)} is a symbolic link (${await readlink(current).catch(() => '?')})`);
    if (info && !info.isDirectory()) throw new Error(`refusing to write ${path}: ${relative(workdir, current)} is not a folder`);
    if (!info) await mkdir(current);
  }
  if ((await lstat(target).catch(() => null))?.isSymbolicLink()) await unlink(target);
  await writeFile(target, content);
}

/**
 * Checks `tree` out into a temporary directory and runs `fn(workdir, { env, linked })` there.
 * `overlay` files ({ path, content }) are written on top, project-relative; `link` links the
 * project's dependency folders in; `isolate` points temporary and bytecode caches inside the
 * export, so a test run leaves nothing behind. The directory is removed whatever happens.
 */
export async function withExport(cwd, tree, fn, { prefix = 'maverick-export-', overlay = [], link = false, isolate = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), prefix)), index = join(dir, '.index'), root = join(dir, 'tree');
  try {
    const env = { GIT_INDEX_FILE: index };
    const read = await git(cwd, ['read-tree', tree], { env });
    if (!read.ok) throw new Error(`could not export ${String(tree).slice(0, 10)}: ${read.stderr.trim()}`);
    const out = await git(cwd, ['checkout-index', '-a', `--prefix=${root}/`], { env });
    if (!out.ok) throw new Error(`could not export ${String(tree).slice(0, 10)}: ${out.stderr.trim()}`);
    await rm(index, { force: true });
    const repoPrefix = (await git(cwd, ['rev-parse', '--show-prefix'])).stdout.trim();
    const workdir = join(await realpath(root), repoPrefix);
    await mkdir(workdir, { recursive: true });
    await rm(join(workdir, '.maverick'), { recursive: true, force: true });
    for (const file of overlay) await writeInside(workdir, file.path, file.content);
    const linked = link ? await linkDependencies(cwd, workdir) : [];
    const scratch = join(dir, 'tmp');
    if (isolate) await mkdir(scratch, { recursive: true });
    // An editable Python install points at the work tree; the export's own sources come first.
    const python = linked.some(path => /(^|[\\/])\.?venv$/.test(path)) ? { PYTHONPATH: [workdir, join(workdir, 'src'), process.env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':') } : {};
    const runEnv = isolate ? { TMPDIR: scratch, TMP: scratch, TEMP: scratch, PYTHONDONTWRITEBYTECODE: '1', ...python } : python;
    return await fn(workdir, { env: runEnv, linked, scratch: isolate ? scratch : null });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
