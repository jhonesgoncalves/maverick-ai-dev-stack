# `maverick lens`

```text
maverick lens [--open] [--port <port>] [--host <host>] [--no-watch] [--json] [--debug]
maverick dashboard   # alias
maverick dash        # alias
```

| Option | Default | Description |
|---|---|---|
| `--open` | off | Open the address in the default browser. |
| `--port <port>` | `4173` | Port to listen on (1–65535). |
| `--host <host>` | `127.0.0.1` | Only `127.0.0.1`, `localhost` and `::1` are accepted. |
| `--no-watch` | watch on | Do not rebuild the index when files change. |
| `--json` | off | Print `{"address","host","port","watch"}` instead of the banner. |
| `--debug` | off | Report when the browser could not be opened. |

Press `Ctrl+C` to stop the server; agent runs started from Lens are stopped with it. See the [full reference](../../site/lens/cli.md).
