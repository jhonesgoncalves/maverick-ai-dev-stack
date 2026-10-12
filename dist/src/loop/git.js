import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, realpath, rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { sha256 } from '../capabilities/model.js';
import { exists } from '../core/util.js';

// Git plumbing for loops. In place (the default) a loop snapshots the working tree into its
// own index file and keeps checkpoints as commits under hidden refs: HEAD, the branch and the
// user's index are never touched, and rolling back restores files from a checkpoint. In a
// worktree a loop owns a branch and commits each accepted iteration to it.

/** Fails a loop closed: the repository is not in a state the loop can trust or restore. */
export class IntegrityError extends Error {}

const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' };
// Checkpoints are the loop's commits, never the user's: a fixed identity, never signed.
const IDENTITY = { GIT_AUTHOR_NAME: 'Maverick Loop', GIT_AUTHOR_EMAIL: 'loop@maverick.invalid', GIT_COMMITTER_NAME: 'Maverick Loop', GIT_COMMITTER_EMAIL: 'loop@maverick.invalid' };
const EXCLUDE = ['--', '.', ':(exclude).maverick'];
const PATCH_LIMIT = 5 * 1024 * 1024;

/** Runs git without a shell. Output is exact (a Buffer when `encoding` is null), never thrown. */
export function git(cwd, args, { env = {}, input, encoding = 'utf8' } = {}) {
  return new Promise(done => {
    let child;
    try { child = spawn('git', args, { cwd, env: { ...process.env, ...GIT_ENV, ...env }, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); } catch (error) { done({ ok: false, code: null, stdout: '', stderr: error.message }); return; }
    const out = [], err = [];
    child.stdout.on('data', chunk => out.push(chunk)); child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error => done({ ok: false, code: null, stdout: '', stderr: error.message }));
    child.on('close', code => { const buffer = Buffer.concat(out); done({ ok: code === 0, code, stdout: encoding ? buffer.toString(encoding) : buffer, stderr: Buffer.concat(err).toString('utf8') }); });
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

async function must(cwd, args, options) {
  const result = await git(cwd, args, options);
  if (!result.ok) throw new IntegrityError(`git ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim().split('\n').slice(-2).join(' ') || `exit ${result.code}`}`);
  return result.stdout;
}

const zsplit = text => String(text).split('\0').filter(Boolean);

/** Facts a loop checks before it starts: where the repository is and whether it is mid-operation. */
export async function repoInfo(cwd) {
  const version = (await git(cwd, ['--version'])).stdout.match(/(\d+)\.(\d+)/);
  const inside = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!inside.ok) return { repo: false, version: version ? [Number(version[1]), Number(version[2])] : null };
  const [prefix, head, branch, gitDir] = await Promise.all([git(cwd, ['rev-parse', '--show-prefix']), git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']), git(cwd, ['symbolic-ref', '-q', 'HEAD']), git(cwd, ['rev-parse', '--absolute-git-dir'])]);
  const marker = async name => exists(resolve(cwd, (await git(cwd, ['rev-parse', '--git-path', name])).stdout.trim()));
  const operations = [];
  for (const [name, label] of [['MERGE_HEAD', 'merge'], ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert'], ['BISECT_LOG', 'bisect']]) if (await marker(name)) operations.push(label);
  return {
    repo: true, root: inside.stdout.trim(), prefix: prefix.stdout.trim().replace(/\/$/, ''), head: head.ok ? head.stdout.trim() : null,
    branch: branch.ok ? branch.stdout.trim() : null, gitDir: gitDir.stdout.trim(), version: version ? [Number(version[1]), Number(version[2])] : null,
    operation: [...new Set(operations)][0] || null
  };
}

export const checkpointRef = (task, n) => `refs/maverick/loops/${task}/${String(n).padStart(4, '0')}`;

/** Checkpoint refs of a task: `[{ ref, n, commit }]`, in order. */
export async function listCheckpointRefs(cwd, task) {
  const out = (await git(cwd, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/maverick/loops/${task}/`])).stdout;
  return out.split('\n').filter(Boolean).map(line => { const [ref, commit] = line.split(' '); return { ref, n: Number(ref.split('/').pop()), commit }; }).sort((a, b) => a.n - b.n);
}

/** A commit's tree, message and parents, or null when it does not exist. */
export async function readCommit(cwd, ref) {
  const result = await git(cwd, ['cat-file', 'commit', ref]);
  if (!result.ok) return null;
  const [header, ...body] = result.stdout.split('\n\n');
  const lines = header.split('\n');
  return { tree: lines.find(line => line.startsWith('tree '))?.slice(5), parents: lines.filter(line => line.startsWith('parent ')).map(line => line.slice(7)), message: body.join('\n\n') };
}

export const resolveRef = async (cwd, ref) => { const result = await git(cwd, ['rev-parse', '--verify', '-q', ref]); return result.ok ? result.stdout.trim() : null; };

/** Changed paths, line counts and the patch between two trees, limited to the project. */
export async function treeDiff(cwd, base, head, { patch = true, maxLines = 50000 } = {}) {
  if (base === head) return { files: [], numstat: [], added: 0, deleted: 0, empty: true, patch: '', truncated: false };
  const raw = zsplit(await must(cwd, ['-c', 'core.quotePath=false', 'diff', '--raw', '-z', '--no-renames', '--no-abbrev', '--relative', base, head, ...EXCLUDE]));
  const files = [];
  for (let index = 0; index < raw.length; index += 2) {
    const [oldMode, newMode, , , status] = raw[index].slice(1).split(' ');
    files.push({ status: status[0], path: raw[index + 1], oldMode, newMode });
  }
  const stats = zsplit(await must(cwd, ['-c', 'core.quotePath=false', 'diff', '--numstat', '-z', '--no-renames', '--relative', base, head, ...EXCLUDE])).map(entry => {
    const [added, deleted, path] = entry.split('\t');
    return { path, added: added === '-' ? 0 : Number(added), deleted: deleted === '-' ? 0 : Number(deleted), binary: added === '-' };
  });
  const added = stats.reduce((sum, item) => sum + item.added, 0), deleted = stats.reduce((sum, item) => sum + item.deleted, 0);
  // A diff too large to read is reported as such; the integrity guard refuses what it cannot audit.
  const truncated = added + deleted > maxLines;
  let text = '';
  if (patch && !truncated) {
    text = await must(cwd, ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-M', '--relative', base, head, ...EXCLUDE]);
    if (text.length > PATCH_LIMIT) text = text.slice(0, PATCH_LIMIT);
  }
  return { files, numstat: stats, added, deleted, empty: !files.length, patch: text, truncated };
}

/** True when `target` is inside `root` (both resolved), so a delete can never escape the project. */
async function contained(root, target) {
  const base = await realpath(root), parent = await realpath(dirname(target)).catch(() => null);
  return Boolean(parent) && (parent === base || parent.startsWith(base + sep)) && !relative(base, join(parent, '.')).split(sep).includes('.maverick');
}

async function pruneEmpty(root, dir) {
  for (let current = dir; current.startsWith(root + sep); current = dirname(current)) {
    try { await rmdir(current); } catch { return; }
  }
}

/**
 * The in-place strategy. Snapshots go through the loop's own index file, so `git add` never
 * touches the user's index; checkpoints are commits under `refs/maverick/loops/<task>/`.
 */
export function inPlace({ cwd, task, indexFile, inflight }) {
  const env = { GIT_INDEX_FILE: indexFile };
  const self = {
    mode: 'in-place', workCwd: cwd,
    async prepare() { if (!await exists(indexFile)) { await mkdir(dirname(indexFile), { recursive: true }); await must(cwd, ['read-tree', 'HEAD'], { env }); } },
    async sync() {},
    /** The tree of the working copy as it is now (ignored files and .maverick/ excluded). */
    async snapshot() {
      await self.prepare();
      await must(cwd, ['add', '-A', ...EXCLUDE], { env });
      return (await must(cwd, ['write-tree'], { env })).trim();
    },
    async checkpoint({ ref, tree, parent, message }) {
      const commit = (await must(cwd, ['commit-tree', '--no-gpg-sign', '-p', parent, tree], { env: IDENTITY, input: message })).trim();
      // Create-only: a ref that already exists is never moved.
      await must(cwd, ['update-ref', ref, commit, '0'.repeat(parent.length)]);
      return { ref, commit, tree };
    },
    diff: (base, head, options) => treeDiff(cwd, base, head, options),
    /**
     * Brings the working copy back to `target` and proves it: restore changed and deleted files,
     * delete added ones, snapshot again, until the tree matches (three passes cover a .gitignore
     * edit that hid a new file). A rollback that cannot be proven stops the loop.
     */
    async rollback(target) {
      const restored = new Set(), deleted = new Set();
      for (let pass = 0; pass < 3; pass += 1) {
        const current = await self.snapshot();
        if (current === target.tree) return { restored: [...restored], deleted: [...deleted] };
        const { files } = await treeDiff(cwd, target.tree, current, { patch: false, maxLines: Infinity });
        const restore = files.filter(file => file.status !== 'A' && file.oldMode !== '160000').map(file => file.path);
        for (const file of files.filter(item => item.status === 'A' && item.newMode !== '160000')) {
          const path = join(cwd, file.path);
          if (!await contained(cwd, path)) throw new IntegrityError(`refusing to delete ${file.path}: it resolves outside the project`);
          await rm(path, { force: true }); deleted.add(file.path); await pruneEmpty(cwd, dirname(path));
        }
        if (restore.length) {
          await must(cwd, ['restore', `--source=${target.commit}`, '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'], { env: { ...env, GIT_LITERAL_PATHSPECS: '1' }, input: `${restore.join('\0')}\0` });
          restore.forEach(path => restored.add(path));
        }
      }
      if (await self.snapshot() !== target.tree) throw new IntegrityError('rollback did not converge: the working copy still differs from the checkpoint');
      return { restored: [...restored], deleted: [...deleted] };
    },
    /** What an agent must not change: HEAD, the branch, the staged entries, the stash and the loop's refs. */
    async captureInvariants() {
      const index = resolve(cwd, (await git(cwd, ['rev-parse', '--git-path', 'index'])).stdout.trim());
      await mkdir(inflight, { recursive: true });
      const backup = join(inflight, 'user-index');
      if (await exists(index)) await copyFile(index, backup); else await rm(backup, { force: true });
      return {
        head: await resolveRef(cwd, 'HEAD'), branch: (await git(cwd, ['symbolic-ref', '-q', 'HEAD'])).stdout.trim() || null,
        staged: sha256((await git(cwd, ['ls-files', '-s', '-z'])).stdout), stash: await resolveRef(cwd, 'refs/stash'),
        refs: (await git(cwd, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/maverick/loops/${task}/`])).stdout,
        index, backup
      };
    },
    /** `{ fatal, findings }`: a moved HEAD or forged loop ref ends the loop; a changed index is put back. */
    async checkInvariants(before) {
      const fatal = [], findings = [];
      const head = await resolveRef(cwd, 'HEAD'), branch = (await git(cwd, ['symbolic-ref', '-q', 'HEAD'])).stdout.trim() || null;
      if (head !== before.head || branch !== before.branch) fatal.push(`HEAD moved during the iteration (${before.branch || before.head?.slice(0, 8)} → ${branch || head?.slice(0, 8)}): the agent committed or checked out; Maverick never resets your branch`);
      const refs = (await git(cwd, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/maverick/loops/${task}/`])).stdout;
      if (refs !== before.refs) fatal.push('the loop\'s checkpoint refs changed during the iteration');
      if (sha256((await git(cwd, ['ls-files', '-s', '-z'])).stdout) !== before.staged) {
        if (await exists(before.backup)) await copyFile(before.backup, before.index); else await rm(before.index, { force: true });
        findings.push({ severity: 'block', kind: 'git-index-modified', file: '.git/index', message: 'the agent staged or unstaged files; your index was restored' });
      }
      if (await resolveRef(cwd, 'refs/stash') !== before.stash) findings.push({ severity: 'block', kind: 'git-stash-modified', file: 'refs/stash', message: 'the agent changed the stash' });
      return { fatal, findings };
    },
    async cleanup() {
      for (const { ref } of await listCheckpointRefs(cwd, task)) await git(cwd, ['update-ref', '-d', ref]);
      await rm(indexFile, { force: true });
    }
  };
  return self;
}

/** Reads a file at a commit, or null when it is not there. */
export async function showFile(cwd, commit, path) {
  const result = await git(cwd, ['show', `${commit}:./${path}`]);
  return result.ok ? result.stdout : null;
}

export async function headCommit(cwd) { return resolveRef(cwd, 'HEAD'); }
export async function treeOf(cwd, commit) { return (await must(cwd, ['rev-parse', `${commit}^{tree}`])).trim(); }
export const readText = path => readFile(path, 'utf8');
