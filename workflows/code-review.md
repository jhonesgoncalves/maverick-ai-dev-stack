# Workflow — AI-assisted Code Review
1. Human reads PRD.md and TECHSPEC.md.
2. Reviewer agent inspects diff against PRD/TECHSPEC (`maverick review <slug> --diff`).
3. Human verifies every blocker/important finding in code.
4. Test agent checks missing behavior coverage.
5. Security reviewer only when risk surface warrants it.
6. Human records the decision in REVIEW.md and makes the merge decision.
