import { findCommand } from './commands/index.js';
import { parseOptions } from './core/util.js';

export async function main(args, cwd = process.cwd()) {
  const { positional, options } = parseOptions(args), [name, arg, third] = positional;
  const command = findCommand(name || 'help');
  if (!command) throw new Error(`unknown command: ${name}; run maverick help`);
  return command.run({ cwd, arg, third, rest: positional.slice(1), options });
}

export { sectionPresent, replaceVars } from './core/util.js';
export { loadConfig, defaultConfig } from './core/config.js';
export { stagesForPreset } from './core/presets.js';
export { recommendPreset } from './core/preset-suggestion.js';
export { commandRegistry } from './core/command-registry.js';
export { detectStack } from './core/stack.js';
