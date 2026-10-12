import { createHash } from 'node:crypto';

// Stable identities for a failing check, so "10 failing tests became 3" reads as progress and
// "the same 3 keep failing" reads as a stall. Test runners name their failures in a handful of
// well-known formats; when none matches, a hash of the output with the noise (durations,
// timestamps, addresses, temp paths) removed stands in for the failure.

/** One row per runner format: the pattern and how a match becomes an id. Every row is tried. */
const RUNNERS = [
  { runner: 'tap', pattern: /^\s*not ok \d+ - (.+?)(?:\s+#.*)?$/gm, id: m => m[1] },
  { runner: 'node-test', pattern: /^\s*✖ (?!failing tests:)(.+?)(?: \([\d.]+m?s\))?$/gm, id: m => m[1] },
  { runner: 'jest', pattern: /^\s*● (.+? › .+)$/gm, id: m => m[1] },
  { runner: 'jest', pattern: /^\s*✕ (.+?)(?: \(\d+ ?ms\))?$/gm, id: m => m[1] },
  { runner: 'vitest', pattern: /^\s*(?:×|✗) (.+?)(?: \d+ms)?$/gm, id: m => m[1] },
  { runner: 'vitest', pattern: /^\s*FAIL\s+(\S+\.(?:[cm]?[jt]sx?)\s+>\s+.+?)(?: \d+ms)?$/gm, id: m => m[1] },
  { runner: 'pytest', pattern: /^(?:FAILED|ERROR) (\S+)/gm, id: m => m[1] },
  { runner: 'go', pattern: /^\s*--- FAIL: (\S+)/gm, id: m => m[1] },
  { runner: 'cargo', pattern: /^test (\S+) \.\.\. FAILED$/gm, id: m => m[1] },
  { runner: 'gradle', pattern: /^(\S+) > (.+) FAILED$/gm, id: m => `${m[1]} > ${m[2]}` },
  { runner: 'surefire', pattern: /^\[ERROR\]\s+([\w$.]+\.[\w$]+):\d+/gm, id: m => m[1] },
  { runner: 'rspec', pattern: /^rspec (\.\/\S+:\d+)/gm, id: m => m[1] },
  { runner: 'dotnet', pattern: /^\s*Failed (\S+) \[/gm, id: m => m[1] },
  { runner: 'tsc', pattern: /^(.+?)\(\d+,\d+\): error (TS\d+)/gm, id: m => `${m[1]} ${m[2]}` },
  { runner: 'tsc', pattern: /^(.+?):\d+:\d+ - error (TS\d+)/gm, id: m => `${m[1]} ${m[2]}` }
];

const MAX_IDS = 500;
const strip = text => String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');

/** ESLint's stylish format names the file on its own line, then each problem with its rule. */
function eslintIds(text) {
  const ids = [];
  let file = null;
  for (const line of text.split('\n')) {
    if (/^\S.*\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(line.trim()) && !/\s{2,}/.test(line)) { file = line.trim(); continue; }
    const problem = file && line.match(/^\s+\d+:\d+\s+error\s+.+?\s{2,}(\S+)\s*$/);
    if (problem) ids.push(`${file} ${problem[1]}`);
  }
  return ids;
}

/** Failing test (or type, or lint) identifiers in a command's output: deduplicated, in order, capped. */
export function failingTests(output) {
  const text = strip(output), runners = new Set(), ids = [];
  for (const row of RUNNERS) {
    for (const match of text.matchAll(row.pattern)) { runners.add(row.runner); ids.push(row.id(match).trim()); }
  }
  const lint = eslintIds(text);
  if (lint.length) { runners.add('eslint'); ids.push(...lint); }
  // Runners repeat failures in their summary; the same id twice is one failure.
  return { runners: [...runners], ids: [...new Set(ids.filter(Boolean))].slice(0, MAX_IDS) };
}

/** The output with run-to-run noise replaced by placeholders, so the same failure hashes the same. */
export function normalizeOutput(output, { cwd } = {}) {
  let text = strip(output);
  if (cwd) text = text.split(cwd).join('<cwd>');
  return text
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<time>')
    .replace(/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<time>')
    .replace(/\(?\b\d+(?:\.\d+)?\s?(?:ns|µs|us|ms|s|sec|secs|seconds|m|min)\b\)?/g, '<dur>')
    .replace(/\b0x[0-9a-f]{4,}\b/gi, '<hex>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/(?:\/private)?\/(?:tmp|var\/folders)\/\S+/g, '<tmp>')
    .replace(/localhost:\d+/g, 'localhost:<port>')
    .replace(/\bpid[ =:]\d+/gi, 'pid <n>')
    .split('\n').filter(line => !/^\s*(?:Time|Duration|Ran \d+ tests? in)\b/i.test(line))
    .map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

export function outputHash(output, options) { return createHash('sha256').update(normalizeOutput(output, options)).digest('hex').slice(0, 12); }

/**
 * Fingerprints of one failed command: one per failing test when the runner names them,
 * otherwise one for the normalised output. Each is prefixed with the command.
 */
export function fingerprintsFor({ command, output, cwd }) {
  const { ids } = failingTests(output), hash = outputHash(output, { cwd });
  return { ids, hash, keys: ids.length ? ids.map(id => `${command} :: ${id}`) : [`${command} #${hash}`] };
}
