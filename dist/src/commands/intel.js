import { buildGraph, directoryGraph, toMermaid } from '../intel/graph.js';
import { churn, rankHotspots } from '../intel/hotspots.js';
import { brand, output } from '../core/util.js';

const since = options => (typeof options.since === 'string' ? options.since : '6 months ago');

async function graphCommand(cwd, options = {}) {
  const graph = await buildGraph(cwd);
  const depth = Number(options.depth) || 2;
  if (options.format === 'mermaid') return output(toMermaid(graph, depth));
  if (options.format === 'dot') return output(`digraph maverick {\n  rankdir=LR;\n${directoryGraph(graph, depth).map(link => `  "${link.from}" -> "${link.to}" [label=${link.weight}];`).join('\n')}\n}`);
  const production = graph.nodes.filter(node => !node.test);
  const languages = Object.entries(graph.nodes.reduce((counts, node) => ({ ...counts, [node.language]: (counts[node.language] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const topFanIn = [...production].sort((a, b) => b.fanIn - a.fanIn).slice(0, 8).filter(node => node.fanIn);
  const unstableHubs = production.filter(node => node.fanIn >= 3 && node.instability >= 0.7).sort((a, b) => b.fanIn - a.fanIn).slice(0, 8);
  const summary = { files: graph.nodes.length, tests: graph.nodes.length - production.length, edges: graph.edges.length, dynamicEdges: graph.edges.filter(edge => edge.dynamic).length, languages: Object.fromEntries(languages), health: graph.health, cycles: graph.cycles, hubs: graph.hubs, topFanIn: topFanIn.map(({ id, fanIn, fanOut }) => ({ id, fanIn, fanOut })), unstableDependencies: unstableHubs.map(({ id, fanIn, fanOut, instability }) => ({ id, fanIn, fanOut, instability })), truncated: graph.truncated };
  if (options.json) return output(JSON.stringify(summary, null, 2));
  const lines = [`${brand()} / GRAPH`, '', `Files: ${summary.files} (${summary.tests} test) · local import edges: ${summary.edges}${summary.dynamicEdges ? ` (${summary.dynamicEdges} lazy)` : ''}`, `Languages: ${languages.map(([name, count]) => `${name} ${count}`).join(', ') || 'none detected'}`, `Health: ${graph.health.score}/100 = ${graph.health.formula}`];
  lines.push('', `Import cycles: ${graph.cycles.length}`, ...graph.cycles.slice(0, 5).map(cycle => `  ${cycle.join(' ⇄ ')}`));
  if (graph.hubs.length) lines.push('', 'Hubs (high fan-in and fan-out):', ...graph.hubs.slice(0, 8).map(id => `  ${id}`));
  if (topFanIn.length) lines.push('', 'Most depended on:', ...topFanIn.map(node => `  ${String(node.fanIn).padStart(3)} ← ${node.id}`));
  if (unstableHubs.length) lines.push('', 'Widely used but unstable (depends on many others):', ...unstableHubs.map(node => `  ${node.id} (fan-in ${node.fanIn}, instability ${node.instability})`));
  if (graph.truncated) lines.push('', 'Note: the scan stopped at 5,000 files.');
  lines.push('', 'Diagram: maverick graph --format mermaid');
  output(lines.join('\n'));
}

async function hotspotsCommand(cwd, options = {}) {
  const [graph, counts] = await Promise.all([buildGraph(cwd), churn(cwd, since(options))]);
  const hotspots = rankHotspots(graph, counts, Number(options.limit) || 15);
  if (options.json) return output(JSON.stringify({ since: since(options), hotspots }, null, 2));
  if (!counts.size) return output('No git history found; hotspots need a Git repository with commits.');
  output(`${brand()} / HOTSPOTS (since ${since(options)})\n\nscore  commits  fan-in  file\n${hotspots.map(item => `${String(item.score).padStart(5)}  ${String(item.commits).padStart(7)}  ${String(item.fanIn).padStart(6)}  ${item.id}`).join('\n') || 'No source files changed in this period.'}\n\nScore = commits × (1 + fan-in) × log10(10 + lines). Prefer strict-review for changes here.`);
}

async function mcpCommand(cwd) {
  const { serveMcp } = await import('../mcp/server.js');
  process.stderr.write(`maverick mcp: serving read-only project intelligence for ${cwd} over stdio\n`);
  await serveMcp({ cwd });
}

export const intelCommands = [
  { id: 'mcp', description: 'Serve read-only project intelligence to AI agents over MCP (stdio).', aliases: [], usage: 'mcp', run: ({ cwd }) => mcpCommand(cwd) },
  { id: 'graph', description: 'Analyze the import graph: cycles, hubs, coupling, and health.', aliases: [], usage: 'graph [--json] [--format mermaid|dot]', run: ({ cwd, options }) => graphCommand(cwd, options) },
  { id: 'hotspots', description: 'Rank files by change frequency and dependents.', aliases: [], usage: 'hotspots [--since "6 months ago"]', run: ({ cwd, options }) => hotspotsCommand(cwd, options) }
];
