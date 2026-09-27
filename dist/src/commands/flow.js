import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readState, runFlow, writeState } from '../flows/engine.js';
import { findFlow, interpolate, loadFlows } from '../flows/model.js';
import { addSubtask, loadGraph, setStatus, STATUSES } from '../subtasks/graph.js';
import { getTask } from '../core/tasks.js';
import { brand, output, rel } from '../core/util.js';

const ICON = { pass: 'PASS', fail: 'FAIL', pending: 'WAIT' };

async function flowCommand(cwd, [action, ...args], options = {}) {
  if (!action || action === 'list') {
    const { flows, errors } = await loadFlows(cwd);
    if (options.json) return output(JSON.stringify({ flows: flows.map(({ name, description, source, contract, gates }) => ({ name, description, source, contract, gates: gates.map(gate => gate.id) })), errors }, null, 2));
    return output(`${brand()} / FLOWS\n\n${flows.map(flow => `${flow.name.padEnd(14)}${flow.description} [${flow.source}]`).join('\n') || 'No flows found.'}${errors.length ? `\n\n${errors.length} invalid flow(s); run maverick flow validate` : ''}\n\nRun with: maverick flow run <flow> <task>`);
  }
  if (action === 'validate') {
    const { flows, errors } = await loadFlows(cwd);
    if (options.json) output(JSON.stringify({ valid: !errors.length, flows: flows.length, errors }, null, 2));
    else { output(`${brand()} / FLOW VALIDATE\n${flows.length} valid flow(s)`); errors.forEach(error => output(`FAIL ${error.file} [${error.source}]: ${error.message}`)); }
    if (errors.length) throw new Error(`${errors.length} invalid flow(s)`);
    return;
  }
  if (action === 'show') {
    const flow = await findFlow(cwd, args[0]);
    if (options.json) return output(JSON.stringify(flow, null, 2));
    return output(`${brand()} / FLOW\n\n${flow.name} [${flow.source}]\n${flow.description}\n\nGoal: ${flow.contract.goal}\nIteration cap: ${flow.contract.iterationCap} · no-progress window: ${flow.contract.noProgressWindow}\n\nGates:\n${flow.gates.map(gate => `  ${gate.id.padEnd(14)}${gate.type}${gate.run ? `:${gate.run}` : ''}${gate.severity === 'warn' ? ' (warn)' : ''}${gate.description ? ` — ${gate.description}` : ''}`).join('\n')}`);
  }
  if (action === 'run') {
    const [name, slug] = args, flow = await findFlow(cwd, name), { dir } = await getTask(cwd, slug);
    const invoke = async argv => (await import('../cli.js')).main(argv, cwd);
    const { run, notes, reportPath, next } = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow, { reset: Boolean(options.reset) });
    if (options.json) output(JSON.stringify({ flow: flow.name, task: slug, outcome: run.outcome, iteration: run.iteration, iterationCap: flow.contract.iterationCap, next, notes, report: rel(cwd, reportPath), gates: run.results }, null, 2));
    else {
      output(`${brand()} / FLOW ${flow.name.toUpperCase()}\nGoal: ${interpolate(flow.contract.goal, { task: slug })}\n`);
      notes.forEach(note => output(`NOTE ${note}`));
      for (const result of run.results) {
        output(`${ICON[result.status]} ${result.id}${result.severity === 'warn' ? ' (warn)' : ''}${result.summary ? ` — ${result.summary}` : ''}`);
        result.issues.forEach(issue => output(`     ${issue}`));
      }
      output(`\nOutcome: ${run.outcome.toUpperCase()} (failed iteration ${run.iteration}/${flow.contract.iterationCap})\n${next}\nReport: ${rel(cwd, reportPath)}`);
    }
    // Only "done" exits zero, so scripts and agents can loop on the exit code safely.
    if (run.outcome !== 'done') throw new Error(`flow ${flow.name} outcome: ${run.outcome}`);
    return;
  }
  if (action === 'status') {
    const [slug] = args, { dir } = await getTask(cwd, slug);
    const files = (await readdir(join(dir, 'flows')).catch(() => [])).filter(file => file.endsWith('.json'));
    const states = await Promise.all(files.map(file => readState(dir, file.replace(/\.json$/, ''))));
    const summary = states.map(state => ({ flow: state.flow, status: state.status || 'not run', runs: state.runs.length, lastRun: state.runs.at(-1)?.at, approvals: state.approvals }));
    if (options.json) return output(JSON.stringify(summary, null, 2));
    return output(summary.length ? summary.map(item => `${item.flow.padEnd(14)}${item.status.padEnd(18)}${item.runs} run(s)${item.lastRun ? `, last ${item.lastRun}` : ''}`).join('\n') : `No flows have run for ${slug}. Try: maverick flow run ship ${slug}`);
  }
  if (action === 'approve') {
    const [name, slug, gateId] = args, flow = await findFlow(cwd, name), { dir } = await getTask(cwd, slug);
    const gate = flow.gates.find(item => item.id === gateId);
    if (!gate || gate.type !== 'approval') throw new Error(`${flow.name} has no approval gate "${gateId || ''}"; approval gates: ${flow.gates.filter(item => item.type === 'approval').map(item => item.id).join(', ') || 'none'}`);
    if (options.reject && (!options.reason || options.reason === true)) throw new Error('explain the rejection with --reason "..."');
    const state = await readState(dir, flow.name);
    const approval = { decision: options.reject ? 'reject' : 'approve', by: typeof options.by === 'string' ? options.by : process.env.USER || 'human', at: new Date().toISOString(), ...(typeof options.reason === 'string' && { reason: options.reason }) };
    await writeState(dir, { ...state, flow: flow.name, approvals: { ...state.approvals, [gate.id]: approval } });
    return output(options.json ? JSON.stringify(approval) : `${brand()} / FLOW APPROVAL\n✓ ${gate.id}: ${approval.decision} by ${approval.by}\nRun maverick flow run ${flow.name} ${slug} to re-evaluate.`);
  }
  throw new Error('use flow list, flow show <flow>, flow validate, flow run <flow> <task>, flow status <task>, or flow approve <flow> <task> <gate>');
}

async function subtaskCommand(cwd, [action, slug, ...args], options = {}) {
  const actions = ['add', 'list', 'next', 'set', 'validate'];
  if (!actions.includes(action)) throw new Error(`use subtask ${actions.join('|')} <task> ...`);
  const { dir } = await getTask(cwd, slug);
  if (action === 'add') {
    const title = args.join(' ').trim();
    if (!title) throw new Error('give the subtask a title, for example: maverick subtask add my-task "Add pagination to the API"');
    const after = typeof options.after === 'string' ? options.after.split(',').map(value => value.trim().padStart(2, '0')).filter(Boolean) : [];
    const created = await addSubtask(dir, slug, { title, after, type: typeof options.type === 'string' ? options.type : undefined, complexity: typeof options.complexity === 'string' ? options.complexity : undefined });
    return output(options.json ? JSON.stringify(created) : `${brand()} / SUBTASK\n✓ ${created.id}: ${title}${after.length ? ` (after ${after.join(', ')})` : ''}\nFile: ${rel(cwd, join(dir, 'subtasks', created.file))}`);
  }
  if (action === 'set') {
    const [id, status] = args;
    const item = await setStatus(dir, slug, (id || '').padStart(2, '0'), status);
    return output(options.json ? JSON.stringify({ id: item.id, status: item.status }) : `✓ ${item.id} ${item.title}: ${item.status}`);
  }
  const graph = await loadGraph(dir);
  if (action === 'validate') {
    if (options.json) output(JSON.stringify({ valid: !graph.problems.length, subtasks: graph.items.length, problems: graph.problems }, null, 2));
    else { output(`${brand()} / SUBTASK VALIDATE\n${graph.items.length} subtask(s)`); graph.problems.forEach(problem => output(`FAIL ${problem}`)); if (!graph.problems.length) output('PASS the subtask graph is valid and acyclic'); }
    if (graph.problems.length) throw new Error(`${graph.problems.length} subtask graph problem(s)`);
    return;
  }
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  if (action === 'next') {
    const ready = graph.items.filter(item => item.ready), inProgress = graph.items.filter(item => item.status === 'in-progress');
    const allDone = graph.items.length > 0 && graph.items.every(item => item.status === 'done');
    if (options.json) return output(JSON.stringify({ inProgress: inProgress.map(({ body: _body, ...item }) => item), ready: ready.map(({ body: _body, ...item }) => item), allDone }, null, 2));
    if (!graph.items.length) return output(`No subtasks yet. Add one with: maverick subtask add ${slug} "<title>"`);
    if (allDone) return output('All subtasks are done.');
    const lines = [...inProgress.map(item => `IN PROGRESS ${item.id} ${item.title}`), ...ready.map(item => `READY       ${item.id} ${item.title}${item.type ? ` [${item.type}]` : ''}`)];
    return output(lines.join('\n') || 'Nothing is ready: remaining subtasks are blocked or waiting on dependencies.');
  }
  const counts = Object.fromEntries(STATUSES.map(status => [status, graph.items.filter(item => item.status === status).length]));
  if (options.json) return output(JSON.stringify({ counts, items: graph.items.map(({ body: _body, ...item }) => item) }, null, 2));
  if (!graph.items.length) return output(`No subtasks yet. Add one with: maverick subtask add ${slug} "<title>"`);
  output(`${brand()} / SUBTASKS ${slug}\n\n${graph.items.map(item => `${item.id}  ${item.status.padEnd(12)}${item.ready ? '▶ ' : '  '}${item.title}${item.dependsOn.length ? `  (after ${item.dependsOn.join(', ')})` : ''}${item.type ? ` [${item.type}]` : ''}`).join('\n')}\n\n${counts.done}/${graph.items.length} done · ▶ ready to start`);
}

export const flowCommands = [
  { id: 'flow', description: 'Run contract-driven flows with typed gates, iteration caps, and stall detection.', aliases: [], usage: 'flow list|show|validate|run <flow> <task>|status <task>|approve', run: ({ cwd, rest, options }) => flowCommand(cwd, rest, options) },
  { id: 'subtask', description: 'Break a task into a dependency graph of subtasks.', aliases: [], usage: 'subtask add|list|next|set|validate <task>', run: ({ cwd, rest, options }) => subtaskCommand(cwd, rest, options) }
];
