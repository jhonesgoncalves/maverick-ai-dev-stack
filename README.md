# Maverick AI Dev Stack

<p align="center"><img src="site/public/brand/logo-horizontal.svg" alt="Maverick AI Dev Stack" width="420"></p>
<p align="center"><strong>Context before code. Evidence before merge.</strong></p>
<p align="center">
  <a href="https://github.com/jhonesgoncalves/maverick-ai-dev-stack/actions/workflows/ci.yml"><img src="https://github.com/jhonesgoncalves/maverick-ai-dev-stack/actions/workflows/ci.yml/badge.svg" alt="Build, test, and publish documentation"></a>
  <a href="https://jhonesgoncalves.github.io/maverick-ai-dev-stack/"><img src="https://img.shields.io/badge/docs-GitHub%20Pages-ff6a00" alt="Documentation"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f6feb" alt="MIT license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-339933" alt="Node 20 or later"></a>
  <a href="https://github.com/jhonesgoncalves/maverick-ai-dev-stack/stargazers"><img src="https://img.shields.io/github/stars/jhonesgoncalves/maverick-ai-dev-stack?style=flat" alt="GitHub stars"></a>
</p>

Maverick is an open-source, vendor-neutral toolkit for building software with AI in real repositories—without accepting changes you cannot explain, verify, or review.

It is not a Claude, Codex, Cursor, or Copilot framework. It is the workflow layer that gives any coding agent explicit intent, scoped context, verification evidence, security checks, and a human decision before merge.

> Spec-driven when you need it. Review-driven always.

## Why Maverick?

AI can produce a diff quickly. The hard part is knowing whether that diff belongs in your codebase.

```text
INTENT → CONTEXT → PLAN → BUILD → VERIFY → REVIEW → PR
```

Maverick helps teams answer the questions that actually matter:

- What problem are we solving, and what is explicitly out of scope?
- Which files, architecture rules, and constraints must the agent understand?
- What checks were run, and what evidence do we have?
- Did the change affect security, dependencies, observability, or rollback?
- Who made the final human merge decision?

## Features

| Area | What Maverick provides |
|---|---|
| Task workflow | Lightweight, Standard, Spec Driven, and Strict Review presets |
| Context | Repository map, task packets, impact lookup, and focused artifacts |
| Verification | Detected test/lint/typecheck/build commands with saved evidence |
| Review | Diff, scope, dependency, security, and readiness reports |
| Collaboration | Handoffs, proposed learnings, and human review gates |
| Governance | Versioned repository policy, change budgets, and sensitive-path rules |
| Integrations | Provider-neutral adapters for Codex, Claude Code, Cursor, and generic agents |
| Automation | JSON output, GitHub Actions task gates, npm release pipeline, and GitHub Pages docs |

## Quick start

Requires Node.js 20 or later.

```bash
npx maverick-ai-dev-stack init
npx maverick-ai-dev-stack map
npx maverick-ai-dev-stack task add-pagination --preset standard
npx maverick-ai-dev-stack packet add-pagination --agent codex
npx maverick-ai-dev-stack dashboard --open
```

## Installation

Maverick runs in the repository you want to understand and change. It does not require an account, a cloud service, or a project-wide daemon.

### Run once with `npx`

This is the quickest way to try Maverick and is the recommended option for occasional use:

```bash
cd path/to/your-repository
npx maverick-ai-dev-stack init
```

### Install globally

Use a global installation when you want the `maverick` command available from every repository:

```bash
npm install --global maverick-ai-dev-stack
maverick init
```

### Use this checkout while contributing

Clone the repository, install its dependencies, and run the CLI through the development script:

```bash
git clone https://github.com/jhonesgoncalves/maverick-ai-dev-stack.git
cd maverick-ai-dev-stack
npm install
npm run dev -- init
```

Confirm your setup at any time with `maverick doctor`. `maverick init` writes `.maverick/config.json`; task artifacts are written to `.maverick/tasks/` by default. Both stay local to the repository and can be reviewed in Git.

Fill the generated task artifacts, use your preferred agent, then collect evidence and complete the review:

```bash
npx maverick-ai-dev-stack verify add-pagination
npx maverick-ai-dev-stack review add-pagination --diff
npx maverick-ai-dev-stack security add-pagination
npx maverick-ai-dev-stack readiness add-pagination
```

## Choose the right preset

| Preset | Use it for | Generated workflow |
|---|---|---|
| `lightweight` | Small, low-risk, obvious changes | Brief → Context → Build → Verify → Review |
| `standard` | Everyday features and fixes | Brief → Context → Plan → Build → Verify → Review → PR |
| `spec-driven` | Ambiguous, complex, or domain-heavy work | Discover → Spec → Context → Plan → Build → Verify → Review → PR |
| `strict-review` | Security, payments, data, migrations, or shared infrastructure | Brief → Context → Plan → Build → Verify → Security → Review → PR |

`standard` is the default. Every preset includes human review. Read the [preset guide](docs/concepts/presets.md) and [Spec-Driven Development guide](docs/concepts/spec-driven.md) for details.

## A complete task flow

```bash
# Understand the repository and create a task
maverick map
maverick task payment-change --preset strict-review --risk-doc

# Give a focused packet to any AI coding agent
maverick adapter install codex
maverick packet payment-change --agent codex

# Capture work and verify it
maverick checkpoint payment-change
maverick verify payment-change
maverick guard payment-change
maverick security payment-change
maverick deps payment-change
maverick review payment-change --diff --against main

# Collaborate and prepare the delivery
maverick handoff payment-change --to reviewer
maverick readiness payment-change
maverick pr payment-change
```

Generated reports stay with the task: `EVIDENCE.md`, `CHECKPOINT.md`, `SECURITY-REPORT.md`, `DEPENDENCY-REVIEW.md`, `REVIEW-FINDINGS.md`, `SCOPE-GUARD.md`, `HANDOFF.md`, and `MERGE-READINESS.md`.

## CLI highlights

```text
maverick init
maverick task <slug> --preset <preset>
maverick presets [show <preset>]
maverick map
maverick stack [--json]
maverick impact <path>
maverick packet|run <task> --agent <name>
maverick verify <task> [--json]
maverick checkpoint <task>
maverick guard <task>
maverick security <task>
maverick deps <task>
maverick review <task> --diff [--against main]
maverick policy init|show|check <task>
maverick handoff <task> --to <owner>
maverick readiness <task>
maverick pr <task>
maverick adapter list|install <name>
maverick ci github <task>
maverick status [--json]
maverick config show|validate|path
maverick doctor [--fix]
maverick dashboard|dash|lens [--open]
```

Run `maverick help` for the current command reference. Most operational commands also support `--json`, making them useful in CI and other developer tools.

## Works with any stack

Maverick detects the project stack from manifest files—nothing is executed during detection—and picks the conventional verification commands for each ecosystem:

| Ecosystem | Detected from | Default checks |
|---|---|---|
| JavaScript / TypeScript | `package.json` (npm, pnpm, yarn, bun) | `lint`, `typecheck`, `test`, `build` scripts |
| Python | `pyproject.toml`, `requirements*.txt`, `Pipfile` (pip, uv, poetry, pdm, pipenv) | ruff/flake8, mypy/pyright, pytest/unittest/Django |
| Go | `go.mod` | `go vet` or golangci-lint, `go test ./...`, `go build ./...` |
| Rust | `Cargo.toml` | `cargo clippy`, `cargo check`, `cargo test`, `cargo build` |
| Java / Kotlin | `pom.xml`, `build.gradle(.kts)` (wrappers preferred) | `test`, `package`/`assemble` |
| C# / F# | `*.sln`, `*.csproj`, `*.fsproj` | `dotnet format`, `dotnet test`, `dotnet build` |
| Ruby, PHP, Elixir, Dart/Flutter, Swift | `Gemfile`, `composer.json`, `mix.exs`, `pubspec.yaml`, `Package.swift` | rspec/rubocop, phpunit/pest/phpstan, mix, flutter/dart, swift |

`Makefile`, `justfile`, and `Taskfile.yml` targets named `lint`, `typecheck`, `test`, or `build` take precedence, because they express the project's own intent. Polyglot repositories are supported: first-level folders such as `backend/` and `frontend/` are detected as subprojects and verified when the root declares no checks. Run `maverick stack` to see exactly what `verify` will run, and override it in `.maverick/config.json`:

```json
{
  "verification": {
    "commands": ["cargo nextest run", { "name": "e2e", "command": "npm run e2e", "cwd": "web" }],
    "kinds": ["lint", "test"],
    "subprojects": "auto"
  }
}
```

Commands run without a shell; use a task-runner target for pipelines or `&&` chains. Configuration is layered—built-in defaults, then `~/.maverick/config.json` (or `$MAVERICK_HOME`), then the project—and validated on load; inspect it with `maverick config show`.

## Bounded agent loops with contract-driven flows

AI agents loop well and stop badly. A flow declares a goal, typed gates, and a contract that decides when to stop, so an agent can iterate on its own without looping forever:

```bash
maverick flow list
maverick flow run fix-checks my-task   # lint, typecheck and tests for the detected stack
maverick flow run ship my-task         # every evidence gate up to the human decision
maverick flow status my-task
```

Each run evaluates every gate and ends in one outcome: `revise` (fix the listed blocking issues and run again), `done`, `awaiting-approval` (a human must sign off), `stalled` (the same blocking issues repeated across the no-progress window), or `exhausted` (the iteration cap was reached). Only `done` exits zero. After `stalled` or `exhausted` the flow refuses to run again until a human passes `--reset`. Results go to `FLOW-<NAME>.md` and `flows/<name>.json` inside the task.

Gates are typed, never free text: `check` (stack-detected lint/typecheck/test/build), `maverick` (validate, verify, guard, security, deps, policy, review, readiness), `command`, `artifact` (file, sections, pattern), and `approval` (recorded with `maverick flow approve <flow> <task> <gate> [--reject --reason ...]`, or found in a task file such as a checked decision in `REVIEW.md`). A missing approval produces `awaiting-approval`, never `revise`, so agents are not asked to fix what only a human can decide. Gates marked `severity: warn` are reported without blocking. Add your own flows in `.maverick/flows/<name>.yaml`:

```yaml
apiVersion: maverick.flow/v1
name: api-change
description: Contract checks for public API changes.
contract:
  goal: The API change for {{task}} is compatible and signed off.
  iterationCap: 3
  noProgressWindow: 2
gates:
  - { id: checks, type: check, kinds: [lint, test] }
  - { id: contract-tests, type: command, run: make contract-test }
  - { id: api-owner, type: approval, prompt: API owner approves the change }
```

Large tasks can be split into a dependency graph that agents follow in order. `subtasks/_tasks.md` owns the edges, each `task_NN.md` owns its status, and cycles, unknown statuses, and unlisted files fail validation:

```bash
maverick subtask add my-task "Add pagination to the API" --type backend
maverick subtask add my-task "Render the paginated list" --after 01 --type frontend
maverick subtask next my-task --json
maverick subtask set my-task 01 done
```

## Run agents headlessly, within limits

Maverick can drive the AI coding CLIs you already use—Claude Code, Codex, Cursor CLI, Gemini CLI, or any other CLI declared in configuration—without a terminal UI. It builds the prompt from the task artifacts, streams normalised events, keeps a transcript, and lets a flow hand failing gates to the agent until the contract says stop:

```bash
maverick agent list                                   # installed, trusted, supported permissions
maverick agent trust claude-code --max-permission edit --yes
maverick agent run my-task --subtask next             # implement the next ready subtask
maverick agent run my-task --provider codex --permission read-only --prompt "Review the diff"
maverick flow run fix-checks my-task --agent          # agent fixes blocking issues until done, stalled, or exhausted
maverick agent runs my-task
```

Safety model:

- **Trust is a reviewed decision.** Only providers listed in `runtime.trusted` in `.maverick/config.json` run; `agent trust` writes that file so the change goes through code review.
- **Configuration is the ceiling.** Portable permissions (`read-only`, `edit`, `full`) map to each tool's own flags; `--permission` can lower the level but never exceed `runtime.maxPermission` (default `edit`). Levels a tool cannot express are refused with the reason, never approximated silently.
- **No shell, no side effects.** Agents are started with argv and the prompt on stdin, told not to commit, push, open pull requests, or touch credentials, and must end with a `maverick-result` block (`done`, `blocked`, or `needs-input`). A flow stops as soon as the agent asks for a human.
- **Bounded runs.** Timeouts (`--timeout` minutes or `runtime.timeoutMinutes`) and Ctrl-C kill the agent; flow contracts cap iterations and detect stalls.
- **Auditable.** Every run writes a JSONL transcript to `runs/` inside the task, git-ignored by default because tool output may contain secrets.

Route work by subtask type or complexity, add other CLIs, and guard runs with hooks:

```json
{
  "runtime": {
    "trusted": ["claude-code", "codex", "aider"],
    "maxPermission": "edit",
    "default": { "provider": "claude-code", "model": "sonnet" },
    "routes": [
      { "match": { "type": "frontend" }, "provider": "codex" },
      { "match": { "complexity": "high" }, "provider": "claude-code", "model": "opus" }
    ],
    "custom": [{ "id": "aider", "command": "aider --yes --model {model} --message {prompt}", "permissions": ["edit"] }]
  },
  "hooks": [
    { "event": "before-agent-run", "run": "scripts/agent-guard.sh" },
    { "event": "after-flow-run", "run": "scripts/notify.sh" }
  ]
}
```

Hooks receive the event as JSON on stdin. Exit `0` allows (a `before-agent-run` hook may print `{"appendPrompt": "..."}`), exit `2` denies with stderr as the reason; a failing `before-agent-run` hook fails closed, while `after-*` hooks only warn.

## Install capabilities into any AI tool

Write a skill, agent, command, or MCP server once and install it into every AI coding tool the repository uses. Maverick ships a built-in catalog (reviewer, builder, test-engineer, security-reviewer, debugger and architect agents; the `maverick-workflow` skill; `preflight`, `review-diff` and `ship-check` commands) and also reads your own capabilities from `.maverick/capabilities/` and any `capabilities.catalogs` paths in configuration.

```bash
maverick catalog                                  # browse; also: search <text>, show <name>, validate
maverick add reviewer maverick-workflow --to claude-code,cursor --dry-run
maverick add reviewer maverick-workflow --to claude-code,cursor --yes
maverick installed                                # versions, drift, and available updates
maverick sync                                     # restore edited or deleted managed files
maverick remove reviewer
```

| Kind (entry file) | Claude Code | Codex | Cursor | Copilot | Gemini CLI | Windsurf |
|---|---|---|---|---|---|---|
| Skill (`SKILL.md`) | `.claude/skills/` | `.agents/skills/` | `.cursor/skills/` | `.github/skills/` | `.gemini/skills/` | `.windsurf/skills/` |
| Agent (`AGENT.md`) | `.claude/agents/` | `.codex/agents/*.toml` | `.cursor/agents/` | `.github/agents/*.agent.md` | `.gemini/agents/` | not supported |
| Command (`COMMAND.md`) | `.claude/commands/` | not supported | not supported (use skills) | `.github/prompts/*.prompt.md` | `.gemini/commands/*.toml` | `.windsurf/workflows/` |
| MCP server (`MCP.json`) | `.mcp.json` | not yet (TOML) | `.cursor/mcp.json` | `.vscode/mcp.json` | `.gemini/settings.json` | user-level only |

Targets come from `--to`, then `capabilities.targets` in configuration, then the tools detected in the repository. Every install shows a plan first and needs `--yes` (or an interactive confirmation). Files and JSON keys Maverick did not create are never overwritten without `--force`, and shared files such as `.mcp.json` are merged key by key. MCP servers that start a local process also need `--allow-exec`. `.maverick/capabilities.lock.json` records versions and SHA-256 hashes so `installed`, `sync`, and `doctor` can detect drift; commit it with the generated files. A failed install restores every file it touched.

A capability is a folder with one entry file. Agents declare portable permissions (`read`, `edit`, `shell`, `web`) that each adapter maps to its own tool names, and commands use `{{ARGUMENTS}}`, which is translated to `$ARGUMENTS`, `{{args}}`, or `${input:args}`:

```markdown
---
name: release-notes
description: Drafts release notes from merged changes. Use when preparing a release.
version: 1.0.0
argument-hint: <version>
---

Draft release notes for {{ARGUMENTS}} from the commits since the previous tag.
```

## Repository policy and team learning

Create a repository-local policy with a change budget and sensitive paths:

```bash
maverick policy init
maverick policy check payment-change
```

Policies are plain JSON under `.maverick/policy.json`, so they can be reviewed with the code. Teams can capture proposed reusable practices without silently turning them into agent instructions:

```bash
maverick learn payment-change --rule "Run focused tests before requesting review."
```

## AI agent integrations

Maverick ships safe, non-overwriting adapters for:

```bash
maverick adapter list
maverick adapter install codex
maverick adapter install claude-code
maverick adapter install cursor
maverick adapter install generic
```

See the [Codex](site/integrations/codex.md), [Claude Code](site/integrations/claude-code.md), [Cursor](site/integrations/cursor.md), and [generic agent](site/integrations/generic.md) integration guides.

## Automation, CI, and releases

The repository pipeline runs documentation link checks, lint, type checks, CLI tests, demo tests, package build, package dry-run, documentation build, and GitHub Pages deployment on successful pushes to `main`.

Generate a task-level GitHub Actions gate when a task needs explicit workflow checks:

```bash
maverick ci github payment-change
```

To publish a release to npm, configure the repository secret `NPM_TOKEN`, update `package.json`, and push a matching tag:

```bash
npm version 1.0.1
git push origin main --follow-tags
```

Every non-release commit pushed to `main` creates a version, a `vX.Y.Z` tag, and an npm publication automatically. The release workflow follows Conventional Commits: `feat:` creates a minor release, `!` or `BREAKING CHANGE:` creates a major release, and other commits create a patch release. It publishes with npm provenance using the `NPM_TOKEN` secret. The [release checklist](RELEASE-CHECKLIST.md) has the complete process.

## Documentation

- [Documentation site](https://jhonesgoncalves.github.io/maverick-ai-dev-stack/)
- [Getting started](site/guide/getting-started.md)
- [Operational toolkit](docs/guide/operational-toolkit.md)
- [Maverick Lens dashboard](docs/guide/dashboard.md)
- [Workflow presets](docs/concepts/presets.md)
- [CLI reference](site/reference/cli.md)
- [Configuration reference](site/reference/config.md)
- [Templates](site/reference/templates.md)
- [Maverick Lab](site/lab/introduction.md)

Run the documentation locally with `npm run docs:dev`.

To preview a screen-safe, fictional Lens project for screenshots or demos, run `npm run dash:example`. It starts a temporary local dashboard on `http://127.0.0.1:4175` and opens it when possible.

## Security and privacy

Maverick collects no telemetry by default. Never place secrets, production data, or unauthorized proprietary code into prompts. Treat repository instructions and generated output as untrusted until reviewed, use least-privilege tool permissions, and keep final merge accountability with a human.

Read the full [security policy](SECURITY.md).

## Contributing

Contributions are welcome—especially improvements that make AI-assisted engineering more explainable, testable, secure, and accessible across tools.

1. Read the [contribution guide](CONTRIBUTING.md) and [code of conduct](CODE_OF_CONDUCT.md).
2. Create a focused task and keep your diff narrow.
3. Run `npm run check` and `npm run docs:build`.
4. Explain compatibility and verification evidence in your pull request.

See the [roadmap](ROADMAP.md) for directions and the [Maverick Lab](site/lab/introduction.md) for workflow experiments.

## License

CLI code is released under the [MIT License](LICENSE). Existing content and template licensing remain described in [LICENSE-CONTENT](LICENSE-CONTENT).
