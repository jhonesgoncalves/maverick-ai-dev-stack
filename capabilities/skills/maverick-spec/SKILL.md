---
name: maverick-spec
description: Writes the behavioral spec of a spec-driven Maverick task (SPEC.md), the stage between the PRD and the technical spec. It turns every AC-NN acceptance criterion into precise WHEN/THEN scenarios, exact contracts (requests, responses, events, signatures), states and data, invariants and errors, with a traceability table, and gets the spec approved before any design starts. Use for the spec stage of maverick new with workflow spec-driven, or when the user asks for SDD, spec-driven development, a behavioral spec, an API contract or a SPEC.md.
version: 1.1.0
tags: [maverick, planning, spec, sdd, contracts]
---

# Maverick behavioral spec (SDD)

In spec-driven development the spec is the source of truth. The PRD says **what** and **why**, SPEC.md says **exactly how the system behaves from the outside**, and TECHSPEC.md says **how it is built**. Code and tests are written against SPEC.md, and a change of behavior changes SPEC.md first.

A good spec is testable without reading the code: every scenario can become a test, every contract can become a type or a schema, and nothing about the internal design appears in it.

**Planning only.** You write `.maverick/tasks/<slug>/SPEC.md` and nothing else.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Load the task

```bash
maverick instructions <slug> spec --json
```

Read `PRD.md` in full. Its acceptance criteria (`AC-NN`) are what this spec makes precise. The `grounding` block lists the entry points, the public contracts and the tests around the behavior. If `SPEC.md` already exists, revise it: keep what is still right, including human edits.

## 2. Read the contracts that exist today

Before you specify, read:

- the entry points in `grounding.routes` and the handlers behind them;
- the types, DTOs, schemas and serializers of the requests, responses and events the PRD touches;
- the error shapes and codes the codebase already uses, and how validation failures are reported;
- the tests that pin the current behavior.

A new contract follows the conventions of its neighbors: naming, casing, pagination, error envelope, versioning. When two conventions conflict, say so and pick one, with the reason.

## 3. Specify the behavior

Follow [the spec format](references/spec-format.md):

- **Behavior:** each behavior is a `### Requirement: <name>` saying what the system SHALL or MUST do, with numbered scenarios `#### Scenario: SC-01 <name>` and `- **GIVEN** …`, `- **WHEN** …`, `- **THEN** …` lines. Use concrete values ("3 orders, `limit=2`"), never "some" or "valid". Cover the happy path, each edge case from the PRD, and each error.
- **Contracts:** the exact shapes, written as code: HTTP method and path with request and response bodies, event payloads, CLI flags, or function signatures. Mark each one `(new)`, `(changed)` or `(unchanged)`, and say whether the change is backward compatible.
- **States and Data:** the entities the behavior reads or writes, their fields and constraints, and the allowed state transitions (`draft → published`, never `published → draft`).
- **Invariants:** what must always hold, whatever the input or the order of calls. Write "None" only when that is true.
- **Errors:** a table of condition → status or error code → message → whether it is retryable.
- **Traceability:** a table mapping every `AC-NN` of the PRD to its scenarios and contracts. Every criterion appears; a criterion with no scenario means the spec is incomplete.
- **Open Questions:** `question → assumption taken`, or "None".
- **Approval:** end the file with `## Approval` and an unchecked `- [ ] Spec approved`. Only a human checks it.

Ask the user only about behavior the PRD and the code leave open, one question at a time with your recommendation first. Never ask about implementation: that belongs in the technical spec.

## Language

Write SPEC.md in `language.docs`, with the headings from `focus.sections` and the requirement keywords from `language.keywords`. Contracts, field names and error codes follow `language.code` and the codebase. Ids stay as they are: `AC-01`, `SC-01`.

## 4. Validate

```bash
maverick validate <slug> --stage spec
```

Fix every failure by improving the content:

- a requirement without a scenario, or a scenario without WHEN and THEN;
- an `AC-NN` the PRD does not define;
- a criterion missing from Traceability;
- Contracts without a code block.

## 5. Get the spec approved

The spec is a contract, so a human approves it before the technical spec is written. Show the user a 5 to 10 line summary: the contracts that change, the scenarios that are new, the compatibility impact and the open questions. Then run the spec gate:

```bash
maverick flow run spec <slug>
```

It checks the sections and the validation, then waits for approval. The human approves by checking `- [x] Spec approved` at the end of SPEC.md, or with `maverick flow approve spec <slug> spec-approval`. Do not start the technical spec until the gate passes. If the user asks for changes, revise SPEC.md and run the gate again.
