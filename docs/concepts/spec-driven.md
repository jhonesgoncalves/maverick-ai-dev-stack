# Spec-driven development

Spec-Driven Development (SDD) is a workflow in Maverick: `spec-driven`. Maverick itself is broader than SDD.

SDD helps define exactly what should be built before anyone designs how. Maverick keeps the intent, the spec, the context, the verification and the review connected until the PR.

```text
PRD ──► SPEC ──► [human approves] ──► TECHSPEC ──► TASKS ──► BUILD ──► VERIFY ──► REVIEW ──► PR
```

## Start a spec-driven task

```bash
maverick new "Expose the orders API to partners" --spec
```

`--workflow spec-driven` does the same. Without a flag, `maverick new` picks `spec-driven` when the idea mentions an API, an endpoint, a webhook, an integration or a contract, and the project default is `standard`. Make it the default with `"workflow": { "default": "spec-driven" }` in `.maverick/config.json`.

## SPEC.md

The `maverick-spec` skill writes it after the PRD. It holds:

| Section | What it fixes |
|---|---|
| Summary | The behavior change in two or three sentences |
| Behavior | `### Requirement:` blocks with numbered `#### Scenario: SC-01 …` WHEN/THEN scenarios, with concrete values |
| Contracts | Exact request, response, event or function shapes, marked new, changed or unchanged |
| States and Data | Entities, fields, constraints and allowed state transitions |
| Invariants | What must always hold |
| Errors | Condition → status or code → message → retryable |
| Traceability | Every `AC-NN` of the PRD → its scenarios and contracts |
| Open Questions | `question → assumption taken` |

`maverick validate <task> --stage spec` checks the sections, the scenarios, that every `AC-NN` exists in the PRD and, under `--strict`, that every criterion is traced and every contract is written as code.

## The spec gate

```bash
maverick flow run spec <task>
maverick flow approve spec <task> spec-approval   # or check "- [x] Spec approved" in SPEC.md
```

The technical spec starts only after a human approves SPEC.md. From there, TECHSPEC.md implements the contracts exactly and cites scenarios in its Test Plan (`IT-01 → AC-01 / SC-01`), the build writes scenario tests first, and the review checks every scenario and contract.

Spec-driven when you need it. Review-driven always.
