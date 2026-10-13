// Captures Maverick Lens screenshots for the docs site from the fictional lens:example project.
// Usage: npm run docs:shots   (needs Playwright's Chromium: npx playwright install chromium)
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const port = 4176;
const base = `http://127.0.0.1:${port}/`;
const out = 'site/public/screens';
const shots = [
  ['lens-inbox', { hash: '/inbox' }],
  ['lens-tasks', { hash: '/tasks' }],
  ['lens-board', { hash: '/tasks?view=board' }],
  ['lens-task', { hash: '/tasks/add-orders-pagination' }],
  ['lens-subtasks', { hash: '/tasks/add-orders-pagination/subtasks' }],
  ['lens-gates', { hash: '/tasks/fix-order-export/gates' }],
  ['lens-gates-failing', { hash: '/tasks/harden-payment-webhooks/gates' }],
  ['lens-runs', { hash: '/runs?kind=agents' }],
  ['lens-flow-runs', { hash: '/runs?kind=flows' }],
  ['lens-agents', { hash: '/agents' }],
  ['lens-new-task', { hash: '/inbox', after: page => page.keyboard.press('n') }],
  ['lens-palette', { hash: '/inbox', after: page => page.keyboard.press('Meta+K') }],
  ['lens-capabilities', { hash: '/capabilities' }],
  ['lens-settings', { hash: '/settings' }],
  ['lens-scorecard', { hash: '/scorecard' }],
  ['lens-holdouts', { hash: '/holdouts' }],
  ['lens-loops', { hash: '/loops' }],
  ['lens-yield', { hash: '/loops/add-orders-pagination/20261012-090000-f002' }],
  ['lens-holdout-gap', { hash: '/loops/repair-cursor-boundary/20261012-110000-f004' }],
  ['lens-cli', { hash: '/cli' }],
  ['devtools-overview', { hash: 'devtools/overview' }],
  ['devtools-routes', { hash: 'devtools/routes' }],
  ['devtools-route-detail', { hash: 'devtools/routes', after: page => page.getByText('/api/orders/export').first().click() }],
  ['devtools-palette', { hash: 'devtools/overview', after: page => page.keyboard.press('Meta+K') }],
  ['devtools-coupling', { hash: 'devtools/coupling' }],
  ['devtools-hotspots', { hash: 'devtools/hotspots' }],
  ['devtools-impact', { hash: 'devtools/impact' }],
  ['devtools-integrations', { hash: 'devtools/integrations' }],
  ['devtools-team', { hash: 'devtools/team' }],
  ['devtools-findings', { hash: 'devtools/findings' }]
];

const server = spawn(process.execPath, ['scripts/lens-example.mjs'], { env: { ...process.env, LENS_EXAMPLE_PORT: String(port), LENS_EXAMPLE_NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  server.stdout.on('data', chunk => String(chunk).includes('is running') && resolve());
  server.once('exit', code => reject(new Error(`lens:example exited with ${code}`)));
});

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  for (const [name, target] of shots) {
    await page.goto("about:blank");
    await page.goto(`${base}#${target.hash}`);
    await page.waitForSelector('#app');
    if (target.hash.startsWith('devtools')) await page.waitForSelector('#devtools-root .dt', { state: 'attached', timeout: 10000 });
    else await page.waitForSelector('#view .page', { timeout: 10000 });
    await page.waitForTimeout(900);
    if (target.after) { await target.after(page); await page.waitForTimeout(600); }
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`✓ ${name}`);
  }
} finally {
  await browser.close();
  server.kill();
}
