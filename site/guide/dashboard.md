# Maverick Lens dashboard

Maverick Lens is the local project-intelligence dashboard. It turns the repository data that Maverick already reads—configuration, task artifacts, documentation, Git state, commands, adapters, agents, and Lab files—into a browsable view. It is an inspection surface, not a hosted control plane: Lens does not upload project data and has no telemetry.

## Start Lens

From the repository you want to inspect, run either the package through `npx` or the installed CLI:

```bash
npx maverick-ai-dev-stack dashboard --open
# or, after a global installation
maverick dashboard --open
```

The server listens on `http://127.0.0.1:4173` by default. `--open` opens that local address in the operating system's default browser. `dashboard`, `dash`, and `lens` are equivalent commands.

```bash
maverick dash --port 4300
maverick lens --no-watch
maverick dashboard --json
```

Only loopback hosts are accepted (`127.0.0.1`, `localhost`, or `::1`); Lens cannot be exposed on a network interface. Press `Ctrl+C` in the terminal to stop it.

## What you see first

The Overview summarizes the current repository: task, specification, documentation, ADR, source-module, and task-artifact counts. The **Needs Attention** panel surfaces observable gaps such as a task without verification evidence or a specification with unresolved questions. It is a prompt for investigation, not an automated merge decision. Counts and warnings naturally change with the project Lens indexes.

## A practical workflow

Open Lens after creating a task or before requesting review:

```bash
maverick map
maverick task add-orders-pagination --preset standard
maverick packet add-orders-pagination --agent codex
maverick dashboard --open
```

Use **Tasks** to confirm which artifacts exist, **Git** to inspect the working tree, and **CLI** to find command syntax. When Lens flags missing verification evidence, run the relevant checks and record them before asking a reviewer to make a decision:

```bash
maverick verify add-orders-pagination
maverick review add-orders-pagination --diff
maverick readiness add-orders-pagination
```

Lens makes local project state easier to inspect; it does not run those commands, approve the change, or replace a review.

## Explore a project

Use the left navigation to move among the local index:

| View | Use it to inspect |
|---|---|
| Overview | Project counts, attention signals, and the capabilities discovered locally. |
| Tasks | Preset, validation state, and last update for each task under the configured task root. |
| Specs and Docs | Specifications and text documentation found in the project. |
| Git | Current branch, recent commits, and working-tree changes. |
| CLI | Maverick's command registry, aliases, descriptions, and runnable examples. |
| Capabilities | Workflow, project-intelligence, review, governance, adapter, and Lab capabilities. |
| Architecture | Filename-based source-module discovery, with its detection confidence. |
| Agents, Adapters, and Lab | Repository-provided agent definitions, adapter templates, and Lab assets. |

The CLI view is especially useful when onboarding: it keeps the actual command names, aliases, and examples beside the project context.

## Search examples

The search box searches the indexed arrays rather than the live filesystem. Use `Cmd/Ctrl+K` to focus it, then search for task IDs, command names, file paths, capability names, or adapter names.

```text
add-orders          Find a task and its generated artifacts
security            Find the security command and review capability
agents/             Find indexed agent definitions
TASK.md             Find task documents and their paths
```

Clear the query to return to the previously selected view.

## How the index stays current

Lens builds the index at startup and writes a local cache to `.maverick/cache/project-index.json`. While the server is running, it watches the repository and refreshes after file changes. Disable that behavior for a stable or low-overhead session:

```bash
maverick dashboard --no-watch
```

The `POST /api/refresh` endpoint also refreshes the in-memory index; `GET /api/project` returns the current index as JSON for the dashboard itself. These endpoints are served only from the local loopback server.

## Limits and interpretation

- Empty sections mean Lens did not find matching local artifacts; they do not prove the project has none.
- Module discovery is filename-based; Lens does not use an AST scanner or infer runtime architecture.
- Attention signals are high-level checks from task artifacts and specifications. Review evidence, scope, security, and merge decisions still require human judgment.
- Lens reflects the configured task root and files that the local process can read. Ignored directories such as `node_modules`, `.git`, `dist`, `build`, `coverage`, `.cache`, and `vendor` are excluded from discovery.
- The dashboard reads local Git information when available. In a directory without Git history, Git fields may be empty or report that no repository is available.

For the broader command set, see the [CLI reference](/reference/cli).
