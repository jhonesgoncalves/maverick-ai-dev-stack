---
title: Keyset pagination in OrdersService
status: pending
type: backend
complexity: medium
---

# Keyset pagination in OrdersService

## Goal
`GET /api/v1/orders?limit=N` returns a page and a `nextCursor`; offset requests are unchanged.

## Acceptance Criteria
- [ ] AC-01: pages are bounded by `limit` (capped) and return `nextCursor` when more exist
- [ ] AC-02: following `nextCursor` after new orders neither repeats nor skips
- [ ] AC-04: `page`/`pageSize` keep the current response shape

## Files
- `src/orders/dto/list-orders.dto.ts` — optional `cursor` and `limit`
- `src/orders/orders.service.ts` — keyset branch, cursor codec, cursor in the cache key
- `src/orders/orders.service.spec.ts` — UT-01, UT-02, UT-04

## Steps
- [ ] Add `cursor` and `limit` to `ListOrdersDto` with class-validator.
- [ ] Add `encodeCursor`/`decodeCursor` (base64url of `createdAt|id`).
- [ ] Branch `list`: cursor or limit → keyset on (`createdAt`, `id`), fetching `limit + 1`; otherwise the current offset path.
- [ ] Include `cursor` and `limit` in the cache key.

## Verification
```bash
npm test -- orders.service
npm run lint && npm run typecheck
```
- [ ] UT-01: `limit=2` with 3 orders returns 2 and a cursor; `limit=500` is capped
- [ ] UT-02: inserts between pages do not duplicate or skip
- [ ] UT-04: offset response unchanged
