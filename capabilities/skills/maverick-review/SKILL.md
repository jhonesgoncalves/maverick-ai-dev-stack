---
name: maverick-review
description: Verifies and reviews a built Maverick task by running every evidence gate (checks, scope, security, dependencies, diff) and reviewing the diff against each PRD acceptance criterion and the technical spec, then helps the human record a decision in REVIEW.md. Use after maverick-build, or when the user asks to verify, review or check a Maverick task.
version: 1.2.0
tags: [maverick, verification, review, security]
---

# Maverick review

You prove the change works and lay out the evidence a human needs to decide. You never make the merge decision yourself.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Load the task

```bash
maverick instructions <slug> --json
```

Write and speak in `language.docs`. When `workflow` is `strict`, the security gate is mandatory.

## 2. Run the gates

Run each gate and read the report it writes. Keep going when one fails.

```bash
maverick verify <slug>        # lint, typecheck, tests, build → EVIDENCE.md
maverick guard <slug>         # diff vs TECHSPEC File References and task Files → SCOPE-GUARD.md
maverick security <slug>      # high-signal patterns in the diff → SECURITY-REPORT.md
maverick deps <slug>          # manifests and lockfiles → DEPENDENCY-REVIEW.md
maverick review <slug> --diff # blast radius and findings → REVIEW-FINDINGS.md, and REVIEW.md
```

`REVIEW.md` is written from the PRD's acceptance criteria and the tasks, in the project's language.

## 3. Review the diff yourself

Read `git diff`, `PRD.md`, `SPEC.md` when the task is spec-driven, and `TECHSPEC.md`. In a spec-driven task, also check that every scenario (`SC-NN`) has a passing test and that the implemented contracts match SPEC.md exactly. For each acceptance criterion (`AC-NN`):

- Is it implemented?
- Which test proves it?
- Did that test run and pass, according to `EVIDENCE.md`?

Then check:

- **Scope:** only the files the spec and the tasks list, with no drive-by refactors.
- **Behavior on the edge cases in the PRD.**
- **Security:** input validation, authorization, secrets.
- **Reliability.**
- **Readability for the next maintainer.**

Report only actionable findings. For each one, give:

- its severity: blocker, important or suggestion;
- the file and line;
- a concrete failure scenario;
- the smallest fix.

Never say a check passed unless it ran.

## 4. Fill REVIEW.md, except the decision

In `REVIEW.md`:

- Tick the criteria, tasks and checks you verified, each with its evidence.
- Write your findings under the findings heading.
- Leave the decision checkboxes and the human explanation empty.

Then ask the user to decide in the answer selector: approve, approve with follow-up, or request changes, with your recommendation first. If they ask for changes, go back to the maverick-build skill. When they decide, they tick the box themselves, or tell you which one to tick.

When the decision is recorded, suggest the maverick-ship skill.
