import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { getTask } from '../core/tasks.js';
import { exists, packageVersion } from '../core/util.js';
import { git, readCommit, resolveRef } from '../loop/git.js';
import { readLedger } from '../loop/ledger.js';
import { loopPaths } from '../loop/model.js';
import { readState } from '../loop/engine.js';
import { loopTips, parseTrailers } from '../memory/why.js';
import { PROOF_PREDICATE } from './receipt.js';

// The receipt in other people's formats. Agent Trace says which lines an agent wrote: Maverick
// knows exactly, by blaming the files against each loop's checkpoint chain, so every range
// names the iteration and the model behind it. The AI-BOM (CycloneDX 1.6) lists the models
// that built, judged and sealed the change. Both point back at the proof receipt, which says
// what proved the lines, not just who wrote them.

const ZERO = /^0{40}$/;
const modelId = (provider, model) => (model ? `${provider}/${model}` : provider);

/** Final line number → commit, from `git blame --porcelain` of the current content against `rev`. */
async function blameLines(cwd, file, rev) {
  const result = await git(cwd, ['blame', '--porcelain', '--contents', file, rev, '--', file]);
  if (!result.ok) return null;
  const lines = new Map();
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: (\d+))?$/);
    if (match) lines.set(Number(match[2]), match[1]);
  }
  return lines;
}

/** Consecutive lines with the same author become one range. */
function ranges(lines, keyOf) {
  const out = [];
  for (const [line, sha] of [...lines].sort(([a], [b]) => a - b)) {
    const key = keyOf(sha);
    if (!key) continue;
    const last = out.at(-1);
    if (last && last.key === key && last.end_line === line - 1) last.end_line = line; else out.push({ key, start_line: line, end_line: line });
  }
  return out;
}

/**
 * Agent Trace (0.1) for a task: for each file its loops changed, the line ranges each loop
 * iteration wrote in the current content, with the agent's model, the ledger position and the
 * checkpoint. Lines edited by hand since are left out (blame shows them as not committed).
 */
export async function agentTrace(cwd, task, { now = new Date() } = {}) {
  const { dir } = await getTask(cwd, task);
  const files = new Map(), loops = [];
  for (const tip of await loopTips(cwd, dir, task)) {
    const state = await readState(dir, tip.loopId).catch(() => null), entries = await readLedger(loopPaths(dir, tip.loopId).ledger).catch(() => []);
    const base = state?.baseCommit;
    if (!base) continue;
    loops.push({ loopId: tip.loopId, base, tip: tip.commit, outcome: state.status });
    const starts = new Map(entries.filter(entry => entry.type === 'iteration-start').map(entry => [entry.data.n, entry.data]));
    const ends = new Map(entries.filter(entry => entry.type === 'iteration-end').map(entry => [entry.data.n, entry]));
    const changed = (await git(cwd, ['diff', '--name-only', '--relative', '--no-renames', base, tip.commit])).stdout.split('\n').filter(Boolean);
    const commits = new Map();
    const authorOf = async sha => {
      if (ZERO.test(sha)) return null;
      if (!commits.has(sha)) {
        const trailers = parseTrailers((await readCommit(cwd, sha))?.message);
        commits.set(sha, trailers.loopId === tip.loopId && trailers.iteration >= 0 ? { ...trailers, sha } : null);
      }
      return commits.get(sha);
    };
    for (const file of changed) {
      if (!await exists(join(cwd, file))) continue;
      const lines = await blameLines(cwd, file, tip.commit);
      if (!lines) continue;
      for (const sha of new Set(lines.values())) await authorOf(sha);
      const attributed = ranges(lines, sha => { const author = commits.get(sha); return author && (author.iteration > 0 || author.label === 'human change') ? sha : null; });
      const conversations = new Map();
      for (const range of attributed) {
        const author = commits.get(range.key), start = starts.get(author.iteration), end = ends.get(author.iteration);
        const human = author.label === 'human change';
        const id = human ? `human:${author.sha}` : `${tip.loopId}#${author.iteration}`;
        if (!conversations.has(id)) {
          conversations.set(id, {
            contributor: human ? { type: 'human' } : { type: 'ai', model_id: modelId(start?.provider || 'unknown', start?.model) },
            ranges: [],
            related: [{ type: 'maverick-loop-iteration', loop: tip.loopId, iteration: human ? null : author.iteration, checkpoint: author.sha, ledger: end ? { seq: end.seq, hash: end.hash } : null, decision: end?.data?.decision || null, ...(start?.effort && { effort: start.effort }) }]
          });
        }
        conversations.get(id).ranges.push({ start_line: range.start_line, end_line: range.end_line });
      }
      if (conversations.size) files.set(file, [...(files.get(file) || []), ...conversations.values()]);
    }
  }
  return {
    version: '0.1.0', id: randomUUID(), timestamp: now.toISOString(),
    vcs: { type: 'git', revision: await resolveRef(cwd, 'HEAD') },
    tool: { name: 'maverick', version: packageVersion },
    files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, conversations]) => ({ path, conversations })),
    metadata: { 'dev.maverick': { task, loops, proof: { predicateType: PROOF_PREDICATE, receipt: `${task}/PROOF.json` } } }
  };
}

/** An AI bill of materials (CycloneDX 1.6) from a proof Statement: the models and their roles. */
export function aiBom(statement, { now = new Date() } = {}) {
  const p = statement.predicate, refs = new Map();
  for (const item of p.models || []) {
    const ref = `model:${modelId(item.provider, item.model)}`;
    if (!refs.has(ref)) refs.set(ref, { type: 'machine-learning-model', 'bom-ref': ref, name: item.model || item.provider, publisher: item.provider, properties: [] });
    refs.get(ref).properties.push({ name: 'maverick:role', value: item.role });
  }
  return {
    bomFormat: 'CycloneDX', specVersion: '1.6', serialNumber: `urn:uuid:${randomUUID()}`, version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: { components: [{ type: 'application', name: 'maverick', version: p.generator.version }] },
      component: { type: 'application', 'bom-ref': `task:${p.task.slug}`, name: p.task.slug, description: p.task.idea || undefined, hashes: [{ alg: 'SHA-1', content: statement.subject[0].digest.gitTree }] }
    },
    components: [...refs.values()],
    dependencies: [{ ref: `task:${p.task.slug}`, dependsOn: [...refs.keys()] }],
    properties: [
      { name: 'maverick:proof:predicateType', value: statement.predicateType },
      { name: 'maverick:proof:gitTree', value: statement.subject[0].digest.gitTree },
      ...(p.change.commit ? [{ name: 'maverick:proof:gitCommit', value: p.change.commit }] : []),
      ...(p.holdout?.OI !== null && p.holdout?.OI !== undefined ? [{ name: 'maverick:proof:overfittingIndex', value: String(p.holdout.OI) }] : [])
    ]
  };
}
