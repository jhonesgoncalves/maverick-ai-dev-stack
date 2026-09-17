import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

async function files(dir) { const entries = await readdir(dir, { withFileTypes: true }); return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat(); }
const important = new Set(['site/index.md', 'site/guide/getting-started.md', 'site/guide/first-task.md', 'site/reference/cli.md', 'site/reference/config.md', 'site/concepts/verification.md', 'site/concepts/review.md', 'site/security.md']);
const failures = [];
for (const file of (await files('site')).filter(file => extname(file) === '.md')) {
  const body = await readFile(file, 'utf8');
  if (!/^#\s+.+/m.test(body) && !/^---[\s\S]*layout:\s*home[\s\S]*---/m.test(body)) failures.push(`${file}: missing top-level title`);
  if (/\b(?:TODO|TBD|FILL ME)\b/i.test(body)) failures.push(`${file}: contains placeholder text`);
  if (important.has(file) && body.replace(/^---[\s\S]*?---/,'').trim().length < 180) failures.push(`${file}: important page is too short for a public reference`);
}
if (failures.length) { console.error(`Documentation quality issues:\n${failures.join('\n')}`); process.exitCode = 1; } else console.log('Documentation quality checks passed.');
