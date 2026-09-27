# PRD — Cursor pagination for the orders list

## Overview
`GET /api/v1/orders` pages with `page`/`pageSize` offsets over an in-memory list (`src/orders/orders.service.ts`). When orders are created while a client is paging, rows shift between pages, so the back-office export tool skips or repeats orders. `docs/decisions/adr-001-cursor-pagination.md` decides on an opaque cursor while keeping offsets for one release.

## Goals
- Clients can walk the whole order list exactly once, even while orders are being created.
- Responses stay bounded by `orders.maxPageSize`.
- Existing `page`/`pageSize` callers keep today's response for one release.

## User Stories
### US-01: Export every order once
As the back-office export tool, I want to page through orders with a cursor, so that a long export neither repeats nor loses orders.

### US-02: Keep existing integrations working
As an integration owner using `page` and `pageSize`, I want the current call to behave as it does today, so that nothing breaks on release.

## Requirements
### Requirement: Cursor pages
`GET /api/v1/orders` SHALL accept an optional opaque `cursor` and `limit`, and SHALL return at most `limit` orders, oldest first, with a `nextCursor` when more orders exist.

#### Scenario: More orders than the limit
- **WHEN** a client requests `limit=2` and 3 orders exist
- **THEN** it receives the 2 oldest orders and a non-empty `nextCursor`

#### Scenario: Orders created between pages
- **WHEN** a client follows `nextCursor` after new orders were created
- **THEN** it receives the next orders with no duplicates and no gaps

### Requirement: Invalid cursors are rejected
The endpoint MUST reject a cursor it did not issue with `400 Bad Request`.

#### Scenario: Malformed cursor
- **WHEN** a client sends `cursor=garbage`
- **THEN** it receives 400 and no order data

### Requirement: Offset pagination keeps working
Requests with `page`/`pageSize` and no `cursor` SHALL return the current `{ data, page, pageSize, total }` shape.

#### Scenario: Existing offset caller
- **WHEN** a client requests `page=1&pageSize=2` with 3 orders
- **THEN** it receives 2 orders, `page=1`, `pageSize=2` and `total=3`

## Acceptance Criteria
- [ ] AC-01: Given 3 orders, when a client requests `limit=2`, then it receives 2 orders and a `nextCursor`; `limit` is capped at `orders.maxPageSize` (US-01)
- [ ] AC-02: Given a client read a page and orders were created afterwards, when it follows `nextCursor`, then no order repeats and none is skipped (US-01)
- [ ] AC-03: Given an invalid cursor, when a client lists orders, then it receives 400 (US-01)
- [ ] AC-04: Given `page`/`pageSize` and no cursor, when a client lists orders, then the response shape is unchanged (US-02)

## Business Rules
- Orders are ordered by `createdAt`, then `id` (`OrdersRepository.insert` guarantees increasing `createdAt`).
- `limit` defaults to `orders.defaultPageSize` and is capped, not rejected, above `orders.maxPageSize`.
- The cursor is base64url and opaque to clients, never a raw id.

## Edge Cases
- Empty list → `data: []` and no `nextCursor`
- `limit` above the maximum → capped at the maximum
- Orders sharing the same `createdAt` → ordered by `id`, none skipped
- Both `cursor` and `page` sent → the cursor wins

## Non-Goals
- Removing offset pagination (next release).
- Customers and reports endpoints.
- Changes to order creation, cancellation or payments.

## Open Questions
None.
