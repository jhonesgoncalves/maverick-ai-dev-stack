# Maverick Lens

Maverick Lens is the local web workspace for a repository: see what needs you, move tasks through their gates, run headless agents within the permissions you allow, record review decisions and explore the architecture. It reads the files Maverick already writes and changes them only by running `maverick` commands. It listens on loopback only, uploads nothing and has no telemetry.

```bash
npx maverick-ai-dev-stack lens --open
# or, installed
maverick lens --open
```

The server listens on `http://127.0.0.1:4173`. `maverick dashboard` and `maverick dash` are aliases.

## Documentation

The complete documentation lives in the docs site, under [`site/lens/`](../../site/lens/index.md):

| Page | Covers |
|---|---|
| [Introduction](../../site/lens/index.md) | What Lens is and is not, core ideas, a map of the workspace |
| [Quick start](../../site/lens/quick-start.md) | Starting Lens, the example project, a five-minute tour |
| [The interface](../../site/lens/interface.md) | Layout, addresses, command palette, shortcuts, live refresh |
| [Inbox and tasks](../../site/lens/inbox-and-tasks.md) | Task states, the Inbox queue, list and board, creating tasks |
| [The task page](../../site/lens/task-page.md) | Next step, criteria, subtasks, gates and approvals, artifacts, the Run card |
| [Agents](../../site/lens/agents.md) | Trust model, permissions, per-step models and reasoning, starting and fixing runs |
| [Runs](../../site/lens/runs.md) | Live agent runs, transcripts, flow runs and outcomes |
| [Devtools](../../site/lens/devtools.md) | Architecture map, entry points, coupling, hotspots, impact, findings, MCP |
| [Library and changes](../../site/lens/library.md) | Specs, docs, Lab and the Git working tree |
| [Capabilities and settings](../../site/lens/system.md) | Installing skills, agents, commands and MCP servers; project settings |
| [`maverick lens`](../../site/lens/cli.md) | Command options and behaviour |
| [Configuration](../../site/lens/configuration.md) | The configuration keys Lens reads and the files it writes |
| [HTTP API](../../site/lens/api.md) | Every endpoint the page uses |
| [Security model](../../site/lens/security.md) | Loopback, host and token checks, file and command allow-lists, agent trust |
| [Troubleshooting](../../site/lens/troubleshooting.md) | Common problems, ignored folders and limits |
