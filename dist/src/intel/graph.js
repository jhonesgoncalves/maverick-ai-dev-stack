import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { extractImports, languageForPath } from '../core/imports.js';
import { IGNORED_DIRS } from '../core/util.js';

// Builds a file-level dependency graph from static imports and resolves each import to a
// real project file per language. Unresolved imports are third-party (or dynamic) and
// are simply not edges. It is a review aid: fast, dependency-free, and explicit about scope.

const MAX_FILES = 5000, MAX_BYTES = 512 * 1024;
const posix = path => path.split(sep).join('/');
const TEST = /(^|\/)(__tests__|tests?|spec)\/|[._-](test|spec)\.[^/]+$|_test\.go$|Tests?\.(java|kt|cs)$/i;

async function sourceFiles(root) {
  const files = [];
  async function visit(dir, depth) {
    if (depth > 12 || files.length >= MAX_FILES) return;
    for (const entry of (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && languageForPath(entry.name)) files.push(posix(relative(root, path)));
    }
  }
  await visit(root, 0);
  return files;
}

const JS_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs'];

/** Per-language resolvers: (specifier, fromFile, context) → project files the import refers to. */
const RESOLVERS = {
  JavaScript(spec, from, ctx) {
    if (!spec.startsWith('.')) return [];
    const base = posix(normalize(join(dirname(from), spec)));
    // TypeScript projects import `./x.js` that is really `./x.ts`.
    const stem = base.replace(/\.(m|c)?js$/, '');
    return first(ctx, [...JS_EXTENSIONS.map(ext => base + ext), ...JS_EXTENSIONS.map(ext => stem + ext)]);
  },
  Python(spec, from, ctx) {
    const dots = spec.match(/^\.*/)[0].length, rest = spec.slice(dots).replaceAll('.', '/');
    const bases = dots ? [posix(normalize(join(dirname(from), ...Array(dots - 1).fill('..'), rest)))] : [rest, ...ctx.pythonRoots.map(root => `${root}/${rest}`)];
    return first(ctx, bases.flatMap(base => [`${base}.py`, `${base}/__init__.py`]));
  },
  Go(spec, from, ctx) {
    if (!ctx.goModulePath || !(spec === ctx.goModulePath || spec.startsWith(`${ctx.goModulePath}/`))) return [];
    const dir = spec.slice(ctx.goModulePath.length).replace(/^\//, '');
    return ctx.files.filter(file => file.endsWith('.go') && !file.endsWith('_test.go') && posix(dirname(file)) === (dir || '.'));
  },
  Rust(spec, from, ctx) {
    if (spec.startsWith('mod:')) { const name = spec.slice(4), dir = posix(dirname(from)), own = from.replace(/(mod|lib|main)\.rs$/, '').replace(/\.rs$/, '/'); return first(ctx, [`${own}${name}.rs`, `${own}${name}/mod.rs`, `${dir}/${name}.rs`, `${dir}/${name}/mod.rs`].map(path => path.replace(/^\.\//, ''))); }
    const parts = spec.split('::');
    if (parts[0] !== 'crate') return [];
    const crateRoot = ctx.files.find(file => /(^|\/)src\/(lib|main)\.rs$/.test(file))?.replace(/(lib|main)\.rs$/, '') || 'src/';
    for (let size = parts.length - 1; size >= 1; size--) {
      const path = parts.slice(1, size + 1).join('/');
      const found = first(ctx, [`${crateRoot}${path}.rs`, `${crateRoot}${path}/mod.rs`]);
      if (found.length) return found;
    }
    return [];
  },
  Java(spec, from, ctx) {
    const path = spec.replace(/\.\*$/, '').replaceAll('.', '/');
    return ctx.files.filter(file => /\.(java|kt)$/.test(file) && (file.endsWith(`/${path}.java`) || file.endsWith(`/${path}.kt`)));
  },
  Ruby(spec, from, ctx) { return spec.startsWith('.') ? first(ctx, [posix(normalize(join(dirname(from), spec))) + (spec.endsWith('.rb') ? '' : '.rb')]) : first(ctx, [`lib/${spec}.rb`]); },
  PHP(spec, from, ctx) { return /\.php$/.test(spec) ? first(ctx, [posix(normalize(join(dirname(from), spec)))]) : []; },
  Dart(spec, from, ctx) {
    if (spec.startsWith('package:')) { const [pkg, ...path] = spec.slice(8).split('/'); return pkg === ctx.dartPackage ? first(ctx, [`lib/${path.join('/')}`]) : []; }
    return spec.includes(':') ? [] : first(ctx, [posix(normalize(join(dirname(from), spec)))]);
  },
  'C/C++'(spec, from, ctx) { return first(ctx, [posix(normalize(join(dirname(from), spec))), spec]); }
};
RESOLVERS.TypeScript = RESOLVERS.JavaScript;
RESOLVERS.Kotlin = RESOLVERS.Java;

function first(ctx, candidates) { const hit = candidates.find(candidate => ctx.fileSet.has(candidate)); return hit ? [hit] : []; }

async function projectContext(root, files) {
  const read = async path => readFile(join(root, path), 'utf8').catch(() => '');
  const goModulePath = (await read('go.mod')).match(/^module\s+(\S+)/m)?.[1];
  const dartPackage = (await read('pubspec.yaml')).match(/^name:\s*(\S+)/m)?.[1];
  const pythonRoots = ['src', 'lib', 'app'].filter(dir => files.some(file => file.startsWith(`${dir}/`) && file.endsWith('.py')));
  return { files, fileSet: new Set(files), goModulePath, dartPackage, pythonRoots };
}

/** Tarjan's strongly connected components; returns components with more than one file (or a self-loop). */
export function stronglyConnected(nodes, adjacency) {
  let index = 0; const stack = [], onStack = new Set(), indices = new Map(), low = new Map(), components = [];
  const connect = node => {
    indices.set(node, index); low.set(node, index); index++; stack.push(node); onStack.add(node);
    for (const next of adjacency.get(node) || []) {
      if (!indices.has(next)) { connect(next); low.set(node, Math.min(low.get(node), low.get(next))); }
      else if (onStack.has(next)) low.set(node, Math.min(low.get(node), indices.get(next)));
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do { member = stack.pop(); onStack.delete(member); component.push(member); } while (member !== node);
      if (component.length > 1 || (adjacency.get(node) || []).includes(node)) components.push(component.sort());
    }
  };
  for (const node of nodes) if (!indices.has(node)) connect(node);
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** Scans the project and returns nodes, resolved edges, and per-file metrics. */
export async function buildGraph(root) {
  const files = await sourceFiles(root), ctx = await projectContext(root, files);
  const nodes = [], edges = [];
  for (const file of files) {
    const info = await stat(join(root, file)).catch(() => null);
    if (!info || info.size > MAX_BYTES) continue;
    const language = languageForPath(file), text = await readFile(join(root, file), 'utf8').catch(() => '');
    const imports = extractImports(language, text), targets = new Map();
    // Lazy `import()` is a deliberate runtime boundary: it counts for impact, not for cycles.
    const lazy = /Script$/.test(language) ? new Set([...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1])) : new Set();
    for (const spec of imports) {
      for (const target of (RESOLVERS[language]?.(spec, file, ctx) || [])) {
        if (target === file && !spec.startsWith('mod:')) continue;
        targets.set(target, (targets.get(target) ?? true) && lazy.has(spec));
      }
    }
    nodes.push({ id: file, language, test: TEST.test(file), lines: text ? text.split('\n').length : 0, imports: imports.length });
    for (const [target, dynamic] of targets) edges.push({ from: file, to: target, ...(dynamic && { dynamic: true }) });
  }
  return withMetrics(nodes, edges, { truncated: files.length >= MAX_FILES });
}

/** Adds fan-in/fan-out, instability, cycles and a health score to a graph. Pure. */
export function withMetrics(nodes, edges, extra = {}) {
  const out = new Map(nodes.map(node => [node.id, []])), incoming = new Map(nodes.map(node => [node.id, []]));
  const staticOut = new Map(nodes.map(node => [node.id, []])), staticIn = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    out.get(edge.from)?.push(edge.to); incoming.get(edge.to)?.push(edge.from);
    if (!edge.dynamic) { staticOut.get(edge.from)?.push(edge.to); staticIn.get(edge.to)?.push(edge.from); }
  }
  for (const node of nodes) {
    node.fanOut = staticOut.get(node.id).length; node.fanIn = staticIn.get(node.id).length;
    node.instability = node.fanIn + node.fanOut ? Number((node.fanOut / (node.fanIn + node.fanOut)).toFixed(2)) : 0;
  }
  const cycles = stronglyConnected(nodes.map(node => node.id), staticOut);
  const inCycles = new Set(cycles.flat());
  // Hubs: production files both widely depended on and depending on many others.
  const source = nodes.filter(node => !node.test);
  const threshold = values => { const sorted = values.sort((a, b) => a - b); return Math.max(5, sorted[Math.floor(sorted.length * 0.9)] || 0); };
  const fanInLimit = threshold(source.map(node => node.fanIn)), fanOutLimit = threshold(source.map(node => node.fanOut));
  const hubs = source.filter(node => node.fanIn >= fanInLimit && node.fanOut >= fanOutLimit).map(node => node.id);
  const total = source.length || 1;
  const cycleShare = source.filter(node => inCycles.has(node.id)).length / total, hubShare = hubs.length / total;
  const health = { score: Math.max(0, Math.round(100 * (1 - 0.7 * cycleShare - 0.3 * hubShare))), formula: '100 × (1 − 0.7 × share of files in import cycles − 0.3 × share of hub files)', cycleShare: Number(cycleShare.toFixed(3)), hubShare: Number(hubShare.toFixed(3)) };
  return { nodes, edges, cycles, hubs, health, out, incoming, ...extra };
}

/** Reverse breadth-first search: everything that directly or transitively imports `target`. */
export function impactOf(graph, target, maxDepth = 10) {
  const seen = new Map([[target, 0]]), queue = [target];
  while (queue.length) {
    const current = queue.shift(), depth = seen.get(current);
    if (depth >= maxDepth) continue;
    for (const parent of graph.incoming.get(current) || []) if (!seen.has(parent)) { seen.set(parent, depth + 1); queue.push(parent); }
  }
  seen.delete(target);
  const testIds = new Set(graph.nodes.filter(node => node.test).map(node => node.id));
  const dependents = [...seen].map(([id, depth]) => ({ id, depth, test: testIds.has(id) })).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  return { target, known: graph.out.has(target), direct: dependents.filter(item => item.depth === 1).map(item => item.id), dependents, tests: dependents.filter(item => item.test).map(item => item.id) };
}

/** Collapses the file graph to directories (up to `depth` segments) for readable diagrams. */
export function directoryGraph(graph, depth = 2) {
  const group = id => { const parts = id.split('/'); return parts.length > 1 ? parts.slice(0, Math.min(depth, parts.length - 1)).join('/') : '(root)'; };
  const weights = new Map();
  for (const edge of graph.edges) {
    const from = group(edge.from), to = group(edge.to);
    if (from !== to) weights.set(`${from}\0${to}`, (weights.get(`${from}\0${to}`) || 0) + 1);
  }
  return [...weights].map(([key, weight]) => { const [from, to] = key.split('\0'); return { from, to, weight }; }).sort((a, b) => b.weight - a.weight);
}

export function toMermaid(graph, depth = 2, limit = 60) {
  const links = directoryGraph(graph, depth).slice(0, limit), ids = new Map();
  const id = name => { if (!ids.has(name)) ids.set(name, `n${ids.size}`); return ids.get(name); };
  const lines = links.map(link => `  ${id(link.from)}["${link.from}"] -->|${link.weight}| ${id(link.to)}["${link.to}"]`);
  return `graph LR\n${lines.join('\n') || '  empty["no local imports"]'}`;
}
