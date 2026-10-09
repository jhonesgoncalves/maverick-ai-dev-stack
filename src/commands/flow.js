import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { autoApproves, readState, recordApproval, runFlow } from '../flows/engine.js';
import { findFlow, interpolate, loadFlows } from '../flows/model.js';
import { addSubtask, loadGraph, setStatus, STATUSES } from '../subtasks/graph.js';
import { loadConfig } from '../core/config.js';
import { getTask } from '../core/tasks.js';
import { runHooks } from '../runtime/hooks.js';
import { printer, startAgentRun } from './agent.js';
import { brand, exists, output, pretty, rel } from '../core/util.js';

const ICON = { pass: 'PASS', fail: 'FAIL', pending: 'WAIT' };

function report(cwd, flow, slug, { run, notes, reportPath, next }, options) {
  if (options.json) return;
  output(`${brand()} / FLOW ${flow.name.toUpperCase()}\nGoal: ${interpolate(flow.contract.goal, { task: slug })}\n`);
  notes.forEach(note => output(`NOTE ${note}`));
  for (const result of run.results) {
    output(`${ICON[result.status]} ${result.id}${result.severity === 'warn' ? ' (warn)' : ''}${result.summary ? ` — ${result.summary}` : ''}`);
    result.issues.forEach(issue => output(`     ${issue}`));
  }
  output(`\nOutcome: ${run.outcome.toUpperCase()} (failed iteration ${run.iteration}/${flow.contract.iterationCap})\n${next}\nReport: ${rel(cwd, reportPath)}`);
}

async function afterFlowHook(cwd, config, flow, slug, { run }) {
  const hooks = await runHooks(cwd, config, 'after-flow-run', { task: slug, flow: flow.name, outcome: run.outcome, iteration: run.iteration });
  hooks.warnings.forEach(warning => output(`WARN ${warning}`));
}

/**
 * Lists or changes `flows.autoApprove` in the project configuration. Like trust, it is a
 * committed decision: a flow that approves itself skips the human review it was built around.
 */
async function autoApprove(cwd, [name, state], options) {
  if (name) await findFlow(cwd, name);
  if (name && !['on', 'off'].includes(state)) throw new Error(`use flow auto-approve ${name} on|off`);
  const path = join(cwd, '.maverick', 'config.json');
  if (name) {
    const current = await exists(path) ? JSON.parse(await readFile(path, 'utf8')) : { version: 1 };
    const names = new Set(current.flows?.autoApprove || []);
    if (state === 'on') names.add(name); else names.delete(name);
    const flows = { ...current.flows, autoApprove: [...names].sort() };
    if (!flows.autoApprove.length) delete flows.autoApprove;
    const next = { ...current, flows };
    if (!Object.keys(flows).length) delete next.flows;
    await mkdir(join(cwd, '.maverick'), { recursive: true });
    await writeFile(path, pretty(next));
  }
  const config = await loadConfig(cwd), { flows } = await loadFlows(cwd), enabled = flows.map(flow => flow.name).filter(flow => autoApproves(config, flow));
  if (options.json) return output(JSON.stringify({ autoApprove: enabled }));
  if (name) return output(`${brand()} / FLOW AUTO-APPROVE\n✓ ${name}: auto-approval ${state}; written to ${rel(cwd, path)}\n${state === 'on' ? 'Pending approvals are approved once every blocking check passes. Commit this file so the team reviews the decision.' : 'A human records every approval again.'}`);
  return output(`${brand()} / FLOW AUTO-APPROVE\n${enabled.length ? enabled.map(flow => `${flow.padEnd(14)}on`).join('\n') : 'No flow approves itself: a human records every approval.'}\n\nChange with: maverick flow auto-approve <flow> on|off, or once with: maverick flow run <flow> <task> --auto-approve`);
}

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
    const [name, slug] = args, flow = await findFlow(cwd, name), { dir } = await getTask(cwd, slug), config = await loadConfig(cwd);
    const invoke = async argv => (await import('../cli.js')).main(argv, cwd);
    const agentRuns = [];
    const autoApprove = Boolean(options.autoApprove);
    let result = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow, { reset: Boolean(options.reset), autoApprove });
    report(cwd, flow, slug, result, options);
    await afterFlowHook(cwd, config, flow, slug, result);
    // With --agent, "revise" hands the blocking issues to the agent and re-runs the gates.
    // The flow contract (iteration cap, no-progress window) is what guarantees termination.
    while (options.agent && result.run.outcome === 'revise') {
      const issues = result.run.results.filter(item => item.severity === 'block' && item.status === 'fail').flatMap(item => item.issues.map(issue => `${item.id}: ${issue}`));
      if (!options.json) output(`\n${brand()} / AGENT FIX (iteration ${result.run.iteration}/${flow.contract.iterationCap})`);
      const { run: agent } = await startAgentRun(cwd, { slug, dir, config, issues, instruction: `Fix the blocking issues so the "${flow.name}" flow passes. Goal: ${interpolate(flow.contract.goal, { task: slug })}`, options, onEvent: printer(options) });
      agentRuns.push({ ok: agent.ok, status: agent.result?.status || null, summary: agent.result?.summary || null, transcript: rel(cwd, agent.transcript) });
      if (!agent.ok) throw new Error(`agent fix run failed: ${agent.problems.join('; ')}`);
      if (agent.result && agent.result.status !== 'done') {
        if (options.json) output(JSON.stringify({ flow: flow.name, task: slug, outcome: result.run.outcome, agentRuns, questions: agent.result.questions }, null, 2));
        else { output(`\nThe agent stopped: ${agent.result.status}. ${agent.result.summary}`); agent.result.questions.forEach(question => output(`? ${question}`)); }
        throw new Error(`agent needs a human: ${agent.result.status}`);
      }
      result = await runFlow({ cwd, task: slug, taskDir: dir, invoke }, flow, { autoApprove });
      report(cwd, flow, slug, result, options);
      await afterFlowHook(cwd, config, flow, slug, result);
    }
    if (options.json) output(JSON.stringify({ flow: flow.name, task: slug, outcome: result.run.outcome, iteration: result.run.iteration, iterationCap: flow.contract.iterationCap, next: result.next, notes: result.notes, report: rel(cwd, result.reportPath), gates: result.run.results, agentRuns }, null, 2));
    // Only "done" exits zero, so scripts and agents can loop on the exit code safely.
    if (result.run.outcome !== 'done') throw new Error(`flow ${flow.name} outcome: ${result.run.outcome}`);
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
    if (options.reject && (!options.reason || options.reason === true)) throw new Error('explain the rejection with --reason "..."');
    const { approval, run, next } = await recordApproval({ cwd, task: slug, taskDir: dir }, flow, gateId, { decision: options.reject ? 'reject' : 'approve', by: typeof options.by === 'string' ? options.by : process.env.USER || 'human', ...(typeof options.reason === 'string' && { reason: options.reason }) });
    if (options.json) return output(JSON.stringify({ ...approval, outcome: run?.outcome || null }));
    return output(`${brand()} / FLOW APPROVAL\n✓ ${gateId}: ${approval.decision} by ${approval.by}\n${run ? `Outcome: ${run.outcome.toUpperCase()}\n${next}` : `Run maverick flow run ${flow.name} ${slug} to re-evaluate.`}`);
  }
  if (action === 'auto-approve') return autoApprove(cwd, args, options);
  throw new Error('use flow list, flow show <flow>, flow validate, flow run <flow> <task> [--auto-approve], flow status <task>, flow approve <flow> <task> <gate>, or flow auto-approve [<flow> on|off]');
}

/** `  3/7` when the task file has checklist items. */
const progress = item => (item.checklist?.total ? `  ${item.checklist.done}/${item.checklist.total}` : '');

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
    const item = await setStatus(dir, slug, (id || '').padStart(2, '0'), status, { force: Boolean(options.force) });
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
    const lines = [...inProgress.flatMap(item => [`IN PROGRESS ${item.id} ${item.title}${progress(item)}`, ...item.checklist.open.map(entry => `              - [ ] ${entry.section ? `${entry.section}: ` : ''}${entry.text}`)]), ...ready.map(item => `READY       ${item.id} ${item.title}${item.type ? ` [${item.type}]` : ''}`)];
    return output(lines.join('\n') || 'Nothing is ready: remaining subtasks are blocked or waiting on dependencies.');
  }
  const counts = Object.fromEntries(STATUSES.map(status => [status, graph.items.filter(item => item.status === status).length]));
  if (options.json) return output(JSON.stringify({ counts, items: graph.items.map(({ body: _body, ...item }) => item) }, null, 2));
  if (!graph.items.length) return output(`No subtasks yet. Add one with: maverick subtask add ${slug} "<title>"`);
  output(`${brand()} / SUBTASKS ${slug}\n\n${graph.items.map(item => `${item.id}  ${item.status.padEnd(12)}${item.ready ? '▶ ' : '  '}${item.title}${progress(item)}${item.dependsOn.length ? `  (after ${item.dependsOn.join(', ')})` : ''}${item.type ? ` [${item.type}]` : ''}`).join('\n')}\n\n${counts.done}/${graph.items.length} done · ▶ ready to start`);
}

export const flowCommands = [
  { id: 'flow', description: 'Run contract-driven flows with typed gates, iteration caps, and stall detection.', aliases: [], usage: 'flow list|show|validate|run <flow> <task> [--auto-approve]|status <task>|approve|auto-approve [<flow> on|off]', run: ({ cwd, rest, options }) => flowCommand(cwd, rest, options) },
  { id: 'subtask', description: 'Break a task into a dependency graph of subtasks.', aliases: [], usage: 'subtask add|list|next|set|validate <task> [set: <id> <status> [--force]]', run: ({ cwd, rest, options }) => subtaskCommand(cwd, rest, options) }
];
