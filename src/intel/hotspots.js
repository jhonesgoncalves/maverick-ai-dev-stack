import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Commits per file since `since` (a git date such as "6 months ago"). Empty outside git. */
export async function churn(cwd, since = '6 months ago') {
  try {
    const { stdout } = await exec('git', ['log', `--since=${since}`, '--no-merges', '--name-only', '--format=%x00'], { cwd, maxBuffer: 64 * 1024 * 1024 });
    const counts = new Map();
    for (const commit of stdout.split('\0')) for (const file of new Set(commit.split('\n').map(line => line.trim()).filter(Boolean))) counts.set(file, (counts.get(file) || 0) + 1);
    return counts;
  } catch { return new Map(); }
}

/**
 * Hotspots are files that change often and that many others depend on: churn × (1 + fan-in),
 * weighted by size. They are where defects and review effort concentrate, so they deserve
 * the strictest preset and the most tests.
 */
export function rankHotspots(graph, counts, limit = 15) {
  return graph.nodes
    .filter(node => !node.test && counts.get(node.id))
    .map(node => {
      const commits = counts.get(node.id);
      return { id: node.id, commits, fanIn: node.fanIn, lines: node.lines, score: Math.round(commits * (1 + node.fanIn) * Math.log10(10 + node.lines)) };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
