# Task artifacts

Maverick ships no task templates. Each task lives in `.maverick/tasks/<slug>/`, and its planning artifacts are written by stage skills that research the code first:

| File | Written by | Holds |
|---|---|---|
| `TASK.json` | `maverick new` | The idea and the workflow (`standard` or `strict`) |
| `PRD.md` | `maverick-prd` | Goals, user stories, requirements with scenarios, acceptance criteria |
| `TECHSPEC.md` | `maverick-techspec` | Current state, approach, real file references, Test Plan, build order, rollback |
| `subtasks/_tasks.md`, `task_NN.md` | `maverick-tasks` | The dependency graph as a checklist, and one file per task with Files and checklists for Acceptance Criteria, Steps and Verification |

The required sections are checked by `maverick validate`; see [From idea to tasks](/guide/planning). Headings are written in the project's docs language: English, Brazilian Portuguese and Spanish have localized headings (for example `## Critérios de Aceite` for Acceptance Criteria, `## Arquivos` for Files), and every reader accepts any of them. Ids such as `AC-01` stay the same in every language; see [Languages](/guide/planning#languages). Delivery commands then write evidence next to them: `EVIDENCE.md`, `CHECKPOINT.md`, `SCOPE-GUARD.md`, `SECURITY-REPORT.md`, `DEPENDENCY-REVIEW.md`, `REVIEW.md`, `REVIEW-FINDINGS.md`, `MERGE-READINESS.md` and `PR-DRAFT.md`. `REVIEW.md` is written in the docs language, with decision options such as `- [ ] approve (aprovar)`. These reports support, rather than replace, a human review.
