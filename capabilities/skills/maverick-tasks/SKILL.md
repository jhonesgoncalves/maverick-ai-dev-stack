---
name: maverick-tasks
description: Breaks a Maverick task's PRD and technical spec into a small dependency graph of implementation tasks, each with the acceptance criteria it satisfies, the real files it touches, its steps and its verification. Use for the third stage of maverick new, or when the user wants to split, break down or plan the implementation of a task that has a TECHSPEC.md.
version: 2.4.0
tags: [maverick, planning, tasks, breakdown]
---

# Maverick tasks

You turn the technical spec's Build Order into implementation tasks. Each task can be picked up by a person or an agent with no other context.

**Planning only.** You write `.maverick/tasks/<slug>/subtasks/` and nothing else.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Load the task

```bash
maverick instructions <slug> tasks --json
```

Read `PRD.md` (for the acceptance criteria), `SPEC.md` when the task is spec-driven (for the scenarios each task must make pass) and `TECHSPEC.md` (for the File References, the Test Plan and the Build Order). If tasks already exist and some have started, change only the pending ones.

## 2. Size the tasks

Follow [the task rules](references/task-format.md):

- **Prefer fewer, larger tasks.** A typical feature has 3 to 7; more than 10 means some should be merged.
- **Split only at a dependency, parallelisation or domain boundary**, for example backend then frontend. The number of files is never a reason to split.
- **Every task ships its own tests.** Never add a test-only task or a docs-only task at the end.
- **Complexity** (`low`, `medium` or `high`) rates implementation risk, not size.
- **Coverage:** every acceptance criterion is covered by at least one task, and every test case in the Test Plan belongs to exactly one task.

Before you write anything, show the user the proposed graph (titles, dependencies and criteria). Confirm it in the answer selector (write the graph (Recommended), or adjust it), then write it.

## 3. Write the graph

Create the tasks in dependency order:

```bash
maverick subtask add <slug> "Cursor helpers and query DTO" --type backend --complexity low
maverick subtask add <slug> "Keyset pagination in OrdersService" --type backend --complexity medium --after 01
```

Each command creates `subtasks/task_NN.md` and adds it to the checklist in `subtasks/_tasks.md`. Replace its body, below the frontmatter, with the task format: Goal, Acceptance Criteria, Files, Steps and Verification. Copy each task's file references and test ids from TECHSPEC.md, so the implementer does not have to search again.

Write every acceptance criterion, step and test as a `- [ ]` checklist item, one concrete item per line:

```markdown
## Steps
- [ ] Add `cursor` and `limit` to `ListOrdersDto` with class-validator.
- [ ] Branch `list`: keyset on (`createdAt`, `id`), fetching `limit + 1`.

## Verification
- [ ] UT-01: `limit=2` with 3 orders returns 2 items and a `nextCursor`
```

The build checks each item as it is done, and a task can only be marked done when every item is checked. Never check an item yourself: planning leaves every box empty.

## Language

Write task titles and bodies in `language.docs`, with the headings from `focus.sections`. File paths, identifiers and test names follow `language.code`.

## 4. Validate

```bash
maverick validate <slug>
```

This checks the whole pipeline:

- the graph is valid and acyclic;
- every task has a Verification section, and its Steps and Verification are checklists;
- every file a task references exists;
- no task references an unknown criterion;
- every criterion is covered.

Fix every failure. Then show the result with `maverick subtask list <slug>` and stop: implementation starts only when the user asks.
