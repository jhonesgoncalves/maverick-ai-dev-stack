# Verification Evidence — adicionar-funcionalidade-de-produtos-crud-de-produtos

Generated: 2026-10-12T16:48:11.910Z

## PASS — npm run lint
Exit code: 0

```text
npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.

> nestjs-orders-api@0.1.0 lint
> eslint "src/**/*.ts" "test/**/*.ts"


```

## PASS — npm run typecheck
Exit code: 0

```text
npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.

> nestjs-orders-api@0.1.0 typecheck
> tsc --noEmit


```

## PASS — npm run test
Exit code: 0

```text
npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.

> nestjs-orders-api@0.1.0 test
> jest

PASS src/orders/orders.service.spec.ts
PASS src/products/products.service.spec.ts
PASS src/orders/order-cursor.spec.ts

Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        1.018 s
Ran all test suites.

```

## PASS — npm run build
Exit code: 0

```text
npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.

> nestjs-orders-api@0.1.0 build
> tsc -p tsconfig.build.json


```
