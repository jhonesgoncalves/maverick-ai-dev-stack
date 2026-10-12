import { GROUPS, commands, findCommand } from '../commands/index.js';

// Pure model behind the interactive launcher: which entries to show, how they
// filter, and which argv to pre-fill. Kept free of Ink so it is unit-testable.

/** Arguments to pre-fill for a command: sub-command defaults, the latest task for `<task>`, literal flags. */
export function prefill(command, snapshot = {}) {
  const args = [];
  for (const token of command.usage.split(' ').slice(1)) {
    if (token.startsWith('[')) break;
    if (token.includes('|') && !args.length) { const options = token.split('|'); args.push(options.find(item => ['list', 'show'].includes(item)) || options[0]); continue; }
    if (token === '<task>' && snapshot.latest) { args.push(snapshot.latest.slug); continue; }
    if (token.startsWith('<')) break;
    if (token.startsWith('--') && !token.includes('<')) args.push(token);
  }
  return args;
}

/** True when the usage has a required placeholder the pre-fill cannot satisfy. */
export function needsInput(command, snapshot = {}) {
  const required = command.usage.split(' ').slice(1).filter(token => token.startsWith('<'));
  return required.some(token => token !== '<task>' || !snapshot.latest) || command.usage.split(' ')[1]?.includes('|');
}

function entry(command, extra = {}) {
  return { key: `${extra.group || command.group}:${command.id}:${(extra.argv || []).join(' ')}`, id: command.id, group: command.group, usage: command.usage, description: command.description, aliases: command.aliases.filter(alias => !alias.startsWith('-')), ...extra };
}

/** The commands that move the latest task forward from its current stage. */
function latestSteps({ slug, stage }) {
  if (['prd', 'spec', 'techspec', 'tasks'].includes(stage)) return [['new', [slug]], ['instructions', [slug]]];
  if (stage === 'build') return [['subtask', ['next', slug]], ['verify', [slug]]];
  if (stage === 'security') return [['security', [slug]], ['review', [slug, '--diff']]];
  if (stage === 'pr') return [['flow', ['run', 'pr', slug]], ['done', [slug]]];
  if (stage === 'done') return [['reopen', [slug]]];
  return [['verify', [slug]], ['review', [slug, '--diff']], ['readiness', [slug]]];
}

/** Context-aware shortcuts shown first, with their argv ready to run. */
export function suggestions(snapshot = {}) {
  const pick = (id, argv, label) => ({ id, argv, label });
  const list = !snapshot.initialized
    ? [pick('init', [], 'init'), pick('new', [], 'new "<idea>"'), pick('doctor', [], 'doctor'), pick('stack', [], 'stack')]
    : !snapshot.latest
      ? [pick('new', [], 'new "<idea>"'), pick('map', [], 'map'), pick('stack', [], 'stack'), pick('doctor', [], 'doctor')]
      : [...latestSteps(snapshot.latest).map(([id, argv]) => pick(id, argv, `${id} ${argv.join(' ')}`)), pick('status', [], 'status'), pick('new', [], 'new "<idea>"')];
  return list.map(item => entry(findCommand(item.id), { group: 'suggested', label: item.label, argv: item.argv, ready: item.id !== 'new' || item.argv.length > 0 }));
}

export const SUGGESTED = { id: 'suggested', title: 'Suggested' };
export const launcherGroups = [SUGGESTED, ...GROUPS];

function score(item, query) {
  const haystack = [item.id, ...item.aliases].join(' '), q = query.toLowerCase();
  if (item.id.startsWith(q)) return 3;
  if (haystack.includes(q)) return 2;
  if (item.description.toLowerCase().includes(q)) return 1;
  let at = 0; for (const char of q) { at = item.id.indexOf(char, at) + 1; if (!at) return 0; }
  return 0.5;
}

/** Entries to display: grouped when browsing, ranked across all commands when searching. */
export function entriesFor(snapshot, query = '') {
  if (!query.trim()) return [...suggestions(snapshot), ...GROUPS.flatMap(group => group.commands.map(id => entry(findCommand(id))))];
  return commands.map(command => ({ item: entry(command), rank: score(entry(command), query.trim()) })).filter(result => result.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.item.id.localeCompare(b.item.id)).map(result => result.item);
}
