import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';
import { parseJson } from './util.js';

// Opening a task's pull request. The remote's URL says which provider hosts the repository
// (GitHub, GitLab, Azure DevOps or Bitbucket; `pr.provider` when the host does not say), and the
// provider's own CLI opens it: `gh`, `glab` or `az repos`. Without that CLI the branch is still
// pushed and the provider's "new pull request" page is returned instead. Maverick commits only
// the change the gates checked (everything outside .maverick/), never force-pushes, never skips
// hooks and never merges.

export const PROVIDERS = {
  github: { name: 'GitHub', cli: 'gh' },
  gitlab: { name: 'GitLab', cli: 'glab' },
  azure: { name: 'Azure DevOps', cli: 'az' },
  bitbucket: { name: 'Bitbucket', cli: null }
};

// Every CLI runs without a terminal: a prompt would hang the gate instead of failing it.
const QUIET = { GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', NO_PROMPT: '1', AZURE_CORE_ONLY_SHOW_ERRORS: '1' };

function run(cwd, bin, args, { input, timeoutMs = 120000 } = {}) {
  return new Promise(resolve => {
    let child, stdout = '', stderr = '', settled = false;
    const done = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child?.kill('SIGTERM'); done({ ok: false, code: null, stdout, stderr: `${bin} timed out after ${Math.round(timeoutMs / 1000)}s` }); }, timeoutMs);
    try { child = spawn(bin, args, { cwd, env: { ...process.env, ...QUIET }, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); } catch (error) { done({ ok: false, code: null, stdout, stderr: error.message, missing: error.code === 'ENOENT' }); return; }
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => done({ ok: false, code: null, stdout, stderr: error.message, missing: error.code === 'ENOENT' }));
    child.on('close', code => done({ ok: code === 0, code, stdout, stderr }));
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

/** The last lines a failed command printed, for an error message. */
const tail = result => (result.stderr || result.stdout || `exit ${result.code}`).trim().split('\n').slice(-3).join(' ').slice(0, 400);

/**
 * `{ host, path }` of a remote URL (scp-like `git@host:owner/repo`, ssh, git or http(s)), with
 * credentials and `.git` removed; null for a local path or file URL.
 */
export function parseRemote(url = '') {
  const text = String(url).trim();
  const full = text.match(/^(?:ssh|git|https?|git\+ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i);
  // scp-like syntax has no slash before the colon; a one-letter "host" is a Windows drive.
  const scp = !full && text.match(/^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/);
  const match = full || scp;
  if (!match) return null;
  const path = match[2].replace(/\/+$/, '').replace(/\.git$/, '').replace(/^\/+/, '');
  return path ? { host: match[1].toLowerCase(), path } : null;
}

/** The provider a host belongs to, or null when the host does not say. */
export function providerOf(host = '') {
  const name = host.toLowerCase();
  if (name === 'dev.azure.com' || name === 'ssh.dev.azure.com' || name.endsWith('.visualstudio.com')) return 'azure';
  if (name.includes('github')) return 'github';
  if (name.includes('gitlab')) return 'gitlab';
  if (name === 'bitbucket.org') return 'bitbucket';
  return null;
}

// An ssh host alias (`git@github-work:…`) or ssh endpoint has no web pages of its own.
const PUBLIC_HOST = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' };
const webHost = (host, provider) => (host === 'ssh.github.com' || !host.includes('.') ? PUBLIC_HOST[provider] || host : host);
const segment = value => encodeURIComponent(decodeURIComponent(value));

/**
 * Where a repository lives on its provider: the provider, its web address and the identifiers its
 * CLI takes. `override` (`pr.provider`) decides when the host does not. Null for local remotes.
 */
export function repository(url, override) {
  const remote = parseRemote(url);
  if (!remote) return null;
  const provider = override || providerOf(remote.host);
  if (!provider) return { provider: null, host: remote.host, path: remote.path };
  if (provider === 'azure') {
    // ssh: v3/org/project/repo · https: org/project/_git/repo, or [DefaultCollection/]project/_git/repo on org.visualstudio.com.
    const parts = remote.path.split('/'), at = parts.indexOf('_git');
    const [org, project, name] = parts[0] === 'v3' ? parts.slice(1, 4) : [remote.host.endsWith('.visualstudio.com') ? remote.host.split('.')[0] : parts[0], parts[at - 1], parts[at + 1]];
    if (!org || !project || !name) return { provider: null, host: remote.host, path: remote.path };
    const organization = `https://dev.azure.com/${segment(org)}`;
    return { provider, host: remote.host, path: remote.path, organization, project: decodeURIComponent(project), name: decodeURIComponent(name), web: `${organization}/${segment(project)}/_git/${segment(name)}` };
  }
  const host = webHost(remote.host, provider);
  return { provider, host, path: remote.path, web: `https://${host}/${remote.path}`, slug: host === 'github.com' ? remote.path : `${host}/${remote.path}` };
}

const ref = name => name.split('/').map(encodeURIComponent).join('/');

/** The provider's page for opening a pull request from `branch` into `base` by hand. */
export function newPullRequestUrl(repo, branch, base) {
  if (!repo?.web) return null;
  if (repo.provider === 'github') return `${repo.web}/compare/${ref(base)}...${ref(branch)}?expand=1`;
  if (repo.provider === 'gitlab') return `${repo.web}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(base)}`;
  if (repo.provider === 'azure') return `${repo.web}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}&targetRef=${encodeURIComponent(base)}`;
  if (repo.provider === 'bitbucket') return `${repo.web}/pull-requests/new?source=${encodeURIComponent(branch)}&dest=${encodeURIComponent(base)}`;
  return null;
}

// Each provider CLI finds the pull request already open for the branch, or opens one.
// `find` returns { missing } when the CLI is not installed, and null when there is none.
const ADAPTERS = {
  github: {
    async find({ exec, repo, branch }) {
      const result = await exec('gh', ['pr', 'list', '--repo', repo.slug, '--head', branch, '--state', 'open', '--json', 'url,number', '--limit', '1']);
      if (result.missing) return { missing: true };
      const found = result.ok ? parseJson(result.stdout)?.[0] : null;
      return found?.url ? { url: found.url, number: found.number } : null;
    },
    async create({ exec, repo, branch, base, title, body, draft }) {
      const result = await exec('gh', ['pr', 'create', '--repo', repo.slug, '--base', base, '--head', branch, '--title', title, '--body-file', '-', ...(draft ? ['--draft'] : [])], { input: body });
      const url = result.ok && result.stdout.match(/https?:\/\/\S+\/pull\/\d+/)?.[0];
      return url ? { url, number: Number(url.split('/').pop()) } : { error: tail(result) };
    }
  },
  gitlab: {
    async find({ exec, repo, branch }) {
      const result = await exec('glab', ['mr', 'list', '--repo', repo.web, '--source-branch', branch, '--output', 'json']);
      if (result.missing) return { missing: true };
      const found = result.ok ? parseJson(result.stdout)?.[0] : null;
      return found?.web_url ? { url: found.web_url, number: found.iid } : null;
    },
    async create({ exec, repo, branch, base, title, body, draft }) {
      const result = await exec('glab', ['mr', 'create', '--repo', repo.web, '--source-branch', branch, '--target-branch', base, '--title', title, '--description', body, '--yes', ...(draft ? ['--draft'] : [])]);
      const url = result.ok && `${result.stdout}\n${result.stderr}`.match(/https?:\/\/\S+\/-\/merge_requests\/\d+/)?.[0];
      return url ? { url, number: Number(url.split('/').pop()) } : { error: tail(result) };
    }
  },
  azure: {
    async find({ exec, repo, branch, base }) {
      const result = await exec('az', ['repos', 'pr', 'list', '--organization', repo.organization, '--project', repo.project, '--repository', repo.name, '--source-branch', branch, '--target-branch', base, '--status', 'active', '--output', 'json']);
      if (result.missing) return { missing: true };
      const found = result.ok ? parseJson(result.stdout)?.[0] : null;
      return found?.pullRequestId ? { url: `${repo.web}/pullrequest/${found.pullRequestId}`, number: found.pullRequestId } : null;
    },
    async create({ exec, repo, branch, base, title, body, draft }) {
      const result = await exec('az', ['repos', 'pr', 'create', '--organization', repo.organization, '--project', repo.project, '--repository', repo.name, '--source-branch', branch, '--target-branch', base, '--title', title, '--description', body, '--output', 'json', ...(draft ? ['--draft', 'true'] : [])]);
      const id = result.ok && parseJson(result.stdout)?.pullRequestId;
      return id ? { url: `${repo.web}/pullrequest/${id}`, number: id } : { error: tail(result) };
    }
  }
};

async function defaultBranch(git, remote) {
  const head = (await git(['symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`])).stdout.trim();
  if (head.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
  for (const name of ['main', 'master']) if ((await git(['rev-parse', '--verify', '-q', `refs/remotes/${remote}/${name}`])).ok) return name;
  for (const name of ['main', 'master']) if ((await git(['rev-parse', '--verify', '-q', `refs/heads/${name}`])).ok) return name;
  throw new Error(`cannot tell the base branch of ${remote}; set pr.base in .maverick/config.json`);
}

/**
 * The pull request's title and description from PR-DRAFT.md: the heading is the title and the
 * rest is the description. Drafts written before the heading was the title fall back to `title`.
 */
export function splitDraft(text, title) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n'), at = lines.findIndex(line => /^#\s+\S/.test(line));
  const heading = at >= 0 ? lines[at].replace(/^#\s+/, '').trim() : '';
  return { title: (heading && !/^PR Draft\b/i.test(heading) ? heading : title).slice(0, 200), body: (at >= 0 ? lines.slice(at + 1) : lines).join('\n').trim() };
}

/**
 * Pushes the task's change and opens its pull request, or finds the one already open, so it can
 * run again safely. `settings` is the `pr` configuration: provider, remote, base, draft, commit.
 * On the base branch (or a detached HEAD) the change moves to `maverick/<task>` first; uncommitted
 * changes outside .maverick/ are committed with the title, through the repository's hooks.
 */
export async function openPullRequest(cwd, { task, title, body, settings = {}, timeoutMs, beforePush }) {
  const exec = (bin, args, options) => run(cwd, bin, args, { timeoutMs, ...options });
  const git = args => exec('git', args);
  const must = async (args, what) => { const result = await git(args); if (!result.ok) throw new Error(`${what} failed: ${tail(result)}`); return result.stdout.trim(); };
  if (!(await git(['rev-parse', '--is-inside-work-tree'])).ok) throw new Error('not a git repository: a pull request needs one');
  const current = (await git(['symbolic-ref', '-q', '--short', 'HEAD'])).stdout.trim();
  const remotes = (await git(['remote'])).stdout.split('\n').map(line => line.trim()).filter(Boolean);
  const upstream = current ? (await git(['config', '--get', `branch.${current}.remote`])).stdout.trim() : '';
  const remote = settings.remote || (remotes.includes(upstream) ? upstream : remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : '');
  if (!remote) throw new Error(remotes.length ? `several git remotes (${remotes.join(', ')}); choose one with pr.remote in .maverick/config.json` : 'no git remote to push to; add one with: git remote add origin <url>');
  if (!remotes.includes(remote)) throw new Error(`git remote "${remote}" (pr.remote) does not exist; remotes: ${remotes.join(', ') || 'none'}`);
  // The configured URL, not the one insteadOf rewrites to: it is the one that names the provider.
  const repo = repository((await git(['config', '--get', `remote.${remote}.url`])).stdout.trim(), settings.provider);
  const base = settings.base || await defaultBranch(git, remote);
  // Exactly what the gates checked: every change outside .maverick/, tracked or new.
  const scope = ['--', '.', ':(exclude).maverick'];
  const dirty = (await git(['status', '--porcelain', '--untracked-files=all', ...scope])).stdout.trim();
  const remoteBase = `refs/remotes/${remote}/${base}`, known = (await git(['rev-parse', '--verify', '-q', remoteBase])).ok;
  const ahead = known ? Number((await git(['rev-list', '--count', `${remoteBase}..HEAD`])).stdout.trim()) || 0 : null;
  if (!dirty && ahead === 0) throw new Error(`nothing to open: no uncommitted change and ${current || 'HEAD'} has no commit ahead of ${remote}/${base}`);
  if (dirty && settings.commit === false) throw new Error(`${dirty.split('\n').length} uncommitted change(s) and pr.commit is off; commit them, then run again`);
  let branch = current, createdBranch = false, commit = null;
  if (!branch || branch === base) {
    branch = `maverick/${task}`;
    if ((await git(['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).ok) throw new Error(`you are on ${current || 'a detached HEAD'} and the branch ${branch} already exists; switch to it (git switch ${branch}) and run again`);
    await must(['checkout', '-q', '-b', branch], `creating the branch ${branch}`);
    createdBranch = true;
  }
  if (dirty) {
    await must(['add', '-A', ...scope], 'staging the change');
    await must(['commit', '-q', '-m', title, '-m', `Maverick task: ${task}`, ...scope], 'git commit');
    commit = await must(['rev-parse', '--short', 'HEAD'], 'reading the commit');
  }
  // What travels with the commit (a signed proof receipt in a git note) is made before the push.
  const extra = beforePush ? await beforePush() : null;
  await must(['push', '-u', remote, branch], `git push ${remote} ${branch}`);
  const result = { provider: repo?.provider || null, providerName: PROVIDERS[repo?.provider]?.name || null, cli: PROVIDERS[repo?.provider]?.cli || null, remote, branch, base, createdBranch, commit, pushed: true };
  for (const ref of extra?.refs || []) {
    // Never forced: notes someone else pushed are kept, and the push is reported instead.
    const pushed = await git(['push', remote, `${ref}:${ref}`]);
    (result.refs ||= []).push({ ref, pushed: pushed.ok, ...(pushed.ok ? {} : { reason: tail(pushed) }) });
  }
  if (extra?.proof) result.proof = extra.proof;
  const page = newPullRequestUrl(repo, branch, base);
  if (!repo?.provider) return { ...result, opened: false, url: null, reason: `the provider of ${repo ? repo.host : `the ${remote} remote`} is unknown; set pr.provider (${Object.keys(PROVIDERS).join(', ')})` };
  const adapter = ADAPTERS[repo.provider];
  if (!adapter) return { ...result, opened: false, url: page, reason: `${result.providerName} has no CLI Maverick can use; open the pull request on its page` };
  const context = { exec, repo, branch, base, title, body, draft: Boolean(settings.draft) };
  const found = await adapter.find(context);
  if (found?.missing) return { ...result, opened: false, url: page, reason: `${result.cli} is not installed; install it to open pull requests from Maverick` };
  if (found) return { ...result, opened: true, existing: true, ...found };
  const created = await adapter.create(context);
  if (created.error) throw new Error(`${result.cli} could not open the pull request: ${created.error}. ${branch} is pushed; fix this and run again, or open it at ${page}`);
  return { ...result, opened: true, existing: false, ...created };
}
