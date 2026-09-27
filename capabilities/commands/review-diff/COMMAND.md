---
name: review-diff
description: Reviews the current diff against a Maverick task and reports actionable findings with severity. Use before asking a human to approve a change.
version: 1.0.0
argument-hint: <task-slug>
tags: [maverick, review]
---

Review the current changes for the Maverick task `{{ARGUMENTS}}`.

1. Run `maverick review {{ARGUMENTS}} --diff` and read `.maverick/tasks/{{ARGUMENTS}}/REVIEW-FINDINGS.md`.
2. Read `TASK.md` and `CONTEXT.md`, then inspect the diff with `git diff`.
3. Check, in order: scope, behavior against each acceptance criterion, tests, security, reliability, maintainability.

Report only actionable findings. For each: severity (blocker, important or suggestion), file, a concrete failure scenario, and the minimal fix. Conclude with APPROVE, REQUEST CHANGES or NEEDS CONTEXT. Never claim a test passed unless you ran it.
