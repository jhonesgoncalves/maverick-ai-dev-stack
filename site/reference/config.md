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

The optional `pr` section tunes the pull requests that `maverick pr open` and the `pr` flow open. `provider` (`github`, `gitlab`, `azure` or `bitbucket`) names the provider when the remote's host does not, for example a self-hosted GitLab at `git.example.com`. `remote` and `base` set the remote and target branch when they cannot be inferred (the branch's upstream remote or `origin`, and the remote's default branch). `draft: true` opens draft pull requests. `commit: false` stops Maverick from committing uncommitted changes, so you commit them yourself first.

```json
{ "pr": { "provider": "gitlab", "base": "develop", "draft": true } }
```

The `workflow.default` key sets the workflow for new tasks: `standard` (the default) or `strict`. `maverick new --strict` overrides it per task.

The optional `authoring` section is given to every stage skill that writes planning artifacts (`maverick new`, `maverick generate` and `maverick instructions`). `context` is free text of up to 50 KB with project constraints, such as "money is stored in integer cents". `rules` maps a stage (`PRD`, `TECHSPEC` or `TASKS`) to extra rules for it. See [From idea to tasks](/guide/planning#project-rules).

## Loops {#loops}

The optional `loop` section sets how `maverick loop run` works for this repository. Every key has a default, and the budget flags override the budgets for one run. See [Loop engineering](/concepts/loop-engineering).

| Key | Default | Meaning |
|---|---|---|
| `flow` | `loop` | The oracle flow. Its blocking non-approval gates decide each iteration; approval and judge gates are decided separately |
| `providers` | none | The rotation for the `switch-provider` step, for example `["claude-code", "codex", "gemini"]`. Each must be trusted and installed. A provider from a model family not yet tried is preferred |
| `isolation` | `in-place` | `in-place` (your checkout, checkpoints as hidden refs under `refs/maverick/loops/`) or `worktree` (its own worktree and branch `maverick/loop/<task>`) |
| `worktreeDir`, `setup`, `setupTimeoutMinutes` | `~/.maverick/worktrees`, none, `20` | Where worktrees go, and the commands run once in a new worktree, such as `npm ci` |
| `budgets` | `{ "maxIterations": 10, "maxMinutes": 120, "forecast": "p90" }` | Hard limits, plus `maxCostUsd`. `forecast` (`p90`, `mean` or `off`) stops the loop before an iteration expected to cross a limit |
| `stall` | `{ "window": <flow no-progress window>, "churnLines": 300, "rollbackStreak": 3, "overclaims": 2 }` | When the diagnosis calls a scope stuck |
| `escalation` | `["retry-with-diagnosis", "raise-effort", "switch-provider", "human"]` | The ladder, one rung per stall; it always ends with `human` |
| `maxEffort` | `xhigh` | The highest reasoning effort `raise-effort` may choose |
| `protectedPaths` | `["**/.env", "**/.env.*"]` | Globs no iteration may change |
| `blastRadius` | `{ "maxFiles": 25, "maxLines": 1500 }` | The largest change one iteration may make; lockfiles and generated files do not count |
| `integrity` | `standard` | `strict`, `standard` or `off`, or `{ "level", "severity": { "<kind>": "block" \| "warn" \| "off" }, "allow": [{ "kind", "path", "reason" }] }` |
| `ratchet` | `{ "newFailures": "count", "recheck": 1 }` | `strict` also rejects a newly failing test when the count does not grow; `recheck` runs a regressed gate again before calling it a regression |
| `gateTimeoutMinutes`, `stopPollMs` | `20`, `500` | Time limit per gate run, and how often a running agent checks for a stop request |
| `judge` | `{ "enabled": false }` | `enabled` (or `--judge`), `prefer` (judges to try first) and `isolation` (`export`, the default, or `live`) |

`runtime.families` names the model family of providers whose CLI can run several vendors' models, so judges and the `switch-provider` step can tell them apart: `{ "copilot": "openai", "aider": "deepseek" }`. Without it, Copilot, Cursor, Kiro, OpenCode and custom providers count as unknown unless the model name says otherwise, and a judge is never assumed independent of them. The `judge` stage in `runtime.stages` sets the judge's default provider, model and effort.

The loop also adds three hook events: `before-loop-iteration` (blocking: exit 2 stops the loop, and `{"appendPrompt": "..."}` adds to the prompt), `after-loop-iteration` and `after-loop`.

```json
{
  "loop": {
    "providers": ["claude-code", "codex"],
    "budgets": { "maxIterations": 12, "maxCostUsd": 5 },
    "protectedPaths": ["src/payments/**", "**/.env"],
    "integrity": { "level": "standard", "allow": [{ "kind": "oracle-config-modified", "path": "eslint.config.js", "reason": "this task adds a lint rule" }] },
    "judge": { "enabled": true }
  },
  "runtime": { "families": { "copilot": "openai" } }
}
```
