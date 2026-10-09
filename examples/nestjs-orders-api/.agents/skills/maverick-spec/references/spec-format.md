# Behavioral spec format

`maverick validate <slug> --stage spec` requires every heading below. The checks it runs are marked **checked**.

~~~markdown
# Spec — Paginate the orders list

## Summary
`GET /orders` gains optional `limit` and `cursor` query parameters and, when either is sent, returns a page object instead of an array. Calls without them keep today's array response. Implements AC-01 to AC-04 of PRD.md.

## Behavior
### Requirement: Paginated listing
The orders endpoint SHALL return at most `limit` orders, newest first, and a `nextCursor` while more orders exist.

#### Scenario: SC-01 More orders than the limit
- **GIVEN** an account with orders `o3`, `o2`, `o1` (newest first)
- **WHEN** the client calls `GET /orders?limit=2`
- **THEN** it receives `200` with `items: [o3, o2]` and a non-empty `nextCursor`

#### Scenario: SC-02 Last page
- **GIVEN** the `nextCursor` returned by SC-01
- **WHEN** the client calls `GET /orders?limit=2&cursor=<nextCursor>`
- **THEN** it receives `200` with `items: [o1]` and no `nextCursor`

### Requirement: Invalid input is rejected
The endpoint MUST reject a cursor it did not issue and a limit outside 1 to 100.

#### Scenario: SC-03 Malformed cursor
- **WHEN** the client calls `GET /orders?cursor=garbage`
- **THEN** it receives `400` with `{ "code": "invalid_cursor" }`

#### Scenario: SC-04 Limit out of range
- **WHEN** the client calls `GET /orders?limit=101`
- **THEN** it receives `400` with `{ "code": "invalid_limit" }`

### Requirement: Existing clients keep working
The endpoint SHALL keep the array response when no pagination parameter is sent.

#### Scenario: SC-05 No parameters
- **WHEN** the client calls `GET /orders`
- **THEN** it receives `200` with the same array body as before this change

## Contracts
`GET /orders` (changed, backward compatible)
```http
GET /orders?limit=20&cursor=eyJjIjoiMjAyNi0wOS0wMSIsImkiOiJvMiJ9
200 { "items": Order[], "nextCursor"?: string }
400 { "code": "invalid_cursor" | "invalid_limit", "message": string }
```
- `limit`: integer, 1 to 100, default 20. `cursor`: opaque string issued by this endpoint.
- Without `limit` and `cursor`: `200 Order[]` (unchanged).

## States and Data
- Reads `Order` (`id`, `accountId`, `createdAt`); no writes, no new fields.
- Order of results: `createdAt` descending, then `id` descending.

## Invariants
- A client paging from the first page to the last sees every order that existed before it started exactly once.
- A page never contains orders of another account.

## Errors
| Condition | Status / code | Message | Retryable |
|---|---|---|---|
| Cursor not issued by the endpoint | 400 `invalid_cursor` | "cursor is invalid or expired" | no |
| `limit` outside 1 to 100 | 400 `invalid_limit` | "limit must be between 1 and 100" | no |

## Traceability
| Criterion | Scenarios | Contracts |
|---|---|---|
| AC-01 | SC-01 | `GET /orders` 200 page |
| AC-02 | SC-02 | `GET /orders` 200 page |
| AC-03 | SC-03, SC-04 | `GET /orders` 400 |
| AC-04 | SC-05 | `GET /orders` 200 array |

## Open Questions
- Should cursors expire? → Assumed no; they only encode a position.

## Approval
- [ ] Spec approved
~~~

## Rules

- **checked:** Behavior has `### Requirement:` blocks, every requirement has at least one `#### Scenario:`, and every scenario has WHEN and THEN.
- **checked (strict):** every requirement says SHALL or MUST.
- **checked:** every `AC-NN` referenced exists in PRD.md.
- **checked (strict):** Traceability maps every acceptance criterion of PRD.md.
- **checked (strict):** Contracts has a code block, and Invariants is not empty.
- **checked:** no TODO, TBD or FILL ME remains.
- **gate:** `maverick flow run spec <slug>` passes only after a human checks `- [x] Spec approved` or runs `maverick flow approve spec <slug> spec-approval`.
- Scenario ids (`SC-NN`) are stable: mark a dropped scenario `(withdrawn)` instead of renumbering. The technical spec's Test Plan cites them, for example "`IT-01` → AC-01 / SC-01".
- Behavior only. Internal modules, queries, libraries and file names belong in TECHSPEC.md.
