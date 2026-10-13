import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCommand, lacksGitBaseline } from '../core/project-tools.js';
import { detectStack } from '../core/stack.js';
import { getTask } from '../core/tasks.js';
import { brand, output, rel } from '../core/util.js';
import { inPlace, resolveRef, treeOf } from '../loop/git.js';
import { loopSettings } from '../loop/model.js';
import { renderAblationReport, runAblation } from '../proof/ablation.js';
import { checkArchitecture, renderArchitectureReport } from '../proof/architecture.js';
import { agentTrace, aiBom } from '../proof/interop.js';
import { answerExplainBack, explainBack } from '../proof/explain.js';
import { buildStatement, KEYS_DIR, NOTES_REF, publishKey, signingKey, signProof, summarizeStatement, verifyProof } from '../proof/receipt.js';
import { loadConfig } from '../core/config.js';

// Evidence about the checks themselves, beyond "they pass": whether the new tests can fail at
// all (ablation) and whether the change made the import structure worse (architecture). Both
// compare the working tree with `--against` (HEAD by default; a loop passes its baseline).

/**
 * Runs `fn({ base, head, diff, against })` on the change since `--against`: the working tree is
 * snapshotted through a private index, so the user's index is never touched. `null` outside git.
 */
async function withChange(cwd, options, fn) {
  if (!(await executeCommand(cwd, 'git rev-parse --is-inside-work-tree', '', 100)).ok) return null;
  if (await lacksGitBaseline(cwd)) throw new Error('git tracks no file of this project; commit it so its changes can be compared');
  const against = typeof options.against === 'string' ? options.against : 'HEAD', commit = await resolveRef(cwd, against);
  if (!commit) throw new Error(`unknown revision: ${against}`);
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-change-'));
  try {
    const tree = inPlace({ cwd, task: 'change', indexFile: join(scratch, 'index'), inflight: scratch });
    const head = await tree.snapshot(), base = await treeOf(cwd, commit);
    return await fn({ base, head, diff: await tree.diff(base, head, { patch: false, maxLines: Infinity }), against });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** `maverick ablation <task>`: each new or changed test must pass with the change and fail without it. */
async function ablation(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const settings = loopSettings(config, null, { integrity: typeof options.level === 'string' ? options.level : undefined });
  const stack = await detectStack(cwd);
  const payload = await withChange(cwd, options, async ({ base, head, diff, against }) => {
    const report = await runAblation({ cwd, taskDir: dir, config, stack, base, head, diff, settings });
    const path = join(dir, 'ABLATION.md');
    await writeFile(path, renderAblationReport(slug, report, { against }));
    return { ...report, against, path: rel(cwd, path) };
  });
  if (!payload) return output(options.json ? JSON.stringify({ ok: true, level: 'off', files: [], findings: [], stats: { tests: 0 }, note: 'not a git repository: nothing to compare' }, null, 2) : `${brand()} / ABLATION ${slug}\nNOTE not a git repository: nothing to compare`);
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    const s = payload.stats;
    output(`${brand()} / ABLATION ${slug}\nCompared with ${payload.against} · level ${payload.level}\n${s.tests ? `${s.discriminating}/${s.tests} new or changed test file(s) fail without the change${s.vacuous ? ` · ${s.vacuous} vacuous` : ''}${s.broken ? ` · ${s.broken} fail with it too` : ''}${s.unmeasured ? ` · ${s.unmeasured} not measured` : ''}` : `NOTE ${payload.note || 'no test to measure'}`}`);
    payload.findings.forEach(item => output(`${item.severity === 'block' ? 'FAIL' : 'WARN'} ${item.kind} ${item.file}: ${item.message}${item.excerpt ? ` (${item.excerpt})` : ''}`));
    payload.files.filter(file => ['broken', 'unmeasured'].includes(file.verdict)).forEach(file => output(`NOTE ${file.path}: ${file.note}`));
    output(`Report: ${payload.path}`);
  }
  if (!payload.ok) throw new Error('vacuous tests require human review');
}

/** `maverick structure <task>` (the `architecture` gate): no new import cycle, no new boundary violation, no health drop beyond the limit. */
async function structure(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const payload = await withChange(cwd, options, async ({ base, head, against }) => {
    const report = await checkArchitecture({ cwd, taskDir: dir, config, base, head });
    const path = join(dir, 'ARCHITECTURE-CHECK.md');
    await writeFile(path, renderArchitectureReport(slug, report, { against }));
    return { ...report, against, path: rel(cwd, path) };
  });
  if (!payload) return output(options.json ? JSON.stringify({ ok: true, findings: [], note: 'not a git repository: nothing to compare' }, null, 2) : `${brand()} / STRUCTURE ${slug}\nNOTE not a git repository: nothing to compare`);
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    output(`${brand()} / STRUCTURE ${slug}\nCompared with ${payload.against}${payload.base.health === null ? '' : `\nHealth ${payload.base.health} → ${payload.head.health} · cycles ${payload.base.cycles} → ${payload.head.cycles} · hubs ${payload.base.hubs} → ${payload.head.hubs}`}`);
    payload.findings.forEach(item => output(`${item.severity === 'block' ? 'FAIL' : 'WARN'} ${item.kind}: ${item.message}`));
    if (payload.note) output(`NOTE ${payload.note}`);
    output(`${payload.ok ? 'PASS no new cycle, boundary violation or health drop that the task did not declare\n' : ''}Report: ${payload.path}`);
  }
  if (!payload.ok) throw new Error('the change made the architecture worse');
}

const list = value => [value].flat().filter(item => typeof item === 'string' && item);

/**
 * `maverick proof`: the signed receipt of what proved a change. `sign` writes PROOF.json and a
 * note on the commit, `verify` checks it (CI runs it), `show` prints the claims, `export`
 * converts it for Agent Trace and AI-BOM tools, `keygen` makes the signing key.
 */
async function proof(cwd, [action, slug], options = {}) {
  if (action === 'keygen') {
    const key = await signingKey(await loadConfig(cwd));
    const published = await publishKey(cwd, key.publicKey);
    return output(options.json ? JSON.stringify({ keyid: key.keyid, source: key.source, publicKey: rel(cwd, published.path) }) : `${brand()} / PROOF KEY\n✓ signing key: ${key.source}\n✓ trusted public key: ${rel(cwd, published.path)} (commit it, so CI can verify)\nKey id: ${key.keyid}`);
  }
  if (action === 'sign') {
    if (!slug) throw new Error('use: maverick proof sign <task> [--commit <ref>]');
    const result = await signProof(cwd, slug, { rev: typeof options.commit === 'string' ? options.commit : null, note: !options.noNote });
    if (options.json) return output(JSON.stringify({ path: rel(cwd, result.path), keyid: result.keyid, publicKey: rel(cwd, result.keyPath), note: result.noted, statement: result.statement }, null, 2));
    return output(`${brand()} / PROOF ${slug}\n${summarizeStatement(result.statement).join('\n')}\n✓ signed by ${result.keyid.slice(0, 16)} · ${rel(cwd, result.path)}${result.noted ? `\n✓ attached to ${result.noted.slice(0, 12)} in ${NOTES_REF} (share it: git push origin ${NOTES_REF})` : '\nNOTE the change is not committed: commit it, then sign again to attach the receipt to the commit'}\nTrusted key: ${rel(cwd, result.keyPath)}`);
  }
  if (action === 'verify') {
    const result = await verifyProof(cwd, { task: slug || null, file: typeof options.file === 'string' ? options.file : null, rev: typeof options.commit === 'string' ? options.commit : null, keys: list(options.key) });
    if (options.json) output(JSON.stringify(result, null, 2));
    else {
      output(`${brand()} / PROOF VERIFY${slug ? ` ${slug}` : ''}\nReceipt: ${result.source || '—'}${result.keyid ? ` · signed by ${result.keyid.slice(0, 16)}` : ''}`);
      if (result.statement && result.ok) output(summarizeStatement(result.statement).join('\n'));
      result.problems.forEach(problem => output(`FAIL ${problem}`));
      result.warnings.forEach(warning => output(`WARN ${warning}`));
      result.notes.forEach(note => output(`NOTE ${note}`));
      if (result.ok) output('PASS the receipt is signed by a trusted key and describes this code');
    }
    if (!result.ok) throw new Error(`the proof receipt does not verify (${result.problems.length} problem(s))`);
    return;
  }
  if (action === 'show') {
    if (!slug) throw new Error('use: maverick proof show <task>');
    const statement = await buildStatement(cwd, slug, { rev: typeof options.commit === 'string' ? options.commit : null });
    return output(options.json ? JSON.stringify(statement, null, 2) : `${brand()} / PROOF ${slug} (unsigned preview)\n${summarizeStatement(statement).join('\n')}`);
  }
  if (action === 'export') {
    if (!slug) throw new Error('use: maverick proof export <task> --format agent-trace|aibom');
    const format = typeof options.format === 'string' ? options.format : 'agent-trace';
    if (format === 'agent-trace') return output(JSON.stringify(await agentTrace(cwd, slug), null, 2));
    if (format === 'aibom') return output(JSON.stringify(aiBom(await buildStatement(cwd, slug)), null, 2));
    throw new Error('--format must be agent-trace or aibom');
  }
  throw new Error(`use proof keygen, proof sign <task>, proof verify [<task>] [--commit <ref>] [--file PROOF.json], proof show <task>, or proof export <task> --format agent-trace|aibom (trusted keys live in ${KEYS_DIR}/)`);
}

/** `maverick explain <task>`: three questions about the change for the reviewer (review.explainBack); `--answer Q1 "..."` records an answer. */
async function explain(cwd, slug, options = {}) {
  if (typeof options.answer === 'string') {
    const text = typeof options.text === 'string' ? options.text : '';
    const state = await answerExplainBack(cwd, slug, options.answer, text, typeof options.by === 'string' ? options.by : undefined);
    return output(options.json ? JSON.stringify(state, null, 2) : `${brand()} / EXPLAIN-BACK ${slug}\n✓ answer to ${options.answer.toUpperCase()} recorded in EXPLAIN-BACK.md and REVIEW.md`);
  }
  const result = await explainBack({ cwd, task: slug, against: typeof options.against === 'string' ? options.against : undefined, force: Boolean(options.force) });
  if (options.json) return output(JSON.stringify(result, null, 2));
  output(`${brand()} / EXPLAIN-BACK ${slug}\n${result.questions.length ? result.questions.map(item => `${item.id}. ${item.question}${item.files.length ? `\n    ${item.files.join(', ')}` : ''}${item.answer ? `\n    ✓ ${item.answer.text}` : ''}`).join('\n') : `NOTE ${result.note}`}${result.questions.length ? `\n\nAnswer in Lens, or: maverick explain ${slug} --answer Q1 --text "..."` : ''}`);
}

export const proofCommands = [
  { id: 'explain', description: 'Explain-back (experimental): a read-only agent asks the reviewer three questions about what the change does; answers go to REVIEW.md. Opt-in, never blocks.', aliases: [], usage: 'explain <task> [--force] [--against <ref>] [--answer Q1 --text "..."]', run: ({ cwd, arg, options }) => explain(cwd, arg, options) },
  { id: 'proof', description: 'Sign and verify the proof receipt: what proved a change (intent, ledgers, gates, holdout, verdicts, approvals, models) as a signed in-toto attestation.', aliases: [], usage: 'proof keygen|sign|verify|show|export [<task>] [--commit <ref>] [--file PROOF.json] [--key pub.pem] [--format agent-trace|aibom] [--no-note]', run: ({ cwd, rest, options }) => proof(cwd, rest, options) },
  { id: 'ablation', description: 'Check that new tests can fail: each must pass with the change and fail without it.', aliases: [], usage: 'ablation <task> [--against <ref>] [--level strict|standard|off]', run: ({ cwd, arg, options }) => ablation(cwd, arg, options) },
  { id: 'structure', description: 'Ratchet the import structure: no new cycle, no new boundary violation, no health drop (the architecture gate).', aliases: [], usage: 'structure <task> [--against <ref>]', run: ({ cwd, arg, options }) => structure(cwd, arg, options) }
];
