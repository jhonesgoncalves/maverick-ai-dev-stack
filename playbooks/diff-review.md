# Playbook — Diff Review

Review the diff, not the confidence of the explanation.

## Five passes
1. **Shape:** files changed, additions/deletions, unexpected surface area.
2. **Contract:** public interfaces, schemas, events, API behavior.
3. **Logic:** happy path, boundaries, failures, concurrency/idempotency.
4. **Tests:** intent, regression, falsifiability.
5. **Risk:** auth, validation, secrets, observability, rollback.

If the diff is too large to understand, that is itself a review finding: split it.
