# Workflow — Spec-Driven (SDD)
Use for APIs, integrations, events, shared contracts, complex domain rules, or work several people must agree on before it is built.

1. Run `maverick new "<idea>" --spec` (or `--workflow spec-driven`); the `maverick-prd` skill writes PRD.md with `AC-NN` acceptance criteria.
2. The `maverick-spec` skill writes SPEC.md: numbered `SC-NN` WHEN/THEN scenarios, exact contracts, states and data, invariants, errors, and a traceability table from every `AC-NN`.
3. `maverick validate <slug> --stage spec --strict` until it passes.
4. Spec gate: `maverick flow run spec <slug>`; a human reviews behavior, contracts and compatibility, then checks `- [x] Spec approved` in SPEC.md (or `maverick flow approve spec <slug> spec-approval`). No design starts before this.
5. The `maverick-techspec` skill writes TECHSPEC.md: Interfaces and Data implement SPEC.md contracts exactly; the Test Plan cites `AC-NN / SC-NN`.
6. The `maverick-tasks` skill writes `subtasks/`; every scenario belongs to a task; human approves scope; `maverick validate <slug>`.
7. Builder implements subtask by subtask, writing each scenario's test before its code (`maverick subtask next <slug>`). A contract change stops the build and goes back to step 2.
8. Run verification (`maverick verify`) and guard (`maverick guard <slug>`).
9. Reviewer checks every `SC-NN` has a passing test and every contract matches SPEC.md (`maverick review <slug> --diff`).
10. Run `maverick flow run ship <slug>`, `maverick readiness` and `maverick pr`; merge only after a human understands the change.
