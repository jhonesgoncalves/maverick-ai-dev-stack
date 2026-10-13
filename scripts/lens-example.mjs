import { execFileSync } from 'node:child_process';
import { startLens } from '../src/lens/server.js';
import { createLensExample } from './lens-example-project.mjs';

const example = await createLensExample();
const port = Number(process.env.LENS_EXAMPLE_PORT || 4175);
let server;
try { server = await startLens({ cwd: example.root, port, watch: false }); }
catch (error) { await example.cleanup(); throw error; }
const address = `http://127.0.0.1:${port}`;
console.log(`Maverick AI Lens example is running at ${address}`);
console.log(`Project: ${example.root}`);
console.log(`Private example home: ${example.home}`);
console.log(`Explore: ${address}/#/scorecard · ${address}/#/holdouts · ${address}/#/loops`);
console.log('All evidence is fictional. Providers are local demo stubs; no external agents are called. Press Ctrl+C to stop.');
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  server.close(); server.closeAllConnections();
  await example.cleanup();
  process.exit(0);
};
process.once('SIGINT', close); process.once('SIGTERM', close);
if (!process.env.LENS_EXAMPLE_NO_OPEN) try {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  execFileSync(opener, process.platform === 'win32' ? ['/c', 'start', address] : [address], { stdio: 'ignore' });
} catch { console.log('Open the address above in a browser.'); }
