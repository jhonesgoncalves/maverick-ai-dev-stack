# Playbook — Task Decomposition

A good AI task usually has:
- one user/system outcome;
- a small number of touched boundaries;
- acceptance criteria a human can verify;
- a clear non-goal;
- a rollback story.

## Split when
- task mixes schema migration + behavior + UI + refactor;
- more than one independently deployable outcome exists;
- review requires understanding too many unrelated files;
- agent repeatedly changes files outside the expected boundary.

## Decomposition pattern
Epic -> vertical slice -> task -> criterion -> check.

Bad: "modernize orders service and add pagination".
Better: "add cursor pagination to GET /orders preserving filters and response fields".
