// Per-file code metrics that mean the same thing in every language: lines of code,
// decision-point complexity, indentation nesting, declared types (for abstractness) and
// debt markers. All regex-based over text with strings and comments blanked out first,
// so they are cheap, comparable across a polyglot repository, and honest approximations.

const HASH_COMMENTS = new Set(['Python', 'Ruby', 'Elixir']);
const DECISIONS = /\b(if|elif|elsif|for|foreach|while|until|unless|case|when|catch|except|rescue|guard|select)\b|&&|\|\||\?\?|\band\b|\bor\b/g;
// Upper case only: that is the convention, and it keeps prose such as "## Bug" out.
const DEBT = /(?:\/\/|#|\/\*|\*|--|<!--|;)[ \t]*(TODO|FIXME|HACK|XXX|BUG|DEPRECATED)\b[ \t:(-]*([^\n]*?)(?:\*\/|-->)?[ \t]*$/gm;

/** Replaces string literals and comments with spaces, keeping offsets and newlines. */
export function blank(text, language) {
  const hash = HASH_COMMENTS.has(language);
  let out = '', index = 0;
  const keepLines = chunk => chunk.replace(/[^\n]/g, ' ');
  while (index < text.length) {
    const char = text[index], next = text[index + 1];
    if (!hash && char === '/' && next === '/') { const end = text.indexOf('\n', index); const stop = end < 0 ? text.length : end; out += keepLines(text.slice(index, stop)); index = stop; continue; }
    if (!hash && char === '/' && next === '*') { const end = text.indexOf('*/', index + 2); const stop = end < 0 ? text.length : end + 2; out += keepLines(text.slice(index, stop)); index = stop; continue; }
    if (hash && char === '#') { const end = text.indexOf('\n', index); const stop = end < 0 ? text.length : end; out += keepLines(text.slice(index, stop)); index = stop; continue; }
    if (hash && (text.startsWith('"""', index) || text.startsWith("'''", index))) { const quote = text.slice(index, index + 3), end = text.indexOf(quote, index + 3); const stop = end < 0 ? text.length : end + 3; out += keepLines(text.slice(index, stop)); index = stop; continue; }
    if (char === '"' || char === "'" || char === '`') {
      let end = index + 1;
      while (end < text.length && text[end] !== char && (char === '`' || text[end] !== '\n')) end += text[end] === '\\' ? 2 : 1;
      out += keepLines(text.slice(index, end + 1)); index = end + 1; continue;
    }
    out += char; index++;
  }
  return out;
}

const count = (text, pattern) => (text.match(pattern) || []).length;

/** Abstract and concrete type declarations, used for Martin's abstractness. */
export function declaredTypes(code, language) {
  let abstract = 0, concrete = 0;
  switch (language) {
    case 'TypeScript': abstract = count(code, /\b(interface\s+\w|abstract\s+class\s+\w)/g); concrete = count(code, /(?<!abstract\s+)\bclass\s+\w/g); break;
    case 'JavaScript': concrete = count(code, /\bclass\s+\w/g); break;
    case 'Python': abstract = count(code, /^\s*class\s+\w+\s*\([^)]*\b(ABC|ABCMeta|Protocol|Interface)\b/gm); concrete = count(code, /^\s*class\s+\w/gm) - abstract; break;
    case 'Go': abstract = count(code, /\btype\s+\w+\s+interface\b/g); concrete = count(code, /\btype\s+\w+\s+struct\b/g); break;
    case 'Rust': abstract = count(code, /\btrait\s+\w/g); concrete = count(code, /\b(struct|enum)\s+\w/g); break;
    case 'Java': case 'Kotlin': case 'C#': case 'PHP': case 'Dart':
      abstract = count(code, /\b(interface|abstract\s+class|trait|sealed\s+interface|sealed\s+class|abstract\s+interface|protocol)\s+\w/g);
      concrete = count(code, /\b(class|record|struct|enum|object|data\s+class)\s+\w/g) - count(code, /\babstract\s+class\s+\w|\bsealed\s+class\s+\w/g); break;
    case 'Swift': abstract = count(code, /\bprotocol\s+\w/g); concrete = count(code, /\b(class|struct|enum|actor)\s+\w/g); break;
    case 'Elixir': abstract = count(code, /\b(defprotocol|@callback)\b/g) ? 1 : 0; concrete = count(code, /\bdefmodule\s+/g) - abstract; break;
    case 'C/C++': abstract = /=\s*0\s*;/.test(code) ? 1 : 0; concrete = Math.max(0, count(code, /\b(class|struct)\s+\w+[^;]*\{/g) - abstract); break;
    case 'Ruby': concrete = count(code, /^\s*class\s+\w/gm); abstract = count(code, /raise\s+NotImplementedError/g) ? 1 : 0; break;
    default: break;
  }
  // Module-level functions are concrete units too, or functional code would look abstract.
  const functions = { TypeScript: /^export\s+(?:default\s+)?(?:async\s+)?(?:function\b|const\s+\w+\s*=\s*(?:async\s*)?\(|const\s+\w+\s*=\s*(?:async\s+)?\w+\s*=>)/gm, Python: /^(?:async\s+)?def\s+\w/gm, Go: /^func\s+(?:\([^)]*\)\s*)?\w/gm, Rust: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+\w/gm, Elixir: /^\s*def\s+\w/gm, Kotlin: /^fun\s+\w/gm, Swift: /^(?:public\s+)?func\s+\w/gm }[language === 'JavaScript' ? 'TypeScript' : language];
  if (functions) concrete += count(code, functions);
  return { abstract: Math.max(0, abstract), concrete: Math.max(0, concrete) };
}

/** Metrics for one file. */
export function fileMetrics(text, language) {
  const code = blank(text, language), lines = code.split('\n');
  let loc = 0, maxNesting = 0, unit = 0;
  const indents = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    loc++;
    const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    indents.push(indent);
  }
  // Indentation unit: the most common positive step between consecutive indents.
  const steps = new Map();
  for (let index = 1; index < indents.length; index++) { const step = indents[index] - indents[index - 1]; if (step > 0 && step <= 8) steps.set(step, (steps.get(step) || 0) + 1); }
  unit = [...steps].sort((a, b) => b[1] - a[1])[0]?.[0] || 4;
  for (const indent of indents) maxNesting = Math.max(maxNesting, Math.floor(indent / unit));
  const complexity = 1 + count(code, DECISIONS);
  const types = declaredTypes(code, language);
  const debt = [];
  for (const match of text.matchAll(DEBT)) {
    const line = text.slice(0, match.index).split('\n').length;
    debt.push({ tag: match[1].toUpperCase(), text: match[2].trim().slice(0, 160), line });
    if (debt.length >= 50) break;
  }
  return { loc, complexity, maxNesting, types, debt };
}
