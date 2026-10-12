import {
  GROUPS,
  commands
} from "./chunk-KCWDTZSZ.js";

// src/core/command-registry.js
var groupTitle = new Map(GROUPS.flatMap((group) => group.commands.map((id) => [id, group.title])));
var commandRegistry = commands.map(({ id, description, aliases, usage }) => ({ id, command: `maverick ${id}`, description, aliases, example: usage, group: groupTitle.get(id) || "Other" }));

export {
  commandRegistry
};
