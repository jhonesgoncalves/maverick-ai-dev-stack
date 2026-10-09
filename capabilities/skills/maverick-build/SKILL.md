---
name: maverick-build
description: Implements a planned Maverick task one ready subtask at a time, following each task file's acceptance criteria, files, steps and verification, and keeping the task graph up to date. Use after maverick-tasks, or when the user says build, implement, code or start the next task of a Maverick task.
version: 1.3.0
tags: [maverick, build, implementation]
---

# Maverick build

You implement the task graph that `maverick-tasks` wrote, one task at a time. PRD.md (what), SPEC.md in a spec-driven task (the exact behavior and contracts) and TECHSPEC.md (how) are the contract. Each `subtasks/task_NN.md` says exactly what to change and how to prove it.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Load the task

```bash
maverick instructions <slug> --json
```

Check these fields:

- `stage` must be `build`. If it is still `prd`, `techspec` or `tasks`, finish planning with the maverick-new skill first.
- `tasks.ready` and `tasks.inProgress` show what you can work on.
- `language.rule` applies to all your output: code, identifiers, comments, test names and commit messages in `language.code`; messages to the user in `language.docs`.
- `grounding.commands` holds the real verification commands.

Read PRD.md, SPEC.md when it exists, and TECHSPEC.md once, in full. In a spec-driven task, write the test for a scenario before its code, and never change a contract that SPEC.md fixes: if the code needs a different one, stop and ask.

## 2. Work one task at a time

For the first task in `tasks.inProgress`, or else the first in `tasks.ready`:

1. Mark it as started: `maverick subtask set <slug> <id> in-progress`.
2. Read its file. Stay inside its **Files**, unless the technical spec's File References justify touching one more file. Before you change a widely shared file, run `maverick impact <path>`.
3. Work through its checklist from top to bottom. The task file is your progress record: **check each item (`- [ ]` → `- [x]`) in `task_NN.md` the moment it is true, never before and never in a batch at the end.**
   - **Steps:** implement one step, following the conventions of the surrounding code, then check it.
   - **Verification:** write each listed test (tests are part of the task, never a later task), run it, and check it only when it passes.
   - **Acceptance Criteria:** check an `AC-NN` when the code and a passing test prove it.
4. Run the task's verification commands, then `maverick verify <slug>`. Fix what fails. Never weaken or delete a test to make it pass, and never check an item whose test fails.
5. Mark it done: `maverick subtask set <slug> <id> done`. It refuses while any item is unchecked and lists them: finish them, or stop and ask. Use `--force` only when the user explicitly agrees to leave an item open, and record why under `## Notes`.
6. Tell the user in 3 to 5 lines what changed and what was verified, with the checklist count (for example 7/7). Then ask in the answer selector: continue to the next task (Recommended), or stop here.

`maverick subtask next <slug>` lists the unchecked items of the task in progress, so a new session can resume exactly where the last one stopped.

## Stop and ask instead of guessing

Stop and ask the user when:

- the change needs a file, dependency or public contract that the technical spec does not list;
- an acceptance criterion turns out to be wrong or impossible, or a step cannot be done as written;
- verification fails for a reason outside this task.

Record anything you decided along the way in the task file under a `## Notes` heading, in `language.docs`.

## Finish

When every task is done, `maverick status` shows the task at the VERIFY or REVIEW stage. Suggest the maverick-review skill. Do not commit or push unless the user asks you to. If they do, write the commit message in `language.code`.
