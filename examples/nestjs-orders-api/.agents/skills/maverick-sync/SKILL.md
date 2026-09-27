---
name: maverick-sync
description: Updates the Maverick flow skills to the latest catalog version and brings a task that was created by an older Maverick to the current format (checklists for criteria, steps and tests), then reconciles unfinished tasks with the code by checking only the items that are already provably done. Use when the user runs /maverick-sync, says sync, update or upgrade the skills or a task, or when a task was planned before the current format.
---

# Maverick sync

You bring two things up to date without losing any work: the flow skills installed in the project, and the files of a task that already exists. The CLI does the mechanical part. You do the part that needs judgment: splitting items and checking only what the code proves.

## Asking the user

Every question to the user goes through your agent's answer selector, never as plain text the user has to type an answer to:

- **Claude Code:** call the `AskUserQuestion` tool. **Other agents:** use their structured question tool (a multiple-choice picker) when they have one.
- One question per call. Give 2 to 4 options, put your recommendation first with "(Recommended)" at the end of its label, and describe in one line what each option leads to. Do not add an "Other" option: the selector already lets the user type their own answer.
- Keep the header short (up to 12 characters), for example "Scope", "Behavior" or "Next step".
- Use the selector for confirmations and decisions too: continue or adjust, approve or request changes, which task to take next.
- Only when the agent has no such tool, write the question with lettered options (A, B, C and "D) Other") and stop until the user answers.

## 1. Update the flow skills

```bash
maverick sync --dry-run
```

Each `UPDATE` line is a skill with a newer version, and `(new)` marks a flow skill the project does not have yet. When there is something to apply, tell the user in one line, then confirm in the answer selector: update the skills (Recommended), or skip. On yes:

```bash
maverick sync --yes
```

A conflict means the user edited an installed skill file. Never pass `--force` on your own: show the file and ask whether to keep their edit or take the new version.

The updated skills take effect in the next message. From here on, follow the current maverick-tasks and maverick-build rules.

## 2. Pick the task

If the user named a task, use it. Otherwise run `maverick status --json`, and when there is more than one task, ask in the answer selector which one to sync, recommending the one in progress.

## 3. Migrate the task files

```bash
maverick sync <slug> --dry-run
maverick sync <slug>
```

This converts, in every `subtasks/task_NN.md`, the Acceptance Criteria, Steps and Verification lists into `- [ ]` checklists (checked in tasks already marked done), and rewrites `subtasks/_tasks.md` as a checklist of the tasks. It keeps the content, never touches code blocks or Files, and running it again changes nothing.

## 4. Make every item checkable

Read each task file that is not done. A checklist item must be one thing that is either true or not:

- **Split** a step that bundles several changes ("Add the DTO, the codec and the cache key") into one item per change.
- **Split** a verification line that lists several tests (`- [ ] UT-01, UT-02`) into one item per test, with what it proves.
- **Keep** the wording, the ids (`AC-NN`, `UT-NN`, `IT-NN`) and the order. Do not add scope: a missing step or test is a question for the user, not something you invent.

## 5. Reconcile unfinished tasks with the code

For each task that is `in-progress`, and for `pending` tasks when the diff already touches their files:

- Read the code the task's Files point to, and run the task's verification commands.
- Check a step only when the change is in the code. Check a test only when it exists and passes. Check an `AC-NN` only when the code and a passing test prove it.
- Leave everything else unchecked. When in doubt, leave it open: the build will get to it.

Never change a task's status here. `maverick subtask set` stays with the build.

## 6. Validate and report

```bash
maverick validate <slug>
maverick subtask list <slug>
```

Fix what the migration left invalid. Then tell the user in a few lines: which skills were updated, which files changed, and each task's progress (for example `01  3/7`). Ask in the answer selector what to do next: continue the build with the maverick-build skill (Recommended), or stop here.

## Language

Write in `language.docs`, keep the existing headings, and leave file paths, identifiers and test names in `language.code`.
