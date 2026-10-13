import { AsyncLocalStorage } from 'node:async_hooks';
import { access, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorEnabled, decorate, wordmark } from './style.js';
import { fold, headingAliases } from './language.js';

// The CLI runs both from src/ (tests, tsx) and bundled into dist/, so the
// package root is located by walking up instead of assuming a fixed depth.
function findPackageRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try { if (JSON.parse(readFileSync(manifest, 'utf8')).name === '@maverick-ai/cli') return dir; } catch { /* keep walking */ }
    }
    if (dirname(dir) === dir) return resolve(start, '..');
  }
}

export const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
export const packageVersion = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;

/** Directories that never contain project source worth scanning, across ecosystems. */
export const IGNORED_DIRS = new Set(['node_modules', '.git', '.maverick', 'dist', 'build', 'coverage', '.cache', 'vendor', 'target', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle', '.dart_tool', '_build', 'obj', '.next', '.nuxt', '.turbo', '.idea', '.vscode']);

const slugOk = /^[a-z0-9][a-z0-9-]{1,80}$/;

export async function exists(path) { try { await access(path); return true; } catch { return false; } }
export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
export async function readText(path) { try { return await readFile(path, 'utf8'); } catch { return ''; } }
export function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
export function pretty(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function rel(cwd, path) { return relative(cwd, path) || '.'; }
// Captured output belongs to one invocation: loops and lanes that run gates in-process at the same
// time each get their own sink, through the async context instead of a module-wide variable.
const sinks = new AsyncLocalStorage();
let pendingHeader = null;
/** Every command opens with the brand header on a terminal: the first `output` of a run adds `MAVERICK AI / <TITLE>` when the command did not print one itself. */
export function brandOutput(title) { pendingHeader = title; }
const branded = text => text.startsWith('MAVERICK AI') || text.startsWith(wordmark());
export function output(message) {
  const sink = sinks.getStore();
  if (sink) return void sink.push(String(message));
  if (pendingHeader) {
    const text = String(message).replace(/^\n+/, '');
    if (colorEnabled() && !branded(text) && !/^\s*[[{]/.test(text)) console.log(decorate(`${brand()} / ${pendingHeader}`));
    pendingHeader = null;
  }
  console.log(decorate(message));
}

/** Runs fn while collecting everything it would print, so commands can be reused as building blocks. */
export async function captureOutput(fn) {
  const lines = [];
  return sinks.run(lines, async () => {
    try { return { value: await fn(), output: lines.join('\n') }; } catch (error) { error.output = lines.join('\n'); throw error; }
  });
}
/** The plain brand mark; `output` colours it (and the `/ SECTION` suffix) on interactive terminals. */
export function brand() { return 'MAVERICK AI'; }

export function replaceVars(text, vars) { return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), text); }
/** True when a heading exists, in any language it is localized to (see core/language.js). */
export function sectionPresent(text, name) { return headingIndex(String(text).split('\n'), name).start >= 0; }
/** The body of a Markdown section in any language, up to the next heading of the same or a higher level (nested headings stay inside). */
export function sectionBody(text, name) {
  const lines = String(text).split('\n'), { start, level, headings } = headingIndex(lines, name);
  if (start < 0) return '';
  const end = headings.findIndex((match, index) => index > start && match && match[1].length <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function headingIndex(lines, name) {
  // `# comments` inside fenced code blocks are not headings.
  let fenced = false;
  const headings = lines.map(line => { if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return null; } return fenced ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(line); });
  const wanted = headingAliases(name), start = headings.findIndex(match => match && wanted.includes(fold(match[2])));
  return { start, level: start >= 0 ? headings[start][1].length : 0, headings };
}
/** Placeholders are upper case on purpose: "todo" is an ordinary word in Portuguese and in to-do features. */
export function hasMeaningfulContent(text) { return !/\b(TODO|TBD|FILL ME)\b/.test(text); }
export function requireSlug(slug) { if (!slugOk.test(slug || '')) throw new Error('use a lowercase slug such as add-orders-pagination'); }

export function parseOptions(args) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[++i];
      // A flag given twice with values keeps both (`--set a=1 --set b=2`); otherwise the last one wins.
      options[key] = typeof value === 'string' && (typeof options[key] === 'string' || Array.isArray(options[key])) ? [options[key]].flat().concat(value) : value;
    } else positional.push(args[i]);
  }
  return { positional, options };
}

/** Splits a command line into argv, honouring quotes and `\"`/`\\` escapes inside double quotes. No shell is involved. */
export function splitCommand(command) {
  const argv = [], chars = [...command.trim()]; let current = '', quote = null, started = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (quote === '"' && char === '\\' && (chars[i + 1] === '"' || chars[i + 1] === '\\')) { current += chars[++i]; continue; }
    if (quote) { if (char === quote) quote = null; else current += char; continue; }
    if (char === '"' || char === "'") { quote = char; started = true; continue; }
    if (/\s/.test(char)) { if (started || current) argv.push(current); current = ''; started = false; continue; }
    current += char;
  }
  if (quote) throw new Error(`unbalanced quote in command: ${command}`);
  if (started || current) argv.push(current);
  return argv;
}

/** True when an executable can be resolved from PATH (or as a relative path from cwd). */
export function commandAvailable(bin, cwd = process.cwd()) {
  if (bin.includes('/') || bin.includes('\\')) return existsSync(resolve(cwd, bin));
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')] : [''];
  return (process.env.PATH || '').split(delimiter).filter(Boolean).some(dir => extensions.some(ext => existsSync(join(dir, bin + ext))));
}

export function changedFilesFromDiff(diff) { return [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(match => match[1]))]; }

/** Edit distance between two strings, for "did you mean" suggestions. */
export function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const current = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = current; }
  }
  return row[b.length];
}

/** The candidate closest to a mistyped `name`, when it is close enough to be a typo. */
export function closest(name, candidates) {
  const [best] = candidates.map(key => ({ key, score: distance(String(name), key) })).sort((a, b) => a.score - b.score);
  return best && best.score <= Math.max(1, Math.floor(String(name).length / 3)) ? best.key : undefined;
}
