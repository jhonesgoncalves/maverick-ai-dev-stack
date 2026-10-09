# `maverick lens`

Starts the Lens server for the current directory.

```text
maverick lens [--open] [--port <port>] [--host <host>] [--no-watch] [--json] [--debug]
```

Aliases: `maverick dashboard`, `maverick dash`.

## Options

| Option | Default | Description |
|---|---|---|
| `--open` | off | Open the address in the default browser (`open` on macOS, `start` on Windows, `xdg-open` elsewhere). |
| `--port <port>` | `4173` | Port to listen on, from 1 to 65535. |
| `--host <host>` | `127.0.0.1` | Interface to bind. Only `127.0.0.1`, `localhost` and `::1` are accepted; any other value is an error. |
| `--no-watch` | watch on | Do not watch the repository for changes. The index is rebuilt only after actions taken in Lens or a manual refresh. |
| `--json` | off | Print `{"address","host","port","watch"}` as JSON instead of the banner, for scripts. |
| `--debug` | off | Report when the browser could not be opened. |

## Examples

```bash
# Start and open the browser
maverick lens --open

# Another port, no file watcher
maverick lens --port 4300 --no-watch

# Machine-readable startup line
maverick lens --json
# {"address":"http://127.0.0.1:4173","host":"127.0.0.1","port":4173,"watch":true}

# Without installing
npx maverick-ai-dev-stack lens --open
```

## Behaviour

- Lens indexes the directory it starts in. Run it from the repository root, or from a subproject to see only that subproject.
- On start it builds the project index and writes it to `.maverick/cache/project-index.json`.
- The process keeps running until `Ctrl+C` (`SIGINT`) or `SIGTERM`, which close the server, stop the file watcher and abort any agent runs Lens started.
- If the port is in use, startup fails with the operating system's error; choose another with `--port`.
- Several Lens processes can run at once on different ports — for example one per repository.

## Exit codes

| Code | When |
|---|---|
| `0` | Stopped normally |
| non-zero | Invalid host or port, port in use, or an unreadable configuration |

## Related commands

| Command | Use |
|---|---|
| `maverick status` | Task stages in the terminal |
| `maverick doctor` | The health checks shown in Settings |
| `maverick agent list` · `trust` · `stage` · `run` · `runs` | What the Agents and Runs views do |
| `maverick flow run <flow> <task>` · `flow approve` | What the Gates tab does |
| `maverick graph` · `coupling` · `routes` · `hotspots` · `impact` · `audit` | The Devtools analysis without a browser |
| `maverick mcp` | The same project intelligence for AI agents |

See the full [CLI reference](/reference/cli).
