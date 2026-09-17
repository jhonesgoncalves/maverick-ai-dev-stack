# Spec-driven development

Spec-Driven Development is supported as a workflow preset. Maverick itself is broader than SDD.

SDD helps define what should be built. Maverick keeps the intent, context, verification and review connected until the PR.

Use `maverick task checkout-redesign --preset spec-driven` when a change needs a shared written specification. The generated `SPEC.md` holds problem, desired behavior, requirements, acceptance criteria, domain rules, constraints, edge cases, open questions, and risks. Keep traceability lightweight: link `AC-01` to a `PLAN.md` step and record its result in `REVIEW.md`.

Spec-driven when you need it. Review-driven always.
