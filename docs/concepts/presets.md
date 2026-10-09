# Workflow presets

Maverick has one core workflow: intent, context, plan, build, verification, review, and PR. Presets choose the right amount of ceremony for a task; they do not create separate frameworks.

| Preset | Pipeline | Use when | Avoid when |
|---|---|---|---|
| `standard` | PRD → TECHSPEC → tasks → build → verify → review → PR | A normal feature, fix or refactor in an existing codebase | The work defines a shared contract or has unusually high risk |
| `spec-driven` | PRD → **SPEC (approved)** → TECHSPEC → tasks → build → verify → review → PR | APIs, integrations, shared contracts, complex domain rules, or stakeholders who must agree on behavior first | A small, obvious local change |
| `strict` | PRD → TECHSPEC → tasks → build → verify → **security** → review → PR | Sensitive code, data, security, payments, migrations, or shared infrastructure | A low-risk local change |

`standard` is the default. Choose per task with `maverick new "<idea>" --spec`, `--strict` or `--workflow <id>`; without a flag, `maverick new` picks `strict` for risky ideas and `spec-driven` for contract ideas. Each task stores its choice in `TASK.json`; older tasks without it are treated as Standard. See [spec-driven development](spec-driven.md).

Review-driven always: every preset includes a human review.
