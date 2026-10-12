import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { sha256 } from '../capabilities/model.js';
import { executeCommand } from '../core/project-tools.js';
import { exists, rel } from '../core/util.js';
import { checkboxOnlyChange } from '../subtasks/graph.js';
import { git, IntegrityError, resolveRef, treeDiff } from './git.js';

// Worktree isolation. The loop works in its own git worktree on the branch
// `maverick/loop/<task>`, outside the repository, and commits each accepted iteration there.
// Your checkout is never touched, so you can keep working while it runs; the branch is the
// result, for you to review and merge. Maverick never pushes it.

const EXCLUDE = ['--', '.', ':(exclude).maverick'];
const IDENTITY = { GIT_AUTHOR_NAME: 'Maverick Loop', GIT_AUTHOR_EMAIL: 'loop@maverick.invalid', GIT_COMMITTER_NAME: 'Maverick Loop', GIT_COMMITTER_EMAIL: 'loop@maverick.invalid' };
const REPORTS = ['EVIDENCE.md', 'SECURITY-REPORT.md', 'SCOPE-GUARD.md', 'INTEGRITY.md', 'REVIEW-FINDINGS.md', 'DEPENDENCY-REVIEW.md', 'POLICY-CHECK.md'];

async function must(cwd, args, options) {
  const result = await git(cwd, args, options);
  if (!result.ok) throw new IntegrityError(`git ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim().split('\n').slice(-2).join(' ') || `exit ${result.code}`}`);
  return result.stdout;
}

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path)); else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** Where a task's worktree lives: outside the repository, so tools that scan the project never see it twice. */
export function worktreeLocation(root, task, settings = {}) {
  const base = settings.worktreeDir || join(process.env.MAVERICK_HOME || join(homedir(), '.maverick'), 'worktrees', `${basename(root)}-${sha256(root).slice(0, 8)}`);
  return join(base, task);
}

export function createWorktree({ cwd, task, state = {}, settings = {}, info = {}, taskDir }) {
  const branch = `maverick/loop/${task}`;
  const prefix = state.worktree?.prefix ?? info.prefix ?? '';
  const location = state.worktree?.path || worktreeLocation(info.root || cwd, task, settings);
  const workCwd = join(location, prefix);
  const mainMaverick = join(cwd, '.maverick'), workMaverick = join(workCwd, '.maverick');
  const self = {
    mode: 'worktree', workCwd, worktree: { path: location, branch, prefix, setup: state.worktree?.setup || [] },
    /** Creates the worktree and runs the setup commands once; on a resume, checks it is still there. */
    async prepare() {
      if (state.worktree) return self.attach();
      if (await exists(location)) throw new Error(`${location} already exists; remove it (maverick loop clean ${task}) or set loop.worktreeDir`);
      if (await resolveRef(cwd, `refs/heads/${branch}`)) throw new Error(`the branch ${branch} exists from an earlier loop; merge or delete it (maverick loop clean ${task} --delete-branch) before starting a worktree loop`);
      await mkdir(dirname(location), { recursive: true });
      await must(cwd, ['worktree', 'add', '-q', '-b', branch, location, 'HEAD']);
      await self.sync(taskDir);
      for (const command of settings.setup || []) {
        const result = await executeCommand(workCwd, command, '', 4000, { timeoutMs: (settings.setupTimeoutMinutes || 20) * 60000 });
        self.worktree.setup.push({ command, ok: result.ok, code: result.code ?? null });
        if (!result.ok) {
          await self.cleanup({ deleteBranch: true });
          throw new Error(`worktree setup failed: ${command} ${result.timedOut ? 'timed out' : `exited ${result.code}`}\n${result.output.trim().split('\n').slice(-5).join('\n')}`);
        }
      }
    },
    async attach() {
      if (!await exists(location)) throw new IntegrityError(`the loop's worktree ${location} is gone; start over with --new`);
      const current = (await git(workCwd, ['symbolic-ref', '-q', 'HEAD'])).stdout.trim();
      if (current !== `refs/heads/${branch}`) throw new IntegrityError(`the loop's worktree is not on ${branch}`);
    },
    /** The main checkout is the source of truth for the configuration and the task: mirror it in. */
    async sync(dir = taskDir) {
      await mkdir(workMaverick, { recursive: true });
      for (const name of ['config.json', 'policy.json']) {
        if (await exists(join(mainMaverick, name))) await cp(join(mainMaverick, name), join(workMaverick, name)); else await rm(join(workMaverick, name), { force: true });
      }
      await rm(join(workMaverick, 'flows'), { recursive: true, force: true });
      if (await exists(join(mainMaverick, 'flows'))) await cp(join(mainMaverick, 'flows'), join(workMaverick, 'flows'), { recursive: true });
      if (!dir) return;
      const taskRel = relative(cwd, dir), from = join(cwd, taskRel), to = join(workCwd, taskRel);
      if (!await exists(from)) return;
      await mkdir(to, { recursive: true });
      for (const entry of await readdir(from)) {
        if (['runs', 'loops'].includes(entry)) continue;
        await rm(join(to, entry), { recursive: true, force: true });
        await cp(join(from, entry), join(to, entry), { recursive: true });
      }
    },
    /**
     * Takes back what the agent may change in the worktree's mirror of the task: ticked boxes in
     * its subtask file. Any other edit to the mirrored configuration or task is reported; the next
     * sync overwrites it from the main checkout either way.
     */
    async harvest(taskDir, subtask) {
      const findings = [], taskRel = relative(cwd, taskDir);
      const pairs = [[join(mainMaverick, 'config.json'), join(workMaverick, 'config.json')], [join(mainMaverick, 'policy.json'), join(workMaverick, 'policy.json')]];
      for (const path of await files(join(workMaverick, 'flows'))) pairs.push([join(mainMaverick, relative(workMaverick, path)), path]);
      for (const path of await files(join(workCwd, taskRel))) if (!/[\\/](runs|loops)[\\/]/.test(relative(join(workCwd, taskRel), path)) && !REPORTS.includes(basename(path)) && !/^(LOOP.*|JUDGE-.*|FLOW-.*)\.md$/.test(basename(path))) pairs.push([join(taskDir, relative(join(workCwd, taskRel), path)), path]);
      for (const [main, mirror] of pairs) {
        const [a, b] = await Promise.all([readFile(main, 'utf8').catch(() => null), readFile(mirror, 'utf8').catch(() => null)]);
        if (a === b) continue;
        if (subtask && main === join(taskDir, 'subtasks', subtask.file) && a !== null && b !== null && checkboxOnlyChange(a, b)) { await writeFile(main, b); continue; }
        findings.push({ severity: 'block', kind: 'protected-path-modified', file: rel(cwd, main), message: 'the agent changed a file that defines the task or its checks; Maverick restored it' });
      }
      return { findings };
    },
    /** Copies the gates' reports from the worktree's task back to the main task. */
    async collect(taskDir) {
      const from = join(workCwd, relative(cwd, taskDir));
      for (const name of REPORTS) if (await exists(join(from, name))) await cp(join(from, name), join(taskDir, name));
    },
    async snapshot() {
      await must(workCwd, ['add', '-A', ...EXCLUDE]);
      return (await must(workCwd, ['write-tree'])).trim();
    },
    /** The first checkpoint: the branch as created, plus whatever the setup produced that git tracks. */
    async baseline(ref) {
      const head = (await must(workCwd, ['rev-parse', 'HEAD'])).trim(), tree = await self.snapshot(), headTree = (await must(workCwd, ['rev-parse', 'HEAD^{tree}'])).trim();
      const commit = tree === headTree ? head : (await must(workCwd, ['commit-tree', '--no-gpg-sign', '-p', head, tree], { env: IDENTITY, input: `maverick loop ${task}: setup\n` })).trim();
      if (commit !== head) await must(workCwd, ['update-ref', `refs/heads/${branch}`, commit, head]);
      await must(workCwd, ['update-ref', ref, commit, '0'.repeat(head.length)]);
      return { ref, commit, tree };
    },
    /** Accepted work becomes a commit on the loop's branch, and a hidden ref the ledger points at. */
    async checkpoint({ ref, tree, parent, message }) {
      const commit = (await must(workCwd, ['commit-tree', '--no-gpg-sign', '-p', parent, tree], { env: IDENTITY, input: message })).trim();
      await must(workCwd, ['update-ref', `refs/heads/${branch}`, commit, parent]);
      await must(workCwd, ['update-ref', ref, commit, '0'.repeat(parent.length)]);
      return { ref, commit, tree };
    },
    diff: (base, head, options) => treeDiff(workCwd, base, head, options),
    /** Back to a checkpoint: reset the branch and the files, remove what the iteration added, and prove it. */
    async rollback(target) {
      await must(workCwd, ['update-ref', `refs/heads/${branch}`, target.commit]);
      await must(workCwd, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
      await must(workCwd, ['reset', '-q', '--hard', target.commit]);
      const cleaned = (await must(workCwd, ['clean', '-fd', ...EXCLUDE])).split('\n').filter(Boolean).map(line => line.replace(/^Removing /, ''));
      if (await self.snapshot() !== target.tree) throw new IntegrityError('rollback did not converge: the worktree still differs from the checkpoint');
      return { restored: [], deleted: cleaned };
    },
    async captureInvariants() {
      return {
        head: await resolveRef(workCwd, 'HEAD'), branch: (await git(workCwd, ['symbolic-ref', '-q', 'HEAD'])).stdout.trim() || null,
        refs: (await git(cwd, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/maverick/loops/${task}/`])).stdout
      };
    },
    /** A commit or checkout in the worktree is undone (the files stay, so the iteration is judged and rolled back); forged loop refs end the loop. */
    async checkInvariants(before) {
      const fatal = [], findings = [];
      const refs = (await git(cwd, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/maverick/loops/${task}/`])).stdout;
      if (refs !== before.refs) fatal.push('the loop\'s checkpoint refs changed during the iteration');
      const head = await resolveRef(workCwd, 'HEAD'), current = (await git(workCwd, ['symbolic-ref', '-q', 'HEAD'])).stdout.trim() || null;
      if (head !== before.head || current !== before.branch) {
        await must(workCwd, ['update-ref', `refs/heads/${branch}`, before.head]);
        await must(workCwd, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
        await must(workCwd, ['reset', '-q', '--mixed', before.head]);
        findings.push({ severity: 'block', kind: 'git-history-modified', file: branch, message: 'the agent committed or checked out in the loop\'s worktree; Maverick put the branch back' });
      }
      return { fatal, findings };
    },
    async cleanup({ deleteBranch = false } = {}) {
      let removed = false, branchDeleted = false;
      if (await exists(location)) { removed = (await git(cwd, ['worktree', 'remove', '--force', location])).ok; if (!removed) { await rm(location, { recursive: true, force: true }); removed = true; } }
      await git(cwd, ['worktree', 'prune']);
      if (deleteBranch) branchDeleted = (await git(cwd, ['branch', '-D', '-q', branch])).ok;
      return { path: location, removed, branch, branchDeleted };
    }
  };
  return self;
}
