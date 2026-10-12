import {
  findCommand,
  suggestCommand
} from "./chunk-PUP4WTVD.js";
import {
  brandOutput,
  exists,
  listTasks,
  loadConfig,
  parseOptions,
  planningStages,
  presets,
  style
} from "./chunk-EVJRL34C.js";

// src/core/task-arg.js
import { join } from "path";

// src/ui/pick.js
import { emitKeypressEvents } from "readline";
function canPrompt() {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY) && !process.env.CI;
}
function pick({ title, hint, items, initial = 0 }) {
  const out = process.stderr, input = process.stdin;
  const selectable = items.map((item, index2) => item.separator ? -1 : index2).filter((index2) => index2 >= 0);
  if (!selectable.length) return Promise.resolve(null);
  const s = (fn, text) => fn(text, out);
  let index = selectable.includes(initial) ? initial : selectable[0], drawn = 0;
  const row = (item, i) => {
    if (item.separator) return s(style.gray, `  ${item.separator}`);
    const on = i === index, label = on ? s(style.text, item.label) : item.dim ? s(style.gray, item.label) : item.label;
    return `${on ? s(style.brand, "\u276F") : " "} ${label}${item.detail ? `  ${on ? item.detail : s(style.gray, item.detail)}` : ""}`;
  };
  const render = () => {
    const lines = [`${s(style.brand, "?")} ${s(style.bold, title)}${hint ? `  ${s(style.gray, hint)}` : ""}`, ...items.map(row), s(style.gray, "  \u2191/\u2193 move \xB7 enter select \xB7 esc cancel")];
    out.write(`${drawn ? `\x1B[${drawn}A` : ""}${lines.map((line) => `\x1B[2K${line}`).join("\n")}
`);
    drawn = lines.length;
  };
  const move = (step) => {
    const at = selectable.indexOf(index);
    index = selectable[(at + step + selectable.length) % selectable.length];
    render();
  };
  return new Promise((resolve) => {
    const finish = (value) => {
      input.off("keypress", onKey);
      input.setRawMode(false);
      input.pause();
      out.write(`\x1B[${drawn}A\x1B[0J${value === null ? `${s(style.gray, "\u2716")} ${title} ${s(style.gray, "cancelled")}` : `${s(style.green, "\u2714")} ${title} ${s(style.text, items[index].label.trim())}`}
\x1B[?25h`);
      resolve(value === null ? null : value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === "c") return finish(null);
      if (key.name === "escape" || text === "q") return finish(null);
      if (key.name === "up" || text === "k") return move(-1);
      if (key.name === "down" || text === "j" || key.name === "tab") return move(1);
      if (key.name === "return" || key.name === "enter") return finish(items[index].value);
      const number = Number(text);
      if (number >= 1 && number <= selectable.length) {
        index = selectable[number - 1];
        render();
      }
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKey);
    out.write("\x1B[?25l");
    render();
  });
}

// src/core/task-arg.js
var PLANNING = [...new Set(Object.values(presets).flatMap(planningStages))];
var SIMPLE = ["packet", "validate", "learn", "handoff", "done", "reopen", "checkpoint", "guard", "integrity", "ablation", "structure", "readiness", "verify", "security", "deps", "review", "instructions", "generate"];
var PREFERRED = {
  verify: ["build", "verify"],
  guard: ["build", "verify"],
  integrity: ["build", "verify"],
  ablation: ["build", "verify"],
  structure: ["build", "verify"],
  deps: ["build", "verify"],
  security: ["security", "verify"],
  review: ["review", "verify", "security"],
  readiness: ["review", "pr"],
  pr: ["pr", "review"],
  done: ["pr"],
  reopen: ["done"],
  checkpoint: ["review", "pr"],
  subtask: ["tasks", "build"],
  agent: ["build"],
  loop: ["build", "verify"],
  seal: ["tasks", "spec", "build"],
  unseal: ["review", "verify"],
  "flow:spec": ["spec"],
  "flow:ship": ["verify", "security", "review"],
  "flow:pr": ["pr"],
  "flow:fix-checks": ["build", "verify"]
};
function taskIndex(id, positional) {
  const action = positional[1];
  if (SIMPLE.includes(id)) return 1;
  if (id === "pr") return action === "open" ? 2 : 1;
  if (id === "ci") return action === "github" ? 2 : -1;
  if (id === "policy") return action === "check" ? 2 : -1;
  if (id === "subtask") return ["list", "next", "validate"].includes(action) ? 2 : -1;
  if (id === "agent") return ["run", "runs"].includes(action) ? 2 : -1;
  if (id === "flow") return action === "run" ? 3 : action === "status" ? 2 : -1;
  if (id === "seal") return ["status", "approve"].includes(action) ? 2 : 1;
  if (id === "unseal") return 1;
  if (id === "loop") return ["run", "status", "stop", "verify", "log", "release", "clean"].includes(action) ? 2 : -1;
  return -1;
}
async function resolveTaskArg(cwd, id, positional, options) {
  let index = taskIndex(id, positional);
  if (index < 0) return positional;
  const args = [...positional], config = await loadConfig(cwd);
  let stage = typeof options.stage === "string" ? options.stage : void 0;
  if (["instructions", "generate"].includes(id) && PLANNING.includes(args[1]) && !await exists(join(cwd, config.taskRoot, args[1]))) {
    stage = args[1];
    args.splice(1, 0, void 0);
  }
  if (args[index]) return args;
  if (id === "flow" && args[1] === "run" && !args[2]) return args;
  const tasks = (await listTasks(cwd, config)).map((task) => task.task);
  const swallowed = Object.entries(options).find(([, value]) => typeof value === "string" && tasks.includes(value));
  if (swallowed) {
    const flag = swallowed[0].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    throw new Error(`--${flag} took "${swallowed[1]}" as its value; put flags after the task: ${commandLine(id, args, index)} ${swallowed[1]} --${flag}`);
  }
  const preferred = stage ? [stage] : PREFERRED[id === "flow" ? `flow:${args[2]}` : id] || [];
  args[index] = await chooseTask(cwd, config, { command: commandLine(id, args, index), preferred, stage });
  return args;
}
var commandLine = (id, args, index) => ["maverick", ...args.slice(0, index).filter(Boolean)].join(" ").replace(/^maverick \S+/, `maverick ${id}`);
async function chooseTask(cwd, config, { command, preferred, stage }) {
  const tasks = await listTasks(cwd, config), usage = `${command} <task>`;
  if (!tasks.length) throw new Error(`no tasks in ${cwd}; start one with maverick new "<idea>", or run this from the project that owns the task`);
  const at = tasks.filter((task) => preferred.includes(task.stage)), rest = tasks.filter((task) => !preferred.includes(task.stage));
  const where = stage ? `at ${stage.toUpperCase()}` : preferred.length ? `at ${preferred.map((item2) => item2.toUpperCase()).join("/")}` : "";
  if (!canPrompt()) {
    const list = [...at, ...rest].map((task) => `${task.task} (${task.stage.toUpperCase()})`).join(", ");
    throw new Error(`which task? pass it: ${usage}; tasks here: ${list}`);
  }
  if (tasks.length === 1) {
    process.stderr.write(`${style.gray("\u203A task", process.stderr)} ${style.text(tasks[0].task, process.stderr)} ${style.gray(`(${tasks[0].stage.toUpperCase()}, the only task here)`, process.stderr)}
`);
    return tasks[0].task;
  }
  const width = Math.max(...tasks.map((task) => task.task.length));
  const item = (task, dim) => ({ value: task.task, label: task.task.padEnd(width), detail: `${task.stage.toUpperCase().padEnd(9)}${task.workflow}`, dim });
  const items = [
    ...at.map((task) => item(task, false)),
    ...at.length && rest.length ? [{ separator: "other tasks" }] : [],
    ...rest.map((task) => item(task, at.length > 0))
  ];
  const hint = where ? at.length ? `${at.length} ${where}` : `none ${where}` : "";
  const chosen = await pick({ title: "Which task?", hint, items });
  if (!chosen) throw new Error("cancelled: no task chosen");
  return chosen;
}

// src/cli.js
async function main(args, cwd = process.cwd()) {
  const parsed = parseOptions(args), { options } = parsed, name = parsed.positional[0];
  const command = findCommand(name || "help");
  if (!command) {
    const guess = suggestCommand(name);
    throw new Error(`unknown command: ${name}; ${guess ? `did you mean "maverick ${guess}"? ` : ""}run maverick help`);
  }
  const positional = await resolveTaskArg(cwd, command.id, parsed.positional, options), [, arg, third] = positional;
  if (!options.json && !options.format && !["help", "mcp"].includes(command.id)) brandOutput(command.id.toUpperCase());
  return command.run({ cwd, arg, third, rest: positional.slice(1), options });
}

export {
  main
};
