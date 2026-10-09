import { readFile, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { extractImports, languageForPath } from '../core/imports.js';
import { listFiles, MAX_FILES, posix, TEST_FILE } from './files.js';

// Builds a file-level dependency graph from static imports and resolves each import to a
// real project file per language. Unresolved imports are third-party (or dynamic) and
// are simply not edges. It is a review aid: fast, dependency-free, and explicit about scope.

const MAX_BYTES = 512 * 1024;
const TEST = TEST_FILE;

const sourceFiles = root => listFiles(root, file => Boolean(languageForPath(file)));

const JS_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs'];
const jsCandidates = base => { const stem = base.replace(/\.(m|c)?js$|\.d\.ts$/, ''); return [...JS_EXTENSIONS.map(ext => base + ext), ...JS_EXTENSIONS.map(ext => stem + ext)]; };
const clean = path => posix(normalize(path)).replace(/^\.\//, '').replace(/\/$/, '');

/** Nearest ancestor entry of `file` in a map keyed by directory ('' is the root). */
function nearest(map, file) {
  for (let dir = posix(dirname(file)); ; dir = posix(dirname(dir))) {
    const key = dir === '.' ? '' : dir;
    if (map.has(key)) return map.get(key);
    if (!key) return undefined;
  }
}

/** Per-language resolvers: (specifier, fromFile, context) → project files the import refers to. */
const RESOLVERS = {
  JavaScript(spec, from, ctx) {
    // TypeScript projects import `./x.js` that is really `./x.ts`.
    if (spec.startsWith('.')) return first(ctx, jsCandidates(posix(normalize(join(dirname(from), spec)))));
    // tsconfig/jsconfig `paths` and `baseUrl` (e.g. "@/*" → "src/*").
    const aliases = nearest(ctx.tsconfigs, from);
    if (aliases) {
      for (const [pattern, targets] of aliases.paths) {
        const star = pattern.indexOf('*'), matched = star < 0 ? (spec === pattern ? '' : null) : spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1)) && spec.length >= pattern.length - 1 ? spec.slice(star, spec.length - (pattern.length - star - 1)) : null;
        if (matched === null) continue;
        for (const target of targets) { const hit = first(ctx, jsCandidates(clean(join(aliases.base, target.replace('*', matched))))); if (hit.length) return hit; }
      }
      if (aliases.baseUrl !== undefined) { const hit = first(ctx, jsCandidates(clean(join(aliases.baseUrl, spec)))); if (hit.length) return hit; }
    }
    // Workspace packages of a monorepo, by package name.
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0], pkg = ctx.workspaces.get(name);
    if (!pkg) return [];
    const rest = spec.slice(name.length).replace(/^\//, '');
    if (rest) return first(ctx, [...jsCandidates(clean(join(pkg.dir, rest))), ...jsCandidates(clean(join(pkg.dir, 'src', rest)))]);
    return first(ctx, pkg.entries.flatMap(entry => [...jsCandidates(clean(join(pkg.dir, entry))), ...jsCandidates(clean(join(pkg.dir, entry.replace(/^(\.\/)?(dist|build|lib|out|esm|cjs)\//, 'src/'))))]).concat([`${pkg.dir ? `${pkg.dir}/` : ''}src/index.ts`, `${pkg.dir ? `${pkg.dir}/` : ''}src/index.tsx`, `${pkg.dir ? `${pkg.dir}/` : ''}src/index.js`, `${pkg.dir ? `${pkg.dir}/` : ''}index.ts`, `${pkg.dir ? `${pkg.dir}/` : ''}index.js`]));
  },
  Python(spec, from, ctx) {
    const dots = spec.match(/^\.*/)[0].length, rest = spec.slice(dots).replaceAll('.', '/');
    const bases = dots ? [posix(normalize(join(dirname(from), ...Array(dots - 1).fill('..'), rest)))] : [rest, ...ctx.pythonRoots.map(root => `${root}/${rest}`)];
    return first(ctx, bases.flatMap(base => [`${base}.py`, `${base}/__init__.py`]));
  },
  Go(spec, from, ctx) {
    const module = ctx.goModules.find(item => spec === item.path || spec.startsWith(`${item.path}/`));
    if (!module) return [];
    const dir = clean(join(module.dir || '.', spec.slice(module.path.length).replace(/^\//, ''))) || '.';
    return (ctx.byDir.get(dir === '' ? '.' : dir) || []).filter(file => file.endsWith('.go') && !file.endsWith('_test.go'));
  },
  Rust(spec, from, ctx) {
    if (spec.startsWith('mod:')) { const name = spec.slice(4), dir = posix(dirname(from)), own = from.replace(/(mod|lib|main)\.rs$/, '').replace(/\.rs$/, '/'); return first(ctx, [`${own}${name}.rs`, `${own}${name}/mod.rs`, `${dir}/${name}.rs`, `${dir}/${name}/mod.rs`].map(path => path.replace(/^\.\//, ''))); }
    const parts = spec.split('::');
    // `crate::` is the current crate; a workspace crate is used by its name.
    const crate = parts[0] === 'crate' ? nearest(ctx.crates, from) : ctx.crateNames.get(parts[0]);
    const crateRoot = crate ? `${crate.dir ? `${crate.dir}/` : ''}src/` : parts[0] === 'crate' ? (ctx.files.find(file => /(^|\/)src\/(lib|main)\.rs$/.test(file))?.replace(/(lib|main)\.rs$/, '') || 'src/') : null;
    if (!crateRoot) return [];
    for (let size = parts.length - 1; size >= 1; size--) {
      const path = parts.slice(1, size + 1).join('/');
      const found = first(ctx, [`${crateRoot}${path}.rs`, `${crateRoot}${path}/mod.rs`]);
      if (found.length) return found;
    }
    return parts[0] === 'crate' ? [] : first(ctx, [`${crateRoot}lib.rs`]);
  },
  Java(spec, from, ctx) {
    const path = spec.replace(/\.\*$/, '').replaceAll('.', '/'), name = path.split('/').pop();
    if (spec.endsWith('.*')) return (ctx.byDir.get([...ctx.byDir.keys()].find(dir => dir.endsWith(`/${path}`) || dir === path)) || []).filter(file => /\.(java|kt)$/.test(file));
    return (ctx.byStem.get(name) || []).filter(file => /\.(java|kt)$/.test(file) && (file.endsWith(`/${path}.java`) || file.endsWith(`/${path}.kt`) || file === `${path}.java` || file === `${path}.kt`));
  },
  'C#'(spec, from, ctx) { return (ctx.csNamespaces.get(spec) || []).filter(file => file !== from); },
  Elixir(spec, from, ctx) { const file = ctx.elixirModules.get(spec); return file && file !== from ? [file] : []; },
  Ruby(spec, from, ctx) { return spec.startsWith('.') ? first(ctx, [posix(normalize(join(dirname(from), spec))) + (spec.endsWith('.rb') ? '' : '.rb')]) : first(ctx, [`lib/${spec}.rb`, `${spec}.rb`, `app/${spec}.rb`]); },
  PHP(spec, from, ctx) {
    if (/\.php$/.test(spec)) return first(ctx, [posix(normalize(join(dirname(from), spec)))]);
    // Composer PSR-4 autoloading: App\Models\User → app/Models/User.php.
    for (const { prefix, dirs } of ctx.psr4) if (spec.startsWith(prefix)) { const hit = first(ctx, dirs.map(dir => clean(join(dir, `${spec.slice(prefix.length).replaceAll('\\', '/')}.php`)))); if (hit.length) return hit; }
    return [];
  },
  Dart(spec, from, ctx) {
    if (spec.startsWith('package:')) { const [pkg, ...path] = spec.slice(8).split('/'); const dir = ctx.dartPackages.get(pkg); return dir !== undefined ? first(ctx, [clean(join(dir, 'lib', path.join('/')))]) : []; }
    return spec.includes(':') ? [] : first(ctx, [posix(normalize(join(dirname(from), spec)))]);
  },
  'C/C++'(spec, from, ctx) { return first(ctx, [posix(normalize(join(dirname(from), spec))), spec, ...ctx.includeDirs.map(dir => clean(join(dir, spec)))]); }
};
RESOLVERS.TypeScript = RESOLVERS.JavaScript;
RESOLVERS.Kotlin = RESOLVERS.Java;

function first(ctx, candidates) { const hit = candidates.find(candidate => ctx.fileSet.has(candidate)); return hit ? [hit] : []; }

const parseJsonc = text => JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|(?<=^|[^:"'\w])\/\/[^\n]*/g, '').replace(/,(\s*[}\]])/g, '$1'));

/** tsconfig/jsconfig files with their effective `paths`, following local `extends`. */
async function tsconfigs(root, read) {
  const found = await listFiles(root, file => /(^|\/)(tsconfig|jsconfig)(\.[\w-]+)?\.json$/.test(file), { depthLimit: 6 });
  const parsed = new Map();
  for (const file of found) { try { parsed.set(file, parseJsonc(await read(file))); } catch { /* unreadable config */ } }
  const effective = (file, seen = new Set()) => {
    const config = parsed.get(file); if (!config || seen.has(file)) return {};
    seen.add(file);
    const dir = posix(dirname(file)) === '.' ? '' : posix(dirname(file));
    const parent = typeof config.extends === 'string' && config.extends.startsWith('.') ? effective(clean(join(dir, config.extends.endsWith('.json') ? config.extends : `${config.extends}.json`)), seen) : {};
    const options = config.compilerOptions || {};
    const baseUrl = options.baseUrl !== undefined ? clean(join(dir, options.baseUrl)) : parent.baseUrl;
    // `paths` resolve against baseUrl, or against the config declaring them.
    return options.paths ? { baseUrl, base: baseUrl ?? dir, paths: Object.entries(options.paths) } : { baseUrl, base: parent.base ?? baseUrl ?? dir, paths: parent.paths || [] };
  };
  const byDir = new Map();
  for (const file of parsed.keys()) {
    if (!/(^|\/)(tsconfig|jsconfig)\.json$/.test(file)) continue;
    const config = effective(file), dir = posix(dirname(file)) === '.' ? '' : posix(dirname(file));
    if (config.paths?.length || config.baseUrl !== undefined) byDir.set(dir, config);
  }
  return byDir;
}

async function projectContext(root, files, texts = new Map()) {
  const read = async path => readFile(join(root, path), 'utf8').catch(() => '');
  const manifests = await listFiles(root, file => /(^|\/)(package\.json|go\.mod|Cargo\.toml|composer\.json|pubspec\.yaml)$/.test(file), { depthLimit: 6 });
  const workspaces = new Map(), goModules = [], crates = new Map(), crateNames = new Map(), psr4 = [], dartPackages = new Map();
  for (const manifest of manifests) {
    const text = await read(manifest), dir = posix(dirname(manifest)) === '.' ? '' : posix(dirname(manifest)), name = manifest.split('/').pop();
    try {
      if (name === 'package.json') {
        const json = JSON.parse(text), exported = typeof json.exports === 'string' ? json.exports : json.exports?.['.'];
        const entries = [json.source, typeof exported === 'string' ? exported : exported?.source, exported?.import, exported?.default, exported?.require, exported?.types, json.module, json.main, json.types].flat().filter(value => typeof value === 'string');
        if (json.name && !workspaces.has(json.name)) workspaces.set(json.name, { dir, entries });
      } else if (name === 'go.mod') { const path = text.match(/^module\s+(\S+)/m)?.[1]; if (path) goModules.push({ path, dir }); }
      else if (name === 'Cargo.toml') { const crate = text.match(/^\[package\][\s\S]*?^\s*name\s*=\s*"([^"]+)"/m)?.[1]; if (crate) { crates.set(dir, { name: crate, dir }); crateNames.set(crate.replaceAll('-', '_'), { name: crate, dir }); } }
      else if (name === 'composer.json') { const json = JSON.parse(text); for (const [prefix, paths] of Object.entries({ ...json.autoload?.['psr-4'], ...json['autoload-dev']?.['psr-4'] })) psr4.push({ prefix, dirs: [].concat(paths).map(path => clean(join(dir, path))) }); }
      else if (name === 'pubspec.yaml') { const pkg = text.match(/^name:\s*(\S+)/m)?.[1]; if (pkg) dartPackages.set(pkg, dir); }
    } catch { /* unreadable manifest */ }
  }
  goModules.sort((a, b) => b.path.length - a.path.length);
  psr4.sort((a, b) => b.prefix.length - a.prefix.length);
  const byDir = new Map(), byStem = new Map(), csNamespaces = new Map(), elixirModules = new Map();
  for (const file of files) {
    const dir = posix(dirname(file)), stem = file.split('/').pop().replace(/\.[^.]+$/, '');
    byDir.set(dir, [...(byDir.get(dir) || []), file]); byStem.set(stem, [...(byStem.get(stem) || []), file]);
    const text = texts.get(file);
    if (!text) continue;
    if (file.endsWith('.cs')) for (const match of text.matchAll(/^\s*namespace\s+([\w.]+)/gm)) csNamespaces.set(match[1], [...(csNamespaces.get(match[1]) || []), file]);
    if (/\.exs?$/.test(file)) for (const match of text.matchAll(/^\s*def(?:module|protocol)\s+([\w.]+)/gm)) if (!elixirModules.has(match[1])) elixirModules.set(match[1], file);
  }
  const pythonRoots = ['src', 'lib', 'app'].filter(dir => files.some(file => file.startsWith(`${dir}/`) && file.endsWith('.py')));
  const includeDirs = [...byDir.keys()].filter(dir => /(^|\/)include$/.test(dir));
  return { files, fileSet: new Set(files), goModules, crates, crateNames, workspaces, psr4, dartPackages, pythonRoots, includeDirs, byDir, byStem, csNamespaces, elixirModules, tsconfigs: await tsconfigs(root, read) };
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

/** Resolves one import specifier of `from` to the project files it refers to. */
export async function createResolver(root, files, texts) {
  const ctx = await projectContext(root, files, texts);
  return (language, spec, from) => RESOLVERS[language]?.(spec, from, ctx) || [];
}

/**
 * Scans the project and returns nodes, resolved edges, and per-file metrics. Pass a
 * `sources` Map to keep each file's text for other analyzers, so files are read once.
 */
export async function buildGraph(root, { sources = new Map() } = {}) {
  const files = await sourceFiles(root);
  for (const file of files) {
    const info = await stat(join(root, file)).catch(() => null);
    if (!info || info.size > MAX_BYTES) continue;
    sources.set(file, await readFile(join(root, file), 'utf8').catch(() => ''));
  }
  const ctx = await projectContext(root, files, sources);
  const nodes = [], edges = [];
  for (const file of files) {
    if (!sources.has(file)) continue;
    const language = languageForPath(file), text = sources.get(file);
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
  return withMetrics(nodes, edges, { truncated: files.length >= MAX_FILES, files });
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
  const health = healthFor(source.length, [
    { ...HEALTH_RULES.cycle, files: source.filter(node => inCycles.has(node.id)).map(node => node.id) },
    { ...HEALTH_RULES.hub, files: hubs }
  ]);
  return { nodes, edges, cycles, hubs, health, out, incoming, ...extra };
}

export const HEALTH_RULES = {
  cycle: { rule: 'Import cycle', weight: 3, why: 'Files in a cycle cannot be understood, tested or changed in isolation.' },
  hub: { rule: 'Hub file', weight: 2, why: 'Widely used and depending on many others: every change ripples both ways.' },
  boundary: { rule: 'Boundary violation', weight: 3, why: 'An import the architecture rules in configuration forbid.' }
};
export const HEALTH_FORMULA = '100 − Σ max(1, round(weight × 100 × share of source files affected))';

/**
 * Size-normalised health: each rule deducts in proportion to the SHARE of source files it
 * affects, so one cycle weighs the same in a 50-file service and a 5,000-file monolith
 * relative to its size, and any real problem costs at least one point.
 */
export function healthFor(sourceFiles, rules) {
  const total = Math.max(1, sourceFiles);
  const deductions = rules.filter(rule => rule.files.length).map(rule => {
    const files = [...new Set(rule.files)], share = files.length / total, points = Math.max(1, Math.round(rule.weight * 100 * share));
    return { rule: rule.rule, weight: rule.weight, why: rule.why, points, count: files.length, share: Number(share.toFixed(3)), files: files.slice(0, 50), detail: `${files.length} of ${total} source files (${Math.round(share * 1000) / 10}%) × weight ${rule.weight}` };
  });
  const share = name => deductions.find(item => item.rule === name)?.share || 0;
  return { score: Math.max(0, 100 - deductions.reduce((sum, item) => sum + item.points, 0)), formula: HEALTH_FORMULA, sourceFiles: total, deductions, cycleShare: share(HEALTH_RULES.cycle.rule), hubShare: share(HEALTH_RULES.hub.rule) };
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
