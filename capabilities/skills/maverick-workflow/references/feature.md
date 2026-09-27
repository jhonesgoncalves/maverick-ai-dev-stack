# Workflow — Feature
1. Write TASK.md from user/system outcome.
2. Write CONTEXT.md with existing behavior and relevant paths.
3. Run preflight prompt.
4. Produce PLAN.md; human approves scope.
5. Builder implements criterion by criterion.
6. Test agent proposes missing cases.
7. Run verification.
8. Reviewer reviews diff.
9. Security review if boundary/auth/input/data changes.
10. Complete PR.md and merge only after human understands the change.
