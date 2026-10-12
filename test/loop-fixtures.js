import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';

// Shared by the loop tests: a git repository with a planned task, a project oracle and fake
// agent CLIs that run a per-test behavior. Import after setting MAVERICK_HOME.

export const node = process.execPath;
export const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A fake agent CLI that runs a per-test behavior and answers in the provider's stream format.
// It lives outside the repository, so snapshots and rollbacks never see it.
export async function fakeAgent(binDir, id, behavior) {
  await writeFile(join(binDir, `behavior-${id}.mjs`), `import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const tick = file => writeFileSync(file, readFileSync(file, 'utf8').replaceAll('- [ ]', '- [x]'));
const write = (file, text) => { mkdirSync(file.split('/').slice(0, -1).join('/') || '.', { recursive: true }); writeFileSync(file, text); };
export default async function ({ prompt, iteration, subtask, cwd, call }) { ${behavior} }
`);
  const path = join(binDir, `fake-${id}.mjs`);
  const emit = id === 'codex'
    ? `out({ type: 'thread.started', thread_id: 't' }); out({ type: 'item.completed', item: { type: 'agent_message', text } }); out({ type: 'turn.completed', ...(r.usage && { usage: r.usage }) });`
    : `out({ type: 'system', subtype: 'init', session_id: 's' }); out({ type: 'assistant', message: { content: [{ type: 'text', text }] } }); out({ type: 'result', subtype: 'success', is_error: false, result: text, total_cost_usd: r.cost ?? 0.01, ...(r.usage && { usage: r.usage }) });`;
  await writeFile(path, `#!/usr/bin/env node
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import behave from './behavior-${id}.mjs';
const prompt = readFileSync(0, 'utf8');
const log = new URL('./calls-${id}.jsonl', import.meta.url);
const call = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\\n').length + 1 : 1;
const iteration = Number(prompt.match(/You are iteration (\\d+)/)?.[1] || 0);
const subtask = prompt.match(/## Current subtask (\\d+)/)?.[1] || null;
appendFileSync(log, JSON.stringify({ argv: process.argv.slice(2), prompt, iteration, subtask, cwd: process.cwd() }) + '\\n');
const out = event => console.log(JSON.stringify(event));
const r = (await behave({ prompt, iteration, subtask, cwd: process.cwd(), call })) || {};
const block = { status: r.status || 'done', summary: r.summary || 'did it', questions: r.questions || [], filesChanged: r.filesChanged || [], notes: r.notes || [], disputes: r.disputes || [] };
const text = r.text ?? 'Done.\\n\\x60\\x60\\x60maverick-result\\n' + JSON.stringify(block) + '\\n\\x60\\x60\\x60';
${emit}
`);
  await chmod(path, 0o755);
  return path;
}

export const CHECK = `import { readFileSync, existsSync } from 'node:fs';
const files = JSON.parse(readFileSync('checks.json', 'utf8'));
let failed = 0;
files.forEach((file, index) => { const ok = existsSync(file); if (!ok) failed += 1; console.log((ok ? 'ok ' : 'not ok ') + (index + 1) + ' - has ' + file); });
process.exit(failed ? 1 : 0);
`;

export const SUBTASK = (title, file) => `---\ntitle: ${title}\nstatus: pending\n---\n\n# ${title}\n\n## Goal\nCreate ${file}.\n\n## Acceptance Criteria\n- [ ] AC-01: ${file} exists\n\n## Files\n- \`${file}\` (new)\n\n## Steps\n- [ ] Write ${file}\n`;

/**
 * A git repository with a planned task, a project oracle (`checks`: every file in checks.json
 * exists; `keep`: src/keep.txt still says ok) and fake claude and codex CLIs.
 */
export async function loopProject({ agents = {}, config = {}, subtasks = [['Create a', 'src/a.txt'], ['Create b', 'src/b.txt']], checks = ['src/a.txt', 'src/b.txt'], files = {} } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-loop-')), binDir = await mkdtemp(join(tmpdir(), 'maverick-bin-'));
  const bins = {};
  for (const [id, behavior] of Object.entries({ claude: '', codex: '', ...agents })) bins[id] = await fakeAgent(binDir, id, behavior);
  await writeFile(join(cwd, 'check.mjs'), CHECK);
  await writeFile(join(cwd, 'keep.mjs'), `import { readFileSync } from 'node:fs'; process.exit(readFileSync('src/keep.txt', 'utf8').trim() === 'ok' ? 0 : 1);\n`);
  await writeFile(join(cwd, 'checks.json'), JSON.stringify(checks));
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeFile(join(cwd, 'src/keep.txt'), 'ok\n');
  for (const [path, content] of Object.entries(files)) { await mkdir(join(cwd, path, '..'), { recursive: true }); await writeFile(join(cwd, path), content); }
  await mkdir(join(cwd, '.maverick/flows'), { recursive: true });
  await writeFile(join(cwd, '.maverick/flows/loop.yaml'), `apiVersion: maverick.flow/v1\nname: loop\ndescription: Test oracle for the loop engine.\ncontract:\n  goal: Every file the task needs exists.\n  noProgressWindow: 2\ngates:\n  - { id: checks, type: check }\n  - { id: keep, type: command, run: '"${node}" keep.mjs' }\n`);
  const { loop, runtime, ...rest } = config;
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({
    version: 1, verification: { commands: [`"${node}" check.mjs`] },
    runtime: { trusted: ['claude-code', 'codex'], default: { provider: 'claude-code' }, bins: { 'claude-code': bins.claude, codex: bins.codex }, ...runtime },
    loop: { budgets: { maxIterations: 8 }, ...loop }, ...rest
  }, null, 2));
  await captureOutput(() => main(['new', 'Demo idea', '--slug', 'demo', '--no-launch'], cwd));
  for (const [index, [title, file]] of subtasks.entries()) {
    await captureOutput(() => main(['subtask', 'add', 'demo', title, ...(index ? ['--after', String(index).padStart(2, '0')] : [])], cwd));
    await writeFile(join(cwd, `.maverick/tasks/demo/subtasks/task_${String(index + 1).padStart(2, '0')}.md`), SUBTASK(title, file));
  }
  sh(cwd, 'init', '-q', '-b', 'main'); sh(cwd, 'config', 'user.email', 't@example.com'); sh(cwd, 'config', 'user.name', 'T');
  sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-qm', 'init');
  return { cwd, binDir };
}

export const calls = async (binDir, id) => { try { return (await readFile(join(binDir, `calls-${id}.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line)); } catch { return []; } };
export const run = (cwd, ...args) => captureOutput(() => main(['loop', ...args], cwd));
export const fails = async (cwd, args, pattern) => { const error = await run(cwd, ...args).then(() => null, err => err); assert.ok(error, `expected loop ${args.join(' ')} to fail`); assert.match(error.message, pattern); return error; };
export const state = async cwd => { const dir = join(cwd, '.maverick/tasks/demo/loops'); const [id] = (await readdir(dir)).filter(name => /^\d{8}-/.test(name)).sort().reverse(); return JSON.parse(await readFile(join(dir, id, 'state.json'), 'utf8')); };
export const status = async (cwd, id) => (await readFile(join(cwd, `.maverick/tasks/demo/subtasks/task_${id}.md`), 'utf8')).match(/status: (\S+)/)[1];

// The well-behaved agent: writes the subtask's file and ticks its boxes.
export const BUILD = `const file = { '01': 'src/a.txt', '02': 'src/b.txt' }[subtask]; if (file) { write(file, 'x'); tick('.maverick/tasks/demo/subtasks/task_' + subtask + '.md'); }`;
