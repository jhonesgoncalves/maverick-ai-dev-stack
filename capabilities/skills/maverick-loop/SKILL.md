---
name: maverick-loop
description: Runs and supervises a bounded Maverick loop on a planned task, where the harness (not the agent) decides every iteration with its gates, an integrity guard, a ratchet that rolls back regressions and, optionally, an independent judge from another model family. Use when the user says loop, keep going until it passes, run it unattended, build all the subtasks on its own, or asks why a loop stopped.
version: 1.0.0
tags: [maverick, loop, automation, verification]
---

# Maverick loop

You start, watch and unblock `maverick loop`. The loop gives one subtask at a time to an agent with a fresh context, then Maverick decides the iteration itself: it audits the diff for weakened checks, runs the gates, keeps what makes nothing worse as a checkpoint and rolls back the rest. Budgets, an escalation ladder (more reasoning, then another vendor) and a human end every loop, and a hash-chained ledger records every decision.

You never make the loop pass. Maverick decides; the user decides what Maverick cannot.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Budget", "Isolation" or "Next step".
- Use the selector for confirmations and decisions too: start or adjust, resume or start over, accept or reject a judge's call.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Check the preconditions

```bash
maverick status <slug>
maverick agent list
maverick loop run <slug> --dry-run
maverick integrity <slug> --oracle
```

- The task is planned: PRD, technical spec and subtasks exist and `maverick subtask validate <slug>` passes. If not, use maverick-new first.
- The project is a git repository with a commit. Uncommitted changes are fine in place (they become the baseline), but say so.
- At least one provider is trusted (`maverick agent trust <id>`). For the judge, a second provider from another model family must be trusted too.
- The dry run shows the oracle gates, the budget, the escalation ladder and the first prompt. `integrity --oracle` shows what the loop will protect.

## 2. Agree the contract

Ask, one question at a time, only what the configuration does not already answer:

- **Isolation:** in place (default; your checkout, hidden checkpoint refs, do not edit files while it runs) or `--worktree` (its own branch outside your checkout; needs `loop.setup`, for example `npm ci`).
- **Budget:** `--max-iterations`, `--max-minutes`, `--max-cost`, `--max-tokens`. Recommend a small first budget, such as 6 iterations.
- **Judge:** `--judge` asks a reviewer from another model family to accept each subtask and the whole change. It costs more and catches work that passes the checks without meeting the criteria.
- **Integrity level:** `standard` unless the user wants `strict`.
- **Sealed tests:** if `.maverick/tasks/<slug>/SEALED.json` exists, the loop is done only when the hidden suite passes too. For a spec-driven or strict task without one, suggest `maverick seal <slug>` first: an agent from a model family no builder belongs to writes acceptance tests the builder never sees. The user reads them with `maverick seal status <slug> --reveal` in their own terminal and approves with `maverick seal approve <slug>`.

## 3. Start it and watch it

Prefer a terminal of its own, because a loop can run for a long time:

```bash
maverick loop run <slug> --max-iterations 6 [--worktree] [--judge]
maverick loop status <slug>
maverick loop log <slug>
```

The user can also follow it in Lens (`maverick lens`, then Loops), and stop it there or with `maverick loop stop <slug>`.

## 4. When it stops

Read `.maverick/tasks/<slug>/LOOP.md` and, for anything but done, `LOOP-ESCALATION.md`. Then offer the user the choices that fit:

- **done:** review the change (`git diff`, or `git diff main...maverick/loop/<slug>` for a worktree loop), then run maverick-review and maverick-ship. Nothing was committed to the user's branch.
- **budget-exceeded:** continue with a higher budget, for example `maverick loop run <slug> --max-iterations 10`.
- **stalled-escalated / needs-human:** summarize the diagnosis and what was tried, ask the user for guidance, then `maverick loop run <slug> --resume --note "<their guidance>"`.
- **disputed:** the agent says a check is wrong. Show the dispute and let the user decide: fix the check themselves, or resume with a note that the check stands.
- **judge undecided:** the judges disagreed. Show `JUDGE-*.md` and let the user decide; a human decision is recorded with `maverick flow approve`.
- **holdout-gap:** every visible check passes, the sealed tests do not. Show the overfitting index from `LOOP-ESCALATION.md` and ask the user to read the tests in their own terminal (`maverick seal status <slug> --reveal`). Then they choose: resume with a note that describes the missing behavior (`--resume --note "..."`), reseal if a test is wrong, or finish without the holdout (`--resume --sealed off --note "<why>"`).
- **integrity-violation:** something rewrote history, refs or the ledger. Run `maverick loop verify <slug>`, show the result, and only then suggest `--new`.

If `LOOP.md` lists quarantined notes or a tainted checkpoint, tell the user: an iteration was kept despite integrity warnings. Releasing the notes (`maverick loop release <slug>`) is their decision.

## Rules for you

- Never edit, skip or weaken a test, a check, the flow or the configuration to unblock a loop.
- Never lower the integrity level, raise a budget, trust a provider or resume after an integrity finding without the user's explicit decision.
- Disputes and judge disagreements are decided by the user, not by you.
- Never read sealed tests: do not run `maverick seal status --reveal` or `maverick unseal`, and do not look in `$MAVERICK_HOME/vault`. They exist so that no agent sees them. Never put what a sealed test checks into a `--note`; describe the behavior the user asks for. `--sealed off` only on the user's explicit decision.
- Never commit, push, merge or delete the loop's branch or refs on your own; `maverick loop clean` only on request.
