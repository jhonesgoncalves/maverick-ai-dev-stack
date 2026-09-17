import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startDashboard } from '../src/dashboard/server.js';

const root = await mkdtemp(join(tmpdir(), 'maverick-lens-example-'));
const write = async (path, body) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), body); };

await write('package.json', JSON.stringify({
  name: 'northstar-orders',
  private: true,
  scripts: { test: 'node --test', lint: 'node --check src/orders.js', typecheck: 'node --check src/orders.js', build: 'node --check src/orders.js' }
}, null, 2));
await write('.maverick/config.json', JSON.stringify({
  version: 1,
  project: { name: 'Northstar Orders', language: 'JavaScript', framework: 'Node.js' },
  workflow: { requirePlan: true, requireReview: true, requireTests: true, defaultPreset: 'standard' },
  adapter: 'codex',
  taskRoot: '.maverick/tasks'
}, null, 2));
await write('.maverick/tasks/add-orders-pagination/TASK.json', JSON.stringify({ preset: 'standard', createdAt: '2026-09-17' }, null, 2));
await write('.maverick/tasks/add-orders-pagination/TASK.md', `# Add orders pagination

## Goal
Allow operators to navigate large order lists without loading every record.

## Acceptance Criteria
- [ ] The API accepts a bounded page size.
- [ ] The response returns a next-page cursor when more results exist.

## In Scope
- Order listing endpoint and its focused tests.

## Out of Scope
- Changes to the order schema.

## Verification
\`npm test\`
`);
await write('.maverick/tasks/add-orders-pagination/CONTEXT.md', '# Context\n\n## Architecture Summary\nOrders are served by a small Node API.\n');
await write('.maverick/tasks/add-orders-pagination/PLAN.md', '# Plan\n\n## Approach\nAdd cursor parsing and response metadata.\n');
await write('.maverick/tasks/add-orders-pagination/REVIEW.md', '# Review\n\n## Decision\n- [ ] approve\n');
await write('.maverick/tasks/add-orders-pagination/PR.md', '# PR\n\n## Summary\nAdd paginated order listing.\n');
await write('.maverick/tasks/fix-order-export/TASK.json', JSON.stringify({ preset: 'lightweight', createdAt: '2026-09-16' }, null, 2));
await write('.maverick/tasks/fix-order-export/TASK.md', '# Fix CSV order export\n\n## Goal\nPreserve customer-selected column order.\n');
await write('.maverick/tasks/fix-order-export/EVIDENCE.md', '# Verification Evidence\n\n## PASS — npm test\nExit code: 0\n');
await write('docs/api/orders.md', '# Orders API\n\nList, create, and export orders.\n');
await write('docs/decisions/adr-001-cursor-pagination.md', '# ADR 001 — Cursor pagination\n\n## Context\nLarge order lists need bounded responses.\n');
await write('src/orders.js', 'export function listOrders() { return []; }\n');
await write('agents/reviewer.md', '# Reviewer\n\nReview scope, behavior, and evidence.\n');
await write('adapters/codex/AGENTS.md.example', '# Codex adapter\n');

const port = 4175;
await startDashboard({ cwd: root, port, watch: false });
const address = `http://127.0.0.1:${port}`;
console.log(`Maverick Lens example is running at ${address}`);
console.log('The indexed project is temporary and contains fictional data only. Press Ctrl+C to stop.');
try {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  execFileSync(opener, process.platform === 'win32' ? ['/c', 'start', address] : [address], { stdio: 'ignore' });
} catch {
  console.log('Open the address above in a browser.');
}
