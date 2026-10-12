# Roadmap

## Now

- CLI, templates, adapters, docs, Maverick Lab, and Maverick Lens v1 (overview, tasks, specs, docs, Git, CLI explorer, capabilities, local search, cache, and watch mode).

- Language-agnostic stack detection and verification (`maverick stack`, `verify` for any ecosystem), layered and validated configuration, and a single command registry.
- Capability manager: skills, agents, commands, and MCP servers installed into six AI tools from one portable definition, with planned changes, key-level merges, a hashed lockfile, drift detection, and rollback.
- Contract-driven flows (typed gates, iteration caps, stall detection, explicit outcomes, human approvals) and acyclic subtask graphs.
- Headless agent runtime for Claude Code, Codex, Cursor CLI, Gemini CLI, and custom CLIs: trusted providers, permission ceilings, routing by subtask type, hooks, transcripts, and agent-driven flow fixes.
- Architecture intelligence across languages (resolved import graph through workspaces, path aliases and module systems; cycles, impact, hotspots, size-normalised health) and a read-only MCP server.
- Loop engineering: `maverick loop` with harness-decided iterations, checkpoints and automatic rollback, an integrity guard against weakened checks, escalation across vendors, cross-family judge gates, budgets with a forecast, and a verifiable ledger (in place or in a worktree).
- Lens Devtools: application map, entry points in any stack (code, file-system routing and contracts), component coupling with Martin metrics and boundary rules, change coupling, ownership, integrations and ranked findings.

## Next

- Capabilities (hooks, templates), remote and signed catalogs, and TOML merging for Codex MCP configuration.
- Deterministic multi-round review files.
- Parallel subtask execution in isolated worktrees, cost budgets for flows outside loops, and replaying recorded loop runs to test loop policies.
- Integrity canaries: tasks with deliberately conflicting tests that measure each provider's integrity on your own repository.
- Deeper resolution (Python namespace packages, Kotlin top-level functions), runtime capture of dependency-injection graphs, and trend tracking of health over time.

## Later / exploratory

- AST analysis, code ownership, historical insights, MCP, IDE integrations, and plugin ecosystem.
- AST-based assertion analysis for the integrity guard, and signed (not only hash-chained) loop ledgers.

No SaaS roadmap or telemetry commitment is implied.
