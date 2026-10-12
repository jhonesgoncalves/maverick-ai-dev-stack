import { commandAvailable, splitCommand } from '../core/util.js';

// Adapters for AI coding CLIs. `interactive` builds argv that opens the agent's own UI with
// a first prompt, for a user to supervise. For headless runs, each provider maps Maverick's
// portable permission levels to its own flags (or explains why a level cannot be expressed),
// builds argv (never a shell string), and normalises its JSON stream into events:
//   { type: 'session', id } · { type: 'text', text } · { type: 'tool', name, detail }
//   { type: 'result', ok, text, cost, usage, error } · { type: 'error', message }
// `usage` is token counts in one shape (normalizeUsage); `reportsUsage` marks providers that send them.

const json = line => { try { return JSON.parse(line); } catch { return null; } };
const short = (value, size = 80) => { const text = typeof value === 'string' ? value : JSON.stringify(value ?? ''); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
// The shell the `edit` level allows: the project's verification commands, with any arguments,
// and read-only git. Providers without a per-command allowlist get no shell at `edit`.
const GIT_READ = ['git status', 'git diff', 'git log', 'git show'];
const editCommands = commands => [...new Set([...commands.map(item => item.command), ...GIT_READ])];

const toolDetail = input => short(input?.file_path || input?.path || input?.command || input?.pattern || input?.url || input?.description || '');

const count = (raw, ...keys) => { for (const key of keys) { const value = Number(raw?.[key]); if (Number.isFinite(value) && value >= 0) return value; } return 0; };

/**
 * Token counts from any provider's usage object, in one shape: `inputTokens` (every prompt token,
 * cached ones included), `cachedInputTokens`, `outputTokens`, `reasoningTokens` and their total.
 * Anthropic counts cache reads and writes apart from `input_tokens`; OpenAI counts cached tokens
 * inside them. Null when the object holds no count.
 */
export function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const anthropic = 'cache_read_input_tokens' in raw || 'cache_creation_input_tokens' in raw;
  const cachedInputTokens = count(raw, 'cache_read_input_tokens', 'cached_input_tokens', 'cachedInputTokens', 'cacheReadTokens', 'cached', 'cachedTokens') || count(raw.cache, 'read');
  let inputTokens = count(raw, 'input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens', 'input', 'prompt');
  if (anthropic) inputTokens += cachedInputTokens + count(raw, 'cache_creation_input_tokens');
  else if (raw.cache && typeof raw.cache === 'object') inputTokens += cachedInputTokens + count(raw.cache, 'write');
  const outputTokens = count(raw, 'output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens', 'output', 'candidates', 'candidatesTokens');
  const reasoningTokens = count(raw, 'reasoning_output_tokens', 'reasoningTokens', 'reasoning_tokens', 'reasoning', 'thoughts', 'thoughtsTokens');
  const totalTokens = inputTokens + outputTokens || count(raw, 'total_tokens', 'totalTokens', 'total');
  return totalTokens ? { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens } : null;
}

/** `{ usage }` for a result event when the provider sent counts, so events without them keep their shape. */
const usageOf = raw => { const usage = normalizeUsage(raw); return usage ? { usage } : {}; };

/** Two usage records added together (OpenCode reports one per step). */
export const addUsage = (a, b) => (!a ? b : !b ? a : Object.fromEntries(Object.keys(a).map(key => [key, (a[key] || 0) + (b[key] || 0)])));

const claude = {
  id: 'claude-code', name: 'Claude Code', bin: 'claude',
  permissions: { 'read-only': true, edit: true, full: true },
  reportsCost: true, // total_cost_usd on the result event
  reportsUsage: true,
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  editShell: 'verification',
  models: { suggested: ['fable', 'opus', 'sonnet', 'haiku', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5'] },
  interactive: ({ prompt, model, effort }) => [...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []), prompt],
  invocation({ prompt, model, effort, permission, commands = [] }) {
    const modes = {
      // --tools is a hard allow-list; dontAsk denies anything else instead of prompting.
      'read-only': ['--permission-mode', 'dontAsk', '--tools', 'Read,Grep,Glob'],
      // acceptEdits still asks before Bash; the allow-list pre-approves the verification commands.
      edit: ['--permission-mode', 'acceptEdits', '--allowedTools', ...editCommands(commands).flatMap(command => [`Bash(${command})`, `Bash(${command} *)`])],
      full: ['--permission-mode', 'bypassPermissions']
    };
    return { args: ['-p', '--output-format', 'stream-json', '--verbose', ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []), ...modes[permission]], input: prompt };
  },
  parse(line) {
    const event = json(line);
    if (!event) return [];
    if (event.type === 'system' && event.subtype === 'init') return [{ type: 'session', id: event.session_id }];
    if (event.type === 'assistant') return (event.message?.content || []).flatMap(part => (part.type === 'text' ? [{ type: 'text', text: part.text }] : part.type === 'tool_use' ? [{ type: 'tool', name: part.name, detail: toolDetail(part.input) }] : []));
    if (event.type === 'result') {
      const denials = (event.permission_denials || []).map(denial => ({ type: 'error', message: `permission denied: ${denial.tool_name || short(denial)}` }));
      return [...denials, { type: 'result', ok: !event.is_error && event.subtype === 'success', text: event.result ?? '', cost: event.total_cost_usd, ...usageOf(event.usage), error: event.is_error ? (event.result || event.subtype) : undefined }];
    }
    return [];
  }
};

// Codex takes the reasoning level as a config override; the value is a TOML string.
const codexEffort = effort => (effort ? ['-c', `model_reasoning_effort="${effort}"`] : []);

// Codex always runs shell commands inside its sandbox; read-only means a read-only sandbox.
const codex = {
  id: 'codex', name: 'OpenAI Codex', bin: 'codex',
  permissions: { 'read-only': true, edit: true, full: true },
  efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  reportsUsage: true, // usage on turn.completed
  editShell: 'all', // workspace-write runs any command inside the sandbox
  // `codex debug models` prints the catalog with the reasoning levels each model accepts.
  models: { list: ['debug', 'models'], parse: text => (JSON.parse(text).models || []).filter(model => model.visibility !== 'hide').map(model => ({ id: model.slug, name: model.display_name, description: model.description, efforts: (model.supported_reasoning_levels || []).map(level => level.effort) })) },
  interactive: ({ prompt, model, effort }) => [...(model ? ['-m', model] : []), ...codexEffort(effort), prompt],
  invocation({ prompt, model, effort, permission }) {
    const sandbox = { 'read-only': 'read-only', edit: 'workspace-write', full: 'danger-full-access' }[permission];
    return { args: ['exec', '--json', '--sandbox', sandbox, ...(model ? ['-m', model] : []), ...codexEffort(effort), '-'], input: prompt };
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
    if (event.type === 'turn.completed') return [{ type: 'result', ok: true, text: state.last ?? '', ...usageOf(event.usage) }];
    if (event.type === 'turn.failed') return [{ type: 'result', ok: false, text: state.last ?? '', error: event.error?.message || 'turn failed' }];
    if (event.type === 'error') return [{ type: 'error', message: event.message }];
    return [];
  }
};

const gemini = {
  id: 'gemini', name: 'Gemini CLI', bin: 'gemini',
  permissions: { 'read-only': true, edit: true, full: true },
  reportsUsage: true, // stats on the result event
  editShell: 'verification',
  models: { suggested: ['auto', 'pro', 'flash', 'flash-lite'] },
  interactive: ({ prompt, model }) => [...(model ? ['-m', model] : []), '-i', prompt],
  invocation({ prompt, model, permission, commands = [] }) {
    // Non-interactive Gemini denies anything that would ask; auto_edit excludes the shell tool
    // except the commands allowed by prefix.
    const approval = { 'read-only': 'plan', edit: 'auto_edit', full: 'yolo' }[permission];
    const allowed = permission === 'edit' ? ['--allowed-tools', ...editCommands(commands).map(command => `run_shell_command(${command})`)] : [];
    return { args: ['-o', 'stream-json', '--approval-mode', approval, ...allowed, ...(model ? ['-m', model] : []), '-p', prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.type === 'init') return [{ type: 'session', id: event.session_id }];
    if (event.type === 'message' && event.role === 'assistant') { state.text = `${state.text || ''}${event.content || ''}`; return event.delta ? [] : [{ type: 'text', text: event.content || '' }]; }
    if (event.type === 'tool_use') return [{ type: 'tool', name: event.tool_name, detail: toolDetail(event.parameters) }];
    if (event.type === 'error') return [{ type: 'error', message: event.message || short(event) }];
    if (event.type === 'result') return [...(state.text ? [{ type: 'text', text: state.text }] : []), { type: 'result', ok: event.status === 'success', text: state.text || '', ...usageOf(event.stats || event.usage), error: event.status === 'success' ? undefined : (event.error?.message || event.status) }];
    return [];
  }
};

const cursor = {
  // `agent` is the current binary; `cursor-agent` is the legacy name.
  id: 'cursor', name: 'Cursor CLI', bin: ['agent', 'cursor-agent'],
  permissions: { 'read-only': true, edit: 'Cursor CLI applies edits only with --force, which also allows shell commands; use full or another provider', full: true },
  interactive: ({ prompt, model }) => [...(model ? ['--model', model] : []), prompt],
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
    if (event.type === 'result') return [{ type: 'result', ok: !event.is_error, text: event.result ?? '', ...usageOf(event.usage), error: event.is_error ? event.result : undefined }];
    return [];
  }
};

// Antigravity CLI (`agy`) exits 0 even when the turn fails, so the result status decides.
// Text arrives as `text_delta` on numbered steps; a step's text is emitted once it is done.
const antigravity = {
  id: 'antigravity', name: 'Antigravity CLI', bin: 'agy',
  permissions: { 'read-only': true, edit: true, full: true },
  efforts: ['low', 'medium', 'high', 'max'],
  // `agy models` prints one "<id>\t<name>" line per model after a progress line.
  models: { list: ['models'], parse: text => text.split('\n').map(line => line.split('\t')).filter(([id, name]) => id && name && !/\s/.test(id)).map(([id, name]) => ({ id, name: name.trim() })) },
  interactive: ({ prompt, model, effort }) => [...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []), '-i', prompt],
  invocation({ prompt, model, effort, permission }) {
    const mode = { 'read-only': ['--mode', 'plan'], edit: ['--mode', 'accept-edits'], full: ['--dangerously-skip-permissions'] }[permission];
    return { args: ['--output-format', 'stream-json', ...mode, ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []), '-p', prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    if (event.event === 'init') return event.conversation_id ? [{ type: 'session', id: event.conversation_id }] : [];
    if (event.event === 'step_update') {
      const step = event.step_update || {}, steps = (state.steps ||= {}), key = step.step_index, out = [];
      const current = (steps[key] ||= { text: '' });
      if (step.text_delta) current.text += step.text_delta;
      if (step.tool_info && !current.tool) { current.tool = true; out.push({ type: 'tool', name: step.tool_info.name || step.tool_info.tool_name || step.step_type || 'tool', detail: toolDetail(step.tool_info.args || step.tool_info.input || step.tool_info) }); }
      if (step.state === 'DONE' && current.text && !current.sent) { current.sent = true; state.last = current.text; out.push({ type: 'text', text: current.text }); }
      return out;
    }
    if (event.event === 'result') {
      const result = event.result || {}, failed = Boolean(result.error) || /error|fail|cancel|timeout/i.test(result.status || '');
      return [{ type: 'result', ok: !failed, text: result.response || state.last || '', ...usageOf(result.usage || event.usage), error: failed ? (result.error || result.status) : undefined }];
    }
    return [];
  }
};

// Copilot CLI denies every tool that is not allowed up front in programmatic mode.
const copilot = {
  id: 'copilot', name: 'GitHub Copilot CLI', bin: 'copilot',
  permissions: { 'read-only': true, edit: true, full: true },
  editShell: 'verification',
  interactive: ({ prompt, model }) => [...(model ? ['--model', model] : []), '-i', prompt],
  invocation({ prompt, model, permission, commands = [] }) {
    const shell = editCommands(commands).flatMap(command => ['--allow-tool', `shell(${command})`, '--allow-tool', `shell(${command}:*)`]);
    const tools = { 'read-only': ['--allow-tool', 'read'], edit: ['--allow-tool', 'read', '--allow-tool', 'write', ...shell], full: ['--allow-all-tools'] }[permission];
    return { args: ['--output-format', 'json', ...tools, ...(model ? ['--model', model] : []), '-p', prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    const data = event.data || {};
    if (event.type === 'assistant.message' && data.content) { state.last = data.content; return [{ type: 'text', text: data.content }]; }
    if (event.type === 'tool.execution_start') return [{ type: 'tool', name: data.toolName || data.name || 'tool', detail: toolDetail(data.arguments || data.args) }];
    if (event.type === 'abort') return [{ type: 'error', message: data.reason || 'aborted' }];
    if (event.type === 'result') {
      const ok = (event.exitCode ?? 0) === 0;
      return [...(event.sessionId || event.session_id ? [{ type: 'session', id: event.sessionId || event.session_id }] : []), { type: 'result', ok, text: state.last ?? '', ...usageOf(event.usage || data.usage), error: ok ? undefined : `exit code ${event.exitCode}` }];
    }
    return [];
  }
};

// Kiro CLI streams its ACP events; tools that are not trusted are refused in headless mode.
const kiro = {
  id: 'kiro', name: 'Kiro CLI', bin: 'kiro-cli',
  permissions: { 'read-only': true, edit: true, full: true },
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  models: { list: ['chat', '--list-models', '--format', 'json'], parse: text => (JSON.parse(text).models || []).map(model => ({ id: model.model_id, name: model.model_name, description: model.description })) },
  interactive: ({ prompt, model, effort }) => ['chat', ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []), prompt],
  invocation({ prompt, model, effort, permission }) {
    const trust = { 'read-only': ['--trust-tools=read,grep,glob'], edit: ['--trust-tools=read,grep,glob,write'], full: ['--trust-all-tools'] }[permission];
    return { args: ['chat', '--no-interactive', '--output-format', 'stream-json', ...trust, ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])], input: prompt };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    const data = event.data || {};
    if (event.type === 'metadata' && data.sessionId && !state.session) { state.session = data.sessionId; return [{ type: 'session', id: data.sessionId }]; }
    if (event.type === 'sessionUpdate') {
      const update = data.update || {};
      if (update.sessionUpdate === 'agent_message_chunk' && update.content?.text) { state.text = `${state.text || ''}${update.content.text}`; return []; }
      if (update.sessionUpdate === 'tool_call') return [{ type: 'tool', name: update.kind || update.title || 'tool', detail: short(update.title || toolDetail(update.rawInput)) }];
      return [];
    }
    if (event.type === 'runError') return [{ type: 'result', ok: false, text: state.text || '', error: data.message || 'run failed' }];
    if (event.type === 'runFinished') {
      const text = !data.finalTextTruncated && data.finalText ? data.finalText : state.text || '';
      return [...(text ? [{ type: 'text', text }] : []), { type: 'result', ok: true, text, ...usageOf(data.usage || data.tokenUsage) }];
    }
    return [];
  }
};

// `opencode run` answers permission questions on its own, so its permission levels cannot be
// narrowed from the command line: only full is offered.
const opencode = {
  id: 'opencode', name: 'OpenCode', bin: 'opencode',
  reportsCost: true, // summed from step_finish events
  reportsUsage: true,
  permissions: { 'read-only': 'opencode run may approve shell commands even with the plan agent; use full or another provider', edit: 'opencode run may approve shell commands on its own; use full or another provider', full: true },
  interactive: ({ prompt, model }) => [...(model ? ['--model', model] : []), '--prompt', prompt],
  invocation({ prompt, model }) {
    return { args: ['run', '--format', 'json', '--agent', 'build', ...(model ? ['--model', model] : []), prompt] };
  },
  parse(line, state) {
    const event = json(line);
    if (!event) return [];
    const part = event.part || {}, out = [];
    if (event.sessionID && !state.session) { state.session = event.sessionID; out.push({ type: 'session', id: event.sessionID }); }
    if (event.type === 'text' && part.text) { state.last = part.text; out.push({ type: 'text', text: part.text }); }
    if (event.type === 'tool_use') out.push({ type: 'tool', name: part.tool || 'tool', detail: toolDetail(part.state?.input) });
    if (event.type === 'step_finish' && typeof part.cost === 'number') state.cost = (state.cost || 0) + part.cost;
    if (event.type === 'step_finish' && part.tokens) state.usage = addUsage(state.usage, normalizeUsage(part.tokens));
    if (event.type === 'error') { state.error = event.error?.data?.message || event.error?.message || event.error?.name || 'error'; out.push({ type: 'error', message: state.error }); }
    return out;
  },
  finish(state) { return [{ type: 'result', ok: !state.error, text: state.last ?? '', cost: state.cost, ...(state.usage && { usage: state.usage }), error: state.error }]; }
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

/**
 * Which shell commands a run can execute: none when read-only, every command when full, and at
 * `edit` what the provider can scope: the verification commands (`verification`), anything
 * inside its own sandbox (`all`), or nothing (`none`). Custom CLIs keep their own rules.
 */
export function shellFor(provider, permission) {
  if (permission === 'read-only') return 'none';
  if (permission === 'full') return 'all';
  return provider.editShell || (provider.custom ? 'all' : 'none');
}

export const BUILTIN_PROVIDERS = [claude, codex, cursor, gemini, antigravity, copilot, kiro, opencode];

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
