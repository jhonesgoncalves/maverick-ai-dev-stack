---
name: maverick-status
description: Shows where every Maverick task stands and which flow skill to use next, and changes the project languages for documents and code. Use when the user asks what's next, the status of a Maverick task, how the Maverick flow works, or wants to change the language of the specs or of the code.
version: 1.3.0
tags: [maverick, status, workflow, language]
---

# Maverick status

The Maverick flow runs inside your agent. Every step is a skill:

| Stage | Skill | Produces |
|---|---|---|
| Idea → plan | `maverick-new` | Runs the planning skills below, in order |
| PRD | `maverick-prd` | `PRD.md`: what and why, with `AC-NN` acceptance criteria |
| SPEC (spec-driven) | `maverick-spec` | `SPEC.md`: scenarios, contracts and invariants, approved with `maverick flow run spec <slug>` |
| TECHSPEC | `maverick-techspec` | `TECHSPEC.md`: how, grounded in real files |
| TASKS | `maverick-tasks` | `subtasks/`: a dependency graph of tasks |
| BUILD | `maverick-build` | The code, one task at a time |
| VERIFY / REVIEW | `maverick-review` | Evidence, findings, REVIEW.md, and the human's decision |
| PR | `maverick-ship` | Readiness and the pull request |
| Update | `maverick-sync` | Newer flow skills, and an older task brought to the current format |

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## Where things stand

```bash
maverick status --json
maverick instructions <slug> --json
```

`status` lists each task with its `stage` and next step. `instructions` returns the `skill` to use now. Tell the user in one line per task, then ask in the answer selector which task to continue, with its skill, recommending the most advanced one first.

## Languages

The project has two languages:

- `language.docs`: the PRD, technical spec, tasks and review, and the conversation with the user;
- `language.code`: identifiers, comments, test names, log and error messages, and commits.

To show or change them:

```bash
maverick language                 # show both
maverick language pt-BR en        # documents in Portuguese, code in English
maverick language --code pt-BR    # change only one
```

Section headings are localized (English, Portuguese, Spanish) and the validator accepts any of them, so documents that already exist keep validating after a change.

## Start something new

For a new idea, use the maverick-new skill. It runs `maverick new "<idea>"`, which creates the task and grounds the idea in the code.
