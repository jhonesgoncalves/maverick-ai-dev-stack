# Quickstart

1. Put this kit beside or inside a project.
2. Custom paths go in `.maverick/config.json`, which `maverick init` creates (a root `maverick.config.json` from v1 is still read as a fallback).
3. Run `node <kit>/bin/maverick.js init <slug>` from the project root.
4. Fill TASK.md first. If you cannot write acceptance criteria, the task is not ready for an agent.
5. Fill CONTEXT.md with reading order and constraints.
6. Run `validate`.
7. Use preflight + builder.
8. Run verification.
9. Use reviewer on the final diff.
10. Complete REVIEW.md and PR.md yourself.
