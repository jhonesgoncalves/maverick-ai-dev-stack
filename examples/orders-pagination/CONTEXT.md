# Context Pack — orders-pagination

## System Snapshot
Node ESM module; in-memory demo only.

## Relevant Paths
1. `demo/src/orders.js`
2. `demo/test/orders.test.js`

## Existing Behavior
`listOrders({status})` returns all orders or filters exact status.

## Local Conventions
Use built-in Node only. Tests use `node:test` + strict assert.

## Constraints
No dependencies; preserve returned objects and ordering.

## Do Not Change
Order fixtures, status values or module exports beyond extending `listOrders` input.

## Commands
```bash
cd demo && node --test test/*.test.js
```

## Known Risks
Applying pagination before filtering changes semantics.
