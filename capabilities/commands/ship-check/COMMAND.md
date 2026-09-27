---
name: ship-check
description: Runs every Maverick evidence gate for a task and summarizes what still blocks a human merge decision. Use when a change looks finished.
version: 1.0.0
argument-hint: <task-slug>
tags: [maverick, verification, readiness]
---

Prepare the Maverick task `{{ARGUMENTS}}` for a human merge decision. Run each command, continuing even if one fails, and read the report it writes:

```bash
maverick verify {{ARGUMENTS}}
maverick guard {{ARGUMENTS}}
maverick security {{ARGUMENTS}}
maverick deps {{ARGUMENTS}}
maverick review {{ARGUMENTS}} --diff
maverick readiness {{ARGUMENTS}}
```

Summarize: which gates passed (quote the evidence), which failed and why, and what the human must still decide. Do not mark the review decision in REVIEW.md yourself.
