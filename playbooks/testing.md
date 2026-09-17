# Playbook — Testing AI-generated changes

## Test pyramid for a task
- unit tests for pure/branch-heavy logic;
- integration tests at important boundaries;
- contract/e2e only where they protect actual public behavior.

## Mutation question
Ask: "what one-line bug could I insert that should make this test fail?" If you cannot answer, the test may be decorative.

## AI-specific traps
- tests generated from the implementation reproduce the same misunderstanding;
- mocks hide integration behavior;
- snapshot churn looks like coverage;
- flaky retries hide real race conditions.
