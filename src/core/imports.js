// Lightweight, regex-based import extraction per language. It is a review aid for the
// Lens coupling views, not a compiler: it favours zero dependencies over precision.

const all = (text, pattern, group = 1) => [...text.matchAll(pattern)].map(match => match[group]).filter(Boolean);

export const SOURCE_LANGUAGES = {
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.cs': 'C#', '.fs': 'F#', '.rb': 'Ruby', '.php': 'PHP', '.ex': 'Elixir', '.exs': 'Elixir',
  '.dart': 'Dart', '.swift': 'Swift', '.c': 'C/C++', '.h': 'C/C++', '.cpp': 'C/C++', '.hpp': 'C/C++', '.cc': 'C/C++'
};

const EXTRACTORS = {
  JavaScript: text => all(text, /(?:from\s*|import\s*\(\s*|require\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm),
  // `from pkg import name` may import a submodule, so `pkg.name` is emitted too; the
  // resolver keeps it only when such a file exists.
  Python: text => [...text.matchAll(/^[ \t]*(?:from[ \t]+([.\w]+)[ \t]+import[ \t]+(?:\(([^)]*)\)|([\w \t,]+))|import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*))/gm)]
    .flatMap(match => (match[1]
      ? [match[1], ...(match[2] ?? match[3]).split(',').map(name => name.trim().split(/\s+as\s+/)[0].trim()).filter(name => /^\w+$/.test(name)).map(name => `${match[1]}${/\.$/.test(match[1]) ? '' : '.'}${name}`)]
      : match[4].split(',').map(name => name.trim()))),
  Go: text => [
    ...all(text, /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm),
    ...[...text.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)].flatMap(block => all(block[1], /"([^"]+)"/g))
  ],
  Rust: text => [...all(text, /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/gm), ...all(text, /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm).map(name => `mod:${name}`)],
  Java: text => all(text, /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;?/gm),
  'C#': text => all(text, /^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/gm),
  'F#': text => all(text, /^\s*open\s+([\w.]+)/gm),
  Ruby: text => [...text.matchAll(/^\s*(require_relative|require)\s*\(?\s*['"]([^'"]+)['"]/gm)]
    .map(match => (match[1] === 'require_relative' && !match[2].startsWith('.') ? `./${match[2]}` : match[2])),
  PHP: text => [...all(text, /^\s*use\s+([\w\\]+)/gm), ...all(text, /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g)],
  Elixir: text => all(text, /^\s*(?:alias|import|use|require)\s+([\w.]+)/gm),
  Dart: text => all(text, /^\s*(?:import|export)\s+['"]([^'"]+)['"]/gm),
  Swift: text => all(text, /^\s*import\s+(?:class\s+|struct\s+|enum\s+|func\s+)?([\w.]+)/gm),
  'C/C++': text => all(text, /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)
};
EXTRACTORS.TypeScript = EXTRACTORS.JavaScript;
EXTRACTORS.Kotlin = EXTRACTORS.Java;

export function languageForPath(path) {
  const extension = path.match(/\.[^./\\]+$/)?.[0]?.toLowerCase();
  return extension ? SOURCE_LANGUAGES[extension] : undefined;
}

export function extractImports(language, text) {
  const extractor = EXTRACTORS[language];
  return extractor ? [...new Set(extractor(text))] : [];
}

/**
 * True when an import refers to code inside the project rather than a third-party package.
 * Relative specifiers are local in every language; Go imports are local when they share the
 * module path declared in go.mod.
 */
export function isLocalImport(language, specifier, { goModulePath } = {}) {
  if (specifier.startsWith('.')) return true;
  if (language === 'Go' && goModulePath) return specifier === goModulePath || specifier.startsWith(`${goModulePath}/`);
  if (language === 'Rust') return /^(crate|self|super)(::|$)/.test(specifier) || specifier.startsWith('mod:');
  return false;
}
