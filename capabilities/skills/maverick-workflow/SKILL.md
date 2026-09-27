---
name: maverick-workflow
description: Runs AI-assisted changes through the Maverick workflow of scoped task, context, plan, verification evidence and human review. Use when starting, implementing, verifying or handing off a change in a repository that has a .maverick directory or when the user mentions Maverick.
version: 1.0.0
tags: [maverick, workflow, verification, review]
---

# Maverick workflow

Maverick keeps AI-assisted changes explainable, verified and reviewable. The CLI writes plain Markdown artifacts under `.maverick/tasks/<task>/`; you fill them and act inside their scope.

## Start a task

1. Run `maverick stack` to learn the languages, frameworks and the exact verification commands for this repository.
2. Create the task: `maverick task <slug> --preset <lightweight|standard|spec-driven|strict-review>`. Use `maverick suggest --risk high` when unsure which preset fits.
3. Fill `TASK.md` (problem, goal, acceptance criteria, in/out of scope, verification) and `CONTEXT.md` (relevant paths, constraints, do-not-touch). Ask the human about anything that would change behavior.
4. Run `maverick validate <slug>` until required sections are present.

## Implement

- TASK.md is the contract: do not expand scope, add dependencies, or change public contracts without explicit permission.
- Work criterion by criterion; run the narrowest relevant check after each step.
- Use `maverick impact <path>` before changing shared files.

## Verify and review

Run these and read every report before claiming the work is done:

```bash
maverick verify <slug>
maverick guard <slug>
maverick security <slug>
maverick deps <slug>
maverick review <slug> --diff
maverick readiness <slug>
```

Never claim a check passed unless `EVIDENCE.md` shows it. `readiness` stays NOT READY until a human records a decision in `REVIEW.md`; Maverick never merges.

## Workflow references

Read the matching reference for the kind of change:

- [Feature](references/feature.md)
- [Bugfix](references/bugfix.md)
- [Refactor](references/refactor.md)
- [Migration](references/migration.md)
- [Code review](references/code-review.md)
