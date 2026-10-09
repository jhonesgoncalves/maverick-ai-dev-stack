// Component-level architecture from the file import graph, for any language:
//
// - components are inferred from the directory layout (or declared in configuration);
// - Robert C. Martin's package metrics per component: afferent (Ca) and efferent (Ce)
//   coupling, instability I = Ce / (Ca + Ce), abstractness A = abstract types / types and
//   distance from the main sequence D = |A + I − 1|;
// - a dependency structure matrix, component cycles, Stable Dependencies Principle
//   violations and user-declared boundary rules.
//
// Everything is derived from resolved static imports, so every number traces to files.

const ROOT = '(root)';

/** Iterative Tarjan: every strongly connected component, dependencies (sinks) first. */
export function components(nodes, adjacency) {
  let counter = 0;
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], result = [];
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    index.set(start, counter); low.set(start, counter); counter++; stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1], [node] = frame, next = adjacency.get(node) || [];
      if (frame[1] < next.length) {
        const child = next[frame[1]++];
        if (!index.has(child)) { index.set(child, counter); low.set(child, counter); counter++; stack.push(child); onStack.add(child); work.push([child, 0]); }
        else if (onStack.has(child)) low.set(node, Math.min(low.get(node), index.get(child)));
        continue;
      }
      work.pop();
      if (work.length) { const parent = work[work.length - 1][0]; low.set(parent, Math.min(low.get(parent), low.get(node))); }
      if (low.get(node) === index.get(node)) {
        const members = []; let member;
        do { member = stack.pop(); onStack.delete(member); members.push(member); } while (member !== node);
        result.push(members.sort());
      }
    }
  }
  return result;
}

/** Shortest loop through a cycle, starting at its first member (for display). */
export function loopOf(members, adjacency) {
  const inside = new Set(members), start = members[0], previous = new Map([[start, null]]), queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const next of adjacency.get(node) || []) {
      if (!inside.has(next)) continue;
      if (next === start) { const path = [node]; let step = node; while (previous.get(step)) { step = previous.get(step); path.unshift(step); } return [...path, start]; }
      if (!previous.has(next)) { previous.set(next, node); queue.push(next); }
    }
  }
  return [...members, start];
}

/** Longest import chain out of each file, finite even through cycles (via the condensation). */
export function depths(ids, adjacency) {
  const order = components(ids, adjacency), owner = new Map(), depth = new Map();
  order.forEach((members, position) => members.forEach(member => owner.set(member, position)));
  order.forEach((members, position) => {
    let best = 0;
    for (const member of members) for (const next of adjacency.get(member) || []) { const other = owner.get(next); if (other !== position && other !== undefined) best = Math.max(best, depth.get(other) + 1); }
    depth.set(position, best);
  });
  return new Map(ids.map(id => [id, depth.get(owner.get(id)) ?? 0]));
}

const dirOf = file => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '');

/** Converts a path glob (`**`, `*`, `?`) to a RegExp; a trailing "/" means everything below. */
export function globToRegex(glob) {
  const pattern = glob.replace(/\/$/, '/**');
  let out = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') { out += pattern[index + 2] === '/' ? '(?:.*/)?' : '.*'; index += pattern[index + 2] === '/' ? 2 : 1; }
    else if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * Chooses components from the directory layout: start at the top-level folders and split
 * any folder holding more than `share` of the files into its sub-folders, collapsing
 * single-child chains (src/main/java/com/acme → one step), until nothing dominates or
 * `max` components exist. Works the same for a Go module, a Maven tree or a JS monorepo.
 */
export function inferComponents(files, { max, share = 0.25, patterns = [], depth } = {}) {
  // Larger codebases deserve more components: about √files, between 16 and 48.
  max ??= Math.max(16, Math.min(48, Math.round(8 + Math.sqrt(files.length) * 0.8)));
  if (patterns.length) {
    const matchers = patterns.map(globToRegex), found = new Set();
    for (const file of files) for (let dir = dirOf(file); dir; dir = dirOf(dir)) if (matchers.some(matcher => matcher.test(dir))) { found.add(dir); break; }
    return [...found].sort();
  }
  if (depth) return [...new Set(files.map(file => file.split('/').slice(0, Math.min(depth, file.split('/').length - 1)).join('/')).filter(Boolean))].sort();
  let prefixes = new Set(files.map(file => (file.includes('/') ? file.split('/')[0] : '')).filter(Boolean));
  const stuck = new Set(), total = files.length || 1;
  for (let guard = 0; guard < 400; guard++) {
    const owner = componentResolver(prefixes), members = new Map([...prefixes].map(prefix => [prefix, []]));
    for (const file of files) members.get(owner(file))?.push(file);
    const candidates = [...prefixes].filter(prefix => !stuck.has(prefix)).map(prefix => ({ prefix, members: members.get(prefix) })).sort((a, b) => b.members.length - a.members.length);
    let changed = false;
    for (const { prefix, members } of candidates) {
      const direct = members.some(file => dirOf(file) === prefix);
      const children = [...new Set(members.filter(file => dirOf(file) !== prefix).map(file => `${prefix}/${file.slice(prefix.length + 1).split('/')[0]}`))];
      if (children.length === 1 && !direct) { prefixes.delete(prefix); prefixes.add(children[0]); changed = true; break; }
      if (members.length / total <= share || children.length < 1) { stuck.add(prefix); continue; }
      const room = max - prefixes.size + (direct ? 0 : 1);
      if (room < 2) { stuck.add(prefix); continue; }
      // Too many sub-folders: promote the largest ones and leave the rest in the parent.
      const size = child => members.filter(file => file.startsWith(`${child}/`)).length;
      const chosen = children.length <= room ? children : children.sort((a, b) => size(b) - size(a)).slice(0, room - 1);
      if (!direct && chosen.length === children.length) prefixes.delete(prefix); else stuck.add(prefix);
      for (const child of chosen) prefixes.add(child);
      changed = true; break;
    }
    if (!changed) break;
  }
  prefixes = [...prefixes].sort();
  return prefixes;
}

/** Maps each file to the longest component prefix containing it. */
export function componentResolver(prefixes) {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  const cache = new Map();
  return file => {
    if (cache.has(file)) return cache.get(file);
    const found = sorted.find(prefix => file.startsWith(`${prefix}/`)) || ROOT;
    cache.set(file, found); return found;
  };
}

const round = (value, digits = 2) => Number(value.toFixed(digits));

/**
 * Component metrics and structure. `nodes` carry per-file metrics (loc, complexity, types)
 * and `edges` are the file import edges (lazy ones marked `dynamic`).
 */
export function analyzeArchitecture(nodes, edges, { prefixes, rules = [] } = {}) {
  const source = nodes.filter(node => !node.test), sourceIds = new Set(source.map(node => node.id));
  const componentOf = componentResolver(prefixes ?? inferComponents(source.map(node => node.id)));
  const groups = new Map();
  const group = id => { if (!groups.has(id)) groups.set(id, { id, files: 0, tests: 0, loc: 0, complexity: 0, abstract: 0, concrete: 0, languages: {}, out: new Map(), in: new Map(), dependents: new Set() }); return groups.get(id); };
  for (const node of nodes) {
    const item = group(componentOf(node.id));
    if (node.test) { item.tests++; continue; }
    item.files++; item.loc += node.loc || 0; item.complexity += node.complexity || 0; item.abstract += node.types?.abstract || 0; item.concrete += node.types?.concrete || 0;
    item.languages[node.language] = (item.languages[node.language] || 0) + 1;
  }
  const componentEdges = new Map();
  for (const edge of edges) {
    if (edge.dynamic || !sourceIds.has(edge.from) || !sourceIds.has(edge.to)) continue;
    const from = componentOf(edge.from), to = componentOf(edge.to);
    if (from === to) continue;
    const key = `${from}\0${to}`;
    if (!componentEdges.has(key)) componentEdges.set(key, { from, to, weight: 0, files: new Set(), examples: [] });
    const link = componentEdges.get(key);
    link.weight++; link.files.add(edge.from);
    if (link.examples.length < 5) link.examples.push({ from: edge.from, to: edge.to });
    group(from).out.set(to, (group(from).out.get(to) || 0) + 1);
    group(to).in.set(from, (group(to).in.get(from) || 0) + 1);
    group(to).dependents.add(edge.from);
  }
  const list = [...groups.values()].filter(item => item.files || item.tests).map(item => {
    const ca = item.in.size, ce = item.out.size, types = item.abstract + item.concrete;
    const instability = ca + ce ? round(ce / (ca + ce)) : 0, abstractness = types ? round(item.abstract / types) : null;
    const distance = abstractness === null ? null : round(Math.abs(abstractness + instability - 1));
    const zone = distance === null || distance < 0.5 || ca + ce === 0 ? null : abstractness + instability < 1 ? 'pain' : 'uselessness';
    return { id: item.id, files: item.files, tests: item.tests, loc: item.loc, complexity: item.complexity, languages: item.languages, ca, ce, afferentFiles: item.dependents.size, importsIn: [...item.in.values()].reduce((a, b) => a + b, 0), importsOut: [...item.out.values()].reduce((a, b) => a + b, 0), instability, abstractness, distance, zone, types };
  }).sort((a, b) => b.files - a.files || a.id.localeCompare(b.id));
  const byId = new Map(list.map(item => [item.id, item]));
  const links = [...componentEdges.values()].map(link => ({ from: link.from, to: link.to, weight: link.weight, files: link.files.size, examples: link.examples })).sort((a, b) => b.weight - a.weight);
  // Component cycles.
  const adjacency = new Map(list.map(item => [item.id, []]));
  for (const link of links) adjacency.get(link.from)?.push(link.to);
  const cycles = components(list.map(item => item.id), adjacency).filter(members => members.length > 1).map(members => ({ members, loop: loopOf(members, adjacency) }));
  // Stable Dependencies Principle: depend in the direction of stability.
  const sdp = links.map(link => ({ ...link, delta: round((byId.get(link.to)?.instability ?? 0) - (byId.get(link.from)?.instability ?? 0)) }))
    .filter(link => link.delta >= 0.25 && byId.get(link.to)?.ca > 0).sort((a, b) => b.delta - a.delta || b.weight - a.weight).slice(0, 30)
    .map(({ from, to, weight, delta, examples }) => ({ from, to, weight, delta, fromInstability: byId.get(from).instability, toInstability: byId.get(to).instability, examples }));
  // Dependency structure matrix, stable components first.
  const order = [...list].sort((a, b) => a.instability - b.instability || b.ca - a.ca || a.id.localeCompare(b.id)).map(item => item.id);
  const position = new Map(order.map((id, index) => [id, index]));
  const matrix = order.map(() => order.map(() => 0));
  for (const link of links) matrix[position.get(link.from)][position.get(link.to)] = link.weight;
  // Boundary rules from configuration.
  const compiled = rules.map(rule => ({ ...rule, fromRe: globToRegex(rule.from), disallowRe: (rule.disallow || []).map(globToRegex), allowRe: (rule.allow || []).map(globToRegex) }));
  const violations = [];
  if (compiled.length) for (const edge of edges) {
    if (edge.dynamic) continue;
    for (const rule of compiled) if (rule.fromRe.test(edge.from) && rule.disallowRe.some(re => re.test(edge.to)) && !rule.allowRe.some(re => re.test(edge.to))) { violations.push({ from: edge.from, to: edge.to, rule: `${rule.from} ↛ ${rule.disallow.join(', ')}`, reason: rule.reason || '' }); break; }
  }
  return { components: list, links, cycles, sdp, dsm: { order, matrix }, violations, componentOf };
}
