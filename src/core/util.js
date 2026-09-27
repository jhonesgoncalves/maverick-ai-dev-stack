import { access, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The CLI runs both from src/ (tests, tsx) and bundled into dist/, so the
// package root is located by walking up instead of assuming a fixed depth.
function findPackageRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try { if (JSON.parse(readFileSync(manifest, 'utf8')).name === 'maverick-ai-dev-stack') return dir; } catch { /* keep walking */ }
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
let sink = null;
export function output(message) { if (sink) sink.push(String(message)); else console.log(message); }

/** Runs fn while collecting everything it would print, so commands can be reused as building blocks. */
export async function captureOutput(fn) {
  const previous = sink, lines = [];
  sink = lines;
  try { return { value: await fn(), output: lines.join('\n') }; } catch (error) { error.output = lines.join('\n'); throw error; } finally { sink = previous; }
}
export function brand() { return process.env.NO_COLOR ? '⚔ MAVERICK' : '\x1b[38;5;208m⚔ MAVERICK\x1b[0m'; }

export function replaceVars(text, vars) { return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), text); }
export function sectionPresent(text, name) { const e = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp(`^#{1,4}\\s+${e}\\s*$`, 'mi').test(text); }
export function hasMeaningfulContent(text) { return !/\b(TODO|TBD|FILL ME)\b/i.test(text); }
export function requireSlug(slug) { if (!slugOk.test(slug || '')) throw new Error('use a lowercase slug such as add-orders-pagination'); }

export function parseOptions(args) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[++i];
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
