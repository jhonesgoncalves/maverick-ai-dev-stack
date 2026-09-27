---
name: maverick-ship
description: Finishes a reviewed Maverick task by checking merge readiness and writing an evidence-backed pull request description, then, only if the user asks, committing, pushing and opening the pull request. Use after maverick-review, or when the user says ship, open the PR, or wrap up a Maverick task.
---

# Maverick ship

You turn a reviewed task into a pull request a human can merge with confidence. Maverick never merges.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Check readiness

```bash
maverick instructions <slug> --json
maverick readiness <slug>
```

`readiness` lists the gates still outstanding in `MERGE-READINESS.md`, including the human decision in REVIEW.md. If anything is missing, name it, suggest the skill that closes it (maverick-review or maverick-build), and stop.

## 2. Write the pull request description

```bash
maverick pr <slug>
```

This writes `PR-DRAFT.md` from the PRD overview, the evidence and the technical spec's rollback. Improve it in `language.docs`:

- **Summary:** what changed and why, taken from PRD.md.
- **Acceptance criteria:** each `AC-NN`, with the test that proves it.
- **Verification:** the commands that ran and their results, from EVIDENCE.md.
- **Risks and rollback:** taken from TECHSPEC.md.
- **Reviewer notes:** anything the human flagged in REVIEW.md.

## 3. Commit, push and open the pull request, only on request

Committing, pushing and opening a pull request change shared state. Do each one only when the user explicitly asks for it:

- Write the commit message in `language.code`, and use the repository's existing commit convention (check `git log`).
- Open the pull request with the repository's tooling, for example `gh pr create --body-file .maverick/tasks/<slug>/PR-DRAFT.md`.
- Never merge, force-push or bypass branch protection.

Finish by telling the user where the PR is and what a reviewer should look at first.
