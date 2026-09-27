# Flow ship — add-cursor-pagination-orders-endpoint

Goal: Every blocking gate for add-cursor-pagination-orders-endpoint passes and a human has recorded a review decision.

Outcome: **AWAITING-APPROVAL** (failed iteration 0/3, no-progress window 2)
Run: 2026-09-27T21:39:02.008Z

## Next step
Blocking checks pass; a human must record the pending approval(s).

## Gates
- ✓ **artifacts** (maverick) — pass
- ✓ **checks** (maverick) — pass
- ✗ **scope** (maverick, warn) — fail
  - Change budget exceeded: 72/8 files.
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-build/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-new/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-prd/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-prd/references/prd-format.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-prd/references/question-protocol.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-review/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-ship/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-spec/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-spec/references/spec-format.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-status/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-sync/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-tasks/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-tasks/references/task-format.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-techspec/SKILL.md
  - Not in TECHSPEC.md File References or any task: .agents/skills/maverick-techspec/references/techspec-format.md
  - Not in TECHSPEC.md File References or any task: .claude/skills
  - Not in TECHSPEC.md File References or any task: .cursor/skills
  - Not in TECHSPEC.md File References or any task: .env.example
  - Not in TECHSPEC.md File References or any task: .gemini/skills
  - Not in TECHSPEC.md File References or any task: .gitignore
  - Not in TECHSPEC.md File References or any task: .kiro/skills
  - Not in TECHSPEC.md File References or any task: AGENTS.md
  - Not in TECHSPEC.md File References or any task: CLAUDE.md
  - Not in TECHSPEC.md File References or any task: GEMINI.md
  - Not in TECHSPEC.md File References or any task: README.md
  - Not in TECHSPEC.md File References or any task: eslint.config.mjs
  - Not in TECHSPEC.md File References or any task: nest-cli.json
  - Not in TECHSPEC.md File References or any task: package-lock.json
  - Not in TECHSPEC.md File References or any task: package.json
  - Not in TECHSPEC.md File References or any task: scripts/setup-playground.sh
  - Not in TECHSPEC.md File References or any task: seed/add-cursor-pagination.patch
  - Not in TECHSPEC.md File References or any task: seed/tasks/add-cursor-pagination/PRD.md
  - Not in TECHSPEC.md File References or any task: seed/tasks/add-cursor-pagination/TECHSPEC.md
  - Not in TECHSPEC.md File References or any task: seed/tasks/add-cursor-pagination/subtasks/_tasks.md
  - Not in TECHSPEC.md File References or any task: seed/tasks/add-cursor-pagination/subtasks/task_01.md
  - Not in TECHSPEC.md File References or any task: seed/tasks/add-cursor-pagination/subtasks/task_02.md
  - Not in TECHSPEC.md File References or any task: src/app.module.ts
  - Not in TECHSPEC.md File References or any task: src/common/cache/cache.module.ts
  - Not in TECHSPEC.md File References or any task: src/common/guards/api-key.guard.ts
  - Not in TECHSPEC.md File References or any task: src/customers/customer.entity.ts
  - Not in TECHSPEC.md File References or any task: src/customers/customers.controller.ts
  - Not in TECHSPEC.md File References or any task: src/customers/customers.module.ts
  - Not in TECHSPEC.md File References or any task: src/customers/customers.repository.ts
  - Not in TECHSPEC.md File References or any task: src/customers/customers.service.ts
  - Not in TECHSPEC.md File References or any task: src/health/health.controller.ts
  - Not in TECHSPEC.md File References or any task: src/notifications/notifications.listener.ts
  - Not in TECHSPEC.md File References or any task: src/notifications/notifications.module.ts
  - Not in TECHSPEC.md File References or any task: src/orders/dto/create-order.dto.ts
  - Not in TECHSPEC.md File References or any task: src/orders/orders.module.ts
  - Not in TECHSPEC.md File References or any task: src/payments/currency.ts
  - Not in TECHSPEC.md File References or any task: src/payments/payments.module.ts
  - Not in TECHSPEC.md File References or any task: src/payments/payments.service.ts
  - Not in TECHSPEC.md File References or any task: src/payments/webhooks.controller.ts
  - Not in TECHSPEC.md File References or any task: src/reports/reports.controller.ts
  - Not in TECHSPEC.md File References or any task: src/reports/reports.module.ts
  - Not in TECHSPEC.md File References or any task: src/reports/reports.service.ts
  - Not in TECHSPEC.md File References or any task: test/jest-e2e.json
  - Not in TECHSPEC.md File References or any task: tsconfig.build.json
  - Not in TECHSPEC.md File References or any task: tsconfig.json
- ✓ **security** (maverick) — pass
- ✓ **dependencies** (maverick, warn) — pass: 1 manifest(s), 1 lockfile(s) changed
- ✗ **diff-review** (maverick, warn) — fail
  - Security: sensitive-looking path changed; confirm secrets and PII were not included.
  - Dependencies: lockfile changed; review new packages, licenses, and vulnerabilities.
- … **human-review** (approval) — pending: record it in REVIEW.md or run maverick flow approve ship add-cursor-pagination-orders-endpoint human-review
  - awaiting approval: A human reviews the change and records the decision.
