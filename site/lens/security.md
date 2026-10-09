# Security model

Lens runs a web server on your machine that can read your repository and start commands in it. This page explains what protects it, what it trusts and where its responsibility ends.

## Summary

| Threat | Protection |
|---|---|
| Someone on your network opens Lens | Binds to loopback only; any other host is refused at startup |
| A malicious website reads your project through Lens (DNS rebinding) | Requests whose `Host` is not loopback get `421` |
| A malicious website makes Lens change files (CSRF) | Every `POST` needs a per-process token only the Lens page knows, and a loopback `Origin` |
| A document injects script into the page | Markdown is escaped before formatting; a Content Security Policy limits scripts to the page itself |
| Lens is framed by another site (clickjacking) | `frame-ancestors 'none'` |
| A request reads arbitrary files | Only task files by validated name, and only source files the analysis already knows |
| A request runs arbitrary commands | Only a fixed list of Maverick commands with validated arguments |
| An agent does more than you allowed | Trusted providers only, capped by `runtime.maxPermission`, checked before start |
| Project data leaves the machine | No telemetry, no outbound requests from the server or the page |

## Network exposure

`maverick lens` accepts only `127.0.0.1`, `localhost` and `::1` as `--host`, and refuses to start otherwise. There is no option to listen on `0.0.0.0` or a LAN address, and there is no authentication layer, because nothing outside your machine should ever reach it.

If you need to look at Lens from another device, don't: run Lens on that device against its own checkout instead. Tunnelling the port exposes a process that can start agents with your account.

## Requests from other websites

A page you visit in the same browser can send requests to `127.0.0.1:4173`. Lens defends against that in three layers:

1. **Host check.** Every request — read or write — must carry a loopback `Host` header. A DNS-rebinding page, which reaches Lens through a hostname it controls, is refused with `421 Misdirected Request` and cannot read the index or your source.
2. **Write token.** At startup Lens generates 24 random bytes and embeds them in the HTML it serves. Every `POST` must send them as `x-lens-token`. Another origin cannot read the page, so it cannot learn the token.
3. **Origin check.** A `POST` carrying a non-loopback `Origin` is refused even with a token.

The token changes every time Lens restarts; an old tab must be reloaded.

## The page

- Responses set `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'`. The only third-party requests the page may make are for fonts.
- Every Markdown renderer escapes text first and then adds formatting, so HTML or script inside a PRD, a doc or a transcript is displayed as text.
- Links in documents open only `http` and `https` URLs, in a new tab, without a referrer.
- The page stores only your reviewer name and preferred editor in `localStorage`.

## Reading files {#reading-files}

Lens never reads a path you give it directly:

- **Task files** (`/api/artifact`) must be named `NAME.md` or `subtasks/NAME.md` inside the task folder; `..` is rejected.
- **Transcripts** (`/api/agents/transcript`) must be a `*.jsonl` name inside the task's `runs/` folder.
- **Source** (`/api/source`) is served only for files the analysis indexed — source files, route files and package manifests. `.env` files, secrets and anything outside the indexed set return `404`.
- **Environment variables** are detected by name in the code; their values are never read.

## Running commands

Lens runs Maverick in-process, through the same entry point as the CLI, and only these commands:

| Area | Commands |
|---|---|
| Task | `validate`, `verify`, `guard`, `security`, `deps`, `readiness`, `review --diff`, `checkpoint`, `pr`, `subtask set`, `flow run`, `new` |
| Agents | `agent trust`, `agent untrust`, `agent stage`, `agent run` |
| Capabilities | `catalog`, `add`, `remove`, `installed`, `sync` — previewed with `--dry-run` before `--yes` |
| Settings | `config show`, `doctor`, `language`, `stack`, `adapter install` |

Arguments are validated before they reach the command: task ids, subtask ids, statuses, provider ids, model ids (no spaces or shell characters), effort and permission levels, language codes and capability references. Commands run one at a time.

Some of these commands start processes, exactly as they would from your terminal: `verify` runs your project's lint, typecheck, test and build commands, and capability installs with `--allow-exec` register an MCP server command. Lens asks for explicit confirmation before installing anything that starts a process.

## Agents

Agents are the most powerful thing Lens can start, so they have their own rules — see [Agents](./agents.md#the-trust-model):

- A provider runs only after it is listed in `runtime.trusted` in `.maverick/config.json`, through **Trust** or `maverick agent trust`. The change is a file in the repository, visible in review.
- `runtime.maxPermission` (default `edit`) caps every run; a run can lower its permission, never raise it.
- Levels a provider cannot enforce exactly are not offered for it.
- The run is resolved and checked before anything changes, and every run writes a transcript.
- Agents run with your user account. Lens cannot sandbox them beyond what the provider's own permission flags do.

## Privacy

Lens has no telemetry and no update check. The server makes no network requests; agents you start talk to their own providers, as they would from your terminal. Git author names shown in Team stay on your machine. The index cache in `.maverick/cache/` contains document text and paths, so keep it out of version control.

## Reporting a vulnerability

See the project's [security policy](/security).
