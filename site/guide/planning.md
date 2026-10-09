# From idea to tasks

<p class="mv-kicker">GUIDE · PLANNING PIPELINE</p>

Every change starts as one sentence. `maverick new` turns it into a task, grounds it in your code and opens your AI coding agent to plan it with you: a PRD, then a technical spec, then a graph of tasks. Nothing is a template. Each stage is written by a skill that reads the code first.

```bash
maverick new "Add cursor pagination to the orders endpoint"
```

## What happens

1. **Slug.** Maverick derives the slug from the idea, for example `add-cursor-pagination-orders-endpoint`, or `adicionar-paginacao-rota-orders` for "adicionar paginação na rota de orders". Choose your own with `--slug`.
2. **Task.** It writes `.maverick/tasks/<slug>/TASK.json` with the idea and the workflow: `standard` by default, `strict` with `--strict` or automatically when the idea touches security, data, payments or migrations.
3. **Grounding.** It ranks the files the idea most likely touches, with the reason for each, and finds the tests next to them, the matching entry points, the shared modules where a change ripples, and the real verification commands.
4. **Agent.** In a terminal, it installs the ten flow skills into your AI coding agent and opens it, prompted with the skill for the task's stage. It looks for Claude Code, then Codex, Cursor and Gemini, and uses whichever is installed; pick one with `--agent`.

Run `maverick new` with no idea to open the agent and let it ask what to build. Inside an agent's shell (no TTY), or with `--no-launch`, Maverick only creates the task.

## Everything happens in the agent

The CLI only starts the flow. From then on you work inside the agent, and each stage is a skill:

| Skill | Does |
|---|---|
| `maverick-new` | Takes the idea and runs the planning skills in order |
| `maverick-prd` | Writes `PRD.md` |
| `maverick-spec` | Writes `SPEC.md` in spec-driven tasks, and gets it approved |
| `maverick-techspec` | Writes `TECHSPEC.md` |
| `maverick-tasks` | Writes `subtasks/_tasks.md` and one `task_NN.md` per task |
| `maverick-build` | Implements ready subtasks one at a time: marks it in progress, works through its checklist checking each step, test and criterion as it is done, runs `maverick verify`, marks it done, and asks before the next |
| `maverick-review` | Runs `verify`, `guard`, `security`, `deps` and `review --diff`, reviews the diff against each PRD `AC-NN`, and fills `REVIEW.md` except the decision, which it asks you to make |
| `maverick-ship` | Runs `readiness` and `pr` to write `PR-DRAFT.md`. It commits, pushes or opens a PR only when you explicitly ask, and never merges |
| `maverick-status` | Shows where each task stands, which skill comes next, and how to change the languages |
| `maverick-sync` | Updates the flow skills (`maverick sync`) and brings a task created by an older Maverick to the current format (`maverick sync <task>`), checking only the items the code already proves |

All ten are installed together through the capability manager and recorded in `.maverick/capabilities.lock.json`, like any other capability. In Claude Code you can invoke a skill by name, for example `/maverick-new Add cursor pagination to the orders endpoint`; in Codex, Cursor and Gemini ask the agent to use the maverick-new skill.

### Resume a task

`maverick new <slug>` (alias `maverick open <slug>`, or `start`) opens the agent with the skill for the task's current stage:

| Stage | Skill |
|---|---|
| PRD, SPEC, TECHSPEC, TASKS | `maverick-new` |
| BUILD | `maverick-build` |
| VERIFY, SECURITY, REVIEW | `maverick-review` |
| PR | `maverick-ship` |

`maverick status` names the same skill in each task's next step.

## The pipeline

```text
PRD → TECHSPEC → TASKS → BUILD → VERIFY → REVIEW → PR
```

The `strict` workflow adds a **SECURITY** gate before review.

Each planning stage follows the same method:

- **Research before asking.** The skill reads the grounded files, their tests and their callers, and the earlier artifacts.
- **Ask only what the code cannot answer.** One question per message, with a recommendation and A/B/C/D-Other options.
- **Write the artifact in full**, then validate it.
- **Ask before moving on.** You decide when the next stage starts.

### PRD

`PRD.md`, written by `maverick-prd`, says what changes and why:

| Section | Holds |
|---|---|
| Overview, Goals | The problem and the outcome |
| User Stories | One `### US-01` heading per story |
| Requirements | `### Requirement:` with SHALL or MUST, each with `#### Scenario:` using WHEN and THEN |
| Acceptance Criteria | `- [ ] AC-01: Given…, when…, then… (US-01)` |
| Business Rules, Edge Cases | Domain constraints and boundary behavior |
| Non-Goals, Open Questions | What is explicitly out of scope, and what is still undecided |

```md
## Acceptance Criteria
- [ ] AC-01: Given 3 orders, when a client requests limit=2, then it receives 2 orders and a nextCursor. (US-01)
- [ ] AC-02: Given an invalid cursor, when a client requests a page, then it receives 400 invalid_cursor. (US-01)
```

### TECHSPEC

`TECHSPEC.md`, written by `maverick-techspec`, says how, grounded in real code:

| Section | Holds |
|---|---|
| Summary, Current State | The approach in brief, and how the code works today with `path:line` references |
| Approach | The chosen design and the alternatives rejected |
| File References | Real paths to change; new files are marked `(new)` |
| Interfaces and Data, Impact | Signatures, payloads, storage and what else is affected |
| Test Plan | Each test mapped to a criterion, such as `UT-01 → AC-01` |
| Build Order, Risks and Rollback | The sequence of changes and how to undo them |
| Commands, Do Not Touch | Verification commands and the files that stay unchanged |

### Tasks

`maverick-tasks` writes `subtasks/_tasks.md`, the dependency graph, and one `task_NN.md` per task with **Goal**, **Acceptance Criteria**, **Files**, **Steps** and **Verification**. A typical feature has 3 to 7 tasks. Work is split only at a dependency, a parallel boundary or a domain boundary, every task ships its own tests, and every acceptance criterion is covered by at least one task.

Acceptance Criteria, Steps and Verification are **checklists**, and `_tasks.md` lists the tasks the same way. The build checks each item as it is done, so the task file is always an exact record of the progress:

```md
## Steps
- [x] Add `cursor` and `limit` to `ListOrdersDto` with class-validator.
- [ ] Branch `list`: keyset on (`createdAt`, `id`), fetching `limit + 1`.

## Verification
- [ ] UT-01: `limit=2` with 3 orders returns 2 items and a `nextCursor`
```

`maverick subtask set <task> <id> done` refuses while an item is unchecked and lists the open ones; `--force` overrides it when you decide to leave one open. `maverick subtask list` shows each task's progress (`3/7`), and `maverick subtask next` lists the open items of the task in progress.

## Instructions for the skills

The skills read what they need from the CLI, so the workflow stays in one place:

```bash
maverick instructions add-cursor-pagination-orders-endpoint techspec --json
```

This returns the idea, the current stage, the required headings, the earlier artifacts, the grounding and the current validation findings. It also returns `skill` (the skill for the current stage), `language` (`docs`, `code`, the language rule and the requirement keywords) and `tasks` (total, done, the ready tasks with their paths, and the one in progress).

## Headless: `maverick generate`

No interactive agent? Run the same skills headlessly with a trusted agent:

```bash
maverick agent trust claude-code
maverick generate add-cursor-pagination-orders-endpoint --agent claude-code
```

The agent runs **read-only**, and its prompt is the stage skill itself, with the language rule and the localized headings. Maverick writes each artifact, validates it strictly, and retries once with the failures when validation does not pass. Pass a stage (`prd`, `techspec` or `tasks`) to generate only that one.

When the agent needs a decision, it records its assumption under Open Questions and prints the question. Answer to refine:

```bash
maverick generate add-cursor-pagination-orders-endpoint prd --agent claude-code --answers "1) 100 per page 2) newest first"
```

## Validation

`maverick validate <slug>` checks every planning artifact; `--stage prd|techspec|tasks` checks one, and `--strict` turns content findings into failures.

| Check | Fails when |
|---|---|
| Headings | a required section is missing under all of its localized headings |
| Placeholders | an artifact still contains upper-case placeholder markers |
| Criteria | an `AC-NN` id is missing or duplicated |
| Requirements | a requirement lacks SHALL/MUST, or a scenario lacks WHEN/THEN (or their localized keywords) |
| Grounding | a referenced path does not exist and is not marked `(new)` |
| Test Plan | an acceptance criterion has no test |
| Tasks | a task references an undefined criterion, has no Verification, or a criterion is covered by no task |

Placeholder detection is case-sensitive, so ordinary lower-case words in any language are never flagged.

## Languages

A project has two languages, set in `.maverick/config.json` as `language: { docs, code }` (both `en` by default):

- **`docs`** is everything the flow writes and says: PRD, TECHSPEC, tasks, `REVIEW.md` and the questions the skills ask you.
- **`code`** is identifiers, comments, test names, log and error messages, and commit messages.

`maverick init` asks for both in a terminal, or takes `--docs-language pt-BR --code-language en`. Change them later with `maverick language`:

```bash
maverick language            # show
maverick language pt-BR en   # docs pt-BR, code en
maverick language --code pt-BR
```

Section headings are localized for English, Brazilian Portuguese and Spanish, and every reader (`validate`, Lens, `guard`, the PR draft) accepts any of them. Ids stay `US-01`, `AC-01` and `UT-01`.

| English | Português (pt-BR) |
|---|---|
| Overview, Goals | Visão Geral, Objetivos |
| User Stories, Requirements | Histórias de Usuário, Requisitos |
| Acceptance Criteria, Business Rules | Critérios de Aceite, Regras de Negócio |
| Edge Cases, Non-Goals, Open Questions | Casos de Borda, Fora de Escopo, Questões em Aberto |
| Summary, Current State, Approach | Resumo, Estado Atual, Abordagem |
| File References, Interfaces and Data, Impact | Referências de Arquivos, Interfaces e Dados, Impacto |
| Test Plan, Build Order, Risks and Rollback | Plano de Testes, Ordem de Construção, Riscos e Rollback |
| Commands, Do Not Touch | Comandos, Não Alterar |
| Goal, Files, Steps, Verification (task files) | Objetivo, Arquivos, Passos, Verificação |

Requirements use the language's keywords: `### Requisito:`, `#### Cenário:`, DEVE, **QUANDO** and **ENTÃO** in Portuguese; `Requisito`, `Escenario`, DEBE, CUANDO and ENTONCES in Spanish. Other languages, such as `fr` or `de`, get content in that language under English headings.

`REVIEW.md` is written in the docs language. Its decision options keep the English keyword with a translation, for example `- [ ] approve (aprovar)`.

## Project rules

Give every stage skill your project's constraints in `.maverick/config.json`:

```json
{
  "authoring": {
    "context": "Public API is versioned under /v2. Money is stored in integer cents.",
    "rules": {
      "PRD": ["Every user story names its persona"],
      "TECHSPEC": ["Every endpoint change lists its error codes"],
      "TASKS": ["Include a feature-flag rollout task"]
    }
  }
}
```

## From Lens

Creating a task from a finding in [Lens](/lens/index) runs `maverick new` for you. The task arrives grounded; open it in your agent with `maverick new <slug>` or plan it headlessly with `maverick generate <slug> --agent <provider>`.

Next: [build, verify and review](/guide/workflow).
