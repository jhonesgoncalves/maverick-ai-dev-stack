# NestJS Orders API — Maverick AI playground

A small but realistic NestJS 11 API (orders, customers, payments, notifications, reports) built to
exercise every part of Maverick AI: the CLI, the task workflow and gates, flows, project
intelligence and Lens. It runs with **no infrastructure**: in-memory repositories, an in-memory
cache (Redis only when `REDIS_URL` is set) and a fake payment gateway.

It deliberately carries a few things for Maverick to find:

| Signal | Where | Seen by |
| --- | --- | --- |
| Import cycle | `src/orders/order-pricing.ts` ⇄ `src/payments/currency.ts` | `graph`, `audit`, Lens Architecture |
| Unguarded write route | `POST /api/v1/webhooks/payments` | `routes`, `audit` |
| TODO / FIXME markers | `src/orders/orders.service.ts` | `audit`, Lens Devtools |
| Events and a cron job | `@OnEvent`, `@Cron` | `routes --kind event\|job` |
| Change hotspots and ownership | fictional Git history by three authors | `hotspots`, Lens Git |
| Global prefix + URI versioning | `src/main.ts` | `routes` resolves `/api/v1/...` |

## 1. Create the playground

The playground is a **copy** of this folder in its own Git repository, so `checkpoint`, `guard` and
`review --diff` see only this project's changes.

```bash
bash examples/nestjs-orders-api/scripts/setup-playground.sh
```

By default it goes to `~/maverick-playground/nestjs-orders-api`. Pass a path to choose another place,
`--force` to recreate it, `--skip-install` to skip `npm install`. The script:

1. copies the sample and replays a short Git history (Ada, Kenji and Lina, August 2026);
2. runs `npm install`;
3. runs `maverick init` and seeds the planned task `add-cursor-pagination`, plus a ready solution at
   `.maverick/seed/add-cursor-pagination.patch`.

If `maverick` is not on your PATH the script uses this checkout. To call it from the playground,
link it once or add an alias, both from the Maverick AI repository root:

```bash
npm link
```

```bash
alias maverick="node $(pwd)/bin/maverick.js"
```

## 2. Run the API

```bash
cd ~/maverick-playground/nestjs-orders-api
npm run build && npm start
```

```bash
curl -s localhost:3000/health
curl -s -X POST localhost:3000/api/v1/orders -H 'x-api-key: dev-api-key' -H 'content-type: application/json' -d '{"customerId":"c-1","items":[{"sku":"mug","quantity":2,"unitPrice":12.5}]}'
curl -s localhost:3000/api/v1/orders -H 'x-api-key: dev-api-key'
curl -s localhost:3000/api/v1/reports/daily -H 'x-api-key: dev-api-key'
```

Checks: `npm run lint`, `npm run typecheck`, `npm test` (unit), `npm run test:e2e`, `npm run build`.
Endpoints are listed in [docs/api.md](docs/api.md).

## 3. Guided tour

Run everything from the playground folder.

### Get started

```bash
maverick doctor
maverick status
maverick lens --open
```

### Project intelligence

```bash
maverick stack
maverick map
maverick routes
maverick routes --kind event
maverick routes --method POST --grep orders
maverick graph
maverick graph --format mermaid
maverick coupling
maverick hotspots
maverick impact src/orders/orders.service.ts
maverick audit
```

### Full task workflow with the seeded task

`add-cursor-pagination` implements [ADR 001](docs/decisions/adr-001-cursor-pagination.md). Its planning is
already done; `review --diff` writes REVIEW.md from its acceptance criteria and tasks.

```bash
maverick status
maverick validate add-cursor-pagination
maverick instructions add-cursor-pagination --json
maverick packet add-cursor-pagination --agent claude-code
maverick checkpoint add-cursor-pagination
```

Implement it yourself (or with your agent), or apply the ready solution:

```bash
git apply .maverick/seed/add-cursor-pagination.patch
```

Then run the gates:

```bash
maverick guard add-cursor-pagination
maverick verify add-cursor-pagination
maverick security add-cursor-pagination
maverick deps add-cursor-pagination
maverick review add-cursor-pagination --diff
maverick readiness add-cursor-pagination
```

`readiness` stays NOT READY until a human decides: tick `- [x] approve` under **Decision** in
`.maverick/tasks/add-cursor-pagination/REVIEW.md`. Then:

```bash
maverick flow run ship add-cursor-pagination
maverick pr add-cursor-pagination
maverick handoff add-cursor-pagination --to kenji
maverick learn add-cursor-pagination --rule "List endpoints use cursor pagination"
maverick ci github add-cursor-pagination
```

To see the gates catch problems, edit a file outside the declared scope (for example
`src/customers/customers.service.ts`) and rerun `guard`, or break a test and rerun `verify` and
`maverick flow run fix-checks add-cursor-pagination`.

### Start a new task from an idea

```bash
maverick new "Verify the HMAC signature of payment webhooks and reject invalid requests with 401" --slug verify-webhook-signature
```

Without `--slug`, Maverick derives one from the idea (`verify-hmac-signature-payment-webhooks-reject`). It
writes `TASK.json`, grounds the idea in the code (ranked relevant files, nearby tests, entry points and
verification commands) and picks the `strict` workflow because it touches payments. In a terminal it then
opens your AI coding agent with the eight flow skills installed, and the agent writes `PRD.md`, `TECHSPEC.md`
and the task graph with you, one stage at a time, then builds, reviews and drafts the PR with the
maverick-build, maverick-review and maverick-ship skills. Already inside an agent? Ask it to use the
maverick-new skill (in Claude Code, `/maverick-new <idea>`). `maverick new verify-webhook-signature` resumes
with the skill for the task's stage.

Headless, with a trusted read-only agent:

```bash
maverick agent list
maverick agent trust claude-code
maverick generate verify-webhook-signature --agent claude-code
maverick validate verify-webhook-signature --strict
maverick subtask list verify-webhook-signature
```

### Agents, capabilities and MCP

```bash
maverick adapter list
maverick adapter install claude-code
maverick catalog
maverick add skill/maverick-build --to claude-code --dry-run
maverick add mcp/maverick --to claude-code --allow-exec
maverick installed
maverick mcp
```

### Configuration and policy

```bash
maverick config show
maverick policy init
maverick policy check add-cursor-pagination
```

## Reset

```bash
bash examples/nestjs-orders-api/scripts/setup-playground.sh --force
```
