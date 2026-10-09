// Build-time data loader: the CLI reference is generated from the same command
// registry that drives routing, `maverick help` and the Lens CLI explorer.
import { commands, GROUPS } from '../../../src/commands/index.js';

export default {
  watch: ['../../../src/commands/*.js'],
  load() {
    return {
      groups: GROUPS.map(({ id, title }) => ({ id, title })),
      commands: commands.map(({ id, group, description, aliases, usage }) => ({ id, group, description, usage, aliases: aliases.filter(alias => !alias.startsWith('-')) }))
    };
  }
};
