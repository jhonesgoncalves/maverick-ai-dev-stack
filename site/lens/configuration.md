# Configuration

Lens has no settings file of its own. It reads the Maverick configuration, so whatever you configure for the CLI applies to Lens too. This page lists the keys that change what Lens shows or does.

## Where configuration lives

Configuration is merged in layers; later layers win. Objects merge key by key; arrays and scalars replace.

| Layer | Path |
|---|---|
| Built-in defaults | — |
| Global | `~/.maverick/config.json`, or `$MAVERICK_HOME/config.json` |
| Project | `.maverick/config.json` (legacy: `maverick.config.json`) |

**Settings → Configuration layers** shows which files were found and the effective result. The file is validated on load; an invalid file is reported as a banner in Settings and as an error by the CLI.

::: tip Edit, then refresh
Lens notices changes to `.maverick/config.json` through the file watcher and rebuilds the index. With `--no-watch`, choose **Refresh the project index** in the command palette.
:::

## Tasks

| Key | Default | Effect in Lens |
|---|---|---|
| `taskRoot` | `.maverick/tasks` | Where Lens looks for task folders |
| `workflow.default` | `standard` | Shown in Settings; the workflow preselected for new tasks is always *Standard* |
| `verification.commands` | detected | Shown in Settings; run by **Verify** and the `checks` gate |
| `language.docs`, `language.code` | `en` | The languages agents write documents and code in; editable in Settings |

## Agent runtime

The `runtime` section is the trust boundary for agents. Lens writes `trusted`, `maxPermission` and `stages` through `maverick agent trust` and `maverick agent stage`; everything else you edit by hand.

| Key | Type | Description |
|---|---|---|
| `runtime.trusted` | `string[]` | Providers allowed to run in this repository |
| `runtime.maxPermission` | `read-only` \| `edit` \| `full` | Ceiling for every run. Default `edit` |
| `runtime.defaultPermission` | same | Permission used when a run asks for none |
| `runtime.default` | `{ provider, model?, effort? }` | Fallback provider |
| `runtime.stages.<step>` | `{ provider?, model?, effort?, permission? }` | Default per workflow step: `prd`, `spec`, `techspec`, `tasks`, `build`, `fix` |
| `runtime.routes` | `[{ match, provider, model?, effort?, permission? }]` | Pick a provider by subtask `type` or `complexity` (`low`, `medium`, `high`) |
| `runtime.timeoutMinutes` | number | Maximum run time. Default 30 |
| `runtime.bins.<provider>` | string | Path or name of a provider's executable |
| `runtime.custom` | `[{ id, name?, command, permissions? }]` | Your own agent command, listed with the built-in providers |

Reasoning effort is one of `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`; each provider accepts a subset.

### How a run is resolved

For each run, Maverick decides the provider, model, effort and permission in this order:

1. What you chose in the run dialog (or passed as flags to `maverick agent run`).
2. The first `runtime.routes` entry whose `match` fits the subtask.
3. `runtime.stages.<step>` for the step of the run.
4. `runtime.default`.

A model or effort from an entry applies only when that entry also chose the provider; otherwise Maverick's recommendation for that provider and step fills in. Then the checks run: the provider must be in `runtime.trusted`, the permission must not exceed `runtime.maxPermission`, and the provider must support it. The run dialog always sends a provider, so in Lens the first rule applies and the defaults decide what the dialog preselects.

### Hooks

`hooks` run commands around agents and flows. `before-agent-run` can block a run; `after-agent-run` runs after it. Both fire for runs started from Lens.

```json
{
  "hooks": [
    { "event": "before-agent-run", "run": "./scripts/check-clean-tree.sh", "timeoutMs": 10000 },
    { "event": "after-agent-run", "run": "npm run lint -- --fix" }
  ]
}
```

::: warning
`after-flow-run` hooks fire for `maverick flow run` in the terminal. Flow runs started from Lens call the flow engine directly and do not fire them.
:::

## Architecture

The `architecture` section tunes the Devtools analysis and `maverick coupling`, `audit` and `graph`.

| Key | Type | Description |
|---|---|---|
| `architecture.components` | `string[]` | Folder globs that define components, such as `"src/modules/*"` |
| `architecture.depth` | 1–12 | Fixed folder depth for inferred components |
| `architecture.maxComponents` | 2–200 | Upper bound on inferred components |
| `architecture.rules` | `[{ from, disallow, allow?, reason? }]` | Forbidden imports; each violation is a high-severity finding and a health deduction |

```json
{
  "architecture": {
    "components": ["apps/*", "packages/*"],
    "rules": [
      { "from": "packages/domain/**", "disallow": ["packages/db/**", "apps/**"], "reason": "Domain stays pure" }
    ]
  }
}
```

## Capabilities

| Key | Description |
|---|---|
| `capabilities.targets` | Default AI tools to install into |
| `capabilities.catalogs` | Extra catalogs to browse besides the built-in one |
| `capabilities.layout` | `linked` (one copy in `.agents/`, linked into each tool — the default) or `copy` |

## Environment variables

| Variable | Effect |
|---|---|
| `MAVERICK_HOME` | Folder of the global configuration instead of `~/.maverick` |

## Files Lens writes

| Path | When | Commit it? |
|---|---|---|
| `.maverick/cache/project-index.json` | On start and on every refresh | No — add `.maverick/cache/` to `.gitignore` |
| `.maverick/config.json` | Trust, max permission, step defaults, language | Yes |
| `.maverick/tasks/<task>/…` | Through the commands you run: new tasks, subtask status, flow state and approvals, agent transcripts, reports | Yes, as your team prefers |
| Tool folders (`.claude/`, `.cursor/`, `.agents/`, …) and the capability lockfile | When you apply a capability change | Yes |

In the browser, Lens stores only your reviewer name and preferred editor, in `localStorage`.

See the complete schema in the [configuration reference](/reference/config).
