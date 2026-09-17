# Refactor Prompt

Goal: improve structure without changing externally observable behavior.

Before editing:
- state the behavior contract;
- identify tests that protect it;
- define the smallest refactor boundary.

During editing:
- keep functional changes out;
- use mechanical steps where possible;
- run tests after each meaningful step;
- stop if the refactor reveals a behavior change requirement.

Return a before/after explanation and evidence that behavior stayed stable.
