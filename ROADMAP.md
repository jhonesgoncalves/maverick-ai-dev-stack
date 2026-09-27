# Roadmap

## Now

- CLI, templates, adapters, docs, Maverick Lab, and Maverick Lens v1 (overview, tasks, specs, docs, Git, CLI explorer, capabilities, local search, cache, and watch mode).

- Language-agnostic stack detection and verification (`maverick stack`, `verify` for any ecosystem), layered and validated configuration, and a single command registry.

## Next

- **Capabilities and adapters:** install skills, agents, commands, hooks, MCP servers, and templates into each AI tool through adapters that return planned file operations (`--dry-run`, rollback), merge only Maverick-owned keys in shared files, and record a lockfile with content hashes for drift detection.
- **Contract-driven flows:** workflow definitions with a goal, typed gates (command, agent judge, human), iteration caps, no-progress detection, and explicit terminal states; task graphs with cycle detection and status derived from artifacts; deterministic review rounds.
- **Agent runtime:** headless runs of existing AI CLIs with normalized events, routing by task type, hooks, and an explicit trust gate for anything that executes.
- **Intelligence:** dependency graph with cycles, change impact, health and hotspots across languages, plus a read-only MCP server exposing the project map, tasks, and impact.

## Later / exploratory

- AST analysis, code ownership, historical insights, MCP, IDE integrations, and plugin ecosystem.

No SaaS roadmap or telemetry commitment is implied.
