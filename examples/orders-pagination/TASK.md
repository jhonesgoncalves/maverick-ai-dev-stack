# Task Brief — orders-pagination

## Objective
Allow callers of `listOrders` to request a page with a positive integer `limit` and zero-based `offset`, while preserving optional status filtering.

## Why
The current function returns the full in-memory collection, which makes the demo unsuitable for showing bounded result sets.

## Acceptance Criteria
- [ ] Default behavior without pagination still returns the full filtered list.
- [ ] `limit` returns at most that many items.
- [ ] `offset` skips that many filtered items before applying limit.
- [ ] status filtering happens before pagination.
- [ ] invalid negative/non-integer values throw `TypeError`.

## In Scope
- `demo/src/orders.js`
- `demo/test/orders.test.js`

## Out of Scope
- cursor pagination;
- HTTP layer;
- database;
- changing order shape.

## Constraints
No dependencies. Preserve order ordering.

## Edge Cases
`limit=0` returns empty list. `offset` beyond end returns empty list.

## Verification
```bash
cd demo && node --test test/*.test.js
```

## Rollback / Failure Signal
Revert the single implementation commit if existing filter behavior regresses.
