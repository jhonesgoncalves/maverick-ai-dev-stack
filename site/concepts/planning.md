# Planning

<p class="mv-kicker">CONCEPT · HOW IT IS BUILT HERE, AND IN WHAT ORDER</p>

A plan records the approach, the files, the tests, the order of work, the risks and the way back, **before** the code changes. In Maverick the plan is two artifacts: `TECHSPEC.md`, which says how the change is built in *this* codebase, and the task graph in `subtasks/`, which splits it into small, shippable pieces.

<ConceptMap current="planning" />

## Why it matters

Reviewing a design is cheap. Reviewing a design by reading 600 lines of diff is expensive, and by then the agent has already committed to it. A plan moves the important decisions to the point where changing your mind costs a sentence, not a rewrite:

| Without a plan | With a plan |
|---|---|
| The approach is discovered in the diff | The approach and the rejected alternatives are written down |
| "Which files will this touch?" is answered after the fact | File References list them up front, and `guard` holds the diff to them |
| Tests are whatever the agent felt like writing | The Test Plan maps every test to an acceptance criterion |
| One giant change | 3 to 7 tasks, each with its own tests and verification |
| No way back | Risks and Rollback say how to undo it |

## How Maverick writes it

After the PRD, the agent moves to two skills, each asking before the next starts:

- **`maverick-techspec`** reads the grounded files, records how the code works today with `path:line` references, proposes an approach, lists the alternatives it rejected, and maps every acceptance criterion to a test.
- **`maverick-tasks`** splits the spec only at a dependency, a parallel boundary or a domain boundary, so every task ships its own tests and every acceptance criterion is covered by at least one task.

## Anatomy of TECHSPEC.md

| Section | Holds |
|---|---|
| Summary, Current State | The approach in brief, and how the code works today with `path:line` references |
| Approach | The chosen design and the alternatives rejected, with why |
| File References | Real paths to change; new files are marked `(new)` |
| Interfaces and Data, Impact | Signatures, payloads, storage, and what else is affected |
| Test Plan | Each test mapped to a criterion, such as `UT-01 → AC-01` |
| Build Order, Risks and Rollback | The sequence of changes and how to undo them |
| Commands, Do Not Touch | Verification commands, and the files that stay unchanged |

```md
## Current State
`OrdersController.list` (src/orders/orders.controller.ts:42) returns every order;
`OrdersService.findAll` (src/orders/orders.service.ts:18) has no limit.

## Approach
Keyset pagination on (createdAt, id), fetching limit + 1 to detect the next page.
Rejected: offset pagination (skips and duplicates rows under concurrent inserts).

## File References
- src/orders/dto/list-orders.dto.ts
- src/orders/orders.service.ts
- src/orders/cursor.ts (new)

## Test Plan
- UT-01 → AC-01: limit=2 with 3 orders returns 2 items and a nextCursor
- UT-02 → AC-02: a malformed cursor returns 400 invalid_cursor
```

## Try it: follow the trace

A plan is only as good as its links. Every story has criteria, every criterion has a test and a task. Hover a node to follow its chain, then break a link to see what `maverick validate` reports.

<TraceGraph />

## The task graph

`maverick-tasks` writes `subtasks/_tasks.md`, the dependency graph, and one `task_NN.md` per task. Acceptance Criteria, Steps and Verification are **checklists**, and the build skill checks each item as it is done, so the task file is always an exact record of progress:

```md
---
title: Keyset query in the service
status: in-progress
type: backend
complexity: medium
---

# Keyset query in the service

## Goal
List orders a page at a time, ordered by (createdAt, id).

## Acceptance Criteria
- [x] AC-01: limit=2 with 3 orders returns 2 orders and a nextCursor

## Files
- `src/orders/orders.service.ts` — keyset branch in `findAll`

## Steps
- [x] Add `cursor` and `limit` to `findAll`.
- [ ] Branch on cursor: keyset on (`createdAt`, `id`), fetching `limit + 1`.

## Verification
- [ ] UT-01: `limit=2` with 3 orders returns 2 items and a `nextCursor`
```

Dependencies live in the frontmatter of `_tasks.md` (`nodes` and `edges`), and each task's status in its own frontmatter. The `type` and `complexity` fields also let [headless runs](/concepts/human-in-the-loop#headless-agents) route a task to a different agent or model.

`maverick subtask set <task> 02 done` refuses while an item is unchecked and lists the open ones. `maverick subtask next` shows the next ready task (its dependencies done), and `maverick subtask list` shows progress such as `3/7`.

## How big is a task?

<div class="mv-anatomy">
  <div class="bad"><b>Too fine</b><span>"Add the import", "add the parameter", "write the test". Tasks without their own tests cannot be verified alone.</span></div>
  <div class="bad"><b>Too coarse</b><span>"Implement pagination". One task, twelve files, no checkpoint where a human can say stop.</span></div>
  <div class="good"><b>Right size</b><span>"Cursor DTO and validation", "Keyset query in the service", "Wire the endpoint and e2e test". Each ships with tests and can be reviewed alone.</span></div>
  <div class="good"><b>Split on a boundary</b><span>Split where one piece depends on another, where two can run in parallel, or where the domain changes. Not by file count.</span></div>
</div>

## Plans change

A plan is the best reading of the evidence *before* the build. When the build finds new evidence, a function that does not exist, a test that reveals a different contract, the plan should change, visibly:

1. Stop the build at the current subtask.
2. Update `TECHSPEC.md` (Approach, File References, Test Plan) and the affected `task_NN.md`.
3. Run `maverick validate <task>` so the trace is still whole.
4. Tell the reviewer in `REVIEW.md` Findings what changed and why.

`maverick guard` compares the diff with the File References, so a plan that is not updated shows up as out-of-scope changes at review.

## Common mistakes

- **Treating a plan as a promise** when new evidence invalidates it. Update it instead of working around it.
- **File References that do not exist.** The validator flags any path that is missing and not marked `(new)`.
- **A Test Plan that does not cite criteria.** "Add unit tests" is not a plan. `UT-01 → AC-01` is.
- **Forgetting rollback.** Migrations, feature flags and contract changes need a written way back.
- **An empty Do Not Touch.** Name the files and modules that must stay unchanged, especially shared ones.

## Checklist

- [ ] Current State cites real `path:line` references
- [ ] Approach names at least one rejected alternative, and why
- [ ] Every acceptance criterion has a test in the Test Plan
- [ ] Every acceptance criterion is covered by at least one task
- [ ] Each task has its own Verification
- [ ] Risks and Rollback say how to undo the change
- [ ] `maverick validate <task>` passes

## Commands

| Command | Does |
|---|---|
| `maverick validate <task> --stage techspec` | Checks headings, grounding (paths exist) and the Test Plan |
| `maverick validate <task> --stage tasks` | Checks criteria coverage and task Verification |
| `maverick subtask list <task>` | Shows the graph and each task's progress |
| `maverick subtask next <task>` | Shows the next ready task and its open items |
| `maverick subtask validate <task>` | Checks the graph for cycles and unknown dependencies |
| `maverick generate <task> techspec --agent <provider>` | Writes the spec headlessly |

## Next

<div class="mv-cards">
  <a href="./verification"><b>Verification →</b><span>Build one subtask at a time and prove each one works.</span></a>
  <a href="../guide/planning#techspec"><b>From idea to tasks</b><span>The full planning pipeline, step by step.</span></a>
</div>
