import { join } from 'node:path';
import { loadConfig } from './config.js';
import { planningStages, presets } from './presets.js';
import { listTasks } from './tasks.js';
import { exists } from './util.js';
import { style } from './style.js';
import { canPrompt, pick } from '../ui/pick.js';

// Task-scoped commands accept the task as an optional argument: `maverick validate --stage techspec`
// asks which task to validate, listing first the tasks at that stage. Only a person at a terminal is
// asked; scripts, CI, agents and the MCP server get an error that names the tasks instead.

const PLANNING = [...new Set(Object.values(presets).flatMap(planningStages))];
const SIMPLE = ['packet', 'validate', 'learn', 'handoff', 'done', 'reopen', 'checkpoint', 'guard', 'integrity', 'readiness', 'verify', 'security', 'deps', 'review', 'instructions', 'generate'];

/** The stages a command usually works on, so tasks there are offered first. */
const PREFERRED = {
  verify: ['build', 'verify'], guard: ['build', 'verify'], integrity: ['build', 'verify'], deps: ['build', 'verify'], security: ['security', 'verify'],
  review: ['review', 'verify', 'security'], readiness: ['review', 'pr'], pr: ['pr', 'review'], done: ['pr'], reopen: ['done'], checkpoint: ['review', 'pr'],
  subtask: ['tasks', 'build'], agent: ['build'], loop: ['build', 'verify'],
  'flow:spec': ['spec'], 'flow:ship': ['verify', 'security', 'review'], 'flow:pr': ['pr'], 'flow:fix-checks': ['build', 'verify']
};

/** Where the task goes in the positional arguments (index 0 is the command), or -1 when this call takes none. */
function taskIndex(id, positional) {
  const action = positional[1];
  if (SIMPLE.includes(id)) return 1;
  if (id === 'pr') return action === 'open' ? 2 : 1;
  if (id === 'ci') return action === 'github' ? 2 : -1;
  if (id === 'policy') return action === 'check' ? 2 : -1;
  if (id === 'subtask') return ['list', 'next', 'validate'].includes(action) ? 2 : -1;
  if (id === 'agent') return ['run', 'runs'].includes(action) ? 2 : -1;
  if (id === 'flow') return action === 'run' ? 3 : action === 'status' ? 2 : -1;
  if (id === 'loop') return ['run', 'status', 'stop', 'verify', 'log', 'clean'].includes(action) ? 2 : -1;
  return -1;
}

/**
 * Fills in a missing task argument. Returns the positional arguments with the task in place,
 * unchanged when the task was given or the command takes none.
 */
export async function resolveTaskArg(cwd, id, positional, options) {
  let index = taskIndex(id, positional);
  if (index < 0) return positional;
  const args = [...positional], config = await loadConfig(cwd);
  let stage = typeof options.stage === 'string' ? options.stage : undefined;
  // `maverick instructions techspec`: a stage name where the task should be means "pick a task at that stage".
  if (['instructions', 'generate'].includes(id) && PLANNING.includes(args[1]) && !await exists(join(cwd, config.taskRoot, args[1]))) { stage = args[1]; args.splice(1, 0, undefined); }
  if (args[index]) return args;
  if (id === 'flow' && args[1] === 'run' && !args[2]) return args; // no flow named: let the command explain
  // `--worktree demo` reads "demo" as the flag's value: say so instead of asking which task.
  const tasks = (await listTasks(cwd, config)).map(task => task.task);
  const swallowed = Object.entries(options).find(([, value]) => typeof value === 'string' && tasks.includes(value));
  if (swallowed) { const flag = swallowed[0].replace(/[A-Z]/g, c => `-${c.toLowerCase()}`); throw new Error(`--${flag} took "${swallowed[1]}" as its value; put flags after the task: ${commandLine(id, args, index)} ${swallowed[1]} --${flag}`); }
  const preferred = stage ? [stage] : PREFERRED[id === 'flow' ? `flow:${args[2]}` : id] || [];
  args[index] = await chooseTask(cwd, config, { command: commandLine(id, args, index), preferred, stage });
  return args;
}

const commandLine = (id, args, index) => ['maverick', ...args.slice(0, index).filter(Boolean)].join(' ').replace(/^maverick \S+/, `maverick ${id}`);

async function chooseTask(cwd, config, { command, preferred, stage }) {
  const tasks = await listTasks(cwd, config), usage = `${command} <task>`;
  if (!tasks.length) throw new Error(`no tasks in ${cwd}; start one with maverick new "<idea>", or run this from the project that owns the task`);
  const at = tasks.filter(task => preferred.includes(task.stage)), rest = tasks.filter(task => !preferred.includes(task.stage));
  const where = stage ? `at ${stage.toUpperCase()}` : preferred.length ? `at ${preferred.map(item => item.toUpperCase()).join('/')}` : '';
  if (!canPrompt()) {
    const list = [...at, ...rest].map(task => `${task.task} (${task.stage.toUpperCase()})`).join(', ');
    throw new Error(`which task? pass it: ${usage}; tasks here: ${list}`);
  }
  if (tasks.length === 1) {
    process.stderr.write(`${style.gray('› task', process.stderr)} ${style.text(tasks[0].task, process.stderr)} ${style.gray(`(${tasks[0].stage.toUpperCase()}, the only task here)`, process.stderr)}\n`);
    return tasks[0].task;
  }
  const width = Math.max(...tasks.map(task => task.task.length));
  const item = (task, dim) => ({ value: task.task, label: task.task.padEnd(width), detail: `${task.stage.toUpperCase().padEnd(9)}${task.workflow}`, dim });
  const items = [
    ...at.map(task => item(task, false)),
    ...(at.length && rest.length ? [{ separator: 'other tasks' }] : []),
    ...rest.map(task => item(task, at.length > 0))
  ];
  const hint = where ? (at.length ? `${at.length} ${where}` : `none ${where}`) : '';
  const chosen = await pick({ title: 'Which task?', hint, items });
  if (!chosen) throw new Error('cancelled: no task chosen');
  return chosen;
}
