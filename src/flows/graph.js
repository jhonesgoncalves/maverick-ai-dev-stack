import { z } from 'zod';
import { EFFORTS } from '../core/enums.js';
import { RUBRICS } from '../decide/decisions.js';

// Flows v2: a typed DAG in a file, never a general graph framework. Nodes are gates, agents,
// typed decisions, humans, fan-outs, joins and explicit ends; an edge carries a typed contract (the
// outputs of its source it follows). A file that could loop, route to an output its source cannot
// produce, or let an advisory decision finish a flow on its own is refused when it is loaded.
// Iteration stays where it was in v1: a run is one pass, and the contract's cap and no-progress
// window decide whether another pass may follow.

export const NODE_TYPES = ['gate', 'agent', 'decision', 'human', 'fan-out', 'join', 'end'];
export const CONTEXT_PARTS = ['prd', 'spec', 'techspec', 'subtask', 'diff', 'gates', 'notes', 'review'];
/** The outcomes an `end` node may declare: the v1 outcomes a run can reach on its own. */
export const END_OUTCOMES = ['done', 'revise', 'stalled'];

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'use a lowercase kebab-case id');
const common = { id, description: z.string().optional() };

const node = z.discriminatedUnion('type', [
  // A gate node holds any v1 gate (check, maverick, command, artifact, approval, judge, sealed) without its id.
  z.object({ ...common, type: z.literal('gate'), gate: z.record(z.string(), z.unknown()) }),
  z.object({
    ...common, type: z.literal('agent'), prompt: z.string().min(1),
    stage: z.string().min(1).optional(), provider: z.string().min(1).optional(), model: z.string().min(1).optional(), effort: z.enum(EFFORTS).optional(),
    permission: z.enum(['read-only', 'edit']).default('read-only'),
    // The context policy: what this agent reads, and nothing else.
    context: z.object({ include: z.array(z.enum(CONTEXT_PARTS)).default(['prd', 'spec', 'diff']), maxDiffBytes: z.number().int().min(1000).max(200000).default(40000) }).default({ include: ['prd', 'spec', 'diff'], maxDiffBytes: 40000 }),
    timeoutMinutes: z.number().positive().max(120).optional()
  }),
  z.object({ ...common, type: z.literal('decision'), rubric: z.enum(Object.keys(RUBRICS)), risk: z.enum(['low', 'medium', 'high']).default('high') }),
  z.object({ ...common, type: z.literal('human'), prompt: z.string().min(1), file: z.string().optional(), pattern: z.string().optional() }),
  z.object({ ...common, type: z.literal('fan-out') }),
  z.object({ ...common, type: z.literal('join') }),
  z.object({ ...common, type: z.literal('end'), outcome: z.enum(END_OUTCOMES) })
]);

const edge = z.object({ from: id, to: id, when: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).default('any') });

/** What a node of each type can produce: the vocabulary of its outgoing edges. */
export function outputsOf(item) {
  if (item.type === 'gate') return ['pass', 'fail', 'pending', 'skipped'];
  if (item.type === 'agent') return ['done', 'partial', 'blocked', 'needs-input', 'failed', 'no-result', 'rolled-back'];
  if (item.type === 'decision') { const rubric = RUBRICS[item.rubric]; return [...(rubric.type === 'yesno' ? ['yes', 'no'] : rubric.choices || []), 'needs-human']; }
  if (item.type === 'human') return ['approve', 'reject', 'pending'];
  if (item.type === 'join') return ['pass', 'fail'];
  if (item.type === 'fan-out') return ['pass'];
  return [];
}

export const whenList = edgeItem => [edgeItem.when].flat();

/** A topological order, stable by declaration (the first ready node in file order goes next); `null` on a cycle. */
export function topologicalNodes(nodes, edges) {
  const indegree = new Map(nodes.map(item => [item.id, 0]));
  for (const item of edges) indegree.set(item.to, (indegree.get(item.to) || 0) + 1);
  const order = [], done = new Set();
  while (order.length < nodes.length) {
    const next = nodes.find(item => !done.has(item.id) && !indegree.get(item.id));
    if (!next) return null;
    order.push(next.id); done.add(next.id);
    for (const item of edges.filter(entry => entry.from === next.id)) indegree.set(item.to, indegree.get(item.to) - 1);
  }
  return order;
}

/** A cycle as a list of ids, for the error message. */
function findCycleIds(nodes, edges) {
  const state = new Map(), stack = [];
  const visit = current => {
    state.set(current, 1); stack.push(current);
    for (const next of edges.filter(item => item.from === current).map(item => item.to)) {
      if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state.get(next)) { const found = visit(next); if (found) return found; }
    }
    state.set(current, 2); stack.pop();
    return null;
  };
  for (const item of nodes) if (!state.get(item.id)) { const found = visit(item.id); if (found) return found; }
  return null;
}

export const flowV2Schema = z.object({
  apiVersion: z.literal('maverick.flow/v2'),
  name: id,
  description: z.string().min(10),
  contract: z.object({ goal: z.string().min(1), iterationCap: z.number().int().min(1).max(20).default(3), noProgressWindow: z.number().int().min(2).max(10).default(2) }),
  nodes: z.array(node).min(2),
  edges: z.array(edge).min(1)
}).superRefine((flow, ctx) => {
  const byId = new Map();
  flow.nodes.forEach((item, index) => { if (byId.has(item.id)) ctx.addIssue({ code: 'custom', path: ['nodes', index, 'id'], message: `duplicate node id "${item.id}"` }); byId.set(item.id, item); });
  flow.edges.forEach((item, index) => {
    const from = byId.get(item.from), to = byId.get(item.to);
    if (!from) return ctx.addIssue({ code: 'custom', path: ['edges', index, 'from'], message: `unknown node "${item.from}"` });
    if (!to) return ctx.addIssue({ code: 'custom', path: ['edges', index, 'to'], message: `unknown node "${item.to}"` });
    if (from.type === 'end') ctx.addIssue({ code: 'custom', path: ['edges', index], message: `end node "${from.id}" cannot have an outgoing edge` });
    const allowed = outputsOf(from), bad = whenList(item).filter(value => value !== 'any' && !allowed.includes(value));
    if (bad.length) ctx.addIssue({ code: 'custom', path: ['edges', index, 'when'], message: `${from.type} node "${from.id}" never outputs ${bad.join(', ')}; it outputs ${allowed.join(', ')}` });
    // Typed decisions are advisory: they may route the work, never finish it.
    if (from.type === 'decision' && to.type === 'end' && to.outcome === 'done') ctx.addIssue({ code: 'custom', path: ['edges', index], message: `decision "${from.id}" cannot lead straight to a done end: a gate or a human must decide` });
  });
  const cycle = findCycleIds(flow.nodes, flow.edges);
  if (cycle) ctx.addIssue({ code: 'custom', path: ['edges'], message: `the flow has a cycle: ${cycle.join(' → ')}; a flow is a DAG, and another pass is a new run` });
  if (!flow.nodes.some(item => item.type === 'end')) ctx.addIssue({ code: 'custom', path: ['nodes'], message: 'a flow needs at least one end node: its outcomes are explicit' });
  for (const item of flow.nodes.filter(entry => entry.type === 'join')) if (flow.edges.filter(entry => entry.to === item.id).length < 2) ctx.addIssue({ code: 'custom', path: ['nodes'], message: `join "${item.id}" needs at least two incoming edges` });
  for (const item of flow.nodes.filter(entry => entry.type !== 'end')) if (!flow.edges.some(entry => entry.from === item.id)) ctx.addIssue({ code: 'custom', path: ['nodes'], message: `node "${item.id}" leads nowhere; end it with an end node` });
});

/**
 * The v1 view of a v2 flow, for everything that reads `flow.gates` (loops, approvals, Lens):
 * its gate nodes, and its human nodes as approval gates.
 */
export function gatesOf(flow, parseGate) {
  return flow.nodes.flatMap(item => {
    if (item.type === 'gate') return [parseGate({ ...item.gate, id: item.id, ...(item.description && !item.gate.description && { description: item.description }) })];
    if (item.type === 'human') return [parseGate({ id: item.id, type: 'approval', prompt: item.prompt, ...(item.file && { file: item.file }), ...(item.pattern && { pattern: item.pattern }), ...(item.description && { description: item.description }) })];
    return [];
  });
}
