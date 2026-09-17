import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
async function files(dir) { const entries = await readdir(dir, { withFileTypes: true }); return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
const broken = [];
for (const file of (await files('site')).filter(f => extname(f) === '.md')) { const text = await readFile(file, 'utf8'); for (const match of text.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]+)?\)/g)) { const link = match[1]; if (/^(https?:|mailto:)/.test(link)) continue; const location = link.startsWith('/') ? join('site', `${link}.md`) : resolve(dirname(file), link.endsWith('/') ? `${link}index.md` : link); const publicAsset = link.startsWith('/') ? join('site', 'public', link) : ''; try { await readFile(location); } catch { try { await readFile(publicAsset); } catch { broken.push(`${file}: ${link}`); } } } }
if (broken.length) { console.error(`Broken local links:\n${broken.join('\n')}`); process.exitCode = 1; } else console.log('Local documentation links are valid.');
