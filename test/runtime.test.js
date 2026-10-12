import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';
import { runHooks } from '../src/runtime/hooks.js';
import { resolveRun } from '../src/runtime/policy.js';
import { HEADLESS_RULES, parseResultBlock } from '../src/runtime/prompt.js';
import { BUILTIN_PROVIDERS, providersFor } from '../src/runtime/providers.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

const byId = Object.fromEntries(BUILTIN_PROVIDERS.map(provider => [provider.id, provider]));
const result = (status, summary = 'did it') => `\`\`\`maverick-result\n${JSON.stringify({ status, summary })}\n\`\`\``;

/** A fake `claude` that speaks stream-json, records its argv and stdin, and runs a scripted action. */
async function fakeClaude(dir, action = '') {
  const path = join(dir, 'fake-claude.mjs');
  await writeFile(path, `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const prompt = readFileSync(0, 'utf8');
appendFileSync('.fake-calls.jsonl', JSON.stringify({ argv: process.argv.slice(2), prompt }) + '\\n');
const out = event => console.log(JSON.stringify(event));
out({ type: 'system', subtype: 'init', session_id: 'sess-1' });
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.js' } }] } });
${action}
const text = process.env.FAKE_TEXT ?? ${JSON.stringify(`Done.\n${result('done')}`)};
out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
out({ type: 'result', subtype: 'success', is_error: false, result: text, total_cost_usd: 0.0123 });
`);
  await chmod(path, 0o755);
  return path;
}

async function project({ runtime = {}, hooks, files = {}, action } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-agent-'));
  const bin = await fakeClaude(cwd, action);
  for (const [path, content] of Object.entries(files)) { await mkdir(join(cwd, path, '..'), { recursive: true }); await writeFile(join(cwd, path), content); }
  await mkdir(join(cwd, '.maverick'), { recursive: true });
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ runtime: { trusted: ['claude-code'], default: { provider: 'claude-code' }, bins: { 'claude-code': bin }, ...runtime }, ...(hooks && { hooks }) }));
  await main(['new', 'Demo idea', '--slug', 'demo', '--no-launch'], cwd);
  await writeFile(join(cwd, '.maverick/tasks/demo/PRD.md'), '# PRD — Demo\n\n## Overview\nDemo task.\n');
  return cwd;
}
const calls = async cwd => (await readFile(join(cwd, '.fake-calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const quiet = argv => captureOutput(() => main(argv.cwd ? argv.args : argv, argv.cwd));

test('policy: trust, permission ceiling, routing and unsupported levels', () => {
  const providers = providersFor();
  const config = { runtime: { trusted: ['claude-code', 'codex', 'cursor'], maxPermission: 'edit', default: { provider: 'claude-code', model: 'sonnet' }, routes: [{ match: { type: 'frontend' }, provider: 'codex', model: 'gpt-5' }, { match: { complexity: 'high' }, provider: 'claude-code', model: 'opus', permission: 'read-only' }] } };
  const plan = resolveRun(config, {}, providers);
  assert.deepEqual([plan.provider.id, plan.model, plan.permission, plan.route], ['claude-code', 'sonnet', 'edit', 'default']);
  assert.deepEqual((({ provider, model }) => [provider.id, model])(resolveRun(config, { subtask: { type: 'frontend' } }, providers)), ['codex', 'gpt-5']);
  assert.equal(resolveRun(config, { subtask: { complexity: 'high' } }, providers).permission, 'read-only');
  assert.equal(resolveRun(config, { provider: 'codex' }, providers).model, undefined, 'the default model belongs to the default provider only');
  assert.equal(resolveRun(config, { permission: 'read-only' }, providers).permission, 'read-only', 'flags can lower permission');
  assert.throws(() => resolveRun(config, { permission: 'full' }, providers), /exceeds runtime\.maxPermission \(edit\)/);
  assert.throws(() => resolveRun(config, { provider: 'gemini' }, providers), /not trusted[\s\S]*maverick agent trust gemini/);
  assert.throws(() => resolveRun(config, { provider: 'cursor' }, providers), /applies edits only with --force/);
  assert.throws(() => resolveRun({ runtime: {} }, {}, providers), /no agent provider selected/);
});

test('providers build argv without a shell and map permission levels', () => {
  const claudeEdit = byId['claude-code'].invocation({ prompt: 'P', model: 'opus', permission: 'edit', commands: [{ command: 'npm run test' }] });
  assert.deepEqual(claudeEdit.args.slice(0, 9), ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'opus', '--permission-mode', 'acceptEdits', '--allowedTools']);
  assert.deepEqual(claudeEdit.args.slice(9, 11), ['Bash(npm run test)', 'Bash(npm run test *)'], 'edit pre-approves the verification commands, with arguments');
  assert.ok(claudeEdit.args.includes('Bash(git diff *)') && !claudeEdit.args.some(arg => arg === 'Bash' || arg === 'Bash(*)'), 'and read-only git, never the whole shell');
  assert.equal(claudeEdit.input, 'P');
  assert.deepEqual(byId.codex.invocation({ prompt: 'P', permission: 'read-only' }).args, ['exec', '--json', '--sandbox', 'read-only', '-']);
  assert.ok(byId.gemini.invocation({ prompt: 'P', permission: 'full' }).args.includes('yolo'));
  const [custom] = providersFor({ runtime: { custom: [{ id: 'aider', command: 'aider --yes --model {model} --message {prompt}' }] } }).filter(provider => provider.custom);
  assert.deepEqual(custom.invocation({ prompt: 'fix it', permission: 'edit' }).args, ['--yes', '--message', 'fix it'], 'a missing model drops the flag too');
  assert.deepEqual(custom.invocation({ prompt: 'fix it', model: 'm1', permission: 'edit' }).args, ['--yes', '--model', 'm1', '--message', 'fix it']);
  assert.match(custom.permissions.full, /not enabled/);
});

test('stream parsers normalise each provider into the same events', () => {
  const parse = (id, lines) => { const state = {}; return [...lines.flatMap(line => byId[id].parse(JSON.stringify(line), state)), ...(byId[id].finish?.(state) || [])]; };
  assert.deepEqual(parse('codex', [{ type: 'thread.started', thread_id: 't1' }, { type: 'item.completed', item: { type: 'command_execution', command: 'npm test' } }, { type: 'item.completed', item: { type: 'agent_message', text: 'hi' } }, { type: 'turn.completed' }]),
    [{ type: 'session', id: 't1' }, { type: 'tool', name: 'shell', detail: 'npm test' }, { type: 'text', text: 'hi' }, { type: 'result', ok: true, text: 'hi' }]);
  assert.deepEqual(parse('gemini', [{ type: 'init', session_id: 'g1' }, { type: 'message', role: 'assistant', content: 'He', delta: true }, { type: 'message', role: 'assistant', content: 'llo', delta: true }, { type: 'result', status: 'success' }]),
    [{ type: 'session', id: 'g1' }, { type: 'text', text: 'Hello' }, { type: 'result', ok: true, text: 'Hello', error: undefined }]);
  assert.equal(parse('claude-code', [{ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' }])[0].ok, false);
  assert.deepEqual(byId.codex.parse('not json', {}), []);
});

test('result blocks are parsed strictly', () => {
  assert.deepEqual(parseResultBlock(`x\n${result('done', 'ok')}`), { status: 'done', summary: 'ok', questions: [], filesChanged: [], notes: [], disputes: [] });
  const disputed = parseResultBlock('```maverick-result\n{"status":"blocked","summary":"s","disputes":[{"target":"test/a.test.js","reason":"expects the old format"}]}\n```');
  assert.deepEqual(disputed.disputes, [{ target: 'test/a.test.js', reason: 'expects the old format' }]);
  assert.match(HEADLESS_RULES, /disputes/);
  assert.equal(parseResultBlock('```maverick-result\n{"status":"maybe"}\n```'), null);
  assert.equal(parseResultBlock('no block'), null);
});

test('agent run streams events, writes a git-ignored transcript, and keeps the prompt off argv', async () => {
  const cwd = await project();
  const { output } = await quiet({ cwd, args: ['agent', 'run', 'demo', '--prompt', 'Add the thing'] });
  assert.match(output, /→ Edit src\/a\.js/);
  assert.match(output, /Status: done/);
  const [call] = await calls(cwd);
  assert.deepEqual(call.argv.slice(0, 10), ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'sonnet', '--effort', 'xhigh', '--permission-mode', 'acceptEdits'], 'the build step uses its recommended model and reasoning');
  assert.match(call.prompt, /## Verification commands\n\nIn this run you can run these commands, with extra arguments/);
  assert.match(call.prompt, /running non-interactively under Maverick[\s\S]*## PRD\.md[\s\S]*## Instruction\n\nAdd the thing/);
  const runs = join(cwd, '.maverick/tasks/demo/runs');
  assert.equal(await readFile(join(runs, '.gitignore'), 'utf8').then(text => text.includes('*')), true);
  const transcript = (await readdir(runs)).find(file => file.endsWith('.jsonl'));
  const events = (await readFile(join(runs, transcript), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ['start', 'session', 'tool', 'text', 'result', 'end']);
  assert.equal(events[0].argv.includes('<prompt>'), false, 'the prompt goes through stdin, not argv');
  assert.equal(events.at(-1).status, 'done');
  const { output: json } = await quiet({ cwd, args: ['agent', 'runs', 'demo', '--json'] });
  assert.equal(JSON.parse(json)[0].provider, 'claude-code');
});

test('agent run fails loudly on untrusted providers, excessive permission, and agent errors', async () => {
  const cwd = await project();
  await assert.rejects(main(['agent', 'run', 'demo', '--provider', 'codex'], cwd), /not trusted/);
  await assert.rejects(main(['agent', 'run', 'demo', '--permission', 'full'], cwd), /exceeds runtime\.maxPermission/);
  const broken = await project({ action: "out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' }); process.exit(3);" });
  await assert.rejects(quiet({ cwd: broken, args: ['agent', 'run', 'demo'] }), /agent run failed/);
});

test('subtask runs pick the next ready subtask and mark it in progress', async () => {
  const cwd = await project();
  await main(['subtask', 'add', 'demo', 'Build API', '--type', 'backend'], cwd);
  await main(['subtask', 'add', 'demo', 'Build UI', '--after', '01'], cwd);
  await quiet({ cwd, args: ['agent', 'run', 'demo', '--subtask', 'next'] });
  assert.match((await calls(cwd))[0].prompt, /## Current subtask 01: Build API/);
  assert.match(await readFile(join(cwd, '.maverick/tasks/demo/subtasks/task_01.md'), 'utf8'), /status: in-progress/);
  await assert.rejects(main(['agent', 'run', 'demo', '--subtask', '02'], cwd), /not ready/);
});

test('dry runs show the resolved plan without running anything', async () => {
  const cwd = await project();
  const { output } = await quiet({ cwd, args: ['agent', 'run', 'demo', '--dry-run', '--json', '--permission', 'read-only'] });
  const plan = JSON.parse(output);
  assert.equal(plan.permission, 'read-only');
  assert.deepEqual(plan.argv.slice(-4), ['--permission-mode', 'dontAsk', '--tools', 'Read,Grep,Glob']);
  assert.equal(existsSync(join(cwd, '.fake-calls.jsonl')), false);
});

test('hooks can deny or extend a run, and failing observers only warn', async () => {
  const deny = `${JSON.stringify(process.execPath)} -e "process.stderr.write('no agents on Fridays'); process.exit(2)"`;
  const cwd = await project({ hooks: [{ event: 'before-agent-run', run: deny }] });
  await assert.rejects(main(['agent', 'run', 'demo'], cwd), /denied: no agents on Fridays/);
  assert.equal(existsSync(join(cwd, '.fake-calls.jsonl')), false);
  const append = `${JSON.stringify(process.execPath)} -e "process.stdout.write(JSON.stringify({ appendPrompt: 'Use the metric system.' }))"`;
  const fail = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
  const extended = await project({ hooks: [{ event: 'before-agent-run', run: append }, { event: 'after-agent-run', run: fail }] });
  const { output } = await quiet({ cwd: extended, args: ['agent', 'run', 'demo'] });
  assert.match((await calls(extended))[0].prompt, /Use the metric system\.$/);
  assert.match(output, /WARN hook .* failed/);
  const outcome = await runHooks(extended, { hooks: [{ event: 'before-agent-run', run: fail }] }, 'before-agent-run', {});
  assert.equal(outcome.allowed, false, 'a crashing guard fails closed');
});

test('timeouts stop the agent', async () => {
  const cwd = await project({ action: 'await new Promise(resolve => setTimeout(resolve, 5000));' });
  await assert.rejects(quiet({ cwd, args: ['agent', 'run', 'demo', '--timeout', '0.005'] }), /agent run failed/);
});

test('flow run --agent fixes blocking issues until the gates pass', async () => {
  const gate = `${JSON.stringify(process.execPath)} -e "process.exit(require('fs').existsSync('fixed') ? 0 : 1)"`;
  const flow = `apiVersion: maverick.flow/v1\nname: fix\ndescription: Loop used by runtime tests.\ncontract:\n  goal: Fixed for {{task}}.\n  iterationCap: 3\n  noProgressWindow: 2\ngates:\n  - id: fixed\n    type: command\n    run: ${JSON.stringify(gate)}\n`;
  const cwd = await project({ files: { '.maverick/flows/fix.yaml': flow }, action: "writeFileSync('fixed', '');" });
  const { output } = await quiet({ cwd, args: ['flow', 'run', 'fix', 'demo', '--agent'] });
  assert.match(output, /AGENT FIX \(iteration 1\/3\)/);
  assert.match(output, /Outcome: DONE/);
  assert.match((await calls(cwd))[0].prompt, /## Blocking issues to fix\n[\s\S]*- fixed: .* exited 1/);

  const lazy = await project({ files: { '.maverick/flows/fix.yaml': flow } });
  await assert.rejects(quiet({ cwd: lazy, args: ['flow', 'run', 'fix', 'demo', '--agent'] }), /outcome: stalled/);
  assert.equal((await calls(lazy)).length, 1, 'the contract stops the loop after no progress');

  const asking = await project({ files: { '.maverick/flows/fix.yaml': flow }, action: `process.env.FAKE_TEXT = ${JSON.stringify(result('needs-input', 'Which API version?'))};` });
  await assert.rejects(quiet({ cwd: asking, args: ['flow', 'run', 'fix', 'demo', '--agent'] }), /agent needs a human: needs-input/);

  // Each fix is recorded with the flow run it produced, so an iteration links to its transcript.
  const state = JSON.parse(await readFile(join(cwd, '.maverick/tasks/demo/flows/fix.json'), 'utf8'));
  assert.equal(state.runs.at(-1).agent.provider, 'claude-code');
  assert.match(state.runs.at(-1).agent.transcript, /runs\/.*-claude-code\.jsonl$/);
});

test('flow run --agent never reads a missing result block as done, and its dry run shows the fix prompt', async () => {
  const gate = `${JSON.stringify(process.execPath)} -e "process.exit(require('fs').existsSync('fixed') ? 0 : 1)"`;
  const flow = `apiVersion: maverick.flow/v1\nname: fix\ndescription: Loop used by runtime tests.\ncontract:\n  goal: Fixed for {{task}}.\n  iterationCap: 4\n  noProgressWindow: 3\ngates:\n  - id: fixed\n    type: command\n    run: ${JSON.stringify(gate)}\n`;
  const silent = await project({ files: { '.maverick/flows/fix.yaml': flow }, action: "process.env.FAKE_TEXT = 'I changed some things.';" });
  await assert.rejects(quiet({ cwd: silent, args: ['flow', 'run', 'fix', 'demo', '--agent'] }), /no maverick-result block and the gates still fail/);
  assert.equal((await calls(silent)).length, 1);

  const dry = await project({ files: { '.maverick/flows/fix.yaml': flow } });
  const error = await quiet({ cwd: dry, args: ['flow', 'run', 'fix', 'demo', '--agent', '--dry-run'] }).then(() => null, err => err);
  assert.match(error.message, /outcome: revise/);
  assert.match(error.output, /AGENT FIX \(dry run[\s\S]*## Blocking issues to fix/);
  assert.ok(!existsSync(join(dry, '.fake-calls.jsonl')), 'a dry run starts no agent');
});

test('agent trust is a reviewed config change', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-trust-'));
  await assert.rejects(main(['agent', 'trust', 'codex'], cwd), /--yes/);
  await quiet({ cwd, args: ['agent', 'trust', 'codex', '--max-permission', 'read-only', '--yes'] });
  let config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.deepEqual(config.runtime, { trusted: ['codex'], maxPermission: 'read-only', default: { provider: 'codex' } });
  await quiet({ cwd, args: ['agent', 'untrust', 'codex', '--yes'] });
  config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.deepEqual(config.runtime.trusted, []);
  assert.equal(config.runtime.default, undefined);
  await assert.rejects(main(['agent', 'trust', 'vim', '--yes'], cwd), /unknown provider vim/);
});

test('Antigravity, Copilot, Kiro and OpenCode map permissions and parse their own streams', () => {
  const parse = (id, lines) => { const state = {}; return [...lines.flatMap(line => byId[id].parse(JSON.stringify(line), state)), ...(byId[id].finish?.(state) || [])]; };
  assert.deepEqual(byId.antigravity.invocation({ prompt: 'P', permission: 'read-only' }).args, ['--output-format', 'stream-json', '--mode', 'plan', '-p', 'P']);
  assert.ok(byId.antigravity.invocation({ prompt: 'P', permission: 'full' }).args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(byId.copilot.invocation({ prompt: 'P', permission: 'edit', commands: [{ command: 'npm test' }] }).args.slice(0, 10), ['--output-format', 'json', '--allow-tool', 'read', '--allow-tool', 'write', '--allow-tool', 'shell(npm test)', '--allow-tool', 'shell(npm test:*)']);
  assert.ok(byId.gemini.invocation({ prompt: 'P', permission: 'edit', commands: [{ command: 'npm test' }] }).args.includes('run_shell_command(npm test)'));
  assert.deepEqual(byId.kiro.invocation({ prompt: 'P', permission: 'read-only' }), { args: ['chat', '--no-interactive', '--output-format', 'stream-json', '--trust-tools=read,grep,glob'], input: 'P' });
  assert.match(byId.opencode.permissions.edit, /use full/);

  // Captured from agy 1.2.12: a failed turn still exits 0, so the result status decides.
  const agy = parse('antigravity', [{ event: 'init', conversation_id: 'c1', init: {} }, { event: 'step_update', step_update: { step_index: 1, state: 'RUNNING', text_delta: 'He' } }, { event: 'step_update', step_update: { step_index: 1, state: 'DONE', text_delta: 'llo' } }, { event: 'result', result: { status: 'SUCCESS', response: 'Hello' } }]);
  assert.deepEqual(agy, [{ type: 'session', id: 'c1' }, { type: 'text', text: 'Hello' }, { type: 'result', ok: true, text: 'Hello', error: undefined }]);
  assert.equal(parse('antigravity', [{ event: 'result', result: { status: 'ERROR', response: '', error: 'RESOURCE_EXHAUSTED (code 429)' } }])[0].error, 'RESOURCE_EXHAUSTED (code 429)');

  assert.deepEqual(parse('copilot', [{ type: 'tool.execution_start', data: { toolName: 'shell', arguments: { command: 'npm test' } } }, { type: 'assistant.message', data: { content: 'done' } }, { type: 'result', sessionId: 's1', exitCode: 0 }]),
    [{ type: 'tool', name: 'shell', detail: 'npm test' }, { type: 'text', text: 'done' }, { type: 'session', id: 's1' }, { type: 'result', ok: true, text: 'done', error: undefined }]);

  // Captured from kiro-cli 2.24.1: metadata repeats the session id; errors arrive as runError.
  const kiroLines = [{ type: 'runStarted', data: {} }, { type: 'metadata', data: { sessionId: 'k1' } }, { type: 'metadata', data: { sessionId: 'k1' } }, { type: 'sessionUpdate', data: { update: { sessionUpdate: 'tool_call', kind: 'read', title: 'Reading a.txt' } } }, { type: 'sessionUpdate', data: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hel' } } } }, { type: 'sessionUpdate', data: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'lo' } } } }, { type: 'runFinished', data: { finalTextTruncated: true } }];
  assert.deepEqual(parse('kiro', kiroLines), [{ type: 'session', id: 'k1' }, { type: 'tool', name: 'read', detail: 'Reading a.txt' }, { type: 'text', text: 'hello' }, { type: 'result', ok: true, text: 'hello' }]);
  assert.equal(parse('kiro', [{ type: 'runError', data: { message: 'The monthly usage limit has been reached' } }])[0].ok, false);

  assert.deepEqual(parse('opencode', [{ type: 'tool_use', sessionID: 'o1', part: { tool: 'bash', state: { input: { command: 'ls' } } } }, { type: 'text', sessionID: 'o1', part: { text: 'ok' } }, { type: 'step_finish', sessionID: 'o1', part: { cost: 0.01 } }]),
    [{ type: 'session', id: 'o1' }, { type: 'tool', name: 'bash', detail: 'ls' }, { type: 'text', text: 'ok' }, { type: 'result', ok: true, text: 'ok', cost: 0.01, error: undefined }]);
});

test('each workflow step resolves its own agent, model and reasoning, and flags still win', () => {
  const providers = BUILTIN_PROVIDERS, runtime = { trusted: ['claude-code', 'codex', 'gemini'], default: { provider: 'claude-code' } };
  const plan = (options, extra = {}) => { const p = resolveRun({ runtime: { ...runtime, ...extra } }, options, providers); return [p.provider.id, p.model, p.effort]; };
  assert.deepEqual(plan({ stage: 'prd' }), ['claude-code', 'opus', 'xhigh'], 'planning uses the strongest model with high reasoning');
  assert.deepEqual(plan({ stage: 'build' }), ['claude-code', 'sonnet', 'xhigh']);
  assert.deepEqual(plan({ stage: 'fix' }), ['claude-code', 'sonnet', 'high']);
  const stages = { stages: { build: { provider: 'codex' }, fix: { model: 'haiku' }, tasks: { provider: 'gemini', effort: 'high' } } };
  assert.deepEqual(plan({ stage: 'build' }, stages), ['codex', 'gpt-6-sol', 'high'], 'a stage agent without a model gets its recommendation');
  assert.deepEqual(plan({ stage: 'fix' }, stages), ['claude-code', 'haiku', undefined], 'a chosen model does not inherit another model\'s reasoning');
  assert.deepEqual(plan({ stage: 'build', provider: 'claude-code', effort: 'max' }, stages), ['claude-code', 'sonnet', 'max'], 'flags win over the stage');
  assert.deepEqual(plan({ stage: 'build', model: 'gpt-6-luna' }, stages), ['codex', 'gpt-6-luna', undefined]);
  assert.throws(() => plan({ stage: 'build', provider: 'gemini', effort: 'high' }), /Gemini CLI has no reasoning setting/);
  assert.throws(() => plan({ stage: 'build', provider: 'claude-code', effort: 'ultra' }), /accepts reasoning low, medium, high, xhigh, max/);
  assert.deepEqual(plan({ stage: 'tasks' }, stages), ['gemini', 'pro', undefined], 'an effort the agent cannot take is dropped from config');
  assert.deepEqual(byId.codex.invocation({ prompt: 'P', effort: 'xhigh', permission: 'edit' }).args, ['exec', '--json', '--sandbox', 'workspace-write', '-c', 'model_reasoning_effort="xhigh"', '-']);
});

test('agent stage writes runtime.stages, drops the old agent\'s model, and resets to the recommendation', async () => {
  const cwd = await project({ runtime: { trusted: ['claude-code', 'codex'], default: { provider: 'claude-code' } } });
  await quiet({ cwd, args: ['agent', 'stage', 'build', '--model', 'opus', '--effort', 'max'] });
  await quiet({ cwd, args: ['agent', 'stage', 'build', '--provider', 'codex'] });
  let config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.deepEqual(config.runtime.stages.build, { provider: 'codex' });
  const { output } = await quiet({ cwd, args: ['agent', 'stage', '--json'] });
  assert.deepEqual(JSON.parse(output).stages.find(item => item.id === 'build'), { id: 'build', name: 'Build', description: 'Implements a subtask or the whole task.', provider: 'codex', model: 'gpt-6-sol', effort: 'high', configured: true });
  await assert.rejects(quiet({ cwd, args: ['agent', 'stage', 'build', '--effort', 'minimal', '--provider', 'claude-code'] }), /accepts reasoning/);
  await quiet({ cwd, args: ['agent', 'stage', 'build', '--reset'] });
  config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.equal(config.runtime.stages, undefined);
  await assert.rejects(quiet({ cwd, args: ['agent', 'stage', 'deploy', '--model', 'x'] }), /stage must be one of/);
});

test('the prompt tells each run which shell it has: verification commands, everything, or nothing', async () => {
  const { buildPrompt } = await import('../src/runtime/prompt.js');
  const { shellFor } = await import('../src/runtime/providers.js');
  const dir = await mkdtemp(join(tmpdir(), 'maverick-prompt-')), commands = [{ command: 'npm run test' }, { command: 'go test ./...', cwd: 'api' }];
  assert.deepEqual(['claude-code', 'codex', 'kiro', 'antigravity', 'gemini'].map(id => shellFor(byId[id], 'edit')), ['verification', 'all', 'none', 'none', 'verification']);
  assert.equal(shellFor(byId.kiro, 'full'), 'all');
  assert.match(await buildPrompt({ taskDir: dir, task: 't', commands, shell: 'verification' }), /Any other shell command is denied[\s\S]*- `npm run test`\n- `go test \.\/\.\.\.` \(in `api\/`\)/);
  assert.match(await buildPrompt({ taskDir: dir, task: 't', commands, shell: 'none' }), /cannot execute shell commands, so do not try\. Maverick runs verification after you finish/);
  assert.match(await buildPrompt({ taskDir: dir, task: 't', commands, shell: 'all' }), /Run the relevant ones before finishing/);
});

test('a subtask run is told to check its checklist items in the task file as they become true', async () => {
  const { buildPrompt } = await import('../src/runtime/prompt.js');
  const dir = await mkdtemp(join(tmpdir(), 'maverick-prompt-'));
  const subtask = { id: '01', title: 'Codec', dependsOn: [], body: '## Acceptance Criteria\n- [ ] AC-01: works\n' };
  const prompt = await buildPrompt({ taskDir: dir, task: 't', subtask, subtaskFile: '.maverick/tasks/t/subtasks/task_01.md' });
  assert.match(prompt, /The checklist lives in `\.maverick\/tasks\/t\/subtasks\/task_01\.md`[\s\S]*change its `- \[ \]` to `- \[x\]`[\s\S]*never in a batch at the end/);
  assert.doesNotMatch(await buildPrompt({ taskDir: dir, task: 't' }), /The checklist lives in/);
});
