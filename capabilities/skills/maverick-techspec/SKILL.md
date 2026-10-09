---
name: maverick-techspec
description: Writes the technical spec of a Maverick task (current state, chosen approach, real file references, interfaces, impact, a test plan traced to the PRD's acceptance criteria, and a build order) by reading the code the PRD touches. Use for the second stage of maverick new, or when the user wants a tech spec, design or implementation plan for a task with a PRD.
version: 2.3.0
tags: [maverick, planning, techspec, design]
---

# Maverick technical spec

The technical spec says how the PRD will be built in this codebase. Anyone should be able to implement it without exploring again, because the exploration is already done and recorded here.

**Planning only.** You write `.maverick/tasks/<slug>/TECHSPEC.md` and nothing else.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Load the task

```bash
maverick instructions <slug> techspec --json
```

Read the `PRD.md` it points to in full. The PRD's acceptance criteria (`AC-NN`) are the contract that this spec implements. When `upstream` also lists `SPEC.md` (workflow `spec-driven`), read it in full too: its contracts are fixed, so Interfaces and Data implements them exactly, and every scenario (`SC-NN`) gets a test. If the design needs a different contract, stop and change SPEC.md with the user first. The `grounding` block lists where to start reading: the ranked files, the tests, the entry points, the shared modules, the generated files, and the real verification commands.

## 2. Map the code

Read before you design:

- the files in `grounding.relevant` and the functions the PRD's behavior runs through;
- their callers, and the tests around them;
- the conventions next to where the change lands: naming, error handling, validation, test style;
- for every shared file you plan to change, run `maverick impact <path>` to see what else depends on it.

When two existing patterns conflict, say so and pick one, with the reason.

## 3. Settle the technical decisions

Most decisions are yours. Make them from the code, and record the alternative you rejected for each. Ask the user, one question at a time with your recommendation first, only about decisions that are theirs: a new dependency, a change to a public contract or schema, a data migration, or a trade-off that changes cost or risk. Never ask what the code answers.

## 4. Write TECHSPEC.md

Follow [the technical spec format](references/techspec-format.md). Write every section in full, with no placeholders:

- **Current State:** how it works today, citing `path:line`.
- **Approach:** the design you chose and the alternatives you rejected.
- **File References:** `` `path:lines` — why it matters ``, for every file to read or change. Every path must exist; mark a new file with `(new)`, placed next to its siblings.
- **Interfaces and Data:** real signatures, schemas and request or response shapes, written as code.
- **Impact:** a table of the files that change, their dependents and the risk.
- **Test Plan:** concrete cases with ids (`UT-01`, `IT-01`), each tracing to the criterion it proves, for example "`UT-01` → AC-01: `listOrders` returns `nextCursor` when more rows exist". In a spec-driven task also cite the scenario: "`IT-01` → AC-01 / SC-01".
- **Build Order:** the dependency-ordered steps that the tasks will follow.
- **Risks and Rollback:** `[Risk] → Mitigation`, then how to undo the change. For `workflow: strict`, add explicit security and data-safety invariants.
- **Commands** and **Do Not Touch:** the real commands, and the generated files and contracts that must not change.

## Language

Write TECHSPEC.md in `language.docs`, with the headings from `focus.sections`. Code snippets, identifiers and the names of the tests you plan are in `language.code`.

## 5. Validate

```bash
maverick validate <slug> --stage techspec
```

Fix every failure by improving the content:

- a path that does not exist;
- an acceptance criterion the Test Plan never proves;
- an `AC-NN` the PRD does not define.

Then summarize the design for the user in 5 to 10 lines.
