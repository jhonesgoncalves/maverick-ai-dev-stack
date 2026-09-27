import { PRESET_IDS } from '../core/presets.js';
import { output, packageVersion } from '../core/util.js';
import { capabilityCommands } from './capabilities.js';
import { deliveryCommands } from './delivery.js';
import { flowCommands } from './flow.js';
import { gateCommands } from './gates.js';
import { projectCommands } from './project.js';
import { taskCommands } from './task.js';

// Display order for help and the Lens CLI explorer.
const ORDER = ['dashboard', 'init', 'task', 'subtask', 'flow', 'map', 'stack', 'packet', 'checkpoint', 'impact', 'guard', 'learn', 'handoff', 'readiness', 'policy', 'adapter', 'ci', 'catalog', 'add', 'remove', 'installed', 'sync', 'verify', 'security', 'deps', 'pr', 'presets', 'suggest', 'validate', 'context', 'plan', 'review', 'config', 'doctor', 'status', 'info', 'help'];

const helpCommand = { id: 'help', description: 'Show usage and the command list.', aliases: ['--help', '-h'], usage: 'help', run: () => help() };

/**
 * The single source of truth for CLI commands: routing, help text and the Lens
 * command registry are all derived from this list. Each entry is
 * { id, description, aliases, usage, run({ cwd, arg, third, rest, options }) }.
 */
export const commands = [...projectCommands, ...taskCommands, ...gateCommands, ...deliveryCommands, ...capabilityCommands, ...flowCommands, helpCommand]
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

const byName = new Map(commands.flatMap(command => [command.id, ...command.aliases].map(name => [name, command])));

export function findCommand(name) { return byName.get(name); }

export function help() {
  const width = Math.max(...commands.map(command => command.usage.length)) + 2;
  const lines = commands.map(command => `  ${command.usage.padEnd(width)}${command.description}${command.aliases.filter(alias => !alias.startsWith('-')).length ? ` (alias: ${command.aliases.filter(alias => !alias.startsWith('-')).join(', ')})` : ''}`);
  output(`MAVERICK AI DEV STACK ${packageVersion}\n\nUsage: maverick <command> [task] [options]\n\nCommands:\n${lines.join('\n')}\n\nMost commands accept --json. Preset values: ${PRESET_IDS.join(', ')}\nStandard is the default. Every preset includes human review.`);
}
