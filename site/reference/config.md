# Configuration

`.maverick/config.json` contains a version, project metadata, workflow requirements, adapter name, task root, and required task/context sections. A legacy root `maverick.config.json` is read as a fallback.

The optional `architecture` section tunes the analysis behind `coupling`, `audit` and Lens Devtools: `components` (folder globs such as `"packages/*"`), `depth` or `maxComponents` for inference, and `rules`, each with `from`, `disallow`, optional `allow` and `reason`. An import that breaks a rule becomes a high-severity finding and a health deduction. `maxHealthDrop` (default `5`) is how many health points one change may cost before the `architecture` gate (`maverick structure`) fails it; a new import cycle or a new rule violation fails it unless the task's TECHSPEC declares the edge under `## Architecture`. See the [Devtools guide](/guide/devtools#configure-components-and-rules).

The optional `verification.runners` list tells Maverick how to run chosen test files, which the `ablation` gate and sealed tests need: the first runner whose `match` glob (or list of globs) matches a file runs it, with `{files}`, `{file}`, `{dir}`, `{name}` and `{report}` (a JUnit XML path, for results per test case) filled in, in `cwd` when given. Without it, runners are inferred for node:test, Vitest, Jest, Mocha, AVA, pytest, unittest, Go, Cargo, RSpec, Minitest, PHPUnit, ExUnit and Dart; a file no runner matches is reported as not measured.

```json
{ "verification": { "runners": [{ "match": ["**/*.test.ts", "**/*.spec.ts"], "run": "npx vitest run {files} --reporter=junit --outputFile={report}" }] } }
```

`runtime.prices` gives a cost to runs whose provider reports tokens but no cost (Codex, Gemini CLI): USD per million tokens by model or provider id, as `{ "input", "output", "cachedInput" }`. The estimate is `(input − cached) × input + cached × cachedInput + output × output`, marked as estimated in `LOOP.md`. Maverick ships no prices, because they change; without one, the cost stays unknown and counted as such.

```json
{ "runtime": { "prices": { "codex": { "input": 1.25, "cachedInput": 0.125, "output": 10 } } } }
```

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
| `flow` | `loop` | The oracle flow. Its blocking gates decide each iteration; approval, judge and sealed gates are decided separately |
| `providers` | none | The rotation for the `switch-provider` step, for example `["claude-code", "codex", "gemini"]`. Each must be trusted and installed. A provider from a model family not yet tried is preferred |
| `isolation` | `in-place` | `in-place` (your checkout, checkpoints as hidden refs under `refs/maverick/loops/`) or `worktree` (its own worktree and branch `maverick/loop/<task>`) |
| `worktreeDir`, `setup`, `setupTimeoutMinutes` | `~/.maverick/worktrees`, none, `20` | Where worktrees go, and the commands run once in a new worktree, such as `npm ci` |
| `budgets` | `{ "maxIterations": 10, "maxMinutes": 120, "forecast": "p90" }` | Hard limits, plus `maxCostUsd` and `maxTokens` (tokens across providers). `forecast` (`p90`, `mean` or `off`) stops the loop before an iteration expected to cross a limit |
| `stall` | `{ "window": <flow no-progress window>, "churnLines": 300, "rollbackStreak": 3, "overclaims": 2 }` | When the diagnosis calls a scope stuck |
| `escalation` | `["retry-with-diagnosis", "raise-effort", "switch-provider", "human"]` | The ladder, one rung per stall; it always ends with `human` |
| `maxEffort` | `xhigh` | The highest reasoning effort `raise-effort` may choose |
| `protectedPaths` | `["**/.env", "**/.env.*"]` | Globs no iteration may change |
| `blastRadius` | `{ "maxFiles": 25, "maxLines": 1500 }` | The largest change one iteration may make; lockfiles and generated files do not count |
| `integrity` | `standard` | `strict`, `standard` or `off`, or `{ "level", "severity": { "<kind>": "block" \| "warn" \| "off" }, "allow": [{ "kind", "path", "reason" }] }` |
| `ratchet` | `{ "newFailures": "count", "recheck": 1 }` | `strict` also rejects a newly failing test when the count does not grow; `recheck` runs a regressed gate again before calling it a regression |
| `gateTimeoutMinutes`, `stopPollMs` | `20`, `500` | Time limit per gate run, and how often a running agent checks for a stop request |
| `judge` | `{ "enabled": false }` | `enabled` (or `--judge`) and `prefer` (judges to try first). Judges always work in an export; `isolation: "live"` is accepted and warned about |
| `feedback` | `criteria` | What the next agent learns from a rejection or a verdict (also for `flow run --agent`): `criteria` names unmet criteria and regressed visible checks, and turns integrity findings into one generic line; `generic` says only that the attempt was rejected; `detailed` tells everything. Humans always get the detail. See [Loop engineering](/concepts/loop-engineering#feedback-that-does-not-teach-evasion) |
| `sealed` | `auto` | Whether the task's [sealed tests](/concepts/sealed-tests) decide the loop: `auto` (when ready), `required` (no loop without them) or `off` |

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

## Sealed tests {#sealed-tests}

The optional `sealed` section sets how [sealed tests](/concepts/sealed-tests) are written and used.

| Key | Default | Meaning |
|---|---|---|
| `surface` | `spec` | What the tests may call: `spec` (SPEC's contracts), `techspec` (the planned interfaces) or `boundary` (HTTP, CLI, a process) |
| `feedback` | `none` | What a builder learns from the holdout: `none`, `count` (how many pass) or `ac` (which criteria are missed) |
| `threshold` | `1` | The share of active sealed tests that must pass for `done` |
| `when` | `milestones` | `milestones` (baseline, each finished subtask, done) or `done` |
| `maxQueries` | `6` | How many times one loop may run the suite before done |
| `timeoutMinutes` | `20` | Time limit for one run of the suite, and for the sealer |
| `requireApproval` | `true` | A human approves a suite (`maverick seal approve`) before it decides a loop |
| `encryption` | `{ "key": "file" }` | Where the vault key comes from: `file` (`$MAVERICK_HOME/keys/vault.key`, created once, `0600`), `env` (`MAVERICK_SEAL_KEY`, never passed to agents) or `command` (with `command`, for a keychain) |
| `sealer` | none | `provider`, `model`, `effort` and `prefer` for the sealer. It must come from a model family no builder belongs to; `runtime.stages.seal` sets its default too |

```json
{
  "sealed": { "feedback": "none", "threshold": 1, "sealer": { "provider": "codex", "effort": "high" } },
  "loop": { "sealed": "required" }
}
```

## Evidence-based decisions

```json
{
  "loop": { "yield": { "enabled": true, "window": 4, "metric": "tokens", "floor": 0.01 } },
  "decisions": { "enabled": true, "localCommand": "my-local-decider", "llm": false, "timeoutSeconds": 30 },
  "autonomy": { "windowDays": 30, "minSamples": 30, "paths": [{ "path": "src/orders", "autoApprove": false, "judgeRequired": true, "maxFiles": 5, "maxPermission": "edit" }] },
  "session": { "privateData": true, "web": false, "externalWrite": false },
  "sealed": { "review": { "required": true }, "ratchet": true }
}
```

Yield governance, decision triage, independent suite-review requirements and the sealed ratchet are opt-in for existing configurations. `decisions.localCommand` receives typed evidence on stdin and returns JSON; when omitted, an installed `jev` is used. `decisions.llm` enables an independent, read-only LLM fallback. Rubric changes reset human calibration; fewer than 30 labels cannot become calibrated evidence. [Decide](../concepts/decide.md) documents the command contract and the meaning of autonomy proposals.
