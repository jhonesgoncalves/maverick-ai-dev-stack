# The Maverick Method

<p class="mv-kicker">CORE · THE METHOD</p>

One sentence goes in. A pull request a human can merge with confidence comes out. In between, every stage follows the same three rules:

- **The agent does the work, through a skill.** Each stage has one skill that runs inside your AI coding agent and writes one artifact.
- **The CLI proves the work is complete.** Each stage exits through a gate, a `maverick` command that checks the artifact or the code. The agent never grades its own work.
- **A human makes every decision.** The agent asks before moving on. The behavior spec, the review decision and the merge always belong to a person.

![The Maverick Method: nine stages in four phases, each with a skill, an artifact, a CLI gate and a human checkpoint](/method/maverick-method.svg)

## Five principles

| # | Principle | In practice |
|---|---|---|
| 01 | **Context before code** | `maverick new` grounds the idea in real files, tests and callers before anyone writes a line. |
| 02 | **One artifact per stage** | PRD.md, SPEC.md, TECHSPEC.md, subtasks/, EVIDENCE.md, REVIEW.md, PR-DRAFT.md. Each one is reviewable on its own and lives next to the code. |
| 03 | **Research before asking** | A skill reads the code first and asks only what the code cannot answer: one question at a time, with a recommendation. |
| 04 | **Evidence before merge** | "Done" means passing gates: checks, scope, security, dependencies and a diff review against every acceptance criterion. |
| 05 | **The human decides** | Maverick never approves its own spec, never records the review decision and never merges. |

## Four phases

| Phase | Stages | The question it answers |
|---|---|---|
| **01 Plan** | PRD → SPEC<sup>spec-driven</sup> → TECHSPEC → TASKS | What are we building, how exactly does it behave, how is it built here, and in what order? |
| **02 Build** | BUILD | Does each subtask change only what it should, with its tests? |
| **03 Prove** | VERIFY → SECURITY<sup>strict</sup> → REVIEW | Is there evidence that it works, is safe, and does what the PRD promised? |
| **04 Ship** | PR | Can the next person understand, trust and merge it? |

Where a task stands is never stored. It is derived from its files, so it cannot drift. The first missing planning artifact is the current stage. After planning, task progress, the evidence and the review decision move the task forward.

## How to run a skill

You start the flow from the terminal. After that, you work inside your agent.

```bash
maverick new "Add cursor pagination to the orders endpoint"   # creates the task, opens the agent at PRD
maverick new add-cursor-pagination-orders-endpoint            # resumes: opens the agent with the skill for the current stage
maverick status                                               # every task, its stage and the next skill
```

Inside the agent, invoke the skill for the stage:

| Agent | How to run a stage skill |
|---|---|
| **Claude Code** | Type the skill as a slash command: `/maverick-prd add-cursor-pagination-orders-endpoint` |
| **Codex, Cursor, Gemini, Copilot, Windsurf, Kiro, OpenCode** | Ask for it by name: *"Use the maverick-prd skill for add-cursor-pagination-orders-endpoint"* |
| **Any agent, headless** | `maverick generate <task> --agent <trusted-provider>` runs the planning skills without a chat |

**You can leave the task out.** On a terminal, `maverick validate --stage techspec`, `maverick verify` or `maverick flow run ship` asks which task to use. Tasks at the relevant stage come first: the `--stage` you passed, or the stages the command usually works on. With a single task in the project, it is used directly. In scripts, CI and agents nothing is asked; the error names the tasks so the call can pass one.

You rarely need to name a skill. `maverick-new` chains the planning stages for you and asks before each one. `maverick status` and `maverick instructions <task> --json` always name the skill for right now.

## Stage by stage

### 01 · PRD: what and why

| | |
|---|---|
| **Run** | `/maverick-prd <task>`, or let `maverick-new` start it |
| **Reads** | The idea, the grounded files, their tests and callers |
| **Writes** | `PRD.md`: overview, goals, `US-NN` user stories, requirements with WHEN/THEN scenarios, `AC-NN` acceptance criteria, edge cases, non-goals |
| **Gate** | `maverick validate <task> --stage prd` |
| **You decide** | Answer the product questions the code cannot answer, then confirm the next stage |

::: tip Good PRD
Every acceptance criterion is testable on its own: `AC-01: Given 3 orders, when a client requests limit=2, then it receives 2 orders and a nextCursor.` The PRD never says how it will be built.
:::

### 02 · SPEC: exactly how it behaves <Badge type="warning" text="spec-driven" />

| | |
|---|---|
| **Run** | `/maverick-spec <task>` |
| **Reads** | PRD.md, the existing contracts and routes |
| **Writes** | `SPEC.md`: `SC-NN` WHEN/THEN scenarios, exact contracts (requests, responses, events, signatures), states, invariants, errors, and a traceability table from every `AC-NN` |
| **Gate** | `maverick flow run spec <task>` checks the sections and validation, then **waits for a human** |
| **You decide** | Approve the behavior: check `- [x] Spec approved` in SPEC.md, or run `maverick flow approve spec <task> spec-approval` |

Use it for APIs, integrations, shared contracts and complex domain rules: `maverick new "<idea>" --spec`. After approval, any change of behavior starts in SPEC.md, not in the code.

### 03 · TECHSPEC: how it is built here

| | |
|---|---|
| **Run** | `/maverick-techspec <task>` |
| **Reads** | PRD.md, SPEC.md, and the code the PRD touches |
| **Writes** | `TECHSPEC.md`: current state, chosen approach, real file references, interfaces, impact, a test plan traced to each `AC-NN` (and `SC-NN`), and the build order |
| **Gate** | `maverick validate <task> --stage techspec`. It flags every referenced path that does not exist. |
| **You decide** | Confirm the approach before it is broken into tasks |

### 04 · TASKS: the graph

| | |
|---|---|
| **Run** | `/maverick-tasks <task>` |
| **Reads** | The TECHSPEC build order |
| **Writes** | `subtasks/_tasks.md` and one `task_NN.md` per task: goal, the criteria it satisfies, files, steps, verification, dependencies. Criteria, steps and tests are `- [ ]` checklists. |
| **Gate** | `maverick validate <task> --stage tasks`, then `maverick subtask list <task>` |
| **You decide** | Confirm the graph. Each task should be small enough for a person or an agent to pick up with no other context. |

![How every planning stage runs: research, ask, write, validate, approve](/method/stage-loop.svg)

### 05 · BUILD: one ready subtask at a time

| | |
|---|---|
| **Run** | `/maverick-build <task>` |
| **Reads** | The next ready `task_NN.md`, PRD.md, SPEC.md and TECHSPEC.md |
| **Writes** | Code and tests. Each checklist item in `task_NN.md` is checked (`- [x]`) as it is done, and the subtask moves from `pending` to `in-progress` to `done`. |
| **Gate** | The subtask's own Verification, then `maverick verify <task>`. `maverick subtask set <task> <id> done` refuses while an item is unchecked, and `maverick guard <task>` keeps the diff inside the planned files. |
| **You decide** | Say yes before each next subtask |

![How build runs: pick, start, change, test, verify, done, one ready subtask at a time](/method/build-loop.svg)

### 06 · VERIFY: collect evidence

| | |
|---|---|
| **Run** | `/maverick-review <task>` |
| **Writes** | `EVIDENCE.md`, `SCOPE-GUARD.md`, `DEPENDENCY-REVIEW.md` |
| **Gate** | `maverick verify <task>`, `maverick guard <task>`, `maverick deps <task>` |
| **You decide** | Read the evidence. A failing gate sends the work back to BUILD. |

### 07 · SECURITY: the extra gate <Badge type="warning" text="strict" />

| | |
|---|---|
| **Run** | `/maverick-review <task>`, which runs the gate for you in a strict task |
| **Writes** | `SECURITY-REPORT.md` |
| **Gate** | `maverick security <task>` |
| **You decide** | Read every finding. `maverick new` picks `strict` on its own for security, data, payment and migration work, or you pass `--strict`. |

### 08 · REVIEW: the human decision

| | |
|---|---|
| **Run** | `/maverick-review <task>` |
| **Writes** | `REVIEW.md` from the PRD acceptance criteria and the tasks (`maverick review <task> --diff`). It reviews the diff against each `AC-NN` and fills in everything except the decision. |
| **Gate** | `maverick flow run ship <task>`: artifacts, checks, scope, security, dependencies, diff review, then **waits for a human** |
| **You decide** | Check one box in REVIEW.md: `approve`, `approve with follow-up` or `request changes` |

### 09 · PR: ship it

| | |
|---|---|
| **Run** | `/maverick-ship <task>` |
| **Writes** | `MERGE-READINESS.md` and `PR-DRAFT.md`, an evidence-backed PR description with the summary, verification, review, risks and rollback |
| **Gate** | `maverick readiness <task>`, then `maverick pr <task>` |
| **You decide** | The skill commits, pushes or opens the PR only when you ask. **You merge.** Maverick never does. |

## Pick the workflow

| Workflow | Stages | Use it for |
|---|---|---|
| `standard` | PRD → TECHSPEC → TASKS → BUILD → VERIFY → REVIEW → PR | Features, fixes and refactors (the default) |
| `spec-driven` | + **SPEC** and its approval gate after the PRD | APIs, integrations, shared contracts, work several people must agree on |
| `strict` | + **SECURITY** before review, and a checkpoint before merge | Security, data, payments, migrations, shared infrastructure |

`maverick new` picks the workflow from the idea. Override it with `--spec`, `--strict` or `--workflow standard`. See [The workflow](/guide/workflow).

## A whole task, start to finish

```bash
maverick new "Expose the orders API to partners" --spec
# in the agent:
#   /maverick-prd      → PRD.md             maverick validate <task> --stage prd
#   /maverick-spec     → SPEC.md            maverick flow run spec <task>          ◆ you approve
#   /maverick-techspec → TECHSPEC.md        maverick validate <task> --stage techspec
#   /maverick-tasks    → subtasks/          maverick subtask list <task>
#   /maverick-build    → code + tests       maverick subtask next <task> · maverick verify <task>
#   /maverick-review   → evidence, REVIEW   maverick flow run ship <task>          ◆ you decide
#   /maverick-ship     → PR-DRAFT.md        maverick readiness <task> · maverick pr <task>   ◆ you merge
maverick status   # at any point: where every task is and which skill comes next
```

When the stages are clear, automate the proving loop: `maverick flow run ship <task> --agent claude-code` reruns the gates, lets a trusted, permission-limited agent fix blocking issues between runs, and stops when the task is done, stalled, or waiting for a person.

## Keep it up to date

A new Maverick release can change the flow skills and the task format. One skill brings both up to date:

```bash
/maverick-sync add-cursor-pagination-orders-endpoint
```

It runs `maverick sync`, which installs the new version of every skill that changed and adds flow skills that are new in the release. It never overwrites a skill file you edited without asking. Then it runs `maverick sync <task>`, which converts the task's files to the current format, and it checks only the items the code already proves. Without an agent, run the two commands yourself; add `--dry-run` to preview either one.

## Anti-patterns

| Don't | Do instead |
|---|---|
| Ask the agent to "just build it" from the idea | Start with `maverick new`, so the code is grounded and the PRD sets the criteria |
| Accept a half-written template or invented paths | Let the gate catch it: `validate` fails on leftover placeholders and flags paths that do not exist |
| Change behavior in the code after the spec is approved | Change SPEC.md first, then the tests, then the code |
| Build several subtasks in one change | One ready subtask at a time, each verified and marked done |
| Let the agent approve the spec or the review | Human gates exist to block. Only a person checks those boxes. |
| Treat "tests pass" as done | Done means every gate passes and the review covers every `AC-NN` |

## Next

- [Your first task](/guide/first-task): the method on a real repository
- [From idea to tasks](/guide/planning): the planning artifacts in depth
- [The workflow](/guide/workflow): workflows, spec-driven development and flows
- [CLI reference](/reference/cli): every command used above
