import {
  findCommand,
  parseOptions
} from "./chunk-ZAV7KFMK.js";

// src/cli.js
async function main(args, cwd = process.cwd()) {
  const { positional, options } = parseOptions(args), [name, arg, third] = positional;
  const command = findCommand(name || "help");
  if (!command) throw new Error(`unknown command: ${name}; run maverick help`);
  return command.run({ cwd, arg, third, rest: positional.slice(1), options });
}

export {
  main
};
