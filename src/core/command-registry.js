import { commands, GROUPS } from '../commands/index.js';

// Read-only view of the CLI commands for the Lens explorer and integrations.
const groupTitle = new Map(GROUPS.flatMap(group => group.commands.map(id => [id, group.title])));
export const commandRegistry = commands.map(({ id, description, aliases, usage }) => ({ id, command: `maverick ${id}`, description, aliases, example: usage, group: groupTitle.get(id) || 'Other' }));
