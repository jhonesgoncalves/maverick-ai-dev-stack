import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { captureOutput } from '../src/core/util.js';

// A fully planned task that passes `maverick validate --strict`: the shape a stage skill writes.

export const PRD = `# PRD — Paginate the orders list

## Overview
Clients receive every order at once from \`listOrders\` (src/orders/list.js:1). Large accounts time out.

## Goals
- Bounded responses for any number of orders.

## User Stories
### US-01: Page through orders
As a client, I want pages of orders, so that large accounts load quickly.

## Requirements
### Requirement: Paginated listing
The list SHALL return at most \`limit\` orders and a cursor when more exist.

#### Scenario: More orders than the limit
- **WHEN** 3 orders exist and 2 are requested
- **THEN** 2 orders and a cursor are returned

## Acceptance Criteria
- [ ] AC-01: Given 3 orders, when a client asks for 2, then it gets 2 and a cursor (US-01)
- [ ] AC-02: Given a bad cursor, when a client asks for a page, then it gets an error (US-01)

## Business Rules
- \`limit\` accepts 1 to 100.

## Edge Cases
- No orders → empty list and no cursor

## Non-Goals
- Sorting options.

## Open Questions
None.
`;

export const TECHSPEC = `# Technical Spec — Paginate the orders list

## Summary
Keyset pagination in \`listOrders\`.

## Current State
- \`src/orders/list.js:1\` — slices the first 20 orders.

## Approach
Keyset on (createdAt, id). Rejected: offset, because pages drift.

## File References
- \`src/orders/list.js:1\` — the query
- \`src/orders/cursor.js\` (new) — encode and decode

## Interfaces and Data
\`listOrders(db, { limit, cursor }) → { items, nextCursor }\`

## Impact
| File | Change | Risk |
|---|---|---|
| \`src/orders/list.js\` | new return shape | medium |

## Test Plan
- UT-01 → AC-01: 3 orders, limit 2, returns a cursor
- UT-02 → AC-02: a bad cursor throws

## Build Order
1. Cursor helpers and keyset query (AC-01, AC-02)

## Risks and Rollback
- [Risk] callers expect an array → keep the old call shape. Rollback: revert the commit.

## Commands
\`\`\`bash
npm test
\`\`\`

## Do Not Touch
- \`package.json\`
`;

// The behavioral spec a spec-driven task adds between the PRD and the technical spec.
export const SPEC = `# Spec — Paginate the orders list

## Summary
\`listOrders\` returns pages with a cursor. Implements AC-01 and AC-02.

## Behavior
### Requirement: Paginated listing
The list SHALL return at most \`limit\` orders and a cursor when more exist.

#### Scenario: SC-01 More orders than the limit
- **WHEN** 3 orders exist and 2 are requested
- **THEN** 2 orders and a cursor are returned

### Requirement: Bad cursors are rejected
The list MUST reject a cursor it did not issue.

#### Scenario: SC-02 Malformed cursor
- **WHEN** a client sends \`cursor=garbage\`
- **THEN** it gets an \`invalid_cursor\` error

## Contracts
\`\`\`js
listOrders(db, { limit, cursor }) → { items, nextCursor }
\`\`\`

## States and Data
- Reads orders; no writes.

## Invariants
- A page never repeats an order.

## Errors
| Condition | Code | Retryable |
|---|---|---|
| Bad cursor | invalid_cursor | no |

## Traceability
| Criterion | Scenarios | Contracts |
|---|---|---|
| AC-01 | SC-01 | listOrders |
| AC-02 | SC-02 | listOrders |

## Open Questions
None.

## Approval
- [ ] Spec approved
`;

export const TASK_BODY = `# Keyset pagination

## Goal
Page orders with a cursor.

## Acceptance Criteria
- [ ] AC-01
- [ ] AC-02

## Files
- \`src/orders/list.js\` — keyset query
- \`src/orders/cursor.js\` (new) — helpers

## Steps
- [ ] Add the cursor.

## Verification
\`\`\`bash
npm test
\`\`\`
- [ ] UT-01, UT-02
`;

/** Writes the source file the fixture references, then the PRD, the technical spec and one task. */
export async function planTask(cwd, slug) {
  await mkdir(join(cwd, 'src/orders'), { recursive: true });
  await writeFile(join(cwd, 'src/orders/list.js'), 'export function listOrders(db, { limit = 20 } = {}) { return db.orders.slice(0, limit); }\n');
  if (!existsSync(join(cwd, 'package.json'))) await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'shop' }));
  const dir = join(cwd, '.maverick/tasks', slug);
  await writeFile(join(dir, 'PRD.md'), PRD);
  await writeFile(join(dir, 'TECHSPEC.md'), TECHSPEC);
  await captureOutput(() => main(['subtask', 'add', slug, 'Keyset pagination', '--type', 'backend'], cwd));
  await writeFile(join(dir, 'subtasks/task_01.md'), `---\ntitle: Keyset pagination\nstatus: pending\ntype: backend\n---\n\n${TASK_BODY}`);
  return dir;
}
