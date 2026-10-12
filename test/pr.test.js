import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { main } from '../src/cli.js';
import { readState } from '../src/flows/engine.js';
import { listTasks } from '../src/core/tasks.js';
import { captureOutput } from '../src/core/util.js';
import { newPullRequestUrl, parseRemote, providerOf, repository, splitDraft } from '../src/core/pull-request.js';
import { planTask } from './fixtures.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

test('the remote URL says which provider hosts the repository, and where', () => {
  assert.deepEqual(parseRemote('git@github.com:acme/app.git'), { host: 'github.com', path: 'acme/app' });
  assert.deepEqual(parseRemote('https://user:secret@github.com/acme/app.git'), { host: 'github.com', path: 'acme/app' }, 'credentials are dropped');
  assert.deepEqual(parseRemote('ssh://git@gitlab.example.com:2222/group/sub/app.git'), { host: 'gitlab.example.com', path: 'group/sub/app' });
  assert.equal(parseRemote('/srv/git/app.git'), null);
  assert.equal(parseRemote('C:\\repos\\app'), null, 'a Windows path is not scp syntax');

  assert.deepEqual(['github.com', 'github.acme.io', 'gitlab.com', 'git.gitlab.acme.io', 'dev.azure.com', 'acme.visualstudio.com', 'bitbucket.org', 'git.acme.io'].map(providerOf), ['github', 'github', 'gitlab', 'gitlab', 'azure', 'azure', 'bitbucket', null]);

  assert.equal(repository('git@github.com:acme/app.git').slug, 'acme/app');
  assert.equal(repository('https://github.acme.io/acme/app').slug, 'github.acme.io/acme/app', 'GitHub Enterprise names its host');
  assert.equal(repository('git@github-work:acme/app.git').web, 'https://github.com/acme/app', 'an ssh host alias maps to the public host');
  assert.equal(repository('https://git.acme.io/team/app.git', 'gitlab').web, 'https://git.acme.io/team/app', 'pr.provider decides for an unknown host');
  assert.equal(repository('https://git.acme.io/team/app.git').provider, null);

  const azure = ['https://acme@dev.azure.com/acme/Shop%20Web/_git/app', 'git@ssh.dev.azure.com:v3/acme/Shop%20Web/app', 'https://acme.visualstudio.com/DefaultCollection/Shop%20Web/_git/app'].map(url => repository(url));
  for (const repo of azure) assert.deepEqual([repo.provider, repo.organization, repo.project, repo.name, repo.web], ['azure', 'https://dev.azure.com/acme', 'Shop Web', 'app', 'https://dev.azure.com/acme/Shop%20Web/_git/app']);

  assert.equal(newPullRequestUrl(repository('git@github.com:acme/app.git'), 'maverick/demo', 'main'), 'https://github.com/acme/app/compare/main...maverick/demo?expand=1');
  assert.equal(newPullRequestUrl(repository('git@gitlab.com:acme/app.git'), 'maverick/demo', 'main'), 'https://gitlab.com/acme/app/-/merge_requests/new?merge_request%5Bsource_branch%5D=maverick%2Fdemo&merge_request%5Btarget_branch%5D=main');
  assert.equal(newPullRequestUrl(azure[0], 'maverick/demo', 'main'), 'https://dev.azure.com/acme/Shop%20Web/_git/app/pullrequestcreate?sourceRef=maverick%2Fdemo&targetRef=main');
  assert.equal(newPullRequestUrl(repository('git@bitbucket.org:acme/app.git'), 'maverick/demo', 'main'), 'https://bitbucket.org/acme/app/pull-requests/new?source=maverick%2Fdemo&dest=main');
});

test('the draft heading is the pull request title and the rest its description', () => {
  assert.deepEqual(splitDraft('# Paginate orders\n\n## Summary\nWhy.\n', 'fallback'), { title: 'Paginate orders', body: '## Summary\nWhy.' });
  assert.equal(splitDraft('# PR Draft — demo\n\n## Summary\n', 'Paginate orders').title, 'Paginate orders', 'drafts from older versions use the task title');
});

const PROVIDER_CLI = `#!/usr/bin/env node
const fs = require('fs'), log = process.env.FAKE_CLI_LOG, args = process.argv.slice(2);
fs.appendFileSync(log, JSON.stringify(args) + '\\n');
if (args[1] === 'list') { process.stdout.write(fs.existsSync(log + '.body') ? '[{"url":"https://github.com/acme/app/pull/7","number":7}]' : '[]'); process.exit(0); }
let body = ''; process.stdin.on('data', chunk => { body += chunk; }).on('end', () => { fs.writeFileSync(log + '.body', body); console.log('https://github.com/acme/app/pull/7'); });
`;

/** A planned, reviewed task in a git repository whose `origin` names `url` but pushes to a local bare repository. */
async function reviewedProject(url) {
  const root = await mkdtemp(join(tmpdir(), 'maverick-pr-')), cwd = join(root, 'app'), remote = join(root, 'remote.git');
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
  await mkdir(cwd);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  await captureOutput(() => main(['new', 'Paginate orders', '--slug', 'demo', '--no-launch'], cwd));
  const dir = await planTask(cwd, 'demo');
  await captureOutput(() => main(['subtask', 'set', 'demo', '01', 'done', '--force'], cwd));
  await writeFile(join(dir, 'REVIEW.md'), '# Review\n\n## Decision\n- [x] approve\n- [ ] request changes\n');
  for (const file of ['EVIDENCE.md', 'REVIEW-FINDINGS.md', 'SECURITY-REPORT.md', 'DEPENDENCY-REVIEW.md', 'SCOPE-GUARD.md']) await writeFile(join(dir, file), `# ${file}\n\n## PASS\n`);
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T');
  git('remote', 'add', 'origin', url); git('config', `url.${remote}.insteadOf`, url);
  git('add', '-A'); git('commit', '-qm', 'init'); git('push', '-q', 'origin', 'main');
  await writeFile(join(cwd, 'src/orders/cursor.js'), 'export const encode = id => Buffer.from(String(id)).toString("base64");\n');
  return { cwd, dir, remote, git };
}

async function withProviderCli(name, fn) {
  const bin = await mkdtemp(join(tmpdir(), 'maverick-bin-')), log = join(bin, 'calls.log'), saved = { PATH: process.env.PATH, FAKE_CLI_LOG: process.env.FAKE_CLI_LOG };
  await writeFile(join(bin, name), PROVIDER_CLI); await chmod(join(bin, name), 0o755);
  Object.assign(process.env, { PATH: `${bin}${delimiter}${process.env.PATH}`, FAKE_CLI_LOG: log });
  try { return await fn({ calls: async () => (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), body: () => readFile(`${log}.body`, 'utf8') }); } finally { Object.assign(process.env, saved); if (saved.FAKE_CLI_LOG === undefined) delete process.env.FAKE_CLI_LOG; }
}

const unix = { skip: process.platform === 'win32' && 'the fake provider CLI is a shebang script' };

test('the pr flow waits for the draft approval, then commits, pushes and opens the pull request on GitHub', unix, async () => {
  const { cwd, dir, remote, git } = await reviewedProject('https://github.com/acme/app.git');
  await withProviderCli('gh', async cli => {
    await assert.rejects(main(['flow', 'run', 'pr', 'demo'], cwd), /outcome: awaiting-approval/);
    const waiting = (await readState(dir, 'pr')).runs.at(-1).results;
    assert.deepEqual(waiting.map(result => [result.id, result.status]), [['review', 'pass'], ['readiness', 'pass'], ['draft', 'pass'], ['approval', 'pending'], ['open', 'skipped']]);
    assert.equal(waiting.at(-1).summary, 'waits for approval', 'nothing is pushed before the approval');
    assert.match(await readFile(join(dir, 'PR-DRAFT.md'), 'utf8'), /^# Paginate the orders list\n/, 'the draft heading is the title');
    assert.equal(git('branch', '--show-current'), 'main');

    await captureOutput(() => main(['flow', 'approve', 'pr', 'demo', 'approval', '--by', 'ana'], cwd));
    const state = await readState(dir, 'pr');
    assert.equal(state.status, 'done', 'approving opens the pull request at once');
    assert.equal(state.runs.at(-1).results.at(-1).summary, 'pull request #7 opened on GitHub: https://github.com/acme/app/pull/7');
    assert.equal(git('branch', '--show-current'), 'maverick/demo', 'the change left the base branch');
    assert.equal(git('log', '-1', '--format=%s'), 'Paginate the orders list');
    assert.equal(git('status', '--porcelain', '--', '.', ':(exclude).maverick'), '', 'the whole change outside .maverick/ was committed');
    assert.equal(execFileSync('git', ['rev-parse', 'maverick/demo'], { cwd: remote }).toString().trim(), git('rev-parse', 'HEAD'), 'and pushed');
    const create = (await cli.calls()).find(args => args[1] === 'create');
    assert.deepEqual(create.slice(0, 12), ['pr', 'create', '--repo', 'acme/app', '--base', 'main', '--head', 'maverick/demo', '--title', 'Paginate the orders list', '--body-file', '-']);
    assert.match(await cli.body(), /^## Summary[\s\S]*- \[x\] Scope, behavior, tests/, 'the description is the approved draft');
    const meta = JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8'));
    assert.deepEqual([meta.pullRequest.provider, meta.pullRequest.url, meta.pullRequest.number, meta.pullRequest.opened], ['github', 'https://github.com/acme/app/pull/7', 7, true]);

    // Running again finds the open pull request instead of opening a second one.
    await captureOutput(() => main(['flow', 'run', 'pr', 'demo'], cwd));
    assert.equal((await cli.calls()).filter(args => args[1] === 'create').length, 1);
    assert.match((await readState(dir, 'pr')).runs.at(-1).results.at(-1).summary, /pull request #7 open on GitHub/);
  });

  // Finishing: only at the PR stage without --force, undone by reopen.
  assert.equal((await listTasks(cwd)).find(task => task.task === 'demo').stage, 'pr');
  await captureOutput(() => main(['done', 'demo', '--by', 'ana', '--note', 'merged'], cwd));
  const finished = (await listTasks(cwd)).find(task => task.task === 'demo');
  assert.deepEqual([finished.stage, finished.stages.at(-1)], ['done', 'done']);
  assert.deepEqual([JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8')).done.by, JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8')).done.note], ['ana', 'merged']);
  await assert.rejects(main(['done', 'demo'], cwd), /already finished/);
  await captureOutput(() => main(['reopen', 'demo'], cwd));
  assert.equal((await listTasks(cwd)).find(task => task.task === 'demo').stage, 'pr');
  await assert.rejects(main(['reopen', 'demo'], cwd), /not finished/);
});

test('auto-approval opens the pull request in one run; without a provider CLI the branch is pushed and its page given', unix, async () => {
  const { cwd, dir, remote, git } = await reviewedProject('git@bitbucket.org:acme/app.git');
  git('checkout', '-q', '-b', 'feat/orders');
  await captureOutput(() => main(['flow', 'run', 'pr', 'demo', '--auto-approve'], cwd));
  const state = await readState(dir, 'pr');
  assert.equal(state.status, 'done');
  assert.equal(state.approvals.approval.by, 'auto-approve');
  assert.match(await readFile(join(dir, 'PR-DRAFT.md'), 'utf8'), /- \[x\] Scope[^\n]*\n {2}> Auto-approved by Maverick/);
  assert.equal(state.runs.at(-1).results.at(-1).summary, 'feat/orders pushed; Bitbucket has no CLI Maverick can use; open the pull request on its page: https://bitbucket.org/acme/app/pull-requests/new?source=feat%2Forders&dest=main');
  assert.equal(git('branch', '--show-current'), 'feat/orders', 'a feature branch is used as it is');
  assert.equal(execFileSync('git', ['rev-parse', 'feat/orders'], { cwd: remote }).toString().trim(), git('rev-parse', 'HEAD'));
  assert.equal(JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8')).pullRequest.opened, false);
});

test('done before the PR stage needs --force, and pr open explains what is missing', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-done-'));
  await captureOutput(() => main(['new', 'Paginate orders', '--slug', 'demo', '--no-launch'], cwd));
  await assert.rejects(main(['done', 'demo'], cwd), /at the PRD stage, not PR[\s\S]*--force/);
  await captureOutput(() => main(['done', 'demo', '--force'], cwd));
  assert.equal(JSON.parse(await readFile(join(cwd, '.maverick/tasks/demo/TASK.json'), 'utf8')).done.stage, 'prd', 'the stage it was finished at is kept');
  await captureOutput(() => main(['reopen', 'demo'], cwd));
  await assert.rejects(main(['pr', 'open', 'demo'], cwd), /PR-DRAFT\.md is missing/);
  await captureOutput(() => main(['pr', 'demo'], cwd));
  await assert.rejects(main(['pr', 'open', 'demo'], cwd), /not a git repository/);
});
