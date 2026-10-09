import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startLens } from '../src/lens/server.js';

const root = join(await mkdtemp(join(tmpdir(), 'maverick-lens-example-')), 'northstar-orders');
await mkdir(root);
const write = async (path, body) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), body); };

await write('package.json', JSON.stringify({
  name: 'northstar-orders',
  private: true,
  dependencies: { express: '^4.21.0', pg: '^8.13.0', redis: '^4.7.0' },
  scripts: { test: 'node --test', lint: 'node --check src/server.js', build: 'node --check src/server.js' }
}, null, 2));
await write('.maverick/config.json', JSON.stringify({
  version: 1,
  project: { name: 'Northstar Orders', language: 'JavaScript', framework: 'Express' },
  workflow: { default: 'standard' },
  language: { docs: 'en', code: 'en' },
  adapter: 'codex',
  taskRoot: '.maverick/tasks',
  runtime: { trusted: ['claude-code'], maxPermission: 'edit', default: { provider: 'claude-code' } }
}, null, 2));

// Fictional tasks in every state the Inbox knows: building, failing a gate, awaiting approval, planning and ready to ship.
const SHIP_GATES = [['artifacts', 'block', 'Task artifacts contain every required section.'], ['checks', 'block', 'Lint, typecheck, tests and build pass for the detected stack.'], ['scope', 'warn', 'Changed files stay within the declared task scope.'], ['security', 'block', 'No high-signal security patterns in the diff.'], ['dependencies', 'warn', 'Dependency changes are reported for review.'], ['diff-review', 'warn', 'Automated diff findings are written for the reviewer.'], ['human-review', 'block', 'A human approved the change in REVIEW.md or with maverick flow approve.']];
const shipRun = (at, outcome, iteration, overrides = {}) => ({ at, outcome, iteration, results: SHIP_GATES.map(([id, severity, description]) => ({ id, type: id === 'human-review' ? 'approval' : 'maverick', severity, description, status: 'pass', issues: [], ...overrides[id] })) });
async function task(slug, { idea, workflow = 'standard', created, criteria = [], spec = true, subtasks = [], evidence = false, review = null, security = false, ship = null, approvals = {} }) {
  const dir = `.maverick/tasks/${slug}`;
  await write(`${dir}/TASK.json`, JSON.stringify({ idea, workflow, createdAt: created }, null, 2));
  await write(`${dir}/PRD.md`, `# PRD — ${idea}\n\n## Overview\n${idea} for the Northstar Orders API, without changing existing clients.\n\n## Goals\n- Keep responses bounded and predictable\n- Leave current integrations untouched\n\n## Acceptance Criteria\n${criteria.map((text, i) => `- AC-0${i + 1}: ${text}`).join('\n')}\n\n## Non-Goals\n- Changing the authentication model\n- A new admin UI\n`);
  if (!spec) return;
  await write(`${dir}/TECHSPEC.md`, `# Tech spec — ${idea}\n\n## Summary\nSmall, additive change in the orders module.\n\n## File References\n- \`src/api/orders.js\`\n- \`src/services/orders.js\`\n- \`src/data/orders.js\`\n- \`test/orders.test.js\`\n\n## Test Plan\n${criteria.map((_, i) => `- AC-0${i + 1}: covered in test/orders.test.js`).slice(0, Math.max(1, criteria.length - 1)).join('\n')}\n\n## Commands\n- npm test\n`);
  if (subtasks.length) {
    const nodes = subtasks.map((item, i) => `  - id: "0${i + 1}"\n    file: task_0${i + 1}.md`).join('\n');
    const edges = subtasks.flatMap((item, i) => (item.after || []).map(dep => `  - from: "${dep}"\n    to: "0${i + 1}"`)).join('\n');
    await write(`${dir}/subtasks/_tasks.md`, `---\nschema: maverick.subtasks/v1\nnodes:\n${nodes}\nedges:${edges ? `\n${edges}` : ' []'}\n---\n\n# Subtasks — ${slug}\n`);
    for (const [i, item] of subtasks.entries()) {
      const done = item.status === 'done';
      await write(`${dir}/subtasks/task_0${i + 1}.md`, `---\ntitle: ${item.title}\nstatus: ${item.status}\ntype: ${item.type || 'backend'}\ncomplexity: ${item.complexity || 'medium'}\n---\n\n# ${item.title}\n\n## Goal\n${item.title}.\n\n## Acceptance Criteria\n${(item.ac || []).map(id => `- [${done ? 'x' : ' '}] ${id}: ${criteria[Number(id.slice(3)) - 1]}`).join('\n')}\n\n## Files\n${(item.files || ['src/services/orders.js']).map(file => `- \`${file}\``).join('\n')}\n\n## Steps\n- [${done ? 'x' : ' '}] Implement the change\n- [${done ? 'x' : ' '}] Add or update tests\n`);
    }
  }
  if (evidence) await write(`${dir}/EVIDENCE.md`, '# Verification Evidence\n\n## PASS — npm run lint\nExit code: 0\n\n## PASS — npm test\nExit code: 0\n');
  if (security) await write(`${dir}/SECURITY-REPORT.md`, '# Security report\n\nNo high-signal patterns in the diff.\n');
  if (review !== null) await write(`${dir}/REVIEW.md`, `# Review\n\n## Decision\n- [${review ? 'x' : ' '}] approve\n- [ ] approve with follow-up\n- [ ] request changes\n`);
  if (ship) await write(`${dir}/flows/ship.json`, JSON.stringify({ flow: 'ship', runs: ship, approvals, status: ship.at(-1).outcome }, null, 2));
}
const ORDER_FILES = ['src/api/orders.js', 'src/services/orders.js'];
await task('add-orders-pagination', {
  idea: 'Add cursor pagination to the orders list', created: '2026-09-17',
  criteria: ['limit=2 returns the two oldest orders and a nextCursor', 'the next page never repeats an order', 'the last page returns nextCursor null', 'clients using page and pageSize get today\'s response'],
  subtasks: [
    { title: 'Signed cursor and query DTO', status: 'done', ac: ['AC-01'], files: ['src/lib/cursor.js'] },
    { title: 'Cursor pagination in the orders service', status: 'pending', after: ['01'], ac: ['AC-01', 'AC-02', 'AC-03'], files: ORDER_FILES, complexity: 'high' },
    { title: 'Keep offset pagination unchanged', status: 'pending', after: ['01'], ac: ['AC-04'], files: ['src/services/orders.js', 'test/orders.test.js'] },
    { title: 'HTTP contract and API docs', status: 'pending', after: ['02', '03'], ac: ['AC-02'], files: ['src/api/orders.js', 'docs/api/orders.md'], type: 'docs', complexity: 'low' }
  ]
});
await task('fix-order-export', {
  idea: 'Preserve column order in the CSV order export', created: '2026-09-16',
  criteria: ['the export keeps the columns in the order the customer chose', 'unknown columns are rejected with 400'],
  subtasks: [{ title: 'Ordered CSV writer', status: 'done', ac: ['AC-01', 'AC-02'], files: ORDER_FILES }],
  evidence: true, review: false,
  ship: [shipRun('2026-09-18T10:12:00Z', 'awaiting-approval', 0, { scope: { status: 'fail', issues: ['Not in TECHSPEC.md File References or any task: src/lib/logger.js'] }, 'human-review': { status: 'pending', issues: ['Waiting for a human decision'] } })]
});
await task('harden-payment-webhooks', {
  idea: 'Verify signatures on payment webhooks', workflow: 'strict', created: '2026-09-15',
  criteria: ['requests without a valid Stripe signature are rejected with 401', 'replayed events older than five minutes are ignored'],
  subtasks: [{ title: 'Signature verification middleware', status: 'done', ac: ['AC-01', 'AC-02'], files: ['src/api/webhooks.js', 'src/services/payments.js'] }],
  evidence: true, review: false,
  ship: [
    shipRun('2026-09-18T08:40:00Z', 'revise', 1, { checks: { status: 'fail', issues: ['npm test: 1 failing — webhooks rejects replayed events'] }, security: { status: 'fail', issues: ['src/services/payments.js:4 — hard-coded API base URL with credentials pattern'] }, 'human-review': { status: 'pending', issues: [] } }),
    shipRun('2026-09-18T11:05:00Z', 'revise', 2, { security: { status: 'fail', issues: ['src/services/payments.js:4 — hard-coded API base URL with credentials pattern'] }, 'human-review': { status: 'pending', issues: [] } })
  ]
});
await task('cache-order-pages', {
  idea: 'Cache the first page of the orders list', created: '2026-09-10',
  criteria: ['the first page is served from Redis for 30 seconds', 'creating an order invalidates the cache'],
  subtasks: [{ title: 'Redis page cache', status: 'done', ac: ['AC-01', 'AC-02'], files: ['src/lib/cache.js', 'src/services/orders.js'] }],
  evidence: true, review: true,
  ship: [shipRun('2026-09-12T16:20:00Z', 'done', 1, { 'human-review': { status: 'pass', summary: 'approve by Kenji Sato' } })],
  approvals: { 'human-review': { decision: 'approve', by: 'Kenji Sato', at: '2026-09-12T16:18:00Z', reason: 'Checked invalidation on create and cancel.' } }
});
await task('customer-search', {
  idea: 'Search customers by email or name', workflow: 'spec-driven', created: '2026-09-18', spec: false,
  criteria: ['a partial email returns matching customers', 'results are limited to 20']
});
// One recorded agent run, as `maverick agent run` writes it.
const events = [
  { at: '2026-09-17T14:02:00.000Z', type: 'start', provider: 'claude-code', model: 'sonnet', effort: 'xhigh', permission: 'edit' },
  { at: '2026-09-17T14:02:01.000Z', type: 'session', id: '6f1c2a90-northstar' },
  { at: '2026-09-17T14:02:04.000Z', type: 'tool', name: 'Read', detail: 'src/services/orders.js' },
  { at: '2026-09-17T14:02:09.000Z', type: 'tool', name: 'Write', detail: 'src/lib/cursor.js' },
  { at: '2026-09-17T14:02:31.000Z', type: 'tool', name: 'Bash', detail: 'npm test' },
  { at: '2026-09-17T14:02:40.000Z', type: 'text', text: 'Added an HMAC-signed cursor codec and the query DTO fields; tests pass.' },
  { at: '2026-09-17T14:02:41.000Z', type: 'result', ok: true, cost: 0.1834, text: '```maverick-result\n{"status":"done","summary":"Signed cursor codec and query DTO added; npm test passes.","questions":[],"filesChanged":["src/lib/cursor.js","src/api/orders.js"]}\n```' },
  { at: '2026-09-17T14:02:42.000Z', type: 'end', ok: true, problems: [], exitCode: 0, durationMs: 42000, status: 'done' }
];
await write('.maverick/tasks/add-orders-pagination/runs/2026-09-17T14-02-00-000Z-claude-code.jsonl', `${events.map(event => JSON.stringify(event)).join('\n')}\n`);
await write('docs/api/orders.md', '# Orders API\n\nList, create, and export orders.\n');
await write('docs/decisions/adr-001-cursor-pagination.md', '# ADR 001 — Cursor pagination\n\n## Context\nLarge order lists need bounded responses.\n');
const source = {
  'src/server.js': "import express from 'express';\nimport { ordersRouter } from './api/orders.js';\nimport { customersRouter } from './api/customers.js';\nimport { webhooksRouter } from './api/webhooks.js';\nimport { logger } from './lib/logger.js';\n\nconst app = express();\napp.use('/api/orders', ordersRouter);\napp.use('/api/customers', customersRouter);\napp.use('/webhooks', webhooksRouter);\napp.listen(process.env.PORT || 3000, () => logger.info('northstar-orders ready'));\n",
  'src/api/orders.js': "import { Router } from 'express';\nimport { requireAuth } from '../lib/auth.js';\nimport { listOrders, createOrder, exportOrders } from '../services/orders.js';\n\nexport const ordersRouter = Router();\nordersRouter.get('/', requireAuth, async (req, res) => res.json(await listOrders(req.query)));\nordersRouter.post('/', requireAuth, async (req, res) => res.status(201).json(await createOrder(req.body)));\nordersRouter.get('/export', async (req, res) => res.send(await exportOrders(req.query)));\nordersRouter.delete('/:id', async (req, res) => res.sendStatus(204));\n",
  'src/api/customers.js': "import { Router } from 'express';\nimport { requireAuth } from '../lib/auth.js';\nimport { findCustomer, updateCustomer } from '../services/customers.js';\n\nexport const customersRouter = Router();\ncustomersRouter.get('/:id', requireAuth, async (req, res) => res.json(await findCustomer(req.params.id)));\ncustomersRouter.put('/:id', requireAuth, async (req, res) => res.json(await updateCustomer(req.params.id, req.body)));\n",
  'src/api/webhooks.js': "import { Router } from 'express';\nimport { confirmPayment } from '../services/payments.js';\n\nexport const webhooksRouter = Router();\nwebhooksRouter.post('/payments', async (req, res) => { await confirmPayment(req.body); res.sendStatus(200); });\n",
  'src/services/orders.js': "import { orderRepository } from '../data/orders.js';\nimport { chargeOrder } from './payments.js';\nimport { notifyCustomer } from './notifications.js';\nimport { cache } from '../lib/cache.js';\n\n// TODO: move pagination defaults to config\nexport async function listOrders({ cursor, limit = 50 }) {\n  return cache.wrap(`orders:${cursor}:${limit}`, () => orderRepository.page(cursor, Math.min(limit, 200)));\n}\nexport async function createOrder(input) {\n  const order = await orderRepository.insert(input);\n  await chargeOrder(order);\n  await notifyCustomer(order.customerId, 'order.created');\n  return order;\n}\n// FIXME: export loads every row in memory\nexport async function exportOrders() { return (await orderRepository.all()).map(o => Object.values(o).join(',')).join('\\n'); }\nexport function orderTotal(order) { return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0); }\n",
  'src/services/payments.js': "import { orderTotal } from './orders.js';\nimport { orderRepository } from '../data/orders.js';\n\nconst STRIPE = 'https://api.stripe.com/v1';\nexport async function chargeOrder(order) {\n  const response = await fetch(`${STRIPE}/payment_intents`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, body: new URLSearchParams({ amount: String(orderTotal(order)), currency: 'eur' }) });\n  return response.json();\n}\nexport async function confirmPayment(event) { await orderRepository.markPaid(event.data.object.metadata.orderId); }\n",
  'src/services/customers.js': "import { customerRepository } from '../data/customers.js';\nexport const findCustomer = id => customerRepository.find(id);\nexport const updateCustomer = (id, patch) => customerRepository.update(id, patch);\n",
  'src/services/notifications.js': "import { customerRepository } from '../data/customers.js';\nimport { logger } from '../lib/logger.js';\n\nexport async function notifyCustomer(customerId, template) {\n  const customer = await customerRepository.find(customerId);\n  await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` }, body: JSON.stringify({ to: customer.email, template }) });\n  logger.info(`notified ${customerId}`);\n}\n",
  'src/data/orders.js': "import { db } from './db.js';\nexport const orderRepository = {\n  page: (cursor, limit) => db.query('select * from orders where id > $1 order by id limit $2', [cursor || 0, limit]),\n  all: () => db.query('select * from orders'),\n  insert: order => db.query('insert into orders(data) values($1) returning *', [order]),\n  markPaid: id => db.query('update orders set paid = true where id = $1', [id])\n};\n",
  'src/data/customers.js': "import { db } from './db.js';\nexport const customerRepository = {\n  find: id => db.query('select * from customers where id = $1', [id]),\n  update: (id, patch) => db.query('update customers set data = $2 where id = $1', [id, patch])\n};\n",
  'src/data/db.js': "import pg from 'pg';\nexport const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });\n",
  'src/lib/cache.js': "import { createClient } from 'redis';\nconst client = createClient({ url: process.env.REDIS_URL });\nexport const cache = { async wrap(key, load) { const hit = await client.get(key); if (hit) return JSON.parse(hit); const value = await load(); await client.set(key, JSON.stringify(value), { EX: 30 }); return value; } };\n",
  'src/lib/auth.js': "export function requireAuth(req, res, next) { return req.headers.authorization ? next() : res.sendStatus(401); }\n",
  'src/lib/logger.js': "export const logger = { info: message => console.log(`[northstar] ${message}`) };\n",
  'test/orders.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { orderTotal } from '../src/services/orders.js';\n\ntest('orderTotal sums items', () => assert.equal(orderTotal({ items: [{ price: 2, quantity: 3 }] }), 6));\n"
};
for (const [path, body] of Object.entries(source)) await write(path, body);

// A small fictional history so churn, change coupling and team views have something to show.
const git = (args, date, author) => execFileSync('git', args, { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: author?.[0] || 'Ada Rivera', GIT_AUTHOR_EMAIL: author?.[1] || 'ada@northstar.example', GIT_COMMITTER_NAME: author?.[0] || 'Ada Rivera', GIT_COMMITTER_EMAIL: author?.[1] || 'ada@northstar.example', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
const team = [['Ada Rivera', 'ada@northstar.example'], ['Kenji Sato', 'kenji@northstar.example'], ['Lina Okafor', 'lina@northstar.example']];
const history = [
  ['feat: orders API', ['src/server.js', 'src/api/orders.js', 'src/services/orders.js', 'src/data/orders.js', 'src/data/db.js'], 0],
  ['feat: customers API', ['src/api/customers.js', 'src/services/customers.js', 'src/data/customers.js'], 1],
  ['feat: stripe payments', ['src/services/payments.js', 'src/services/orders.js', 'src/api/webhooks.js'], 0],
  ['feat: order notifications', ['src/services/notifications.js', 'src/services/orders.js'], 2],
  ['perf: cache order pages', ['src/lib/cache.js', 'src/services/orders.js'], 1],
  ['fix: payment webhook', ['src/services/payments.js', 'src/api/webhooks.js'], 0],
  ['test: order totals', ['test/orders.test.js', 'src/services/orders.js'], 2]
];
try {
  git(['init', '-q', '-b', 'main'], '2026-08-01T10:00:00');
  history.forEach(([message, files, who], index) => {
    const date = `2026-08-${String(4 + index * 3).padStart(2, '0')}T1${index % 8}:00:00`;
    files.forEach(file => appendFileSync(join(root, file), `// rev ${index}\n`));
    git(['add', ...files], date, team[who]);
    git(['commit', '-q', '-m', message], date, team[who]);
  });
  git(['add', '-A'], '2026-09-18T09:00:00');
  git(['commit', '-q', '-m', 'chore: workflow artifacts'], '2026-09-18T09:00:00');
} catch {
  // Git is optional; Lens simply shows fewer history-based signals.
}
await write('agents/reviewer.md', '# Reviewer\n\nReview scope, behavior, and evidence.\n');
await write('adapters/codex/AGENTS.md.example', '# Codex adapter\n');

const port = Number(process.env.LENS_EXAMPLE_PORT || 4175);
await startLens({ cwd: root, port, watch: false });
const address = `http://127.0.0.1:${port}`;
console.log(`Maverick AI Lens example is running at ${address}`);
console.log('The indexed project is temporary and contains fictional data only. Press Ctrl+C to stop.');
if (!process.env.LENS_EXAMPLE_NO_OPEN) try {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  execFileSync(opener, process.platform === 'win32' ? ['/c', 'start', address] : [address], { stdio: 'ignore' });
} catch {
  console.log('Open the address above in a browser.');
}
