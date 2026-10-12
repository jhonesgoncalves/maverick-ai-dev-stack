// Moves the `[Unreleased]` entries of CHANGELOG.md under the version being released and writes
// that section for the GitHub release notes. When nobody wrote an entry, the section lists the
// Conventional Commit subjects since the last tag instead, so no release is ever empty.
// The release job of .github/workflows/pipeline.yml runs it after the version bump:
//
//   node scripts/release-changelog.mjs <version> [--range v1.8.0..HEAD] [--notes <file>] [--date YYYY-MM-DD]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const UNRELEASED = /^## \[Unreleased\][^\n]*\n/m;

// Commit types that say something to users, and the heading they go under.
const GROUPS = [['feat', 'Added'], ['fix', 'Fixed'], ['perf', 'Changed'], ['refactor', 'Changed'], ['docs', 'Documentation']];

/** Changelog entries from commit subjects: `feat(lens): add x` becomes `- **lens:** Add x` under Added. */
export function entriesFromCommits(subjects) {
  const groups = new Map();
  for (const subject of subjects) {
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
    const heading = match && GROUPS.find(([type]) => type === match[1])?.[1];
    if (!heading || /^chore\(release\)/.test(subject)) continue;
    const text = match[3].charAt(0).toUpperCase() + match[3].slice(1);
    groups.set(heading, [...(groups.get(heading) || []), `- ${match[2] ? `**${match[2]}:** ` : ''}${text}`]);
  }
  const order = [...new Set(GROUPS.map(([, heading]) => heading))].filter(heading => groups.has(heading));
  return order.map(heading => `### ${heading}\n${groups.get(heading).join('\n')}`).join('\n\n') || '- Maintenance release: dependencies, build and internal changes.';
}

/**
 * The changelog with its `[Unreleased]` entries moved under `## [version] - date` (an empty
 * `[Unreleased]` stays on top), and the release notes: the entries, or the commit-based ones.
 */
export function stampChangelog(text, { version, date, commits = [] }) {
  if (!UNRELEASED.test(text)) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(text)) throw new Error(`CHANGELOG.md already has a section for ${version}`);
  const start = text.search(UNRELEASED), bodyStart = start + text.slice(start).match(UNRELEASED)[0].length;
  const next = text.slice(bodyStart).search(/^## \[/m), bodyEnd = next < 0 ? text.length : bodyStart + next;
  const notes = text.slice(bodyStart, bodyEnd).trim() || entriesFromCommits(commits);
  const stamped = `${text.slice(0, start)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n${next < 0 ? '' : '\n'}${text.slice(bodyEnd)}`;
  return { text: stamped, notes };
}

function main(argv) {
  const [version, ...rest] = argv, option = name => { const at = rest.indexOf(`--${name}`); return at >= 0 ? rest[at + 1] : undefined; };
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version || '')) throw new Error('usage: release-changelog.mjs <version> [--range <git range>] [--notes <file>] [--date YYYY-MM-DD]');
  const file = option('file') || 'CHANGELOG.md', range = option('range') || 'HEAD';
  const commits = execFileSync('git', ['log', '--no-merges', '--format=%s', range], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const { text, notes } = stampChangelog(readFileSync(file, 'utf8'), { version, date: option('date') || new Date().toISOString().slice(0, 10), commits });
  writeFileSync(file, text);
  if (option('notes')) writeFileSync(option('notes'), `${notes}\n`);
  console.log(`${file}: [Unreleased] moved under ${version}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
