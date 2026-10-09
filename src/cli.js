import { findCommand, suggestCommand } from './commands/index.js';
import { resolveTaskArg } from './core/task-arg.js';
import { brandOutput, parseOptions } from './core/util.js';

export async function main(args, cwd = process.cwd()) {
  const parsed = parseOptions(args), { options } = parsed, name = parsed.positional[0];
  const command = findCommand(name || 'help');
  if (!command) { const guess = suggestCommand(name); throw new Error(`unknown command: ${name}; ${guess ? `did you mean "maverick ${guess}"? ` : ''}run maverick help`); }
  // A missing <task> is asked for on a terminal (tasks at the relevant stage first), or named in the error elsewhere.
  const positional = await resolveTaskArg(cwd, command.id, parsed.positional, options), [, arg, third] = positional;
  // Raw formats (--json, --format mermaid|dot) stay machine-readable, mcp's stdout is JSON-RPC, help draws its own title.
  if (!options.json && !options.format && !['help', 'mcp'].includes(command.id)) brandOutput(command.id.toUpperCase());
  return command.run({ cwd, arg, third, rest: positional.slice(1), options });
}

export { sectionPresent, replaceVars } from './core/util.js';
export { loadConfig, defaultConfig } from './core/config.js';
export { stagesForPreset } from './core/presets.js';
export { commandRegistry } from './core/command-registry.js';
export { detectStack } from './core/stack.js';
