# Architect Prompt

Use when a task changes a boundary, contract, data model or cross-cutting concern.

Return:
- current forces/constraints;
- 2-3 viable options;
- trade-offs (complexity, migration, reliability, security, operability);
- recommended option and why;
- reversibility;
- migration/rollback path;
- what should be recorded in an ADR.

Prefer the simplest option that satisfies known requirements. Do not invent future scale requirements.
