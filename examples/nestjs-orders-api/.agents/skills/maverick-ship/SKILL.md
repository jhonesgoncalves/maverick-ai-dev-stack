---
name: maverick-ship
description: Finishes a reviewed Maverick task by checking merge readiness and writing an evidence-backed pull request description, then, once the user approves the draft, opening the pull request on the repository's git provider with the pr flow, and finishing the task after it merges. Use after maverick-review, or when the user says ship, open the PR, or wrap up a Maverick task.
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
maverick flow run pr <slug>
```

The `pr` flow checks the review decision and readiness, then writes `PR-DRAFT.md` from the PRD overview, the evidence and the technical spec's rollback, and stops at its `approval` gate (it exits non-zero with `awaiting-approval`; that is expected). The draft's heading is the pull request's title and the rest its description. Improve it in `language.docs`, keeping the heading and the `## Human Review` checkbox:

- **Title:** the heading, a short imperative summary of the change.
- **Summary:** what changed and why, taken from PRD.md.
- **Acceptance criteria:** each `AC-NN`, with the test that proves it.
- **Verification:** the commands that ran and their results, from EVIDENCE.md.
- **Risks and rollback:** taken from TECHSPEC.md.
- **Reviewer notes:** anything the human flagged in REVIEW.md.

The flow keeps an existing draft, so running it again never discards your edits.

## 3. Open the pull request, only once the user approves the draft

Opening the pull request commits the change, pushes a branch and publishes it on the provider. Ask the user to read `PR-DRAFT.md` and approve it, with the answer selector. Never approve it yourself unless the user says so. The user approves in Lens (**Record your decision**) or you run, on their explicit answer:

```bash
maverick flow approve pr <slug> approval --by "<their name>"
```

Approving runs the flow's `open` gate: Maverick finds the provider from the `origin` remote (GitHub with `gh`, GitLab with `glab`, Azure DevOps with `az repos`, Bitbucket), moves the change to `maverick/<slug>` when it is on the base branch, commits everything outside `.maverick/` with the draft's title through the repository's hooks, pushes without force, and opens the pull request, or reuses the one already open for the branch. Without the provider's CLI it pushes the branch and gives the provider's page to open it by hand. If the gate fails (authentication, a hook, a rejected push), tell the user what failed and how to fix it, then run `maverick flow run pr <slug>` again.

If the project has turned on `flow auto-approve pr`, the flow opens the pull request in the same run once every other gate passes: say so before you run it.

Never merge, force-push or bypass branch protection.

### The proof receipt

If the repository signs proof receipts (`.maverick/proof-keys/` exists, or `proof.onPullRequest` is on), the `open` gate signs the commit it pushes and pushes the receipt in `refs/notes/maverick`. Otherwise, once the change is committed and only if the user asks, run `maverick proof sign <slug>` and tell them to share it with `git push origin refs/notes/maverick`. `maverick proof verify <slug> --commit HEAD` checks it. Never sign with a key the user did not set up, and never sign before the review decision is recorded.

## 4. Finish the task after it merges

Tell the user where the pull request is and what a reviewer should look at first. Once it has merged, and only when the user confirms it, finish the task:

```bash
maverick done <slug> --by "<their name>"
```

`maverick reopen <slug>` undoes it.
