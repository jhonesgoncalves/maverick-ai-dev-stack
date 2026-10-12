// A small unified-diff reader. It takes paths from the `---`/`+++` and `rename` lines, never
// from the ambiguous `diff --git` header, and understands what git prints for new, deleted,
// renamed, binary and mode-only changes.

const unquote = path => {
  if (!path.startsWith('"')) return path;
  const escapes = { n: '\n', t: '\t', '"': '"', '\\': '\\', a: '\x07', b: '\b', f: '\f', r: '\r', v: '\v' };
  const bytes = [];
  for (let i = 1; i < path.length - 1; i++) {
    if (path[i] !== '\\') { bytes.push(...Buffer.from(path[i])); continue; }
    const next = path[++i];
    if (/[0-7]/.test(next)) { bytes.push(parseInt(path.slice(i, i + 3), 8)); i += 2; } else bytes.push(...Buffer.from(escapes[next] ?? next));
  }
  return Buffer.from(bytes).toString('utf8');
};
const strip = (path, prefix) => { const value = unquote(path.trim()); return value === '/dev/null' ? null : value.startsWith(prefix) ? value.slice(prefix.length) : value; };

/** Files of a unified diff: `{ oldPath, newPath, status, similarity, binary, hunks: [{ removed, added, context }] }`, lines with numbers. */
export function parseDiff(text = '') {
  const files = [];
  let file = null, hunk = null, oldLine = 0, newLine = 0;
  const finish = () => {
    if (!file) return;
    if (file.oldPath === undefined && file.newPath === undefined) {
      // Mode-only or binary change without ---/+++: the header names the same path twice.
      const header = file.header.replace(/^diff --git /, ''), size = (header.length - 5) / 2;
      const path = Number.isInteger(size) && header.startsWith('a/') && header.slice(size + 3, size + 5) === 'b/' ? header.slice(2, size + 2) : header.split(' b/').pop();
      file.oldPath = file.status === 'added' ? null : path; file.newPath = file.status === 'deleted' ? null : path;
    }
    file.oldPath ??= file.status === 'added' ? null : file.newPath;
    file.newPath ??= file.status === 'deleted' ? null : file.oldPath;
    if (file.status === 'modified' && file.renamed) file.status = 'renamed';
    delete file.header; delete file.renamed;
    files.push(file);
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) { finish(); file = { header: line, oldPath: undefined, newPath: undefined, status: 'modified', similarity: null, binary: false, hunks: [], renamed: false }; hunk = null; continue; }
    if (!file) continue;
    if (!hunk || !/^[ +\-\\]/.test(line)) {
      if (line.startsWith('new file mode')) { file.status = 'added'; continue; }
      if (line.startsWith('deleted file mode')) { file.status = 'deleted'; continue; }
      if (line.startsWith('rename from ')) { file.oldPath = unquote(line.slice(12)); file.renamed = true; continue; }
      if (line.startsWith('rename to ')) { file.newPath = unquote(line.slice(10)); file.renamed = true; continue; }
      if (line.startsWith('similarity index ')) { file.similarity = Number.parseInt(line.slice(17), 10); continue; }
      if (line.startsWith('Binary files ')) { file.binary = true; continue; }
      if (line.startsWith('--- ')) { const path = strip(line.slice(4), 'a/'); if (path === null) file.status = 'added'; else if (!file.renamed) file.oldPath = path; continue; }
      if (line.startsWith('+++ ')) { const path = strip(line.slice(4), 'b/'); if (path === null) file.status = 'deleted'; else if (!file.renamed) file.newPath = path; continue; }
      const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (header) { hunk = { removed: [], added: [], context: [] }; file.hunks.push(hunk); oldLine = Number(header[1]); newLine = Number(header[2]); }
      continue;
    }
    if (line.startsWith('+')) hunk.added.push({ line: newLine++, text: line.slice(1) });
    else if (line.startsWith('-')) hunk.removed.push({ line: oldLine++, text: line.slice(1) });
    else if (line.startsWith(' ')) { hunk.context.push({ line: newLine, text: line.slice(1) }); oldLine++; newLine++; }
  }
  finish();
  return files.map(item => ({ ...item, oldPath: item.status === 'added' ? null : item.oldPath, newPath: item.status === 'deleted' ? null : item.newPath }));
}
