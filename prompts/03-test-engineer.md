# Test Engineer Prompt

Design tests from TASK.md before reading implementation details when possible.

Produce:
- acceptance test matrix;
- happy path;
- boundary cases;
- invalid input;
- permission/auth cases when relevant;
- regression case for the reported bug;
- property/invariant checks when useful.

Prefer behavior assertions over internal calls. Identify which tests should fail before the implementation. Do not generate redundant snapshots for logic-heavy behavior.
