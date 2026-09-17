# CLI reference

`maverick init` creates `.maverick/config.json`. `maverick task <slug>` creates artifacts for the selected workflow preset. `map`, `packet`, `run`, `verify`, `checkpoint`, `impact`, `guard`, `security`, `deps`, `review --diff`, `pr`, `handoff`, and `readiness` turn those artifacts into an auditable delivery workflow.

`policy init|show|check`, `adapter list|install`, and `ci github <task>` provide repository-level configuration, agent instructions, and an optional GitHub Actions task gate. Most operational commands accept `--json` for automation. `init <slug>` remains a compatibility alias for task creation.
