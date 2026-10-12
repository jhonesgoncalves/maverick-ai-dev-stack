import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, renderFrontmatter, sha256 } from '../capabilities/model.js';
import { loadConfig } from '../core/config.js';
import { listTasks, taskPath } from '../core/tasks.js';
import { exists, readText, rel } from '../core/util.js';
import { globToRegex } from '../intel/architecture.js';
import { readLedger } from '../loop/ledger.js';
import { loopIds, loopPaths } from '../loop/model.js';

// The error ratchet (Hashimoto's rule, automated): every time an agent gets something wrong, the
// harness should make that mistake harder next time. Maverick harvests the failures its loops
// already record (rollbacks, judge rejections, escalations, disputes) into proposals, one per
// failure class, each with the evidence that produced it. A human accepts or rejects; accepted
// rules reach an agent's prompt only when its subtask touches their paths, and each rule is
// measured: did its failure class stop recurring after it was accepted? Rules that do not pay
// for themselves are flagged for pruning, because every line of instructions costs.

export const PROPOSALS_DIR = join('.maverick', 'proposals');
export const PROPOSAL_KINDS = ['agents', 'lint', 'skill', 'integrity', 'prd-question'];
const ID = /^P-[0-9a-f]{6}$/;
const MAX_OCCURRENCES = 50, MAX_SEEN = 5000;
// A rule in force for this many loops whose class recurs as often as before is flagged for pruning.
export const PRUNE_AFTER = 5;

const WEAKENED = ['test-deleted', 'test-count-decreased', 'assertion-count-decreased', 'assertion-weakened', 'skip-or-only-added', 'test-literal-special-casing', 'undeclared-test-modified', 'disputed-check-modified', 'vacuous-test'];

/** What kind of fix a failure class calls for, and a first draft of the rule a human edits. */
export function classify(failure) {
  const [source, kind, detail] = failure.split(':');
  if (source === 'rollback' && WEAKENED.includes(kind)) return { kind: 'agents', title: `Agents weaken tests (${kind})`, suggestion: 'Never delete, skip or weaken a test or an assertion to make a check pass. If a test is wrong, leave it and report it in "disputes".' };
  if (source === 'rollback' && kind === 'lint-or-type-suppression-added') return { kind: 'lint', title: 'Agents silence lint or type errors', suggestion: 'Forbid new lint or type suppressions (eslint-disable, @ts-ignore, # type: ignore, noqa) in these paths with a lint rule, so the check fails before review.' };
  if (source === 'rollback' && ['protected-path-modified', 'oracle-config-modified', 'reviewer-directed-text'].includes(kind)) return { kind: 'integrity', title: `Agents edit what the oracle owns (${kind})`, suggestion: 'If the edit is legitimate for this path, add a loop.integrity.allow entry with the reason; otherwise state in AGENTS.md that these files are owned by humans.' };
  if (source === 'rollback' && kind === 'blast-radius-exceeded') return { kind: 'agents', title: 'Changes grow past the blast radius', suggestion: 'Change only the files the subtask lists. Split work that needs more into another subtask instead of widening this one.' };
  if (source === 'rollback' && ['overclaim', 'claim-mismatch'].includes(kind)) return { kind: 'agents', title: 'Agents claim more than they did', suggestion: 'List in filesChanged only the files you changed, and tick a checklist item only after you ran the check that proves it.' };
  if (source === 'rollback' && ['gate-regression', 'test-regression'].includes(kind)) return { kind: 'agents', title: `Changes break ${detail || 'a passing check'}`, suggestion: `Run ${detail ? `the ${detail} check` : 'the checks that pass now'} before reporting done; a change that makes a passing check fail is rolled back.` };
  if (source === 'rollback' && kind === 'checklist-regression') return { kind: 'agents', title: 'Agents untick checklist items', suggestion: 'Never untick a checklist item that was already done; if it no longer holds, say so in the result.' };
  if (source === 'rollback') return { kind: 'agents', title: `Rollbacks: ${kind}`, suggestion: `Avoid ${kind.replace(/-/g, ' ')} in these paths.` };
  if (source === 'judge') return { kind: 'prd-question', title: 'The independent judge rejects the change', suggestion: 'The criteria may be ambiguous to an implementer: sharpen the acceptance criteria (Given/When/Then with concrete inputs) or add a SPEC scenario.' };
  if (source === 'stall') return { kind: 'skill', title: `Loops stall (${kind})`, suggestion: 'Agents keep failing the same way here: write a skill or an AGENTS.md section on how this area is built and tested.' };
  if (source === 'dispute') return { kind: 'prd-question', title: 'Agents dispute a check', suggestion: 'An agent believes a test or a requirement is wrong. Decide it in the PRD, and fix the test or the requirement so the next task does not trip on it.' };
  return { kind: 'agents', title: failure, suggestion: '' };
}

const idOf = failure => `P-${sha256(failure).slice(0, 6)}`;
/** The directory glob a file belongs to: rules are scoped to areas, not single files. */
const areaOf = path => (path.includes('/') ? `${path.split('/').slice(0, -1).join('/')}/**` : path);

/** One failure per class from a rollback reason: "kind: path — detail" or "kind: detail". */
function rollbackFailures(data) {
  const out = [];
  for (const reason of data.reasons || []) {
    const kind = String(reason).match(/^([a-z][a-z-]+):\s*(.*)$/);
    if (!kind) continue;
    const gate = ['gate-regression', 'test-regression'].includes(kind[1]) ? kind[2].match(/^(\S+?)(?::|\s)/)?.[1] : null;
    const path = kind[2].match(/^([\w./@-]+\.[a-z0-9]+)\b/i)?.[1] || null;
    // The reason's text names what a detector matched; it stays in the ledger, not in a file a later builder may read.
    out.push({ failure: `rollback:${kind[1]}${gate ? `:${gate}` : ''}`, detail: `rolled back (${kind[1]}${gate ? ` of ${gate}` : ''}); the full reason is in the loop's ledger`, paths: path ? [areaOf(path)] : [] });
  }
  for (const kind of data.findings || []) if (!out.some(item => item.failure === `rollback:${kind}`)) out.push({ failure: `rollback:${kind}`, detail: kind, paths: [] });
  return out;
}

/** Every failure a loop recorded, as `{ failure, task, loopId, n, at, detail, paths, evidence }`. */
export async function loopFailures(taskDir, task, loopId) {
  const paths = loopPaths(taskDir, loopId), entries = await readLedger(paths.ledger).catch(() => []);
  const state = JSON.parse(await readFile(paths.state, 'utf8').catch(() => 'null'));
  const out = [], at = entry => entry.at;
  for (const entry of entries) {
    const base = { task, loopId, n: entry.data?.n ?? null, at: at(entry), seq: entry.seq };
    if (entry.type === 'iteration-end' && entry.data.decision === 'rejected') {
      const record = state?.iterations?.find(item => item.n === entry.data.n), files = record?.diff?.paths || [];
      const patch = await exists(join(paths.rejected, `${entry.data.n}.patch`)) ? join(paths.rejected, `${entry.data.n}.patch`) : null;
      for (const item of rollbackFailures(entry.data)) {
        // The files an integrity finding names are where the rule belongs; else the files the attempt changed.
        const named = (record?.findings || []).filter(finding => `rollback:${finding.kind}` === item.failure && finding.file).map(finding => areaOf(finding.file));
        out.push({ ...base, ...item, paths: [...new Set(named.length ? named : item.paths.length ? item.paths : files.slice(0, 5).map(areaOf))], evidence: { ledger: `${loopId}#${entry.seq}`, ...(patch && { patch }) } });
      }
    }
    if (entry.type === 'judge' && entry.data.status === 'fail') out.push({ ...base, failure: 'judge:fail', detail: `judge rejected ${entry.data.scope === 'task' ? 'the whole change' : `subtask ${entry.data.scope}`}: ${(entry.data.verdicts || []).map(item => `${item.provider} ${item.verdict}`).join(', ')}`, paths: [], evidence: { ledger: `${loopId}#${entry.seq}` } });
    if (entry.type === 'escalation') out.push({ ...base, failure: `stall:${(entry.data.signals || []).map(item => item.kind || item).sort().join('+') || 'no-progress'}`, detail: `escalated ${entry.data.scope === 'goal' ? 'the goal' : `subtask ${entry.data.scope}`} to ${entry.data.rung || 'the next rung'}`, paths: [], evidence: { ledger: `${loopId}#${entry.seq}` } });
  }
  for (const item of state?.iterations || []) for (const dispute of item.agent?.disputes || []) out.push({ task, loopId, n: item.n, at: item.endedAt || item.startedAt || null, failure: 'dispute', detail: `${dispute.target}: ${dispute.reason}`.slice(0, 300), paths: /\.[a-z0-9]+$/i.test(dispute.target) ? [areaOf(dispute.target)] : [], evidence: { state: `${loopId} iteration ${item.n}` } });
  return out;
}

/** Every proposal of the project. */
export async function listProposals(cwd) {
  const dir = join(cwd, PROPOSALS_DIR), out = [];
  for (const name of (await readdir(dir).catch(() => [])).filter(name => /^P-[0-9a-f]{6}\.md$/.test(name)).sort()) {
    const { data, body } = parseFrontmatter(await readFile(join(dir, name), 'utf8'));
    if (ID.test(data.id || '')) out.push({ ...data, occurrences: data.occurrences || [], seen: data.seen || (data.occurrences || []).map(item => ({ key: item.key, at: item.at })), paths: data.paths || [], body, path: join(PROPOSALS_DIR, name) });
  }
  return out;
}

async function readProposal(cwd, id) {
  if (!ID.test(id || '')) throw new Error('proposal ids look like P-1a2b3c; list them with maverick proposals');
  const found = (await listProposals(cwd)).find(item => item.id === id);
  if (!found) throw new Error(`proposal not found: ${id}`);
  return found;
}

const renderBody = proposal => `# ${proposal.id} ${proposal.title}\n\nFailure class: \`${proposal.class}\` · kind: ${proposal.kind}\n\n## Proposed rule\n${proposal.rule?.text || proposal.suggestion}\n\n## Evidence\n${proposal.occurrences.slice(-10).map(item => `- ${item.task} · loop ${item.loopId}${item.n !== null ? ` #${item.n}` : ''}: ${item.detail}${item.evidence?.patch ? ` (rejected diff: \`${item.evidence.patch}\`)` : ''}`).join('\n')}\n\n## Decide\n- Accept: \`maverick proposals accept ${proposal.id} [--text "<rule>"] [--paths "<glob>,…"]\`\n- Reject: \`maverick proposals reject ${proposal.id} --reason "<why>"\`\n`;

async function writeProposal(cwd, proposal) {
  const { body: _body, path: _path, ...data } = proposal;
  await mkdir(join(cwd, PROPOSALS_DIR), { recursive: true });
  await writeFile(join(cwd, PROPOSALS_DIR, `${proposal.id}.md`), renderFrontmatter(data, renderBody(proposal)));
}

/**
 * Turns the loops' failures into proposals: new classes become open proposals, known classes
 * gain occurrences (an occurrence is recorded once). Rejected proposals keep counting, so a
 * class that keeps coming back can be reconsidered. Returns the proposals that are new.
 */
export async function harvestProposals(cwd, { task } = {}) {
  const config = await loadConfig(cwd), tasks = task ? [task] : (await listTasks(cwd, config)).map(item => item.task);
  const existing = new Map((await listProposals(cwd)).map(item => [item.class, item])), created = [], touched = new Set();
  for (const slug of tasks) {
    const taskDir = taskPath(cwd, config, slug);
    for (const loopId of await loopIds(taskDir)) {
      for (const failure of await loopFailures(taskDir, slug, loopId)) {
        let proposal = existing.get(failure.failure);
        if (!proposal) {
          const shape = classify(failure.failure);
          proposal = { id: idOf(failure.failure), class: failure.failure, ...shape, status: 'open', paths: [], occurrences: [], created: new Date().toISOString().slice(0, 10) };
          existing.set(failure.failure, proposal); created.push(proposal);
        }
        // `seen` keeps every occurrence (key and time) for dedupe and measurement; `occurrences` only the latest, with evidence.
        const key = `${failure.task}/${failure.loopId}/${failure.seq ?? failure.n}`;
        proposal.seen ||= proposal.occurrences.map(item => ({ key: item.key, at: item.at }));
        if (proposal.seen.some(item => item.key === key)) continue;
        proposal.seen = [...proposal.seen, { key, at: failure.at }].slice(-MAX_SEEN);
        proposal.occurrences = [...proposal.occurrences, { key, task: failure.task, loopId: failure.loopId, n: failure.n, at: failure.at, detail: failure.detail, ...(failure.evidence && { evidence: { ...failure.evidence, ...(failure.evidence.patch && { patch: rel(cwd, failure.evidence.patch) }) } }) }].slice(-MAX_OCCURRENCES);
        if (proposal.status === 'open') proposal.paths = [...new Set([...proposal.paths, ...failure.paths])].slice(0, 10);
        touched.add(proposal.class);
      }
    }
  }
  for (const proposal of existing.values()) if (touched.has(proposal.class)) await writeProposal(cwd, proposal);
  return { created, updated: [...touched].length };
}

/** A human promotes a proposal: the rule text and the paths it applies to (none: everywhere). */
export async function acceptProposal(cwd, id, { text, paths, by = process.env.USER || 'human' } = {}) {
  const proposal = await readProposal(cwd, id);
  if (proposal.status === 'accepted') throw new Error(`${id} is already accepted`);
  const scope = typeof paths === 'string' ? paths.split(',').map(item => item.trim()).filter(Boolean) : proposal.paths;
  const rule = { text: typeof text === 'string' && text.trim() ? text.trim() : proposal.suggestion, paths: scope, by, at: new Date().toISOString() };
  if (!rule.text) throw new Error('give the rule with --text "<rule>"');
  await writeProposal(cwd, { ...proposal, status: 'accepted', rule });
  return { id, rule };
}

export async function rejectProposal(cwd, id, { reason, by = process.env.USER || 'human' } = {}) {
  const proposal = await readProposal(cwd, id);
  if (!reason) throw new Error('a rejection needs a reason: --reason "<why>"');
  await writeProposal(cwd, { ...proposal, status: 'rejected', rejected: { by, at: new Date().toISOString(), reason } });
  return { id };
}

/** Loops started across the project, by start time: the denominator of a recurrence rate. */
async function loopStarts(cwd) {
  const config = await loadConfig(cwd), starts = [];
  for (const { task } of await listTasks(cwd, config)) {
    const taskDir = taskPath(cwd, config, task);
    for (const loopId of await loopIds(taskDir)) {
      const first = (await readLedger(loopPaths(taskDir, loopId).ledger).catch(() => []))[0];
      if (first) starts.push({ task, loopId, at: first.at });
    }
  }
  return starts;
}

/**
 * Whether each accepted rule pays for itself: occurrences of its class per loop before and after
 * it was accepted. `prune` marks a rule in force for PRUNE_AFTER loops or more whose class recurs
 * at least as often as before.
 */
export async function measureRules(cwd, { proposals, pruneAfter = PRUNE_AFTER } = {}) {
  proposals ||= await listProposals(cwd);
  const starts = await loopStarts(cwd);
  return proposals.filter(item => item.status === 'accepted' && item.rule?.at).map(item => {
    const since = item.rule.at, seen = item.seen || item.occurrences, before = starts.filter(loop => loop.at < since).length, after = starts.filter(loop => loop.at >= since).length;
    const recurBefore = seen.filter(entry => entry.at && entry.at < since).length, recurAfter = seen.filter(entry => entry.at && entry.at >= since).length;
    const rateBefore = before ? recurBefore / before : null, rateAfter = after ? recurAfter / after : null;
    const verdict = !after ? 'no loop since' : !recurAfter ? 'effective' : rateBefore !== null && rateAfter < rateBefore ? 'helping' : 'recurring';
    return { id: item.id, class: item.class, kind: item.kind, text: item.rule.text, paths: item.rule.paths, since: since.slice(0, 10), loops: { before, after }, occurrences: { before: recurBefore, after: recurAfter }, verdict, prune: after >= pruneAfter && recurAfter > 0 && (rateBefore === null || rateAfter >= rateBefore) };
  });
}

/** Accepted rules that apply to `files`: rules without paths apply everywhere. */
export function rulesFor(proposals, files) {
  // Lint, integrity and PRD proposals are for humans to act on (a lint rule, a config entry, a PRD edit), not prompt text.
  return proposals.filter(item => item.status === 'accepted' && item.rule?.text && ['agents', 'skill'].includes(item.kind)).filter(item => {
    if (!item.rule.paths?.length) return true;
    const patterns = item.rule.paths.map(glob => globToRegex(glob));
    return files.some(file => patterns.some(pattern => pattern.test(file)));
  });
}

export function rulesSection(rules) {
  if (!rules.length) return null;
  return { title: 'Project rules for these files', body: `Rules this project adopted after earlier agents got these files wrong. Follow them.\n\n${rules.slice(0, 15).map(item => `- ${item.rule.text}${item.rule.paths?.length ? ` (${item.rule.paths.join(', ')})` : ''}`).join('\n')}` };
}

const BLOCK = /<!-- maverick:rules -->[\s\S]*?<!-- \/maverick:rules -->\n?/;

/**
 * Keeps a managed block in AGENTS.md with the accepted agent rules, for tools that read
 * AGENTS.md but not Maverick's prompts. Only the block is rewritten; the rest stays the user's.
 */
export async function syncAgentsBlock(cwd, { create = false } = {}) {
  const path = join(cwd, 'AGENTS.md');
  if (!create && !await exists(path)) return null;
  const rules = (await listProposals(cwd)).filter(item => item.status === 'accepted' && item.kind === 'agents');
  const block = `<!-- maverick:rules -->\n## Rules learned from past mistakes\n\nManaged by \`maverick proposals\`; edit the proposals, not this block.\n\n${rules.map(item => `- ${item.rule.text}${item.rule.paths?.length ? ` (applies to ${item.rule.paths.map(glob => `\`${glob}\``).join(', ')})` : ''}`).join('\n') || '- none yet'}\n<!-- /maverick:rules -->\n`;
  const current = await readText(path);
  const next = BLOCK.test(current) ? current.replace(BLOCK, block) : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`;
  await writeFile(path, next);
  return { path: 'AGENTS.md', rules: rules.length };
}
