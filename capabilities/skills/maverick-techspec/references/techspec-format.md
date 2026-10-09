# Technical spec format

`maverick validate <slug> --stage techspec` requires every heading below. The checks it runs are marked **checked**.

~~~markdown
# Technical Spec — Paginate the orders list

## Summary
Add keyset pagination to `OrdersService.findAll` and expose `limit` and `cursor` query parameters on `GET /orders`. The cursor is an opaque base64url string that encodes (`createdAt`, `id`).

## Current State
- `src/orders/orders.controller.ts:18` — `@Get()` calls `findAll(user.accountId)` with no parameters.
- `src/orders/orders.service.ts:42-61` — loads every order with `find({ order: { createdAt: 'DESC' } })`.
- `test/orders.e2e-spec.ts` — covers listing with 2 orders only.

## Approach
Keyset pagination on (`createdAt`, `id`), validated by a query DTO with `class-validator`, as the other DTOs in `src/orders/dto/` already are.
- Rejected: offset pagination. Pages drift when orders are inserted, which breaks AC-01 under load.
- Rejected: a new pagination library. Nothing in the repository uses one, and the logic is 30 lines.

## File References
- `src/orders/orders.controller.ts:15-25` — add the `@Query()` DTO
- `src/orders/orders.service.ts:42-61` — keyset query and `nextCursor`
- `src/orders/dto/list-orders.dto.ts` (new) — `limit` and `cursor` validation, next to `create-order.dto.ts`
- `src/orders/cursor.ts` (new) — encode and decode
- `test/orders.e2e-spec.ts` — extend with the paging cases

## Interfaces and Data
```ts
export class ListOrdersDto { @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20; @IsOptional() @IsString() cursor?: string }
findAll(accountId: string, query: ListOrdersDto): Promise<{ items: Order[]; nextCursor?: string }>
```
Response: `{ "items": [...], "nextCursor": "…" }`. Without parameters, the response keeps its current array shape (AC-04).

## Impact
| File | Change | Dependents | Risk |
|---|---|---|---|
| `src/orders/orders.service.ts` | new signature | 2 (controller, reports job) | medium: the reports job calls `findAll` |

## Test Plan
- `UT-01` → AC-01: `findAll` returns 2 items and a `nextCursor` when 3 exist
- `UT-02` → AC-02: the last page has no `nextCursor`
- `IT-01` → AC-03: `GET /orders?cursor=garbage` returns 400 `invalid_cursor`
- `IT-02` → AC-04: `GET /orders` without parameters returns the unchanged array

## Build Order
1. Cursor helpers and the DTO, with unit tests (AC-03)
2. Service keyset query (AC-01, AC-02)
3. Controller wiring and e2e tests (AC-01 to AC-04)

## Risks and Rollback
- [Risk] The reports job depends on the old `findAll` shape → keep an overload without a query that returns an array.
- Rollback: revert the commit. There is no schema change or migration.

## Commands
```bash
npm run lint
npm test
npm run test:e2e
```

## Do Not Touch
- `package-lock.json`: no new dependency
- `src/orders/entities/order.entity.ts`: no schema change
~~~

## Rules

- **checked (strict):** every backticked path in File References, Impact and Do Not Touch exists, unless its line says `(new)`.
- **checked:** every `AC-NN` referenced here is defined in PRD.md.
- **checked (strict):** the Test Plan proves every criterion of the PRD.
- **checked:** no TODO, TBD or FILL ME remains.
- The Build Order is the input of the maverick-tasks skill: keep its steps at the level of whole tasks, not individual edits.
