# Troubleshooting

Answers to the problems people run into most, and the limits worth knowing before you rely on a number.

## Startup

### The port is already in use

Another process — often a second Lens — holds `4173`. Pick another port:

```bash
maverick lens --port 4300 --open
```

### "Lens host must be loopback-only"

`--host` accepts only `127.0.0.1`, `localhost` and `::1`. Lens cannot be exposed on a network interface; see the [security model](./security.md#network-exposure).

### The browser did not open

`--open` uses `open` (macOS), `start` (Windows) or `xdg-open` (Linux). On a headless machine or without a desktop handler, nothing happens; open the printed address yourself. Add `--debug` to see when opening failed.

### "Lens could not load the project index"

The page could not read `/api/project` — the server stopped, or the index failed to rebuild, usually because `.maverick/config.json` became invalid. Check the terminal running Lens, run `maverick doctor` or `maverick config show` to see the validation error, fix the file and reload.

## Data

### A section is empty

Empty means Lens found nothing that matches, not that the project has none:

- **Tasks** are read from `taskRoot` (`.maverick/tasks` by default). Check the path in Settings.
- **Specs** need `PRD.md`, `SPEC.md` or `TECHSPEC.md` files; **Docs** need Markdown or text files outside ignored folders.
- **Changes**, **Team**, **Hotspots** and the activity feed need Git history.
- **Entry points** need a supported framework, file-system router or API contract; see [what is detected](./devtools.md#what-is-detected).
- **Lab** only appears when a `lab/` folder exists.

### Lens does not update after I edit a file

- Was Lens started with `--no-watch`? Use **Refresh the project index** in the palette (`⌘K`), or restart without the flag.
- Changes inside `.git`, `node_modules` and `.maverick/cache` are ignored on purpose.
- The view does not reload while a dialog or output panel is open; close it.
- The live dot in the sidebar reads *Reconnecting…* when the event stream dropped — reload the page.

### A task is at the wrong stage

Lens computes the stage from the files in the task folder, exactly like `maverick status <task>`. If the CLI agrees, the files are what need changing: a missing section, an unchecked subtask, a flow that has not run.

### Numbers differ from the CLI

They come from the same code. Usually one side is stale: press **↻ Re-analyze** in Devtools, or check that both run in the same directory — Lens analyses the folder it was started in.

## Actions

### "Missing or invalid Lens token"

The tab belongs to an earlier Lens process; the token changes on every start. Reload the page.

### "No agent can run yet"

No provider is both **trusted** and **installed**. Open **Agents**: install the CLI (the Binary column shows what Lens looks for, overridable with `runtime.bins`), then press **Trust**.

### "permission … exceeds runtime.maxPermission"

The run asked for more than the ceiling. Choose a lower permission, or raise **Max permission** in Agents after reviewing what it allows.

### "An agent is already running on *task*"

One agent per task at a time. Stop the running one in Runs or wait for it to finish.

### A live run disappeared after restarting Lens

Live runs live in the process that started them, and stopping Lens stops them. The transcript stays: open it under **Runs → Agents**.

### Setting a subtask to done is refused

Its checklist has unchecked items. Lens offers **Verify with agent** or **Mark done anyway**; see [Finishing a subtask with open items](./task-page.md#finishing-a-subtask-with-open-items).

### I approved, but the flow still says *Awaiting approval*

Recording a decision does not finish the flow. Press **Run ship** again to evaluate the gates with your decision in place.

## What Lens ignores {#what-lens-ignores}

Discovery skips these folders everywhere in the tree:

`node_modules`, `.git`, `dist`, `build`, `coverage`, `.cache`, `vendor`, `target`, `.venv`, `venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.gradle`, `.dart_tool`, `_build`, `obj`, `.next`, `.nuxt`, `.turbo`, `.idea`, `.vscode`

`.maverick` is indexed for tasks, but its `cache/` folder is not.

## Limits

| Limit | Value |
|---|---|
| Files analysed by Devtools | 5,000; the report says when it was truncated |
| Largest file analysed | 512 KB |
| Folder depth for documents | 8 levels |
| Git history for Team, Hotspots and change coupling | Last 12 months |
| Flow runs listed | 200 most recent |
| Agent events kept per run | Last 3,000 |
| Lines shown by the source viewer | 4,000 |
| Recent commits in Changes | 5 |

## Interpreting results

- **Static analysis.** Dependency-injection containers, reflection, generated code and routes registered in loops are not followed.
- **Guards.** A write route without a route-level guard may be protected by middleware Lens cannot see; treat it as a question.
- **States.** The Inbox and task states are derived from files and flow runs. Review, scope, security and merge decisions remain human judgments: Lens records the decision you make, it never makes it.

Still stuck? Open an issue with the output of `maverick doctor --json` and, if relevant, the transcript of the run.
