# Memory

<p class="mv-kicker">CONCEPT · WHY EVERY LINE EXISTS</p>

`git blame` says who changed a line and when. It does not say why, under which criterion, proven how, or approved by whom. Agents delete old decisions because they cannot see them. Maverick already records every link of that chain while a task runs: the commit trailer, the loop checkpoint, the ledger, the judges, the sealed tests, the review. Memory is what reads it back, and what makes the next change respect it.

```bash
maverick why src/orders/orders.service.ts:88     # the chain behind one line
maverick why add-cursor-pagination --ac AC-02    # the reverse walk, from a criterion
maverick contract list                           # what finished tasks promised
maverick proposals                               # rules learned from the agents' mistakes
maverick attention add-cursor-pagination         # where the reviewer should look first
maverick graph --trend                           # architecture health over time
```

## Why a line exists

```text
$ maverick why src/orders/orders.service.ts:88
src/orders/orders.service.ts:88   if (!isOpaqueCursor(cursor)) throw new BadRequestException(…)
Commit    3f9a1c20e1 Ana 2026-10-12 · feat: cursor pagination for orders
Task      add-cursor-pagination  (PR #42, done 2026-10-12)
Intent    AC-02 The cursor is opaque to the client
Built     subtask 02 · loop 20261012-101500-ab12 · iteration 4 · codex gpt-6 (high) · accepted
Proven    checks PASS (checks, keep) · integrity clean · sealed 10/10 · ablation pass
Decided   judge claude (anthropic) 0.91 PASS · human review: approve
Guards    contract C-07 "The cursor is opaque to the client" · test tests/orders/cursor.sealed.spec.ts
```

`why` walks edges that already exist. Blame gives the commit, and its `Maverick task:` trailer (written by `maverick pr open`) the task. The iteration comes from blaming the current content against each of the task's loop checkpoint chains, so it is exact, not a text match. The iteration's ledger entries give the agent, model, effort, gates and integrity findings; the subtask names the criteria; the task's flows, judges, sealed suite and `REVIEW.md` give the decisions. When a link is missing (a repository with no Maverick history, checkpoints that were cleaned), `why` shows what it has and lists what it does not.

Agents can ask too: the MCP server's `why` tool returns the same chain, without author names and without what the loop's feedback policy withholds from a builder (integrity detections, holdout results, the judges' reasoning).

## Living contracts

What a task promised usually dies with it, and the next change cannot see it. When a task is finished with `maverick done`, its SPEC invariants and the criteria its committed sealed tests prove become contracts in `.maverick/contracts/C-NN.md`, anchored to the files that implement them, with an owner and a review date.

- An agent whose subtask touches an anchored file gets the contract in its prompt, as a constraint.
- The `contracts` gate of the `ship` flow (`maverick contract check <task>`) runs the contract's tests; the change must keep them passing, or its PRD must revoke the contract explicitly: `Revokes C-07: <the reason>`. A contract test that was deleted always fails.
- In CI, `maverick contract check --against origin/main` reports drift: an anchor changed outside a task. `--strict` makes untested drift a failure.
- A revocation in a task's PRD takes effect when the task is finished with `maverick done`.
- `maverick contract review <id>` confirms a contract still holds; overdue ones are listed by every check, so stale contracts surface instead of piling up.

## The error ratchet

Every time an agent gets something wrong, the harness should make that mistake harder next time. At the end of every loop, Maverick turns its rollbacks, judge rejections, escalations and disputes into proposals in `.maverick/proposals/`, one per failure class (for example `rollback:skip-or-only-added`), with the evidence: the ledger entry and the rejected diff (the detector's own wording stays in the ledger, out of files a later builder may read). Each proposal says what kind of fix it calls for: an AGENTS.md line, a lint rule, a skill, an integrity rule, or a question for the PRD.

A human decides: `maverick proposals accept <id> [--text "<rule>"] [--paths "<glob>,…"]`, or `reject <id> --reason`. Accepted `agents` and `skill` rules reach an agent's prompt **only when its subtask touches their paths** (lint, integrity and PRD proposals are for you to act on), because every line of instructions costs; `--agents-md` also keeps a managed block in `AGENTS.md` for tools that do not read Maverick's prompts. `maverick proposals stats` measures each rule: occurrences of its failure class per loop before and after it was accepted. A rule in force for five loops whose class recurs as often as before is flagged for pruning.

## The review budget

The reviewer is the bottleneck, and a complete PR draft does not say where to look. `maverick attention <task>` (the `review-budget` gate of the `ship` flow) scores every hunk of the diff from evidence Maverick already has: blast radius, hotspot, integrity warnings, a judge that was unsure or rejected the criterion the hunk serves, the sealed escape set (once a reviewer has opened the seal), and whether any test near it changed. It compares with the commit the task's newest loop started from, else where the branch left `pr.base` (or `main`/`master`), so committed work still counts. It writes `REVIEW-BUDGET.md` with the few hunks that carry most of the risk, a time range (never a promise), and a proof tree per criterion: criterion → files → tests → judges → verdict. Unless `loop.feedback` is `detailed`, the copy in the task (which a later loop's builder could read) leaves out detection kinds and the judges' evidence; the full copy is in `$MAVERICK_HOME/reports/`. `PR-DRAFT.md` gets a *Where to look* section.

## Grounding with memory

Grounding for a new change ranks files by what the description says, and now by what the repository remembers: files that earlier, similar tasks planned, files that usually change together with them in git history, and who knows them best (shown to you, never sent to an agent). Spanish stopwords join English and Portuguese.

## Health over time

Every `graph`, `coupling` and `audit` run records a snapshot of the graph (files, edges, cycles, hubs, boundary violations, health) in `.maverick/cache/graph/snapshots.jsonl`. `maverick graph --trend` shows health over time with the commit of each change.
