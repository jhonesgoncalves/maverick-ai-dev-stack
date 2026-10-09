import { readdir } from 'node:fs/promises';
import { buildGraph, impactOf } from '../intel/graph.js';
import { churn } from '../intel/hotspots.js';
import { extractRoutes } from '../intel/routes.js';
import { loadConfig } from './config.js';
import { inspectProject } from './project-tools.js';
import { selectVerificationCommands } from './stack.js';

// Grounding turns a plain-language change description into evidence from the repository:
// the files, tests, entry points and shared modules the change is most likely to touch.
// It is deterministic and local, so every generated artifact starts from real paths
// instead of placeholders, and an agent knows where to start reading.

const STOPWORDS = new Set(`a an and are as at be by can do for from has have how i in into is it its let make me my need new of on or our should so that the their them then there this to up use using want we when where which will with without would add adds allow allows change create creates feature implement support update user users able also any each every only same like just more most other some such than too very via through about into onto over under after before while
o os as um uma uns umas de do da dos das no na nos nas em ao aos para por pelo pela com sem que quando onde como mais menos ser estar ter fazer criar cria adicionar adiciona permitir permite deve devem pode podem precisa quero queremos seja sejam isso esse essa este esta e ou se ja nao sim tambem cada todo toda todos todas nova novo novas novos usuario usuarios funcionalidade tela sistema`.split(/\s+/));

const GENERATED = ['dist', 'build', 'out', 'coverage', 'vendor', 'target', '.next', '.nuxt'];
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'Gemfile.lock', 'composer.lock', 'go.sum', 'pubspec.lock', 'mix.lock'];

const fold = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** A cheap, language-agnostic stem: long words keep their first six letters, short ones lose a plural "s". */
const stem = word => (word.length > 6 ? word.slice(0, 6) : word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);

/** Meaningful terms of a description, folded and stemmed, in first-seen order. */
export function descriptionTerms(description = '') {
  const words = fold(description).split(/[^a-z0-9]+/).filter(word => word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
  return [...new Set(words.map(stem))].slice(0, 16);
}

/** Splits a path into lowercase tokens across separators and camelCase, e.g. OrderList.tsx → order, list, tsx. */
export function pathTokens(path) {
  return fold(path.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).split(/[^a-z0-9]+/).filter(Boolean);
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scoreFile(path, text, terms, idf) {
  const tokens = pathTokens(path), fileTokens = pathTokens(path.split('/').pop()), folded = fold(text || '');
  let score = 0; const reasons = [], matched = new Set();
  for (const term of terms) {
    const inName = fileTokens.some(token => token.startsWith(term)), inPath = !inName && tokens.some(token => token.startsWith(term));
    const hits = Math.min(10, (folded.match(new RegExp(`(?<![a-z0-9])${escape(term)}`, 'g')) || []).length);
    if (!inName && !inPath && !hits) continue;
    matched.add(term);
    score += idf.get(term) * ((inName ? 6 : inPath ? 3 : 0) + hits * 0.5);
    reasons.push(inName ? `name matches "${term}"` : inPath ? `path matches "${term}"` : `mentions "${term}" ${hits}×`);
  }
  // Files matching several terms are far more likely to be the right place than one noisy match.
  return { score: score * matched.size, matched: matched.size, reasons };
}

async function presentEntries(cwd, names) {
  const entries = new Set(await readdir(cwd).catch(() => []));
  return names.filter(name => entries.has(name));
}

/**
 * Grounds a change description in the repository. Returns the stack, verification
 * commands, instruction files, ranked relevant files (with the reason for each),
 * tests to extend, entry points, shared modules and paths that must not be edited.
 */
export async function groundChange(cwd, description, { limit = 8 } = {}) {
  const [config, project] = await Promise.all([loadConfig(cwd), inspectProject(cwd)]);
  const sources = new Map(), graph = await buildGraph(cwd, { sources });
  const terms = descriptionTerms(description);
  const commands = selectVerificationCommands(project.stack, config).map(({ name, command, cwd: dir }) => ({ name, command, cwd: dir || '.' }));
  const base = {
    description, terms,
    stack: { name: project.name, languages: project.languages, frameworks: project.frameworks, packageManagers: project.packageManagers },
    commands, instructions: project.instructions,
    doNotTouch: [...(await presentEntries(cwd, GENERATED)).map(name => `${name}/`), ...await presentEntries(cwd, LOCKFILES)],
    relevant: [], tests: [], neighbors: [], routes: [], shared: []
  };
  if (!terms.length) return base;
  const nodes = graph.nodes, df = new Map(terms.map(term => [term, 0]));
  const folded = new Map(nodes.map(node => [node.id, `${fold(node.id)}\n${fold(sources.get(node.id) || '')}`]));
  for (const term of terms) for (const text of folded.values()) if (text.includes(term)) df.set(term, df.get(term) + 1);
  const idf = new Map(terms.map(term => [term, Math.log((nodes.length + 1) / (df.get(term) + 1)) + 1]));
  const scored = nodes.map(node => ({ node, ...scoreFile(node.id, sources.get(node.id), terms, idf) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
  const counts = await churn(cwd).catch(() => new Map());
  const describe = ({ node, score, reasons }) => {
    const impact = impactOf(graph, node.id);
    // Tests close in the import graph exercise this file; distant ones only reach it through an entry point.
    const near = impact.dependents.filter(item => item.test && item.depth <= 2).map(item => item.id);
    return { path: node.id, score: Number(score.toFixed(1)), reasons: reasons.slice(0, 3), fanIn: node.fanIn, dependents: impact.dependents.length, tests: near.slice(0, 3), commits: counts.get(node.id) || 0 };
  };
  // Keep only files within reach of the best match; a long tail of weak matches is noise.
  const best = scored[0]?.score || 0, strong = scored.filter(item => item.score >= best * 0.12);
  const relevant = strong.filter(item => !item.node.test).slice(0, limit).map(describe);
  const chosen = new Set(relevant.map(item => item.path));
  const tests = [...new Set([...strong.filter(item => item.node.test).slice(0, 4).map(item => item.node.id), ...relevant.flatMap(item => item.tests)])].slice(0, 6);
  const neighbors = [...new Set(relevant.slice(0, 3).flatMap(item => graph.out.get(item.path) || []))].filter(path => !chosen.has(path) && !nodes.find(node => node.id === path)?.test).slice(0, 6);
  // Direct importers measure how shared a file is; transitive counts saturate in CLI-style apps.
  const shared = relevant.filter(item => item.fanIn >= 5 || graph.hubs.includes(item.path)).map(item => ({ path: item.path, importers: item.fanIn, dependents: item.dependents, commits: item.commits }));
  let routes = [];
  try {
    routes = (await extractRoutes(cwd, { sources }))
      .map(route => ({ route, hits: terms.filter(term => pathTokens(`${route.path} ${route.handler || ''}`).some(token => token.startsWith(term))).length + (chosen.has(route.file) ? 1 : 0) }))
      .filter(item => item.hits).sort((a, b) => b.hits - a.hits).slice(0, 8)
      .map(({ route }) => ({ kind: route.kind, method: route.method, path: route.path, file: route.file, line: route.line, handler: route.handler }));
  } catch { /* Route extraction is best effort; grounding still works without it. */ }
  return { ...base, relevant, tests, neighbors, routes, shared };
}
