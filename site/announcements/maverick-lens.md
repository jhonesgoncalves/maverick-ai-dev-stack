# Introducing Maverick Lens

Maverick Lens is a local dashboard for inspecting the engineering context around an AI-assisted change.

## Why Lens

AI-assisted work often leaves important information split across task files, repository instructions, Git state, generated reports, and command output. Lens brings the local index of that information into one place so an engineer can inspect the system before deciding what to do next.

It is designed for the question behind a code change: *what is known, what is missing, and what still needs a human decision?*

## What is available

Lens indexes the repository where it runs and provides views for:

- Task artifacts and their verification state.
- Specifications and documentation discovered locally.
- Git branch, recent commits, and working-tree changes.
- Maverick commands, aliases, and examples.
- Workflow, review, governance, adapter, and Lab capabilities.
- Filename-based source-module discovery, agents, adapters, and Lab assets.

The Overview calls out simple observable gaps, such as missing verification evidence or unresolved questions in a specification. These are signals for review, not automated findings of correctness or approval.

## Start it locally

```bash
npx maverick-ai-dev-stack dashboard --open
```

`maverick dash` and `maverick lens` are aliases. The server defaults to `http://127.0.0.1:4173` and accepts loopback hosts only. Add `--no-watch` to stop filesystem watching, `--port <port>` to choose a local port, or `--json` for machine-readable startup information.

## Local by design

Lens reads the same local configuration and artifacts used by the CLI. It stores its cache under `.maverick/cache/project-index.json`; it does not upload the repository data or include telemetry. It also does not execute verification, make a merge decision, or modify project files other than its local cache.

## Read more

See the [Maverick Lens guide](/guide/dashboard) for navigation, search examples, cache behavior, limitations, and the full command reference.
