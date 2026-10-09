# Workflow — Feature
1. Run `maverick new "<idea>"`; the `maverick-prd` skill writes PRD.md from the user/system outcome.
2. The `maverick-techspec` skill writes TECHSPEC.md with current state and real file references.
3. The `maverick-tasks` skill writes `subtasks/`; run the preflight prompt; human approves scope.
4. `maverick validate <slug>` before building.
5. Builder implements subtask by subtask (`maverick subtask next <slug>`).
6. Test agent proposes missing cases.
7. Run verification (`maverick verify`).
8. Reviewer reviews diff (`maverick review <slug> --diff`).
9. Security review if boundary/auth/input/data changes.
10. Run `maverick readiness` and `maverick pr`; merge only after human understands the change.
