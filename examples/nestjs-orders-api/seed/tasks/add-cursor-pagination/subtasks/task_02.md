---
title: Reject invalid cursors and document the contract
status: pending
type: backend
complexity: low
---

# Reject invalid cursors and document the contract

## Goal
Invalid cursors fail with 400 through the HTTP layer, and clients can read the new contract in the API docs.

## Acceptance Criteria
- [ ] AC-03: an invalid cursor returns 400

## Files
- `src/orders/orders.service.ts` — `decodeCursor` throws `BadRequestException`
- `test/orders.e2e-spec.ts` — IT-01
- `src/orders/orders.service.spec.ts` — UT-03
- `docs/api.md` — `cursor`, `limit`, `nextCursor`, and that the cursor wins over `page`

## Steps
- [ ] Make `decodeCursor` throw `BadRequestException` for undecodable or malformed values.
- [ ] Add the e2e case and the unit case.
- [ ] Document the parameters and the one-release offset deprecation.

## Verification
```bash
npm test -- orders.service
npm run test:e2e
```
- [ ] UT-03: `decodeCursor('garbage')` throws `BadRequestException`
- [ ] IT-01: `GET /api/v1/orders?cursor=garbage` returns 400
