# Configuration

`.maverick/config.json` contains a version, project metadata, workflow requirements, adapter name, task root, and required task/context sections. A legacy root `maverick.config.json` is read as a fallback.

The optional `architecture` section tunes the analysis behind `coupling`, `audit` and Lens Devtools: `components` (folder globs such as `"packages/*"`), `depth` or `maxComponents` for inference, and `rules`, each with `from`, `disallow`, optional `allow` and `reason`. An import that breaks a rule becomes a high-severity finding and a health deduction. See the [Devtools guide](/guide/devtools#configure-components-and-rules).

The `language` section sets the two project languages: `docs` for everything the flow writes and asks (PRD, TECHSPEC, tasks, `REVIEW.md`, questions to you) and `code` for identifiers, comments, test names, log and error messages, and commit messages. Both default to `en` and take codes such as `en`, `pt-BR` or `es`. Set them with `maverick init` or `maverick language`. See [Languages](/guide/planning#languages).

```json
{ "language": { "docs": "pt-BR", "code": "en" } }
```

The optional `flows.autoApprove` key lists the flows that approve their own pending approval gates once every blocking check passes, instead of waiting for a human. Set it with `maverick flow auto-approve <flow> on|off` or the **Auto-approve** switch in Lens; `maverick flow run <flow> <task> --auto-approve` does the same for one run. Auto-approved gates are recorded with `by: "auto-approve"` and the checked box in `REVIEW.md` or `SPEC.md` is followed by a note that no human recorded the decision.

```json
{ "flows": { "autoApprove": ["ship"] } }
```

The `workflow.default` key sets the workflow for new tasks: `standard` (the default) or `strict`. `maverick new --strict` overrides it per task.

The optional `authoring` section is given to every stage skill that writes planning artifacts (`maverick new`, `maverick generate` and `maverick instructions`). `context` is free text of up to 50 KB with project constraints, such as "money is stored in integer cents". `rules` maps a stage (`PRD`, `TECHSPEC` or `TASKS`) to extra rules for it. See [From idea to tasks](/guide/planning#project-rules).
