---
name: maverick-new
description: Starts a new feature, fix or refactor from a plain idea and takes it through the Maverick planning pipeline, PRD then (for spec-driven work) an approved behavioral spec, then technical spec then task graph, grounded in the code and written in full. Use when the user describes something to build or change, says "new feature", "start a task", "plan this", "write a PRD/spec", or runs maverick new.
version: 2.3.0
tags: [maverick, planning, prd, spec, sdd, techspec, tasks]
---

# Maverick: from idea to ready-to-build tasks

You take one idea through three stages, or four when the workflow is `spec-driven`. Each stage has its own skill and produces one artifact:

| Stage | Skill | Writes |
|---|---|---|
| 1. Product | `maverick-prd` | `PRD.md`: what and why, user stories, requirements with scenarios, acceptance criteria |
| 1b. Behavior (spec-driven only) | `maverick-spec` | `SPEC.md`: exact scenarios (`SC-NN`), contracts, states, invariants and errors, traced to every criterion and approved by a human |
| 2. Technical | `maverick-techspec` | `TECHSPEC.md`: how, grounded in real files, with a test plan and a build order |
| 3. Breakdown | `maverick-tasks` | `subtasks/`: 3 to 7 dependency-ordered tasks, each with its criteria, files and verification |

**Planning only.** Write under `.maverick/tasks/<slug>/` and nowhere else. Never edit source code, tests or configuration in this workflow.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## Start

If you were given an idea and no task exists yet, create it. If you have no idea yet, ask the user what they want to build (a free-text question: offer 2 or 3 likely ideas from the repository as options). Your shell has no TTY, so the command only creates the task and does not open another agent:

```bash
maverick new "<the idea, in the user's words>"
```

Add `--spec` when the user asks for SDD or spec-driven development, or when the idea defines an API, an integration, an event or another contract that other people or systems depend on. Add `--strict` for security, data, payment or migration work. Without a flag Maverick picks the workflow from the idea and says why.

The command prints the slug. If you were given a slug, or `maverick new` already ran and launched you, use that task. Then read the current state:

```bash
maverick instructions <slug> --json
```

- `stage` tells you where to resume.
- `grounding` lists the files, tests and entry points the idea most likely touches.
- `workflow` is `strict` for security, data, payment or migration work, and `spec-driven` when SPEC.md sits between the PRD and the technical spec.
- `stages` lists the planning stages of this workflow, in order. Run exactly those.
- `language.rule` sets the language: talk to the user and write every artifact in `language.docs`; code and test names go in `language.code`. To change it, run `maverick language <docs> [code]`.

## Run the stages

For each stage, starting from `stage`:

1. Follow its skill fully: read `maverick instructions <slug> <stage> --json`, research, ask, write, and validate with `maverick validate <slug> --stage <stage>`.
2. Show the user a short summary: 5 to 10 lines, with the decisions you took and the open questions.
3. Ask in the answer selector: continue to the next stage (Recommended), or adjust this one. Do not start the next stage until the user says so.

Always re-read earlier artifacts from disk before a stage, because the user may have edited them.

In a `spec-driven` task, the spec stage ends with the spec gate (`maverick flow run spec <slug>`). Do not start the technical spec until a human has approved SPEC.md.

## Finish

When `maverick validate <slug>` passes, show the task graph with `maverick subtask list <slug>` and list what is still open. Then offer the next steps of the flow, each run from here as its own skill:

1. `maverick-build`: implement the tasks one at a time.
2. `maverick-review`: run the evidence gates, review the diff and record the human decision.
3. `maverick-ship`: check readiness and write the pull request.

Start building only when the user says so.
