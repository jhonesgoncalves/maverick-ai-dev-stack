---
name: maverick-workflow
description: Runs AI-assisted changes through the Maverick workflow of scoped task, context, plan, verification evidence and human review. Use when starting, implementing, verifying or handing off a change in a repository that has a .maverick directory or when the user mentions Maverick.
version: 1.1.0
tags: [maverick, workflow, verification, review]
---

# Maverick workflow

Maverick keeps AI-assisted changes explainable, verified and reviewable. The CLI writes plain Markdown artifacts under `.maverick/tasks/<task>/`; you fill them and act inside their scope.

## Start a task

1. Run `maverick stack` to learn the languages, frameworks and the exact verification commands for this repository.
2. Create the task: `maverick task <slug> --preset <lightweight|standard|spec-driven|strict-review>`. Use `maverick suggest --risk high` when unsure which preset fits.
3. Fill `TASK.md` (problem, goal, acceptance criteria, in/out of scope, verification) and `CONTEXT.md` (relevant paths, constraints, do-not-touch). Ask the human about anything that would change behavior.
4. Run `maverick validate <slug>` until required sections are present.

## Break it down

For work with more than one step, create a subtask graph and follow it:

```bash
maverick subtask add <slug> "Add pagination to the API" --type backend
maverick subtask add <slug> "Render the paginated list" --after 01 --type frontend
maverick subtask next <slug> --json      # what is ready now
maverick subtask set <slug> 01 in-progress
maverick subtask set <slug> 01 done
```

Work only on subtasks reported as ready; dependencies are enforced.

## Implement

- TASK.md is the contract: do not expand scope, add dependencies, or change public contracts without explicit permission.
- Work criterion by criterion; run the narrowest relevant check after each step.
- Use `maverick impact <path>` before changing shared files.

## Verify with a flow

Flows run typed gates under a contract with an iteration cap and stall detection. Loop on the exit code, and obey the outcome:

```bash
maverick flow run fix-checks <slug>   # bounded fix loop for lint, typecheck and tests
maverick flow run ship <slug>         # every evidence gate up to the human decision
```

- `revise`: fix only the listed blocking issues, then run the flow again.
- `done` or `awaiting-approval`: stop and hand over to the human.
- `stalled` or `exhausted`: stop immediately and ask the human. Never pass `--reset` yourself.

## Individual gates

The same gates can be run one by one; read every report before claiming the work is done:

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
