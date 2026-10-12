import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { entriesFromCommits, stampChangelog } from '../scripts/release-changelog.mjs';

const changelog = entries => `# Changelog\n\nIntro.\n\n## [Unreleased]\n${entries}\n## [1.0.0] - 2026-09-16\n\n- First.\n`;

test('a release moves the [Unreleased] entries under its version and keeps an empty [Unreleased]', () => {
  const { text, notes } = stampChangelog(changelog('\n### Added: loops\n- `maverick loop`.\n\n'), { version: '1.9.0', date: '2026-10-13' });
  assert.equal(text, '# Changelog\n\nIntro.\n\n## [Unreleased]\n\n## [1.9.0] - 2026-10-13\n\n### Added: loops\n- `maverick loop`.\n\n## [1.0.0] - 2026-09-16\n\n- First.\n');
  assert.equal(notes, '### Added: loops\n- `maverick loop`.');
  assert.throws(() => stampChangelog(text, { version: '1.9.0', date: '2026-10-13' }), /already has a section for 1\.9\.0/);
  assert.throws(() => stampChangelog('# Changelog\n', { version: '1.9.0', date: '2026-10-13' }), /no "## \[Unreleased\]"/);
});

test('without entries, the release lists the user-facing commit subjects', () => {
  const commits = ['feat(lens): add a done lane', 'fix: keep blank lines', 'docs: explain mirrors', 'chore: bump eslint', 'chore(release): v1.8.0', 'ci: cache npm'];
  const { text, notes } = stampChangelog(changelog('\n'), { version: '1.8.1', date: '2026-10-13', commits });
  assert.equal(notes, '### Added\n- **lens:** Add a done lane\n\n### Fixed\n- Keep blank lines\n\n### Documentation\n- Explain mirrors');
  assert.match(text, /## \[Unreleased\]\n\n## \[1\.8\.1\] - 2026-10-13\n\n### Added\n/);
  assert.equal(entriesFromCommits(['chore: bump eslint', 'ci: cache npm']), '- Maintenance release: dependencies, build and internal changes.');
});

test('every released version has its own changelog section, newest first', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const versions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm)].map(match => match[1]);
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(versions[0], version, 'the current version is the newest section');
  const key = value => value.split('.').map(Number).reduce((sum, part) => sum * 1000 + part, 0);
  assert.deepEqual(versions, [...versions].sort((a, b) => key(b) - key(a)));
});
