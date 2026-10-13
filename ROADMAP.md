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
- Proof the agent cannot optimise: sealed tests (a holdout another model family writes before the build, encrypted out of the tree, with the overfitting index), feedback that names criteria instead of detections, quarantined notes, drift on resume, ablation of new tests, the architecture ratchet, and tokens and costs for every provider.
- Memory: `maverick why <file:line>` from a line to its criterion, iteration, evidence and decisions; living contracts left by finished tasks; the error ratchet (proposals from loop failures, promoted by a human and measured); the review budget; grounding with past tasks and co-change; graph health over time.

- Decide: repository scorecards with uncertainty and integrity penalties, reviewed route/autonomy proposals, opt-in yield governance and typed advisory decisions, integrity canaries, capability lint, and Lens scorecard/holdout panels. Sealed suites support independent review, surface lint, disputed amendments and suspension, transcript vault-access scans and an opt-in human-decided ratchet.

## Next

- Capabilities (hooks, templates), remote and signed catalogs, and TOML merging for Codex MCP configuration.
- Deterministic multi-round review files.
- Parallel subtask execution in isolated worktrees, cost budgets for flows outside loops, and replaying recorded loop runs to test loop policies.
- Memory, next steps: `why` records in the Agent Trace format, a proof tree in Lens, and grounding precision measured against the files each task really changed.
- Deeper resolution (Python namespace packages, Kotlin top-level functions), and runtime capture of dependency-injection graphs.

## Later / exploratory

- AST analysis, code ownership, historical insights, MCP, IDE integrations, and plugin ecosystem.
- AST-based assertion analysis for the integrity guard, and signed (not only hash-chained) loop ledgers.

No SaaS roadmap or telemetry commitment is implied.
