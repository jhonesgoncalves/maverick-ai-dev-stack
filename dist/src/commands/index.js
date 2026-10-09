import { brand, output, packageVersion } from '../core/util.js';
import { colorEnabled, style, wordmark } from '../core/style.js';
import { agentCommands } from './agent.js';
import { capabilityCommands } from './capabilities.js';
import { deliveryCommands } from './delivery.js';
import { flowCommands } from './flow.js';
import { gateCommands } from './gates.js';
import { intelCommands } from './intel.js';
import { projectCommands } from './project.js';
import { newCommands } from './new.js';
import { taskCommands } from './task.js';

// Display order for help and the Lens CLI explorer.
const ORDER = ['lens', 'init', 'language', 'new', 'instructions', 'generate', 'subtask', 'flow', 'agent', 'map', 'stack', 'graph', 'hotspots', 'routes', 'coupling', 'audit', 'mcp', 'packet', 'checkpoint', 'impact', 'guard', 'learn', 'handoff', 'readiness', 'policy', 'adapter', 'ci', 'catalog', 'add', 'remove', 'installed', 'sync', 'verify', 'security', 'deps', 'pr', 'validate', 'review', 'config', 'doctor', 'status', 'info', 'help'];

/** Help and the interactive launcher present commands in these groups, in this order. */
export const GROUPS = [
  { id: 'start', title: 'Get started', commands: ['init', 'language', 'status', 'doctor', 'lens'] },
  { id: 'workflow', title: 'Plan & build', commands: ['new', 'instructions', 'generate', 'validate', 'subtask', 'packet'] },
  { id: 'gates', title: 'Verify & review', commands: ['verify', 'checkpoint', 'guard', 'security', 'deps', 'review', 'readiness', 'policy'] },
  { id: 'delivery', title: 'Deliver', commands: ['pr', 'handoff', 'learn', 'ci'] },
  { id: 'automation', title: 'Flows & agents', commands: ['flow', 'agent', 'adapter', 'mcp'] },
  { id: 'intel', title: 'Project intelligence', commands: ['map', 'stack', 'graph', 'coupling', 'routes', 'hotspots', 'impact', 'audit'] },
  { id: 'capabilities', title: 'Capabilities', commands: ['catalog', 'add', 'remove', 'installed', 'sync'] },
  { id: 'meta', title: 'Configuration', commands: ['config', 'info', 'help'] }
];
const groupOf = new Map(GROUPS.flatMap(group => group.commands.map(id => [id, group.id])));

const helpCommand = { id: 'help', description: 'Show usage, or details for one command.', aliases: ['--help', '-h'], usage: 'help [command]', run: ({ arg }) => help(arg) };

/**
 * The single source of truth for CLI commands: routing, help text and the Lens
 * command registry are all derived from this list. Each entry is
 * { id, group, description, aliases, usage, run({ cwd, arg, third, rest, options }) }.
 */
export const commands = [...projectCommands, ...newCommands, ...taskCommands, ...gateCommands, ...deliveryCommands, ...capabilityCommands, ...flowCommands, ...agentCommands, ...intelCommands, helpCommand]
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
  .map(command => ({ ...command, group: groupOf.get(command.id) || 'meta' }));

const byName = new Map(commands.flatMap(command => [command.id, ...command.aliases].map(name => [name, command])));

export function findCommand(name) { return byName.get(name); }

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const current = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = current; }
  }
  return row[b.length];
}

/** The closest known command or alias to a mistyped name, if any is close enough. */
export function suggestCommand(name) {
  const [best] = [...byName.keys()].filter(key => !key.startsWith('-')).map(key => ({ key, score: key.startsWith(name) ? 0 : distance(name, key) })).sort((a, b) => a.score - b.score);
  return best && best.score <= Math.max(1, Math.floor(name.length / 3)) ? byName.get(best.key).id : undefined;
}

const publicAliases = command => command.aliases.filter(alias => !alias.startsWith('-'));

function commandHelp(name) {
  const command = findCommand(name);
  if (!command) { const guess = suggestCommand(name); throw new Error(`unknown command: ${name}${guess ? `; did you mean "${guess}"?` : ''}`); }
  const group = GROUPS.find(item => item.id === command.group), related = group.commands.filter(id => id !== command.id);
  output([
    `${brand()} / ${command.id.toUpperCase()}`, '', command.description, '',
    'Usage:', `  maverick ${command.usage}`,
    ...(publicAliases(command).length ? ['', `Aliases:    ${publicAliases(command).join(', ')}`] : []),
    `Group:      ${group.title}`,
    ...(related.length ? [`Related:    ${related.join(', ')}`] : [])
  ].join('\n'));
}

export function help(name) {
  if (name) return commandHelp(name);
  const color = colorEnabled(), width = 30;
  const row = command => {
    const [head, ...tail] = command.usage.split(' '), aliases = publicAliases(command);
    const usage = `${style.bold(head)}${tail.length ? ` ${style.gray(tail.join(' '))}` : ''}`;
    const gap = command.usage.length < width - 1 ? ' '.repeat(width - command.usage.length) : `\n  ${' '.repeat(width)}`;
    return `  ${usage}${gap}${command.description}${aliases.length ? style.dim(` (alias: ${aliases.join(', ')})`) : ''}`;
  };
  const sections = GROUPS.map(group => `${color ? style.amber(style.bold(group.title.toUpperCase())) : `${group.title}:`}\n${group.commands.map(findCommand).map(row).join('\n')}`);
  const title = color ? `${wordmark()} ${style.gray(`v${packageVersion}`)}\n${style.italic(style.gray('Understand. Build. Debug. Ship.'))}` : `MAVERICK AI ${packageVersion}`;
  const usage = color ? `${style.amber(style.bold('USAGE'))}\n  ${style.cyan('maverick')} ${style.bold('<command>')} ${style.gray('[task] [options]')}` : 'Usage: maverick <command> [task] [options]';
  const tips = [
    `${style.cyan('maverick')}                 open the interactive launcher`,
    `${style.cyan('maverick help <command>')}  details for one command`,
    `${style.gray('--json')}                   machine-readable output on most commands`,
    `${style.cyan('maverick new "<idea>"')}    start here: PRD → technical spec → tasks, written with your AI agent`
  ];
  // Written directly: the text is already styled, so it must not pass through `output` decoration twice.
  output(`${title}\n\n${usage}\n\n${color ? '' : 'Commands:\n\n'}${sections.join('\n\n')}\n\n${color ? style.amber(style.bold('TIPS')) : 'Tips:'}\n${tips.map(tip => `  ${tip}`).join('\n')}`);
}
