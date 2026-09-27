import { commands } from '../commands/index.js';

// Read-only view of the CLI commands for the Lens explorer and integrations.
export const commandRegistry = commands.map(({ id, description, aliases, usage }) => ({ id, command: `maverick ${id}`, description, aliases, example: usage }));
