# Workflow — Data/API Migration
1. Write an ADR when the change affects a durable contract.
2. Define old/new schemas and compatibility window.
3. Prefer expand -> migrate -> contract.
4. Add observability before irreversible steps.
5. Define rollback before rollout.
6. Test old and new clients during overlap.
7. Remove compatibility only after evidence it is unused.
