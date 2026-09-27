---
name: maverick-prd
description: Writes the PRD of a Maverick task (what to build and why, user stories, requirements with WHEN/THEN scenarios and AC-NN acceptance criteria) after researching the code and asking only the product questions the code cannot answer. Use for the first stage of maverick new, or when the user wants to write or revise a PRD or product requirements.
---

# Maverick PRD

The PRD is the behavior contract: what must be true when the work is done, for whom, and why. It says nothing about how it is built; that belongs to the technical spec.

**Planning only.** You write `.maverick/tasks/<slug>/PRD.md` and nothing else.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Load the task

```bash
maverick instructions <slug> prd --json
```

This returns:
- `idea`: the request, in the user's words.
- `workflow`: the workflow for this task.
- `grounding`: ranked relevant files with the reasons, nearby tests, matching entry points, shared modules and verification commands.
- `sections`: the headings the PRD must have.
- `path`: where the PRD goes.

If `PRD.md` already exists, read it and revise it instead of starting over.

## 2. Research before asking

Read the files in `grounding.relevant`, their tests and their callers. The ranking is a starting point, so also search the code for the words of the idea. Learn:

- what happens today, citing `path:line`;
- who calls this behavior and which contracts are public;
- the limits, defaults and validations that already exist.

Tell the user what you found in 3 to 5 bullets, keeping what you observed separate from what you assume.

## 3. Ask the product questions the code cannot answer

Follow [the question protocol](references/question-protocol.md):

- Ask one question at a time in the answer selector (see Asking the user), with your recommendation as the first option.
- Ask first about what unblocks the most decisions: scope, then behavior, then limits and permissions, then compatibility.
- Ask about behavior, not implementation. "What happens to an order created while someone is paging?" is a good question; "offset or cursor?" is not, because you decide that in the technical spec.
- Never ask what the code already answers.
- Stop when no remaining unknown would change the scope, the visible behavior or the acceptance criteria.

A small, clear idea may need one question or none. Say so, and record your assumptions.

## 4. Write PRD.md

Follow [the PRD format](references/prd-format.md). Write every section in full, with no placeholders. The essentials:

- **User Stories:** each is `### US-01: <title>`, then "As a … I want … so that …". Ids are never renumbered.
- **Requirements:** each behavior is a `### Requirement: <name>` saying what the system SHALL or MUST do. Each requirement has at least one `#### Scenario:` with `- **WHEN** …` and `- **THEN** …` lines.
- **Acceptance Criteria:** `- [ ] AC-01: Given …, when …, then … (US-01)`. Every requirement maps to at least one criterion, and every later artifact references these ids.
- **Edge Cases:** sweep invalid input, empty or missing data, limits, permissions, concurrency, interruption, repetition, ordering, state transitions and scale. Keep the cases that apply, written as `condition → expected behavior`.
- **Non-Goals:** anything the user rejected, and anything an eager implementer might add.
- **Open Questions:** write `question → assumption taken`, or "None".

## Language

`maverick instructions` returns `language`. Follow `language.rule`:

- Write the PRD and talk to the user in `language.docs`.
- Use the headings exactly as `focus.sections` gives them, already translated.
- Use the requirement keywords from `language.keywords`. In Portuguese, for example: `### Requisito:`, `#### Cenário:`, "o sistema DEVE", **QUANDO** and **ENTÃO**.
- Ids stay as they are: `US-01`, `AC-01`.

## 5. Validate

```bash
maverick validate <slug> --stage prd
```

Fix every failure by improving the content. If a finding is a false positive, say so instead of inventing text to satisfy the checker. Then summarize the PRD for the user in 5 to 10 lines.
