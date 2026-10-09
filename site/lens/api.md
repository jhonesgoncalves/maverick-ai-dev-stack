# HTTP API

The Lens page is a plain client of a small JSON API served by the same process. This page documents it for people who want to understand what the UI does, debug it or script against a running Lens on their own machine.

::: warning Not a public API
The API exists for the Lens page. It can change between minor versions, it only listens on loopback, and every write needs a token that is regenerated each time Lens starts. For automation, prefer the CLI with `--json` or `maverick mcp`.
:::

## Conventions

- **Base URL:** `http://127.0.0.1:4173` (or the host and port Lens was started with).
- **Host check:** requests whose `Host` header is not `127.0.0.1`, `localhost` or `::1` get `421 Misdirected Request`.
- **Writes:** every `POST` must send `x-lens-token: <token>` and, when an `Origin` is present, a loopback origin. Otherwise the answer is `403`. The token is embedded in the page as `<meta name="lens-token">`.
- **Bodies:** `POST` bodies are JSON (`content-type: application/json`). Responses are JSON with `cache-control: no-store`.
- **Errors:** `{ "error": "message" }` with `400` (invalid input), `404` (unknown task, file or run), `409` (conflict, such as an agent already running on the task or a task id that exists) or `500`.
- **Command results:** endpoints that run a Maverick command answer `200` even when the command fails, with `ok: false`, its output and the error — a failing `verify` is a result, not a server error.
- **Serialization:** commands that write run one at a time in a single queue.
- **Task ids** match `^[a-z0-9][a-z0-9-]{1,80}$`.

## Project

### `GET /api/project`

The project index: the same JSON cached in `.maverick/cache/project-index.json`.

| Field | Contents |
|---|---|
| `generatedAt` | When the index was built |
| `project` | Name, root, languages, frameworks, package managers, manifests, Maverick version, default workflow, active adapter |
| `commands` | The CLI command registry |
| `presets` | Workflows with how many tasks use each |
| `tasks[]` | Per task: `id`, `title`, `preset`, `stages`, `stage`, `next`, `goal`, `acceptanceCriteria`, `scope`, `artifacts`, `reports`, `validation`, `subtasks` (`total`, `done`, `ready`, `problems`), `flows` (`flow`, `status`, `runs`), `updated` |
| `specs`, `docs`, `adrs` | Documents with path, title, type, excerpt and content |
| `modules`, `couplings`, `graph` | Import graph nodes and edges, health, cycles, hubs, hotspots |
| `improvements`, `signals` | Suggested tasks and warnings |
| `git` | `branch`, `changes`, `commits` |
| `adapters`, `agents`, `workflows`, `lab`, `capabilities` | Repository assets |

### `POST /api/refresh`

Rebuilds the index and notifies every open page. `204 No Content`.

### `GET /api/events`

A Server-Sent Events stream.

| Event | Data | When |
|---|---|---|
| `ready` | `{ version }` | On connect |
| `changed` | `{ version }` | After the index was rebuilt |
| `agent` | `{ version, id, event }` | Each event of a live agent run |
| `agent-end` | `{ version, id, status }` | A live agent run finished |

## Tasks

### `GET /api/task?task=<id>`

Everything the task page shows: `id`, `title`, `workflow`, `stages`, `stage`, `next`, `created`, `goal`, `goals`, `nonGoals`, `scope`, `criteria[]` (`id`, `text`, `specified`, `tested`, `tasks`), `subtasks[]` (`id`, `file`, `title`, `status`, `ready`, `type`, `complexity`, `dependsOn`, `checklist`, `criteria`, `files`), `subtaskProblems`, `statuses`, `artifacts[]` (`file`, `kind`, `size`, `updated`), `flows[]` (`name`, `description`, `contract`, `gates`, `status`, `approvals`, `lastRun`, `history`), `evidence` and `activity[]`.

### `GET /api/artifact?task=<id>&file=<name>`

One Markdown file of the task: `{ file, content }`. `file` must be `NAME.md` or `subtasks/NAME.md`.

### `POST /api/improvements`

Creates a task with `maverick new`.

```json
{ "slug": "Add pagination to orders", "title": "Add pagination to orders", "detail": "Cursor based", "preset": "standard" }
```

`slug` is normalized to an id. `preset` is `standard`, `spec-driven` or `strict`. Answers `201 { slug, preset }`, or `409` when the task cannot be created.

### `POST /api/action` {#actions}

Runs one whitelisted command on a task.

| `action` | Extra fields | Runs |
|---|---|---|
| `validate` · `verify` · `guard` · `security` · `deps` · `readiness` · `checkpoint` · `pr` | — | `maverick <action> <task>` |
| `review` | — | `maverick review <task> --diff` |
| `subtask-set` | `id` (`01`…), `status` (`pending`, `in-progress`, `blocked`, `done`), `force` | `maverick subtask set <task> <id> <status> [--force]` |
| `flow-run` | `flow` (default `ship`), `reset` | The flow engine, as `maverick flow run` |

```json
{ "action": "verify", "task": "add-orders-pagination" }
```

Answers `{ ok, action, command, output, error? }`; for `flow-run`, `{ ok, action, run, next, notes }`. Any other action is `400`.

## Flows

### `GET /api/task-flow?task=<id>&flow=<name>`

The flow definition (`name`, `description`, `contract`, `gates`), its state and `lastRun`.

### `POST /api/task-flow/run`

`{ task, flow?, reset? }` → `{ flow, task, run, next, notes }`.

### `POST /api/task-flow/approval`

Records a decision on an approval gate.

```json
{ "task": "add-orders-pagination", "flow": "ship", "gate": "human-review", "decision": "reject", "by": "Ana", "reason": "Missing test for an empty page" }
```

`decision` is `approve` or `reject`; a rejection needs a `reason`. `by` is trimmed to 80 characters and `reason` to 500. Answers `{ approval }`.

### `GET /api/runs`

Every flow run across tasks, newest first, at most 200: `{ runs: [{ task, flow, at, outcome, iteration, results }] }`.

## Agents

### `GET /api/agents`

Providers (`id`, `name`, `bin`, `installed`, `trusted`, `permissions`, `efforts`, `recommended`, `custom`), `stages`, `stageDefaults`, `configuredStages`, `permissions`, `efforts`, `maxPermission`, `default`, `routes` and `timeoutMinutes`.

### `GET /api/agents/models?provider=<id>`

`{ provider, efforts, models: [{ id, name? }] }` — listed by the provider's CLI when it supports it, suggested otherwise.

### `POST /api/agents/trust`

`{ provider, trusted?, maxPermission? }`. Runs `maverick agent trust` (or `untrust` with `"trusted": false`). Answers `{ ok, command, output }`.

### `POST /api/agents/stage`

`{ stage, provider?, model?, effort?, reset? }`. Runs `maverick agent stage`. Answers `{ ok, command, data }`.

### `POST /api/agents/run`

Starts a run and answers `202` immediately with the run (without events).

```json
{ "task": "add-orders-pagination", "subtask": "02", "provider": "claude-code", "model": "sonnet", "effort": "high", "permission": "edit", "prompt": "Keep the public API unchanged" }
```

Optional `issues` (up to 50 strings) makes it a fix run. `409` when an agent is already running on the task; `400` when the provider is not trusted, the permission exceeds the ceiling or the subtask is unknown.

### `POST /api/agents/stop`

`{ id }`. Aborts a live run.

### `GET /api/agents/run?id=<id>`

A live run with all its events: `id`, `task`, `subtask`, `provider`, `model`, `effort`, `stage`, `permission`, `kind` (`subtask`, `task` or `fix`), `status`, `startedAt`, `endedAt`, `result`, `events`.

### `GET /api/agents/runs`

`{ live: [...], history: [...] }` — live runs of this process and recorded transcripts of every task, newest first.

### `GET /api/agents/transcript?task=<id>&file=<name>.jsonl`

`{ task, file, events }`, the last 3,000 events.

## Capabilities and settings

| Endpoint | Body or query | Does |
|---|---|---|
| `GET /api/capabilities` | — | `{ catalog, installed, adapters, errors }` |
| `GET /api/capability?ref=<kind/name>` | — | One catalog entry, from `maverick catalog show` |
| `POST /api/capabilities` | `{ action: "add" \| "remove" \| "sync", refs, to?, allowExec?, force?, apply? }` | Without `apply`, a `--dry-run` plan; with `apply: true`, the change. Answers `{ ok, data, output, command }` |
| `GET /api/settings` | — | `{ config, configError, doctor, language, stack }` |
| `POST /api/settings` | `{ action: "language", docs, code }` or `{ action: "adapter", id }` | Runs `maverick language` or `maverick adapter install` |

## Codebase

### `GET /api/devtools[?refresh]`

The Devtools report: files, edges, components, routes, integrations, history, findings and health. Built on first request and cached until the index refreshes; `?refresh` forces a new analysis.

### `GET /api/source?file=<path>`

`{ file, root, lines, truncated, imports, importedBy }` for a file the analysis knows — a source file, a route's file or a manifest. Anything else is `404`. At most 4,000 lines are returned.

## Example: reading the index from a script

```bash
curl -s http://127.0.0.1:4173/api/project | jq '.tasks[] | {id, stage}'
```

Writes need the token from the page, which is intentional: only the page served by that Lens process can change anything.
