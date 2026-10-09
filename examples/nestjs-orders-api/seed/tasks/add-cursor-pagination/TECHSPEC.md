# Technical Spec — Cursor pagination for the orders list

## Summary
Add a keyset branch to `OrdersService.list` on (`createdAt`, `id`), driven by optional `cursor` and `limit` query parameters, with a base64url cursor codec. Offset requests keep the current branch. The cache key includes the cursor.

## Current State
- `src/orders/orders.controller.ts` — `GET /orders` passes `ListOrdersDto` to `OrdersService.list`.
- `src/orders/orders.service.ts` — filters by `customerId`/`status`, slices by `page`/`pageSize`, and caches for 30s under `orders:<customer>:<status>:<page>:<pageSize>`.
- `src/orders/dto/list-orders.dto.ts` — validates `page` and `pageSize` with class-validator.
- `src/orders/orders.repository.ts` — in-memory store; `insert` keeps `createdAt` strictly increasing.
- `src/orders/orders.service.spec.ts` and `test/orders.e2e-spec.ts` — cover offset pagination only.

## Approach
Keyset pagination in the service, following ADR-001. Rejected: offset with a snapshot, because it needs per-client state. Rejected: moving filtering into `OrdersRepository`, because it widens the change for no behavior gain.

## File References
- `src/orders/dto/list-orders.dto.ts` — add optional `cursor` (string) and `limit` (int ≥ 1)
- `src/orders/orders.service.ts` — keyset branch, `encodeCursor`/`decodeCursor`, cursor in the cache key
- `src/orders/orders.service.spec.ts` — unit tests UT-01 to UT-04
- `test/orders.e2e-spec.ts` — e2e IT-01
- `docs/api.md` — document `cursor`, `limit` and `nextCursor`
- `docs/decisions/adr-001-cursor-pagination.md` — the decision this implements

## Interfaces and Data
```ts
class ListOrdersDto { page?: number; pageSize?: number; cursor?: string; limit?: number }
// cursor branch
list(query): Promise<{ data: Order[]; nextCursor?: string }>
// offset branch, unchanged
list(query): Promise<{ data: Order[]; page: number; pageSize: number; total: number }>
```
Cursor: base64url of `<createdAt ISO>|<id>`; undecodable values throw `BadRequestException`.

## Impact
| File | Change | Risk |
|---|---|---|
| `src/orders/orders.service.ts` | new branch and cache key | medium: most used endpoint |
| `src/orders/dto/list-orders.dto.ts` | two optional fields | low |

## Test Plan
- UT-01 → AC-01: `limit=2` with 3 orders returns 2 and a `nextCursor`; `limit=500` is capped
- UT-02 → AC-02: orders inserted between pages are neither repeated nor skipped
- UT-03 → AC-03: `decodeCursor('garbage')` throws `BadRequestException`
- UT-04 → AC-04: `page`/`pageSize` returns the current shape
- IT-01 → AC-03: `GET /api/v1/orders?cursor=garbage` returns 400

## Build Order
1. DTO, cursor codec and keyset branch in the service, with unit tests (AC-01, AC-02, AC-04)
2. Invalid-cursor handling end to end and API docs (AC-03)

## Risks and Rollback
- [Risk] Stale pages if the cache key misses the cursor → the key includes `cursor` and `limit`.
- [Risk] Clients mixing parameters → the cursor wins, documented in `docs/api.md`.
- Rollback: revert the commit; offset pagination is untouched.

## Commands
```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

## Do Not Touch
- `src/payments/`
- `src/customers/`
- `src/orders/orders.repository.ts`
