import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseFrontmatter, renderFrontmatter } from '../capabilities/model.js';
import { exists } from '../core/util.js';

// A task's subtasks live in `<task>/subtasks/`: `_tasks.md` owns the graph (nodes and
// edges); each `task_NN.md` owns only its own status and metadata. Dependencies are
// declared in one place, so the graph can always be validated as a whole.

export const STATUSES = ['pending', 'in-progress', 'blocked', 'done'];
export const COMPLEXITY = ['low', 'medium', 'high'];
export const MANIFEST = '_tasks.md';

const nodeId = z.string().regex(/^\d{2,3}$/, 'use a two or three digit id such as 01');
const manifestSchema = z.object({
  schema: z.literal('maverick.subtasks/v1'),
  nodes: z.array(z.object({ id: nodeId, file: z.string().regex(/^task_\d{2,3}\.md$/) })),
  edges: z.array(z.object({ from: nodeId, to: nodeId })).default([])
});
// Unknown statuses fail validation instead of silently becoming "pending".
const itemSchema = z.object({
  title: z.string().min(1), status: z.enum(STATUSES),
  type: z.string().regex(/^[a-z0-9-]+$/).optional(), complexity: z.enum(COMPLEXITY).optional()
});

const dirFor = taskDir => join(taskDir, 'subtasks');
const CHECKBOX = /^\s*[-*] \[( |x|X)\] +(.+)$/;

/**
 * The work items of a task file: every `- [ ]` / `- [x]` line, with the section it is in.
 * Acceptance Criteria, Steps and Verification are written as checklists, and the build
 * checks each item as it goes, so a task can only be marked done when nothing is left open.
 */
export function checklist(body = '') {
  const items = [];
  let section = '';
  for (const line of String(body).split('\n')) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading) { section = heading[1]; continue; }
    const box = line.match(CHECKBOX);
    if (box) items.push({ section, text: box[2].trim(), done: box[1] !== ' ' });
  }
  const done = items.filter(item => item.done).length;
  return { total: items.length, done, open: items.filter(item => !item.done) };
}
function issues(error) { return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '); }

/** Returns one cycle as a list of ids (first id repeated at the end), or null when the graph is acyclic. */
export function findCycle(ids, edges) {
  const next = new Map(ids.map(id => [id, []]));
  for (const edge of edges) next.get(edge.from)?.push(edge.to);
  const state = new Map(), stack = [];
  const visit = id => {
    state.set(id, 'visiting'); stack.push(id);
    for (const to of next.get(id) || []) {
      if (state.get(to) === 'visiting') return [...stack.slice(stack.indexOf(to)), to];
      if (!state.has(to)) { const cycle = visit(to); if (cycle) return cycle; }
    }
    state.set(id, 'done'); stack.pop();
    return null;
  };
  for (const id of ids) if (!state.has(id)) { const cycle = visit(id); if (cycle) return cycle; }
  return null;
}

/** Kahn's algorithm with id order as the tie-breaker, so the order is deterministic. */
export function topologicalOrder(ids, edges) {
  const incoming = new Map(ids.map(id => [id, 0]));
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  const ready = ids.filter(id => !incoming.get(id)).sort(), order = [];
  while (ready.length) {
    const id = ready.shift(); order.push(id);
    for (const edge of edges.filter(item => item.from === id)) {
      incoming.set(edge.to, incoming.get(edge.to) - 1);
      if (!incoming.get(edge.to)) { ready.push(edge.to); ready.sort(); }
    }
  }
  return order;
}

/** Loads and validates the whole graph. `problems` lists every inconsistency found. */
export async function loadGraph(taskDir) {
  const dir = dirFor(taskDir), manifestPath = join(dir, MANIFEST);
  if (!await exists(manifestPath)) return { exists: false, nodes: [], edges: [], items: [], problems: [] };
  const problems = [];
  const parsed = manifestSchema.safeParse(parseFrontmatter(await readFile(manifestPath, 'utf8')).data);
  if (!parsed.success) return { exists: true, nodes: [], edges: [], items: [], problems: [`${MANIFEST}: ${issues(parsed.error)}`] };
  const { nodes, edges } = parsed.data, ids = nodes.map(node => node.id);
  for (const id of ids.filter((value, index) => ids.indexOf(value) !== index)) problems.push(`duplicate node ${id}`);
  for (const edge of edges) {
    if (!ids.includes(edge.from) || !ids.includes(edge.to)) problems.push(`edge ${edge.from} → ${edge.to} references an unknown node`);
    if (edge.from === edge.to) problems.push(`node ${edge.from} depends on itself`);
  }
  const cycle = findCycle(ids, edges.filter(edge => ids.includes(edge.from) && ids.includes(edge.to)));
  if (cycle) problems.push(`dependency cycle: ${cycle.join(' → ')}`);
  const items = [];
  for (const node of nodes) {
    const path = join(dir, node.file);
    if (!await exists(path)) { problems.push(`${node.file} is listed in ${MANIFEST} but missing`); continue; }
    const { data, body } = parseFrontmatter(await readFile(path, 'utf8'));
    const item = itemSchema.safeParse(data);
    if (!item.success) { problems.push(`${node.file}: ${issues(item.error)}`); continue; }
    items.push({ id: node.id, file: node.file, ...item.data, body, checklist: checklist(body), dependsOn: edges.filter(edge => edge.to === node.id).map(edge => edge.from) });
  }
  const listed = new Set(nodes.map(node => node.file));
  for (const file of (await readdir(dir)).filter(name => /^task_\d{2,3}\.md$/.test(name) && !listed.has(name))) problems.push(`${file} is not listed in ${MANIFEST}`);
  const order = cycle ? ids : topologicalOrder(ids, edges);
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const done = new Set(items.filter(item => item.status === 'done').map(item => item.id));
  for (const item of items) item.ready = item.status === 'pending' && item.dependsOn.every(id => done.has(id));
  return { exists: true, nodes, edges, items, problems };
}

async function writeManifest(taskDir, slug, nodes, edges, items) {
  // A checklist of the tasks, rewritten on every change: checked when the task is done.
  const list = items.map(item => `- [${item.status === 'done' ? 'x' : ' '}] ${item.id} ${item.title} — ${item.status}${item.dependsOn.length ? ` · after ${item.dependsOn.join(', ')}` : ''}`).join('\n');
  await writeFile(join(dirFor(taskDir), MANIFEST), renderFrontmatter({ schema: 'maverick.subtasks/v1', nodes, edges }, `# Subtasks — ${slug}\n\nThe frontmatter is the source of truth for dependencies and each task_NN.md for its status. Manage them with \`maverick subtask\`.\n\n${list}\n`));
}

/** Rewrites `_tasks.md` from the graph and the task files, for example after a format change. */
export async function refreshManifest(taskDir, slug) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  await writeManifest(taskDir, slug, graph.nodes, graph.edges, graph.items);
}

/** Adds a subtask, refusing edges that would create a cycle. */
export async function addSubtask(taskDir, slug, { title, after = [], type, complexity, body }) {
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  const ids = graph.nodes.map(node => node.id);
  const unknown = after.filter(id => !ids.includes(id));
  if (unknown.length) throw new Error(`unknown dependency ${unknown.join(', ')}; existing subtasks: ${ids.join(', ') || 'none'}`);
  if (complexity && !COMPLEXITY.includes(complexity)) throw new Error(`complexity must be one of ${COMPLEXITY.join(', ')}`);
  const id = String(Math.max(0, ...ids.map(Number)) + 1).padStart(2, '0'), file = `task_${id}.md`;
  const nodes = [...graph.nodes, { id, file }], edges = [...graph.edges, ...after.map(from => ({ from, to: id }))];
  await mkdir(dirFor(taskDir), { recursive: true });
  await writeFile(join(dirFor(taskDir), file), renderFrontmatter({ title, status: 'pending', type, complexity }, body?.trim() ? `${body.trim()}\n` : `# ${title}\n\n## Goal\nFILL ME\n\n## Acceptance Criteria\n- [ ] AC-01: FILL ME\n\n## Files\n- \`FILL ME\`\n\n## Steps\n- [ ] FILL ME\n\n## Verification\n\`\`\`bash\nFILL ME\n\`\`\`\n- [ ] UT-01: FILL ME\n`));
  await writeManifest(taskDir, slug, nodes, edges, [...graph.items, { id, title, status: 'pending', dependsOn: after }]);
  return { id, file };
}

/**
 * Updates one subtask's status. Starting or finishing work requires its dependencies to be done,
 * and finishing requires every checklist item of the task to be checked (unless `force`).
 */
export async function setStatus(taskDir, slug, id, status, { force = false } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  const item = graph.items.find(entry => entry.id === id);
  if (!item) throw new Error(`subtask not found: ${id}; existing: ${graph.items.map(entry => entry.id).join(', ') || 'none'}`);
  const blockedBy = item.dependsOn.filter(dep => graph.items.find(entry => entry.id === dep)?.status !== 'done');
  if (['in-progress', 'done'].includes(status) && blockedBy.length) throw new Error(`subtask ${id} depends on unfinished ${blockedBy.join(', ')}`);
  if (status === 'done' && !force && item.checklist.open.length) {
    const open = item.checklist.open.map(entry => `\n  - [ ] ${entry.section ? `${entry.section}: ` : ''}${entry.text}`).join('');
    throw new Error(`subtask ${id} has ${item.checklist.open.length} of ${item.checklist.total} item(s) unchecked in ${item.file}; check each one as it is done (- [x]), or pass --force:${open}`);
  }
  const path = join(dirFor(taskDir), item.file), { data, body } = parseFrontmatter(await readFile(path, 'utf8'));
  await writeFile(path, renderFrontmatter({ ...data, status }, body));
  item.status = status;
  await writeManifest(taskDir, slug, graph.nodes, graph.edges, graph.items);
  return item;
}
