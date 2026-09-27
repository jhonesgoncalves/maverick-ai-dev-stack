import { commandAvailable, splitCommand } from '../core/util.js';

// Headless adapters for AI coding CLIs. Each provider maps Maverick's portable
// permission levels to its own flags (or explains why a level cannot be expressed),
// builds argv (never a shell string), and normalises its JSON stream into events:
//   { type: 'session', id } · { type: 'text', text } · { type: 'tool', name, detail }
//   { type: 'result', ok, text, cost, error } · { type: 'error', message }

const json = line => { try { return JSON.parse(line); } catch { return null; } };
const short = (value, size = 80) => { const text = typeof value === 'string' ? value : JSON.stringify(value ?? ''); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
const toolDetail = input => short(input?.file_path || input?.path || input?.command || input?.pattern || input?.url || input?.description || '');

const claude = {
  id: 'claude-code', name: 'Claude Code', bin: 'claude',
  permissions: { 'read-only': true, edit: true, full: true },
  invocation({ prompt, model, permission }) {
    const modes = {
      // --tools is a hard allow-list; dontAsk denies anything else instead of prompting.
      'read-only': ['--permission-mode', 'dontAsk', '--tools', 'Read,Grep,Glob'],
      edit: ['--permission-mode', 'acceptEdits'],
      full: ['--permission-mode', 'bypassPermissions']
    };
    return { args: ['-p', '--output-format', 'stream-json', '--verbose', ...(model ? ['--model', model] : []), ...modes[permission]], input: prompt };
  },
  parse(line) {
    const event = json(line);
    if (!event) return [];
    if (event.type === 'system' && event.subtype === 'init') return [{ type: 'session', id: event.session_id }];
    if (event.type === 'assistant') return (event.message?.content || []).flatMap(part => (part.type === 'text' ? [{ type: 'text', text: part.text }] : part.type === 'tool_use' ? [{ type: 'tool', name: part.name, detail: toolDetail(part.input) }] : []));
    if (event.type === 'result') {
      const denials = (event.permission_denials || []).map(denial => ({ type: 'error', message: `permission denied: ${denial.tool_name || short(denial)}` }));
      return [...denials, { type: 'result', ok: !event.is_error && event.subtype === 'success', text: event.result ?? '', cost: event.total_cost_usd, error: event.is_error ? (event.result || event.subtype) : undefined }];
    }
    return [];
  }
};

// Codex always runs shell commands inside its sandbox; read-only means a read-only sandbox.
const codex = {
  id: 'codex', name: 'OpenAI Codex', bin: 'codex',
  permissions: { 'read-only': true, edit: true, full: true },
  invocation({ prompt, model, permission }) {
    const sandbox = { 'read-only': 'read-only', edit: 'workspace-write', full: 'danger-full-access' }[permission];
    return { args: ['exec', '--json', '--sandbox', sandbox, ...(model ? ['-m', model] : []), '-'], input: prompt };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.type === 'thread.started') return [{ type: 'session', id: event.thread_id }];
    if (event.type === 'item.completed') {
      const item = event.item || {};
      if (item.type === 'agent_message') { state.last = item.text; return [{ type: 'text', text: item.text }]; }
      if (item.type === 'command_execution') return [{ type: 'tool', name: 'shell', detail: short(item.command) }];
      if (item.type === 'file_change') return [{ type: 'tool', name: 'edit', detail: short((item.changes || []).map(change => change.path).join(', ')) }];
      if (item.type === 'mcp_tool_call') return [{ type: 'tool', name: `${item.server}:${item.tool}` }];
      return [];
    }
    if (event.type === 'turn.completed') return [{ type: 'result', ok: true, text: state.last ?? '' }];
    if (event.type === 'turn.failed') return [{ type: 'result', ok: false, text: state.last ?? '', error: event.error?.message || 'turn failed' }];
    if (event.type === 'error') return [{ type: 'error', message: event.message }];
    return [];
  }
};

const gemini = {
  id: 'gemini', name: 'Gemini CLI', bin: 'gemini',
  permissions: { 'read-only': true, edit: true, full: true },
  invocation({ prompt, model, permission }) {
    // Non-interactive Gemini denies anything that would ask; auto_edit excludes the shell tool.
    const approval = { 'read-only': 'plan', edit: 'auto_edit', full: 'yolo' }[permission];
    return { args: ['-o', 'stream-json', '--approval-mode', approval, ...(model ? ['-m', model] : []), '-p', prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.type === 'init') return [{ type: 'session', id: event.session_id }];
    if (event.type === 'message' && event.role === 'assistant') { state.text = `${state.text || ''}${event.content || ''}`; return event.delta ? [] : [{ type: 'text', text: event.content || '' }]; }
    if (event.type === 'tool_use') return [{ type: 'tool', name: event.tool_name, detail: toolDetail(event.parameters) }];
    if (event.type === 'error') return [{ type: 'error', message: event.message || short(event) }];
    if (event.type === 'result') return [...(state.text ? [{ type: 'text', text: state.text }] : []), { type: 'result', ok: event.status === 'success', text: state.text || '', error: event.status === 'success' ? undefined : (event.error?.message || event.status) }];
    return [];
  }
};

const cursor = {
  // `agent` is the current binary; `cursor-agent` is the legacy name.
  id: 'cursor', name: 'Cursor CLI', bin: ['agent', 'cursor-agent'],
  permissions: { 'read-only': true, edit: 'Cursor CLI applies edits only with --force, which also allows shell commands; use full or another provider', full: true },
  invocation({ prompt, model, permission }) {
    const mode = permission === 'read-only' ? ['--mode', 'ask'] : ['--force'];
    return { args: ['-p', '--output-format', 'stream-json', '--trust', ...mode, ...(model ? ['--model', model] : []), prompt] };
  },
  parse(line) {
    const event = json(line);
    if (!event) return [];
    if (event.type === 'system' && event.subtype === 'init') return [{ type: 'session', id: event.session_id }];
    if (event.type === 'assistant') return (event.message?.content || []).filter(part => part.type === 'text').map(part => ({ type: 'text', text: part.text }));
    if (event.type === 'tool_call' && event.subtype === 'started') { const [name, call] = Object.entries(event.tool_call || {})[0] || []; return name ? [{ type: 'tool', name: name.replace(/ToolCall$/, ''), detail: toolDetail(call?.args) }] : []; }
    if (event.type === 'result') return [{ type: 'result', ok: !event.is_error, text: event.result ?? '', error: event.is_error ? event.result : undefined }];
    return [];
  }
};

/**
 * A custom provider wraps any other CLI from configuration, e.g.
 * { "id": "aider", "command": "aider --yes --message {prompt} --model {model}", "permissions": ["edit"] }.
 * `{prompt}` becomes one argv element (or stdin when absent); output is treated as plain text.
 */
function customProvider(definition) {
  const template = splitCommand(definition.command);
  const allowed = definition.permissions || ['edit'];
  return {
    id: definition.id, name: definition.name || definition.id, bin: template[0], custom: true,
    permissions: Object.fromEntries(['read-only', 'edit', 'full'].map(level => [level, allowed.includes(level) || `not enabled for ${definition.id} in runtime.custom`])),
    invocation({ prompt, model }) {
      const usesPrompt = template.some(part => part.includes('{prompt}'));
      const args = [];
      for (const part of template.slice(1)) {
        // Without a model, drop the placeholder and the flag that introduces it (`--model {model}`).
        if (part.includes('{model}') && !model) { if (args.at(-1)?.startsWith('-') && part === '{model}') args.pop(); continue; }
        args.push(part.replaceAll('{prompt}', prompt).replaceAll('{model}', model || ''));
      }
      return { args, input: usesPrompt ? undefined : prompt };
    },
    parse(line, state) { state.lines = [...(state.lines || []), line]; return [{ type: 'text', text: line }]; },
    finish(state) { return [{ type: 'result', ok: true, text: (state.lines || []).join('\n') }]; }
  };
}

export const BUILTIN_PROVIDERS = [claude, codex, cursor, gemini];

/** The configured binary (runtime.bins) wins; otherwise the first installed candidate, else the first name. */
export function resolveBin(provider, config, cwd) {
  const configured = config.runtime?.bins?.[provider.id];
  if (configured) return configured;
  const candidates = [provider.bin].flat();
  return candidates.find(bin => commandAvailable(bin, cwd)) || candidates[0];
}

export function providersFor(config = {}) {
  const custom = (config.runtime?.custom || []).map(customProvider);
  return [...BUILTIN_PROVIDERS.filter(provider => !custom.some(item => item.id === provider.id)), ...custom];
}
