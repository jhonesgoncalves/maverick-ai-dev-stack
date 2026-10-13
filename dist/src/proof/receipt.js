import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { sha256 } from '../capabilities/model.js';
import { maverickHome } from '../core/home.js';
import { getTask } from '../core/tasks.js';
import { exists, packageVersion, pretty, readText } from '../core/util.js';
import { git, resolveRef } from '../loop/git.js';
import { readLedger, verifyChain } from '../loop/ledger.js';
import { isTaskLoop, loopIds, loopPaths } from '../loop/model.js';
import { readState } from '../loop/engine.js';
import { taskEvidence } from '../memory/why.js';
import { readSealed } from '../sealed/model.js';

// The proof receipt: what Maverick proved about a change, signed. An in-toto Statement whose
// subject is the code (the git tree without `.maverick/`) and whose predicate says what checked
// it: the intent it was built against (PRD and SPEC digests), the head of every loop ledger, the
// gates, the sealed holdout and its overfitting index, the integrity findings, the judges'
// verdicts, the human approvals and the models that did the work. It travels in a DSSE envelope
// signed with ed25519 from `node:crypto`, in the task's PROOF.json and in `refs/notes/maverick`.
// Other attestations say who wrote the code; this one says what proved it.

export const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
export const PROOF_PREDICATE = 'https://maverick.dev/proof/v1';
export const PAYLOAD_TYPE = 'application/vnd.in-toto+json';
export const NOTES_REF = 'refs/notes/maverick';
export const KEYS_DIR = join('.maverick', 'proof-keys');
const DOCUMENTS = ['PRD.md', 'SPEC.md', 'TECHSPEC.md'];

/** DSSE pre-authentication encoding: what is signed is the type and the body, never just the body. */
export function pae(type, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${payload.length} `), payload]);
}

/** A key's id: the SHA-256 of its public key (SPKI, DER). */
export const keyIdOf = key => sha256((key.type === 'public' ? key : createPublicKey(key)).export({ type: 'spki', format: 'der' }));

/**
 * The signing key: `MAVERICK_PROOF_KEY` (a PEM, for CI; never passed to an agent), else
 * `proof.keyFile`, else `$MAVERICK_HOME/keys/proof-ed25519.pem`, created once (0600).
 */
export async function signingKey(config = {}, { create = true } = {}) {
  if (process.env.MAVERICK_PROOF_KEY) return withId(createPrivateKey(process.env.MAVERICK_PROOF_KEY.replace(/\\n/g, '\n')), 'MAVERICK_PROOF_KEY');
  const configured = config.proof?.keyFile;
  const path = configured ? (isAbsolute(configured) ? configured : resolve(maverickHome(), configured)) : join(maverickHome(), 'keys', 'proof-ed25519.pem');
  if (!await exists(path)) {
    if (!create || configured) throw new Error(`no proof signing key at ${path}${configured ? ' (proof.keyFile)' : ''}; run maverick proof keygen`);
    const { privateKey } = generateKeyPairSync('ed25519');
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    await chmod(path, 0o600);
  }
  return withId(createPrivateKey(await readFile(path, 'utf8')), path);
}

function withId(privateKey, source) {
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error(`${source} is a ${privateKey.asymmetricKeyType} key; proof receipts are signed with ed25519`);
  const publicKey = createPublicKey(privateKey);
  return { privateKey, publicKey, keyid: keyIdOf(publicKey), source };
}

/** Commits the public key under `.maverick/proof-keys/`, where `proof verify` looks for trusted keys. */
export async function publishKey(cwd, publicKey) {
  const keyid = keyIdOf(publicKey), path = join(cwd, KEYS_DIR, `${keyid.slice(0, 16)}.pem`);
  if (!await exists(path)) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, publicKey.export({ type: 'spki', format: 'pem' })); }
  return { keyid, path };
}

/** The keys this repository trusts: `.maverick/proof-keys/*.pem`, plus any given with `--key`. */
export async function trustedKeys(cwd, extra = []) {
  const keys = new Map();
  const add = async path => { try { const key = createPublicKey(await readFile(path, 'utf8')); keys.set(keyIdOf(key), { key, path }); } catch { /* not a public key */ } };
  for (const name of (await readdir(join(cwd, KEYS_DIR)).catch(() => [])).filter(item => item.endsWith('.pem'))) await add(join(cwd, KEYS_DIR, name));
  for (const path of extra) await add(resolve(cwd, path));
  return keys;
}

/**
 * The code a receipt is about: the tree of `rev` (or of the working copy) without `.maverick/`,
 * so writing the receipt into the task never changes what it signs. A private index; the
 * user's index is never touched.
 */
export async function subjectTree(cwd, rev = null) {
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-proof-')), env = { GIT_INDEX_FILE: join(scratch, 'index') };
  const must = async args => { const result = await git(cwd, args, { env }); if (!result.ok) throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || result.stdout.trim()}`); return result.stdout.trim(); };
  try {
    await must(['read-tree', rev || 'HEAD']);
    if (!rev) await must(['add', '-A', '--', '.', ':(exclude).maverick']);
    await must(['rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', '.maverick']);
    return await must(['write-tree']);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

const count = items => Object.fromEntries([...items.reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map())].sort(([a], [b]) => a.localeCompare(b)));

/** What one loop's ledger proves: its head, outcome, the integrity it saw, its judges and holdout, and who built. */
async function loopEvidence(taskDir, loopId) {
  const entries = await readLedger(loopPaths(taskDir, loopId).ledger).catch(() => []);
  if (!entries.length) return null;
  const chain = verifyChain(entries, loopId), state = await readState(taskDir, loopId).catch(() => null);
  const ends = entries.filter(entry => entry.type === 'iteration-end').map(entry => entry.data);
  const starts = entries.filter(entry => entry.type === 'iteration-start').map(entry => entry.data);
  const stop = entries.filter(entry => entry.type === 'stop').at(-1)?.data || null;
  const result = entries.filter(entry => entry.type === 'sealed-result').at(-1)?.data || null;
  const tip = entries.map(entry => entry.data?.checkpoint).filter(point => point?.commit).at(-1) || null;
  return {
    loopId, head: chain.head, entries: entries.length, chain: chain.ok ? 'verified' : 'broken',
    outcome: stop?.outcome || state?.status || 'running', checkpoint: tip && { ref: tip.ref, commit: tip.commit, tree: tip.tree },
    iterations: { total: ends.length, accepted: ends.filter(item => item.decision === 'accepted').length, rejected: ends.filter(item => item.decision === 'rejected').length },
    integrity: { findings: count(ends.flatMap(item => item.findings || [])), tainted: [...new Set(ends.flatMap(item => item.tainted || []))].sort(), acknowledged: Boolean(state?.checkpoint?.tainted?.acknowledged) },
    verdicts: entries.filter(entry => entry.type === 'judge').map(({ data }) => ({ n: data.n, scope: data.scope, status: data.status, digest: data.digest || null, judges: (data.verdicts || []).map(item => ({ provider: item.provider, model: item.model || null, family: item.family || null, verdict: item.verdict ?? null })) })),
    holdout: result && { S: result.S, OI: result.OI, tree: result.tree },
    builders: [...new Map(starts.map(item => [`${item.provider}|${item.model || ''}|${item.effort || ''}`, { provider: item.provider, model: item.model || null, effort: item.effort || null }])).values()]
  };
}

/** The in-toto Statement for a task's change at `rev` (or the working copy). */
export async function buildStatement(cwd, task, { rev = null, now = new Date() } = {}) {
  const { dir, meta } = await getTask(cwd, task);
  if (!(await git(cwd, ['rev-parse', '--is-inside-work-tree'])).ok) throw new Error('a proof receipt needs a git repository: its subject is a git tree');
  const commit = rev ? await resolveRef(cwd, `${rev}^{commit}`) : await resolveRef(cwd, 'HEAD');
  if (rev && !commit) throw new Error(`unknown revision: ${rev}`);
  const tree = await subjectTree(cwd, rev ? commit : null);
  // A working copy that matches HEAD is HEAD: the receipt can then be attached to the commit.
  const committed = rev ? true : commit ? (await subjectTree(cwd, commit)) === tree : false;
  const documents = {};
  for (const name of DOCUMENTS) if (await exists(join(dir, name))) documents[name] = sha256(await readText(join(dir, name)));
  const loops = [];
  // The loops that built the change: the task's own and its lanes; arena competitors and forks were experiments.
  for (const id of await loopIds(dir)) { if (!await isTaskLoop(dir, id)) continue; const evidence = await loopEvidence(dir, id); if (evidence) loops.push(evidence); }
  const evidence = await taskEvidence(dir);
  const sealed = await readSealed(dir);
  const models = [...new Map([
    ...loops.flatMap(loop => loop.builders.map(item => ({ role: 'builder', provider: item.provider, model: item.model }))),
    ...loops.flatMap(loop => loop.verdicts.flatMap(verdict => verdict.judges.map(item => ({ role: 'judge', provider: item.provider, model: item.model })))),
    ...(sealed?.sealer && !sealed.sealer.human ? [{ role: 'sealer', provider: sealed.sealer.provider, model: sealed.sealer.model || null }] : [])
  ].map(item => [`${item.role}|${item.provider}|${item.model || ''}`, item])).values()];
  return {
    _type: STATEMENT_TYPE,
    subject: [{ name: `git-tree:${task}`, digest: { gitTree: tree } }],
    predicateType: PROOF_PREDICATE,
    predicate: {
      task: { slug: task, idea: meta.idea || null, workflow: meta.workflow || 'standard' },
      generator: { name: 'maverick', version: packageVersion },
      createdAt: now.toISOString(),
      change: { tree, commit: committed ? commit : null, excludes: ['.maverick/'] },
      intent: documents,
      ledgers: loops.map(({ builders: _b, holdout: _h, ...loop }) => loop),
      gates: Object.fromEntries(Object.entries(evidence.flows.gates).sort(([a], [b]) => a.localeCompare(b)).map(([id, gate]) => [id, { status: gate.status, type: gate.type, flow: gate.flow }])),
      // The holdout's numbers only once a reviewer decided on the seal: PROOF.json sits in the task, where a resumed builder could read it.
      holdout: sealed ? { sealId: sealed.sealId || null, suiteDigest: sealed.suiteDigest || null, status: sealed.status || null, tests: sealed.tests ?? null, decision: sealed.decision?.decision || null, ...(sealed.decision && { OI: loops.find(loop => loop.holdout)?.holdout.OI ?? null, S: loops.find(loop => loop.holdout)?.holdout.S ?? null }) } : null,
      approvals: { flows: evidence.flows.approvals, review: evidence.review, done: evidence.done, pullRequest: evidence.pullRequest },
      models
    }
  };
}

/** Signs a Statement into a DSSE envelope. */
export function signStatement(statement, key) {
  const body = Buffer.from(JSON.stringify(statement));
  return { payloadType: PAYLOAD_TYPE, payload: body.toString('base64'), signatures: [{ keyid: key.keyid, sig: sign(null, pae(PAYLOAD_TYPE, body), key.privateKey).toString('base64') }] };
}

/** Checks an envelope's signature against trusted keys and returns its Statement. */
export function openEnvelope(envelope, keys) {
  const problems = [];
  if (!envelope || typeof envelope.payload !== 'string' || !Array.isArray(envelope.signatures)) return { ok: false, problems: ['not a DSSE envelope'] };
  if (envelope.payloadType !== PAYLOAD_TYPE) problems.push(`payload type ${envelope.payloadType}, expected ${PAYLOAD_TYPE}`);
  const body = Buffer.from(envelope.payload, 'base64');
  const signer = envelope.signatures.map(item => ({ item, trusted: keys.get(item.keyid) })).find(({ item, trusted }) => trusted && verify(null, pae(envelope.payloadType, body), trusted.key, Buffer.from(item.sig || '', 'base64')));
  if (!signer) problems.push(envelope.signatures.some(item => keys.has(item.keyid)) ? 'the signature does not match: the receipt was changed after it was signed' : `signed by ${envelope.signatures.map(item => item.keyid.slice(0, 16)).join(', ') || 'nobody'}, a key this repository does not trust (${KEYS_DIR}/)`);
  let statement = null;
  try { statement = JSON.parse(body.toString('utf8')); } catch { problems.push('the payload is not JSON'); }
  if (statement && statement._type !== STATEMENT_TYPE) problems.push(`statement type ${statement._type}, expected ${STATEMENT_TYPE}`);
  if (statement && statement.predicateType !== PROOF_PREDICATE) problems.push(`predicate type ${statement.predicateType}, expected ${PROOF_PREDICATE}`);
  return { ok: !problems.length, problems, statement, keyid: signer?.item.keyid || null };
}

export const proofPath = taskDir => join(taskDir, 'PROOF.json');

/** Attaches the envelope to a commit as a git note in `refs/notes/maverick`, replacing an older one. */
export async function attachNote(cwd, commit, envelope) {
  const result = await git(cwd, ['notes', '--ref', NOTES_REF, 'add', '-f', '-F', '-', commit], { input: `${JSON.stringify(envelope)}\n` });
  if (!result.ok) throw new Error(`git notes failed: ${result.stderr.trim()}`);
}

export async function readNote(cwd, rev) {
  const result = await git(cwd, ['notes', '--ref', NOTES_REF, 'show', rev]);
  if (!result.ok) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

/** `proof sign`: builds, signs and stores the receipt; attaches it to the commit when the change is committed. */
export async function signProof(cwd, task, { rev = null, note = true } = {}) {
  const { config, dir } = await getTask(cwd, task);
  const key = await signingKey(config);
  const published = await publishKey(cwd, key.publicKey);
  const statement = await buildStatement(cwd, task, { rev });
  const envelope = signStatement(statement, key);
  await writeFile(proofPath(dir), pretty(envelope));
  const commit = statement.predicate.change.commit;
  if (note && commit) await attachNote(cwd, commit, envelope);
  return { envelope, statement, keyid: key.keyid, keyPath: published.path, path: proofPath(dir), noted: note && commit ? commit : null };
}

/**
 * `proof verify`: the signature, then the subject against the code as it is (or at `rev`), the
 * intent digests against the task's documents, and every ledger head against the ledger when
 * it is here (loops are local; in CI they are not, which is said, not failed).
 */
export async function verifyProof(cwd, { task = null, file = null, rev = null, keys = [] } = {}) {
  const problems = [], warnings = [], notes = [];
  let envelope = null, source = null, taskDir = null;
  if (task) taskDir = (await getTask(cwd, task)).dir;
  if (file) { envelope = JSON.parse(await readFile(resolve(cwd, file), 'utf8')); source = file; }
  else if (rev) { envelope = await readNote(cwd, rev); source = `${NOTES_REF} on ${rev}`; }
  else if (taskDir) { envelope = await readFile(proofPath(taskDir), 'utf8').then(JSON.parse).catch(() => null); source = 'PROOF.json'; }
  if (!envelope) return { ok: false, source, problems: [`no proof receipt found${source ? ` in ${source}` : ''}; sign one with maverick proof sign <task>`], warnings, notes, statement: null };
  const opened = openEnvelope(envelope, await trustedKeys(cwd, keys));
  problems.push(...opened.problems);
  const statement = opened.statement, p = statement?.predicate;
  if (statement && opened.ok) {
    const tree = await subjectTree(cwd, rev ? (await resolveRef(cwd, `${rev}^{commit}`)) : null).catch(error => { problems.push(error.message); return null; });
    const signed = statement.subject?.[0]?.digest?.gitTree;
    if (tree && signed !== tree) problems.push(`the code changed since the receipt was signed: it proves tree ${signed?.slice(0, 12)}, ${rev || 'the working copy'} is ${tree.slice(0, 12)}`);
    if (!taskDir && p?.task?.slug) taskDir = await getTask(cwd, p.task.slug).then(item => item.dir).catch(() => null);
    if (task && p?.task?.slug !== task) problems.push(`the receipt is for task ${p?.task?.slug}, not ${task}`);
    if (taskDir) {
      for (const [name, digest] of Object.entries(p?.intent || {})) {
        const now = await exists(join(taskDir, name)) ? sha256(await readText(join(taskDir, name))) : null;
        if (now !== digest) problems.push(`${name} changed since the receipt was signed: the change was proved against another intent`);
      }
      for (const loop of p?.ledgers || []) {
        const entries = await readLedger(loopPaths(taskDir, loop.loopId).ledger).catch(() => []);
        if (!entries.length) { notes.push(`ledger of loop ${loop.loopId}: not here (loops are local); its head ${loop.head.slice(0, 12)} is in the receipt`); continue; }
        const prefix = entries.slice(0, loop.entries), chain = verifyChain(prefix, loop.loopId);
        if (!chain.ok || chain.head !== loop.head) problems.push(`ledger of loop ${loop.loopId} no longer matches the head the receipt recorded: its history was rewritten`);
        else if (entries.length > loop.entries) warnings.push(`loop ${loop.loopId} recorded ${entries.length - loop.entries} more entr${entries.length - loop.entries === 1 ? 'y' : 'ies'} after the receipt was signed`);
      }
    } else notes.push('the task is not in this checkout: intent and ledgers are taken from the receipt');
    for (const loop of p?.ledgers || []) if (loop.chain !== 'verified') warnings.push(`loop ${loop.loopId}: its ledger chain was already broken when the receipt was signed`);
  }
  return { ok: !problems.length, source, keyid: opened.keyid, problems, warnings, notes, statement };
}

/** What a receipt claims, as lines for a terminal: the evidence, not a verdict on it. */
export function summarizeStatement(statement) {
  const p = statement?.predicate;
  if (!p) return [];
  const gates = Object.entries(p.gates || {});
  const findings = (p.ledgers || []).reduce((sum, loop) => sum + Object.values(loop.integrity?.findings || {}).reduce((a, b) => a + b, 0), 0);
  return [
    `Task: ${p.task.slug} · tree ${statement.subject[0].digest.gitTree.slice(0, 12)}${p.change.commit ? ` · commit ${p.change.commit.slice(0, 12)}` : ' · uncommitted'}`,
    `Intent: ${Object.keys(p.intent || {}).join(', ') || 'no PRD or SPEC'}`,
    `Loops: ${(p.ledgers || []).map(loop => `${loop.loopId} ${loop.outcome} (${loop.iterations.accepted}/${loop.iterations.total} kept, ledger ${loop.chain})`).join('; ') || 'none'}`,
    `Gates: ${gates.length ? gates.map(([id, gate]) => `${id} ${gate.status}`).join(', ') : 'none recorded'}`,
    `Integrity: ${findings ? `${findings} finding(s)` : 'no finding'}${(p.ledgers || []).some(loop => loop.integrity?.tainted?.length) ? ' · tainted checkpoints' : ''}`,
    `Holdout: ${p.holdout ? `${p.holdout.status}${p.holdout.S !== null && p.holdout.S !== undefined ? ` · S ${Math.round(p.holdout.S * 100)}%` : ''}${p.holdout.OI !== null && p.holdout.OI !== undefined ? ` · OI ${p.holdout.OI >= 0 ? '+' : ''}${p.holdout.OI} pp` : ''}` : 'none'}`,
    `Verdicts: ${(p.ledgers || []).flatMap(loop => loop.verdicts).map(item => `${item.scope} ${item.status}`).join(', ') || 'none'}`,
    `Approvals: ${[...(p.approvals?.flows || []).map(item => `${item.flow}/${item.gate} ${item.decision} by ${item.by}`), p.approvals?.review && `review ${p.approvals.review}`, p.approvals?.done && `done by ${p.approvals.done.by}`].filter(Boolean).join(', ') || 'none'}`,
    `Models: ${(p.models || []).map(item => `${item.role} ${item.provider}${item.model ? ` (${item.model})` : ''}`).join(', ') || 'none recorded'}`
  ];
}
