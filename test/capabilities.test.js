import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { ADAPTERS, resolveTargets } from '../src/capabilities/adapters.js';
import { findCapability, loadCatalog } from '../src/capabilities/catalog.js';
import { resolveInside } from '../src/capabilities/engine.js';
import { loadCapability, parseFrontmatter } from '../src/capabilities/model.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

async function project(files = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-cap-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), content);
  }
  return cwd;
}
const read = (cwd, path) => readFile(join(cwd, path), 'utf8');
const readJson = async (cwd, path) => JSON.parse(await read(cwd, path));
const lock = cwd => readJson(cwd, '.maverick/capabilities.lock.json');
const mcp = (name, server) => ({ [`.maverick/capabilities/${name}/MCP.json`]: JSON.stringify({ name, description: 'Exposes a test MCP server for integration tests.', server }) });
const agent = (name, body = 'Do the thing carefully.') => ({ [`.maverick/capabilities/${name}/AGENT.md`]: `---\nname: ${name}\ndescription: A project-local agent used by the tests.\nversion: 1.0.0\n---\n\n${body}\n` });

test('built-in catalog is valid and covers every kind', async () => {
  const catalog = await loadCatalog(await project());
  assert.deepEqual(catalog.errors, []);
  assert.deepEqual([...new Set(catalog.capabilities.map(item => item.kind))].sort(), ['agent', 'command', 'mcp', 'skill']);
  assert.equal(findCapability(catalog, 'reviewer').ref, 'agent/reviewer');
  assert.throws(() => findCapability(catalog, 'review'), /did you mean agent\/reviewer/);
});

test('invalid capabilities are reported with a precise reason, and project entries shadow built-ins', async () => {
  const cwd = await project({
    '.maverick/capabilities/bad-name/AGENT.md': '---\nname: other\ndescription: Mismatched directory name here.\n---\nBody\n',
    '.maverick/capabilities/no-body/SKILL.md': '---\nname: no-body\ndescription: A skill without instructions.\n---\n',
    ...agent('reviewer', 'Project override.')
  });
  const catalog = await loadCatalog(cwd);
  assert.match(catalog.errors.find(error => error.path.endsWith('bad-name')).message, /must match its directory/);
  assert.match(catalog.errors.find(error => error.path.endsWith('no-body')).message, /body is empty/);
  assert.equal(findCapability(catalog, 'agent/reviewer').source, 'project');
  assert.deepEqual(catalog.shadowed, [{ ref: 'agent/reviewer', source: 'built-in', by: 'project' }]);
  await assert.rejects(main(['catalog', 'validate'], cwd), /2 invalid/);
});

test('adapters render each tool format from one portable definition', async () => {
  const catalog = await loadCatalog(await project());
  const byId = Object.fromEntries(ADAPTERS.map(adapter => [adapter.id, adapter]));
  const command = findCapability(catalog, 'command/preflight');
  assert.match(byId['claude-code'].render(command)[0].content, /Preflight the Maverick task `\$ARGUMENTS`/);
  assert.match(byId.gemini.render(command)[0].content, /^description = ".+"\nprompt = '''\n[\s\S]*\{\{args\}\}/);
  assert.match(byId.copilot.render(command)[0].path, /^\.github\/prompts\/preflight\.prompt\.md$/);
  assert.match(byId.cursor.supports('command'), /skills/);
  assert.match(byId.codex.supports('mcp'), /config\.toml/);
  const reviewer = findCapability(catalog, 'agent/reviewer');
  assert.match(byId['claude-code'].render(reviewer)[0].content, /tools: Read, Grep, Glob, Bash/);
  assert.match(byId.codex.render(reviewer)[0].content, /^name = "reviewer"\ndescription = [\s\S]*developer_instructions = '''/);
  const skill = byId.codex.render(findCapability(catalog, 'skill/maverick-workflow'));
  assert.ok(skill.some(output => output.path === '.agents/skills/maverick-workflow/references/feature.md'));
  const { data } = parseFrontmatter(skill.find(output => output.path.endsWith('SKILL.md')).content);
  assert.deepEqual(Object.keys(data), ['name', 'description'], 'skill frontmatter is trimmed to the Agent Skills spec');
});

test('targets come from --to, config, or detection', async () => {
  const cwd = await project({ 'GEMINI.md': '# g', '.cursor/rules/x.mdc': '' });
  assert.deepEqual((await resolveTargets(cwd, {})).map(adapter => adapter.id), ['cursor', 'gemini']);
  assert.deepEqual((await resolveTargets(cwd, { capabilities: { targets: ['codex'] } })).map(adapter => adapter.id), ['codex']);
  assert.equal((await resolveTargets(cwd, {}, 'all')).length, ADAPTERS.length);
  await assert.rejects(resolveTargets(cwd, {}, 'vim'), /unknown target vim/);
  await assert.rejects(resolveTargets(await project(), {}), /no AI tool configuration detected/);
});

test('add requires consent, installs, records the lockfile, and is idempotent', async () => {
  const cwd = await project();
  await assert.rejects(main(['add', 'reviewer', '--to', 'claude-code'], cwd), /rerun with --yes/);
  await main(['add', 'reviewer', '--to', 'claude-code', '--dry-run'], cwd);
  assert.equal(existsSync(join(cwd, '.claude/agents/reviewer.md')), false);
  await main(['add', 'reviewer', 'maverick-workflow', '--to', 'claude-code,copilot', '--yes'], cwd);
  assert.match(await read(cwd, '.github/agents/reviewer.agent.md'), /^---\nname: reviewer/);
  const entry = (await lock(cwd)).capabilities['agent/reviewer'];
  assert.deepEqual(Object.keys(entry.targets), ['claude-code', 'copilot']);
  assert.equal(entry.targets['claude-code'].files[0].path, '.claude/agents/reviewer.md');
  await main(['add', 'reviewer', '--to', 'claude-code', '--yes'], cwd);
});

test('existing unmanaged files are never overwritten without --force', async () => {
  const cwd = await project({ '.claude/agents/reviewer.md': 'my own reviewer' });
  await assert.rejects(main(['add', 'reviewer', '--to', 'claude-code', '--yes'], cwd), /1 conflict/);
  assert.equal(await read(cwd, '.claude/agents/reviewer.md'), 'my own reviewer');
  await main(['add', 'reviewer', '--to', 'claude-code', '--yes', '--force'], cwd);
  assert.match(await read(cwd, '.claude/agents/reviewer.md'), /name: reviewer/);
});

test('MCP servers need explicit exec trust and merge only Maverick-owned keys', async () => {
  const cwd = await project({
    ...mcp('files', { command: 'npx', args: ['-y', 'some-mcp-server'], env: { ROOT: '${PWD}' } }),
    '.mcp.json': JSON.stringify({ mcpServers: { mine: { command: 'mine' } }, other: true }),
    '.vscode/mcp.json': JSON.stringify({ servers: { files: { command: 'hand-written' } } })
  });
  await assert.rejects(main(['add', 'mcp/files', '--to', 'claude-code', '--yes'], cwd), /starts a local process[\s\S]*--allow-exec/);
  await main(['add', 'mcp/files', '--to', 'claude-code,cursor,gemini', '--yes', '--allow-exec'], cwd);
  const claude = await readJson(cwd, '.mcp.json');
  assert.deepEqual(Object.keys(claude.mcpServers), ['mine', 'files']);
  assert.equal(claude.other, true);
  assert.deepEqual(claude.mcpServers.files, { command: 'npx', args: ['-y', 'some-mcp-server'], env: { ROOT: '${PWD}' } });
  assert.equal((await readJson(cwd, '.cursor/mcp.json')).mcpServers.files.type, 'stdio');
  assert.equal((await readJson(cwd, '.gemini/settings.json')).mcpServers.files.command, 'npx');
  assert.equal((await lock(cwd)).capabilities['mcp/files'].allowExec, true);
  await assert.rejects(main(['add', 'mcp/files', '--to', 'copilot', '--yes', '--allow-exec'], cwd), /key exists and is not managed/);
  await main(['remove', 'files', '--yes'], cwd);
  assert.deepEqual(await readJson(cwd, '.mcp.json'), { mcpServers: { mine: { command: 'mine' } }, other: true });
  assert.deepEqual((await readJson(cwd, '.cursor/mcp.json')).mcpServers, {});
});

test('remote MCP servers use each tool\'s URL key without exec trust', async () => {
  const cwd = await project(mcp('docs', { url: 'https://example.com/mcp' }));
  await main(['add', 'docs', '--to', 'claude-code,gemini,copilot', '--yes'], cwd);
  assert.deepEqual((await readJson(cwd, '.mcp.json')).mcpServers.docs, { type: 'http', url: 'https://example.com/mcp' });
  assert.deepEqual((await readJson(cwd, '.gemini/settings.json')).mcpServers.docs, { httpUrl: 'https://example.com/mcp' });
  assert.deepEqual((await readJson(cwd, '.vscode/mcp.json')).servers.docs, { type: 'http', url: 'https://example.com/mcp' });
});

test('drift is detected, sync restores it, and remove protects local edits', async () => {
  const cwd = await project();
  await main(['add', 'reviewer', '--to', 'claude-code', '--yes'], cwd);
  await writeFile(join(cwd, '.claude/agents/reviewer.md'), 'edited locally');
  await assert.rejects(main(['remove', 'reviewer', '--yes'], cwd), /conflict/);
  await main(['sync', '--yes'], cwd);
  assert.match(await read(cwd, '.claude/agents/reviewer.md'), /name: reviewer/);
  await main(['remove', 'reviewer', '--yes'], cwd);
  assert.equal(existsSync(join(cwd, '.claude')), false, 'empty managed directories are cleaned up');
  assert.deepEqual((await lock(cwd)).capabilities, {});
});

test('upgrades remove files the new version no longer ships, and sync never upgrades silently', async () => {
  const cwd = await project({ '.maverick/capabilities/helper/SKILL.md': '---\nname: helper\ndescription: A helper skill for upgrade tests.\n---\nUse it.\n', '.maverick/capabilities/helper/extra.md': 'v1 extra' });
  await main(['add', 'helper', '--to', 'claude-code', '--yes'], cwd);
  assert.equal(await read(cwd, '.claude/skills/helper/extra.md'), 'v1 extra');
  await writeFile(join(cwd, '.maverick/capabilities/helper/SKILL.md'), '---\nname: helper\ndescription: A helper skill for upgrade tests.\nversion: 1.1.0\n---\nUse it better.\n');
  await import('node:fs/promises').then(fs => fs.rm(join(cwd, '.maverick/capabilities/helper/extra.md')));
  await main(['sync', '--yes'], cwd);
  assert.equal(await read(cwd, '.claude/skills/helper/extra.md'), 'v1 extra', 'sync keeps the locked version');
  await main(['add', 'helper', '--to', 'claude-code', '--yes'], cwd);
  assert.equal(existsSync(join(cwd, '.claude/skills/helper/extra.md')), false);
  assert.equal((await lock(cwd)).capabilities['skill/helper'].version, '1.1.0');
});

test('a failed apply restores every file it touched', async () => {
  const cwd = await project({ ...agent('solo'), '.cursor/agents': 'a file where a directory is expected' });
  await assert.rejects(main(['add', 'solo', '--to', 'claude-code,cursor', '--yes'], cwd), /all files restored/);
  assert.equal(existsSync(join(cwd, '.claude/agents/solo.md')), false);
  assert.equal(existsSync(join(cwd, '.maverick/capabilities.lock.json')), false);
});

test('paths outside the project are refused', () => {
  assert.throws(() => resolveInside('/repo', '../escape.md'), /outside the project/);
  assert.throws(() => resolveInside('/repo', '/etc/passwd'), /outside the project/);
});

test('loadCapability hashes every shipped file into its integrity', async () => {
  const cwd = await project({ 'cap/demo/SKILL.md': '---\nname: demo\ndescription: Demo skill for integrity checks.\n---\nBody\n', 'cap/demo/a.txt': 'a' });
  const before = (await loadCapability(join(cwd, 'cap/demo'))).integrity;
  await writeFile(join(cwd, 'cap/demo/a.txt'), 'b');
  assert.notEqual((await loadCapability(join(cwd, 'cap/demo'))).integrity, before);
});

test('Codex MCP servers are managed as TOML tables without touching the rest of the file', async () => {
  const original = '# my codex settings\nmodel = "gpt-5"\n\n[mcp_servers.mine]\ncommand = "mine" # keep me\n\n[profiles.fast]\nmodel = "mini"\n';
  const cwd = await project({ ...mcp('files', { command: 'npx', args: ['-y', 'files-mcp'], env: { ROOT: '.' } }), ...mcp('docs', { url: 'https://example.com/mcp' }), '.codex/config.toml': original });
  await main(['add', 'mcp/files', '--to', 'codex', '--yes', '--allow-exec'], cwd);
  const written = await read(cwd, '.codex/config.toml');
  assert.ok(written.startsWith(original.trimEnd()), 'existing content, comments and order are preserved');
  assert.match(written, /\n\n\[mcp_servers\.files\]\ncommand = "npx"\nargs = \["-y", "files-mcp"\]\n\n\[mcp_servers\.files\.env\]\nROOT = "\."\n$/);
  await main(['add', 'mcp/files', '--to', 'codex', '--yes', '--allow-exec'], cwd);
  assert.equal(await read(cwd, '.codex/config.toml'), written, 'reinstalling is idempotent');
  await assert.rejects(main(['add', 'mcp/docs', '--to', 'codex', '--yes'], cwd), /only writes stdio MCP servers/);

  await writeFile(join(cwd, '.codex/config.toml'), written.replace('"files-mcp"', '"edited"'));
  assert.match((await import('../src/capabilities/engine.js').then(engine => engine.readLock(cwd).then(lock => engine.checkDrift(cwd, lock))))[0].issues[0].status, /modified/);
  await main(['sync', '--yes'], cwd);
  assert.equal(await read(cwd, '.codex/config.toml'), written, 'sync restores the managed table');
  await main(['remove', 'files', '--yes'], cwd);
  assert.equal(await read(cwd, '.codex/config.toml'), original);
});

test('TOML tables defined with dotted keys or inline tables are refused, not rewritten', async () => {
  for (const content of ['mcp_servers.files.command = "x"\n', '[mcp_servers]\nfiles = { command = "x" }\n']) {
    const cwd = await project({ ...mcp('files', { command: 'npx', args: [] }), '.codex/config.toml': content });
    await assert.rejects(main(['add', 'mcp/files', '--to', 'codex', '--yes', '--allow-exec'], cwd), /dotted keys or an inline table/);
    assert.equal(await read(cwd, '.codex/config.toml'), content);
  }
});
