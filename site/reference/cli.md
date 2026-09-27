# CLI reference

`maverick init` creates `.maverick/config.json`. `maverick task <slug>` creates artifacts for the selected workflow preset. `map`, `packet`, `run`, `verify`, `checkpoint`, `impact`, `guard`, `security`, `deps`, `review --diff`, `pr`, `handoff`, and `readiness` turn those artifacts into an auditable delivery workflow.

`policy init|show|check`, `adapter list|install`, and `ci github <task>` provide repository-level configuration, agent instructions, and an optional GitHub Actions task gate. Most operational commands accept `--json` for automation. `init <slug>` remains a compatibility alias for task creation.

`stack [--json]` reports detected languages, frameworks, package managers, task runners, subprojects, and the exact commands `verify` will run for JavaScript/TypeScript, Python, Go, Rust, Java/Kotlin, .NET, Ruby, PHP, Elixir, Dart/Flutter, and Swift projects. `config show|validate|path` inspects the layered configuration (defaults, `~/.maverick/config.json`, project). `doctor` also checks that each detected toolchain binary is installed. `help` is generated from the same command registry used for routing and the Lens CLI explorer.

`catalog [search <text>|show <name>|validate]`, `add <capability...> [--to <tools>] [--dry-run] [--yes] [--force] [--allow-exec]`, `remove <capability...>`, `installed`, and `sync` manage skills, agents, commands, and MCP servers across Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, and Windsurf. Installs are planned before anything is written, recorded in `.maverick/capabilities.lock.json` with content hashes, and never overwrite files or JSON keys Maverick does not own unless `--force` is passed.
