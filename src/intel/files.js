import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { IGNORED_DIRS } from '../core/util.js';

// One bounded, sorted walk of the repository shared by the analyzers. Hidden folders and
// build output are skipped so every analyzer sees the same files in the same order.

export const MAX_FILES = 5000;
export const posix = path => path.split(sep).join('/');
export const TEST_FILE = /(^|\/)(__tests__|tests?|spec|specs|e2e)\/|[._-](test|spec)\.[^/]+$|_test\.(go|py|exs)$|(^|\/)test_[^/]+\.py$|Tests?\.(java|kt|cs|swift)$/i;

export async function listFiles(root, keep, { limit = MAX_FILES, depthLimit = 12 } = {}) {
  const files = [];
  async function visit(dir, depth) {
    if (depth > depthLimit || files.length >= limit) return;
    for (const entry of (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= limit) return;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile()) { const file = posix(relative(root, path)); if (keep(file)) files.push(file); }
    }
  }
  await visit(root, 0);
  return files;
}

/** 1-based line number of a character offset. */
export function lineAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index++) if (text.charCodeAt(index) === 10) line++;
  return line;
}

/** Line starts, so many offsets can be converted without rescanning the text. */
export function lineIndex(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) starts.push(index + 1);
  return offset => { let low = 0, high = starts.length - 1; while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= offset) low = mid; else high = mid - 1; } return low + 1; };
}
