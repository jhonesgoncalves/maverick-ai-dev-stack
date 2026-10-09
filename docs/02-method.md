# The Maverick Method

## Why this exists
AI coding tools are good at producing plausible local changes. The engineering problem is making the work **bounded, inspectable and reversible** inside a real codebase.

![The Maverick Method](../site/public/method/maverick-method.svg)

## Three rules
- **The agent does the work, through a skill.** Each stage has one skill that runs inside your AI coding agent and writes one artifact.
- **The CLI proves the work is complete.** Each stage exits through a `maverick` gate. The agent never grades its own work.
- **A human makes every decision.** The behavior spec, the review decision and the merge always belong to a person.

## The stages

| Phase | Stage | Skill | Artifact | Gate | Human |
|---|---|---|---|---|---|
| Plan | PRD | `maverick-prd` | `PRD.md` | `validate <task> --stage prd` | answers product questions |
| Plan | SPEC *(spec-driven)* | `maverick-spec` | `SPEC.md` | `flow run spec <task>` | **approves the spec** |
| Plan | TECHSPEC | `maverick-techspec` | `TECHSPEC.md` | `validate <task> --stage techspec` | confirms the approach |
| Plan | TASKS | `maverick-tasks` | `subtasks/` | `validate <task> --stage tasks` | confirms the graph |
| Build | BUILD | `maverick-build` | code + tests | `subtask next <task>`, `verify <task>` | OKs each subtask |
| Prove | VERIFY | `maverick-review` | `EVIDENCE.md` | `verify`, `guard`, `deps` | reads the evidence |
| Prove | SECURITY *(strict)* | `maverick-review` | `SECURITY-REPORT.md` | `security <task>` | reads the findings |
| Prove | REVIEW | `maverick-review` | `REVIEW.md` | `flow run ship <task>` | **records the decision** |
| Ship | PR | `maverick-ship` | `PR-DRAFT.md` | `readiness <task>`, `pr <task>` | **merges** |

In Claude Code, run a stage as `/maverick-prd <task>`. In any other agent, ask it to use the skill by name. `maverick status` always names the skill to run next.

The artifacts are deliberately boring. Boring is good when it makes review easier.

The full playbook, with each stage's inputs, outputs, gates and anti-patterns, is in [site/guide/method.md](../site/guide/method.md).
