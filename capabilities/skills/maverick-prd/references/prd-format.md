# PRD format

`maverick validate <slug> --stage prd` requires every heading below. The checks it runs are marked **checked**.

~~~markdown
# PRD — Paginate the orders list

## Overview
Clients of `GET /orders` receive every order in one response (`src/orders/orders.service.ts:42`). Accounts with more than 5,000 orders time out on mobile. This change lets clients read orders page by page.

## Goals
- Clients can read any number of orders with bounded response sizes.
- Existing clients keep working without changes.

## User Stories
### US-01: Page through orders
As a mobile client, I want to fetch orders page by page, so that large accounts load quickly.

### US-02: Keep existing integrations working
As an integration owner, I want the unpaginated call to keep its behavior, so that nothing breaks on release.

## Requirements
### Requirement: Paginated listing
The orders endpoint SHALL return at most `limit` orders and a `nextCursor` when more exist.

#### Scenario: More orders than the limit
- **WHEN** a client requests `limit=2` and 3 orders exist
- **THEN** it receives the 2 newest orders and a non-empty `nextCursor`

#### Scenario: Last page
- **WHEN** a client requests the page after the last order
- **THEN** it receives the remaining orders and no `nextCursor`

### Requirement: Invalid cursors are rejected
The endpoint MUST reject a cursor it did not issue.

#### Scenario: Malformed cursor
- **WHEN** a client sends `cursor=garbage`
- **THEN** it receives 400 with `code=invalid_cursor`

## Acceptance Criteria
- [ ] AC-01: Given 3 orders, when a client requests `limit=2`, then it receives 2 orders and a `nextCursor` (US-01)
- [ ] AC-02: Given the last page, when a client requests it, then no `nextCursor` is returned (US-01)
- [ ] AC-03: Given a malformed cursor, when a client requests a page, then it receives 400 `invalid_cursor` (US-01)
- [ ] AC-04: Given no pagination parameters, when a client lists orders, then the response is unchanged (US-02)

## Business Rules
- `limit` defaults to 20 and accepts 1 to 100.
- Orders are sorted by `createdAt` descending, with the id as the tie-breaker.

## Edge Cases
- No orders → `[]` with no `nextCursor`
- `limit=0` or `limit=101` → 400 `invalid_limit`
- Order deleted between pages → the next page skips it without an error

## Non-Goals
- Sorting or filtering options.
- Changing the order schema.

## Open Questions
- Should admins page through every account at once? → Assumed no; the endpoint stays scoped to the caller's account.
~~~

## Rules

- **checked:** every requirement has at least one `#### Scenario:` (exactly four `#`), and every scenario has WHEN and THEN.
- **checked (strict):** every requirement says SHALL or MUST.
- **checked:** acceptance criteria use unique `AC-NN` ids.
- **checked (strict):** User Stories uses `### US-NN:` headings.
- **checked:** no TODO, TBD or FILL ME remains.
- Behavior only. If the implementation could change without anything visible changing, the detail belongs in TECHSPEC.md.
- Ids are stable: mark a dropped criterion `(withdrawn)` instead of renumbering the others.
