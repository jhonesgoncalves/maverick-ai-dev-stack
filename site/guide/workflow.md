# The workflow

<p class="mv-kicker">CORE</p>

Every change moves through one pipeline. **PRD** says what changes and why. In spec-driven work, **SPEC** fixes the exact behavior and contracts, and a human approves it. **TECHSPEC** grounds the approach in real files. **Tasks** split it into a dependency graph with tests. **Build** makes focused changes. **Verify** collects evidence. **Review** is a human decision. **PR** records the rationale. Every stage runs as a skill inside your AI coding agent: `maverick-new` plans, `maverick-build` builds, `maverick-review` verifies and reviews, and `maverick-ship` drafts the PR. See [The Maverick Method](/guide/method) for the stage-by-stage playbook and [From idea to tasks](/guide/planning#everything-happens-in-the-agent).

Pick a workflow and click a stage to see what it produces:

<WorkflowExplorer />

## Run each stage

Every stage is a skill. In **Claude Code**, type it as a slash command with the task slug. In **Codex, Cursor, Gemini, Copilot, Windsurf, Kiro or OpenCode**, ask for it by name: *"Use the maverick-spec skill for add-orders-pagination"*.

| Stage | Run in your agent | It writes | Gate (CLI) | You decide |
|---|---|---|---|---|
| **PRD** | `/maverick-prd <task>` | `PRD.md` | `maverick validate <task> --stage prd` | answer product questions |
| **SPEC** <Badge type="warning" text="spec-driven" /> | `/maverick-spec <task>` | `SPEC.md` | `maverick flow run spec <task>` | **◆ approve the spec** |
| **TECHSPEC** | `/maverick-techspec <task>` | `TECHSPEC.md` | `maverick validate <task> --stage techspec` | confirm the approach |
| **TASKS** | `/maverick-tasks <task>` | `subtasks/` | `maverick validate <task> --stage tasks` | confirm the graph |
| **BUILD** | `/maverick-build <task>` | code + tests | `maverick subtask next <task>`, `maverick verify <task>` | OK each next subtask |
| **VERIFY** | `/maverick-review <task>` | `EVIDENCE.md` | `maverick verify`, `guard`, `deps` | read the evidence |
| **SECURITY** <Badge type="warning" text="strict" /> | `/maverick-review <task>` | `SECURITY-REPORT.md` | `maverick security <task>` | read the findings |
| **REVIEW** | `/maverick-review <task>` | `REVIEW.md` | `maverick flow run ship <task>` | **◆ record the decision** |
| **PR** | `/maverick-ship <task>` | `PR-DRAFT.md` | `maverick readiness <task>`, `maverick pr <task>` | **◆ merge** |

You don't have to remember the table. `/maverick-new <idea>` chains the planning skills for you and asks before each one, `maverick new <task>` reopens the agent with the right skill for the current stage, and `maverick status` names it in each task's next step. See [The Maverick Method](/guide/method) for each stage in depth.

## Workflows

| Workflow | Best for | Adds |
|---|---|---|
| `standard` | Features, fixes and refactors. This is the default. | — |
| `spec-driven` | APIs, integrations, shared contracts, complex domain rules, or work several people must agree on. | `SPEC.md` between the PRD and the technical spec, and the `spec` approval gate. |
| `strict` | Security, data, payment, migration or shared-infrastructure work. | A security gate before review and a checkpoint before merge. |

```bash
maverick new "Add pagination to the orders list"            # standard
maverick new "Expose the orders API to partners" --spec     # spec-driven (SDD)
maverick new "Replace the shared cache layer" --strict      # strict
```

`maverick new` picks `strict` on its own when the idea touches security, data, payments or migrations, and `spec-driven` when it defines an API, an endpoint, a webhook, an integration or another contract. Pass `--workflow standard` to skip the spec. Change the default with `workflow.default` in `.maverick/config.json`.

## Spec-driven development (SDD)

`spec-driven` puts a behavioral spec in the middle of the pipeline:

```text
PRD ──► SPEC ──► [human approves] ──► TECHSPEC ──► TASKS ──► BUILD ──► VERIFY ──► REVIEW ──► PR
what     exact behavior                how           graph      tests first
and why  and contracts                                          against SPEC
```

- **PRD.md** stays the product contract: goals, stories and `AC-NN` criteria.
- **SPEC.md** (the `maverick-spec` skill) turns each criterion into numbered `SC-NN` WHEN/THEN scenarios, exact contracts (requests, responses, events, signatures), states and data, invariants, errors, and a traceability table from every `AC-NN` to its scenarios and contracts. `maverick validate <task> --stage spec` fails when a scenario lacks WHEN/THEN or references an undefined criterion, and, under `--strict`, when a criterion is not traced.
- **The `spec` flow** is the gate: `maverick flow run spec <task>` checks the sections and the validation, then waits until a human checks `- [x] Spec approved` in SPEC.md or runs `maverick flow approve spec <task> spec-approval`.
- **TECHSPEC.md** implements the contracts exactly and cites the scenarios in its Test Plan (`IT-01 → AC-01 / SC-01`). Build writes the scenario tests first; review checks every scenario has a passing test and every contract matches SPEC.md.

A behavior change after approval starts in SPEC.md, not in the code.

## Know where each task is

```bash
maverick status
```

`status` shows each task's stage and names the skill to run next; `maverick new <slug>` reopens the agent with it. Under the skills, `guard` checks the diff against the TECHSPEC File References and the task Files, and `review <task> --diff` writes `REVIEW.md` from the PRD acceptance criteria and the tasks.

## Automate the loop

When the stages are clear, `maverick flow run ship <task>` runs contract-driven gates — checks, commands, artifacts and human approvals — until the task is done, stalled or waiting for a person. Add `--agent` to let a trusted, permission-limited agent fix blocking issues between runs. See the [CLI reference](/reference/cli).
