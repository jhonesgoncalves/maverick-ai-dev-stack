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

## Complete example

From a repository clone, `npm run lens:example` opens Northstar Orders on port `4175`. Its temporary project and private home include verifiable loop ledgers, encrypted holdouts, canaries, decision calibration, policy proposals, contracts and intentional capability drift. Providers are local stubs. Start with **Scorecard**, **Sealed holdouts**, **Loops**, then **Docs → Evidence tour**. See the [example walkthrough](../../site/lens/quick-start.md#2-try-it-on-the-example-project).
