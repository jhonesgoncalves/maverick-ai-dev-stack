# ADR 001 — Cursor pagination for orders

## Status
Proposed

## Context
`GET /api/v1/orders` uses offset pagination (`page`, `pageSize`). Offsets get slower and skip rows
when orders are inserted while a client is paging.

## Decision
Move to an opaque `cursor` + `limit` contract, keeping `page` working for one release.

## Consequences
- Clients receive `nextCursor` instead of `total`.
- The cache key changes from page number to cursor.
