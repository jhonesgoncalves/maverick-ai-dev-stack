# Maverick Lens

Lens is Maverick's local project-intelligence dashboard. It reads the same configuration, presets, task artifacts, command registry, and local Git state used by the CLI.

```bash
npx maverick-ai-dev-stack dashboard --open
```

The default address is `http://127.0.0.1:4173`. Lens does not upload project data or include telemetry. It refreshes its local index while running; use `--no-watch` to turn watching off.

Use the navigation and global search to inspect tasks, specs, documentation, Git state, CLI commands, available capabilities, adapters, agents, and Lab assets. Empty views mean the corresponding local artifacts were not found.
