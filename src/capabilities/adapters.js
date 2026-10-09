import { join } from 'node:path';
import { exists } from '../core/util.js';
import { renderFrontmatter } from './model.js';

// Project-level locations verified against each tool's documentation (2026-09).
// An adapter only renders outputs; the engine decides what to write. When a tool has
// no project-level home for a kind, `supports` returns the reason instead of guessing.

const argumentsAs = (body, token) => body.replaceAll('{{ARGUMENTS}}', token);
const tomlString = text => (text.includes("'''") ? JSON.stringify(text) : `'''\n${text}'''`);

/** Skills follow the Agent Skills format everywhere: the folder ships as-is, frontmatter trimmed to the spec. */
function skillOutputs(capability, root) {
  const base = `${root}/${capability.name}`;
  return capability.files.map(file => ({
    type: 'file', path: `${base}/${file}`,
    content: file === 'SKILL.md' ? renderFrontmatter({ name: capability.name, description: capability.description, 'allowed-tools': capability['allowed-tools'] }, capability.body) : capability.contents[file]
  }));
}

function stdioOrRemote(server, { typed = false, remote = server => ({ type: server.type, url: server.url, ...(Object.keys(server.headers).length && { headers: server.headers }) }) } = {}) {
  if (!server.command) return remote(server);
  return { ...(typed && { type: 'stdio' }), command: server.command, args: server.args, ...(Object.keys(server.env).length && { env: server.env }) };
}

const CLAUDE_TOOLS = { read: ['Read', 'Grep', 'Glob'], edit: ['Edit', 'Write'], shell: ['Bash'], web: ['WebFetch', 'WebSearch'] };
const KIRO_TOOLS = { read: ['read'], edit: ['write'], shell: ['shell'], web: ['web_search', 'web_fetch'] };

/** The tool-neutral store every adapter links to: one copy of each capability in `.agents/`. */
export const SHARED = { id: 'agents', root: '.agents' };

/** Renders the canonical, tool-neutral copy of a capability. MCP servers live only in each tool's config. */
export function sharedOutputs(capability) {
  if (capability.kind === 'skill') return skillOutputs(capability, `${SHARED.root}/skills`);
  if (capability.kind === 'agent') return [{ type: 'file', path: `${SHARED.root}/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, tools: capability.tools, model: capability.model }, capability.body) }];
  if (capability.kind === 'command') return [{ type: 'file', path: `${SHARED.root}/commands/${capability.name}.md`, content: renderFrontmatter({ description: capability.description, 'argument-hint': capability['argument-hint'] }, capability.body) }];
  return [];
}

export const ADAPTERS = [
  {
    id: 'claude-code', name: 'Claude Code', home: '.claude/', detect: ['CLAUDE.md', '.claude', '.mcp.json'],
    supports: () => true,
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.claude/skills');
      if (capability.kind === 'agent') return [{ type: 'file', path: `.claude/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, tools: capability.tools?.flatMap(tool => CLAUDE_TOOLS[tool]).join(', '), model: capability.model }, capability.body) }];
      if (capability.kind === 'command') return [{ type: 'file', path: `.claude/commands/${capability.name}.md`, content: renderFrontmatter({ description: capability.description, 'argument-hint': capability['argument-hint'] }, argumentsAs(capability.body, '$ARGUMENTS')) }];
      return [{ type: 'json-key', path: '.mcp.json', pointer: ['mcpServers', capability.name], value: stdioOrRemote(capability.server) }];
    }
  },
  {
    id: 'codex', name: 'OpenAI Codex', home: '.agents/ · .codex/', detect: ['AGENTS.md', '.codex', '.agents'],
    supports: (kind, capability) => (kind === 'command' ? 'Codex has no project-level custom commands (prompts are user-level and deprecated); install the matching skill instead'
      : kind === 'mcp' && !capability?.server?.command ? 'Maverick only writes stdio MCP servers to .codex/config.toml; add remote servers manually' : true),
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.agents/skills');
      // Codex only loads project .codex/config.toml in trusted projects; Maverick owns just this table.
      if (capability.kind === 'mcp') return [{ type: 'json-key', path: '.codex/config.toml', pointer: ['mcp_servers', capability.name], value: stdioOrRemote(capability.server) }];
      const lines = [`name = ${JSON.stringify(capability.name)}`, `description = ${JSON.stringify(capability.description)}`, ...(capability.model ? [`model = ${JSON.stringify(capability.model)}`] : []), `developer_instructions = ${tomlString(capability.body.trim() + '\n')}`];
      return [{ type: 'file', path: `.codex/agents/${capability.name}.toml`, content: `${lines.join('\n')}\n` }];
    }
  },
  {
    id: 'cursor', name: 'Cursor', home: '.cursor/', detect: ['.cursor', '.cursorrules'],
    supports: kind => (kind === 'command' ? 'Cursor replaced custom commands with skills; install the matching skill instead' : true),
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.cursor/skills');
      if (capability.kind === 'agent') {
        const readonly = capability.tools ? !capability.tools.some(tool => tool === 'edit' || tool === 'shell') : undefined;
        return [{ type: 'file', path: `.cursor/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, model: capability.model, readonly: readonly || undefined }, capability.body) }];
      }
      return [{ type: 'json-key', path: '.cursor/mcp.json', pointer: ['mcpServers', capability.name], value: stdioOrRemote(capability.server, { typed: true }) }];
    }
  },
  {
    id: 'copilot', name: 'GitHub Copilot', home: '.github/', detect: ['.github/copilot-instructions.md', '.github/agents', '.github/prompts', '.github/skills', '.vscode/mcp.json'],
    supports: () => true,
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.github/skills');
      if (capability.kind === 'agent') return [{ type: 'file', path: `.github/agents/${capability.name}.agent.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, model: capability.model }, capability.body) }];
      if (capability.kind === 'command') return [{ type: 'file', path: `.github/prompts/${capability.name}.prompt.md`, content: renderFrontmatter({ description: capability.description, 'argument-hint': capability['argument-hint'] }, argumentsAs(capability.body, '${input:args}')) }];
      return [{ type: 'json-key', path: '.vscode/mcp.json', pointer: ['servers', capability.name], value: stdioOrRemote(capability.server, { typed: true }) }];
    }
  },
  {
    id: 'gemini', name: 'Gemini CLI', home: '.gemini/', detect: ['GEMINI.md', '.gemini'],
    supports: () => true,
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.gemini/skills');
      if (capability.kind === 'agent') return [{ type: 'file', path: `.gemini/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, model: capability.model }, capability.body) }];
      if (capability.kind === 'command') return [{ type: 'file', path: `.gemini/commands/${capability.name}.toml`, content: `description = ${JSON.stringify(capability.description)}\nprompt = ${tomlString(argumentsAs(capability.body.trim(), '{{args}}') + '\n')}\n` }];
      const remote = server => ({ [server.type === 'sse' ? 'url' : 'httpUrl']: server.url, ...(Object.keys(server.headers).length && { headers: server.headers }) });
      return [{ type: 'json-key', path: '.gemini/settings.json', pointer: ['mcpServers', capability.name], value: stdioOrRemote(capability.server, { remote }) }];
    }
  },
  {
    // Antigravity reads workspace skills from `.agents/skills` (the shared store) and retires
    // workflows in favor of skills on 2026-11-01; MCP servers and agents are user-level only.
    id: 'antigravity', name: 'Google Antigravity', home: '.agents/', detect: ['.agents/rules', '.agent/rules', '.agent/workflows'],
    supports: kind => (kind === 'command' ? 'Antigravity is replacing workflows with skills; install the matching skill instead'
      : kind === 'agent' ? 'Antigravity has no project-level subagents'
        : kind === 'mcp' ? 'Antigravity only reads MCP servers from user-level configuration' : true),
    render: capability => skillOutputs(capability, '.agents/skills')
  },
  {
    id: 'windsurf', name: 'Windsurf / Devin Desktop', home: '.windsurf/', detect: ['.windsurf', '.windsurfrules', '.devin'],
    supports: kind => (kind === 'agent' ? 'Windsurf (Devin Desktop) has no project-level subagents'
      : kind === 'mcp' ? 'Windsurf (Devin Desktop) only reads MCP servers from user-level configuration' : true),
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.windsurf/skills');
      const body = argumentsAs(capability.body, 'the arguments the user provided').trim();
      if (body.length > 12000) throw new Error(`${capability.ref} is longer than the 12,000-character Windsurf workflow limit`);
      return [{ type: 'file', path: `.windsurf/workflows/${capability.name}.md`, content: `# ${capability.name}\n\n${capability.description}\n\n${body}\n` }];
    }
  },
  {
    id: 'kiro', name: 'Kiro', home: '.kiro/', detect: ['.kiro'],
    supports: kind => (kind === 'command' ? 'Kiro has no project-level custom commands; install the matching skill instead' : true),
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.kiro/skills');
      if (capability.kind === 'agent') return [{ type: 'file', path: `.kiro/agents/${capability.name}.md`, content: renderFrontmatter({ name: capability.name, description: capability.description, tools: capability.tools?.flatMap(tool => KIRO_TOOLS[tool]) }, capability.body) }];
      const remote = server => ({ url: server.url, ...(Object.keys(server.headers).length && { headers: server.headers }) });
      return [{ type: 'json-key', path: '.kiro/settings/mcp.json', pointer: ['mcpServers', capability.name], value: stdioOrRemote(capability.server, { remote }) }];
    }
  },
  {
    id: 'opencode', name: 'OpenCode', home: '.opencode/', detect: ['opencode.json', '.opencode'],
    supports: () => true,
    render(capability) {
      if (capability.kind === 'skill') return skillOutputs(capability, '.opencode/skills');
      if (capability.kind === 'agent') return [{ type: 'file', path: `.opencode/agents/${capability.name}.md`, content: renderFrontmatter({ description: capability.description, mode: 'subagent' }, capability.body) }];
      if (capability.kind === 'command') return [{ type: 'file', path: `.opencode/commands/${capability.name}.md`, content: renderFrontmatter({ description: capability.description }, argumentsAs(capability.body, '$ARGUMENTS')) }];
      const { server } = capability;
      const value = server.command
        ? { type: 'local', command: [server.command, ...server.args], ...(Object.keys(server.env).length && { environment: server.env }) }
        : { type: 'remote', url: server.url, ...(Object.keys(server.headers).length && { headers: server.headers }) };
      return [{ type: 'json-key', path: 'opencode.json', pointer: ['mcp', capability.name], value }];
    }
  }
];

export const ADAPTER_IDS = ADAPTERS.map(adapter => adapter.id);

/**
 * How capabilities land in each tool: `linked` writes them once to `.agents/` and symlinks
 * every tool file whose content is identical; `copy` writes each tool its own files.
 * Windows needs developer mode for symlinks, so it copies unless configured otherwise.
 */
export function layoutFor(config = {}) { return config.capabilities?.layout || (process.platform === 'win32' ? 'copy' : 'linked'); }

export async function detectAdapters(cwd) {
  const detected = [];
  for (const adapter of ADAPTERS) if ((await Promise.all(adapter.detect.map(path => exists(join(cwd, path))))).some(Boolean)) detected.push(adapter);
  return detected;
}

/** Target tools: --to, then `capabilities.targets` in config, then tools detected in the repository. */
export async function resolveTargets(cwd, config = {}, to) {
  const requested = typeof to === 'string' ? to.split(',').map(value => value.trim()).filter(Boolean) : config.capabilities?.targets;
  if (requested?.length) {
    const ids = requested.includes('all') ? ADAPTER_IDS : requested;
    const unknown = ids.filter(id => !ADAPTER_IDS.includes(id));
    if (unknown.length) throw new Error(`unknown target ${unknown.join(', ')}; use ${ADAPTER_IDS.join(', ')} or all`);
    return ADAPTERS.filter(adapter => ids.includes(adapter.id));
  }
  const detected = await detectAdapters(cwd);
  if (!detected.length) throw new Error(`no AI tool configuration detected; choose targets with --to ${ADAPTER_IDS.join(',')} (or --to all)`);
  return detected;
}
