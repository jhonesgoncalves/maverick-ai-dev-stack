# Documentation V2 Audit

Audit date: 2026-09-17  
Audit basis: repository source, templates, tests, automation, and existing documentation.

## Current Product Version

- `package.json`: `1.4.0`.
- `src/cli.js` reports `1.0.0` from `maverick info`; this is an implementation/documentation inconsistency.
- The changelog only contains a `1.0.0` entry, while Lens' index reports a hard-coded `1.2.0`. Public documentation must not treat these as a single reliable version source until the implementation is aligned.

## Product Positioning

Maverick is a local-first, vendor-neutral engineering workflow layer for AI-assisted development. It connects task intent, scoped context, planning artifacts, agent handoff material, recorded verification, review, and a human PR/merge decision.

It is not an AI model, autonomous agent, code editor, or replacement for Codex, Claude Code, Cursor, or human review. The codebase supports the positioning: adapters write local instruction files and the CLI produces task artifacts; it does not call an LLM provider.

## Current CLI Commands

The command registry contains 23 command identities:

`dashboard`, `init`, `task`, `map`, `packet`, `checkpoint`, `impact`, `guard`, `learn`, `handoff`, `readiness`, `policy`, `adapter`, `ci`, `verify`, `security`, `deps`, `pr`, `presets`, `suggest`, `validate`, `context`, `plan`, `review`, `doctor`, `status`, and `info`.

The apparent count is 27 because the registry includes 27 entries; `dashboard` is in the registry and dispatch, and the help text is a shorter, outdated subset. Public CLI reference should use the command registry plus dispatch as source of truth and call out the abbreviated help output until it is updated.

## Current Command Aliases

| Canonical command | Aliases |
|---|---|
| `dashboard` | `dash`, `lens` |
| `task` | `create` |
| `packet` | `run` |
| `info` | `version`, `--version`, `-v` |
| `init` | compatibility behavior: with a slug it creates a task; without one it initializes project config |

## Current Flags

The parser accepts long `--key [value]` options and converts kebab case to camel case. Command-specific options found in source include:

- `dashboard`: `--open`, `--port`, `--host`, `--no-watch`, `--json`, `--debug`.
- task creation: `--preset`, `--risk-doc`.
- packet: `--agent`, `--json`.
- diff-based commands: `--against`; `review` additionally needs `--diff` to run a diff review.
- JSON-producing command paths: `dashboard`, `map`, `packet`, `verify`, `checkpoint`, `impact`, `guard`, `learn`, `handoff`, `readiness`, `policy`, `adapter`, `ci`, `security`, `deps`, `pr`, `suggest`, `validate`, `status`, and `doctor`.
- `doctor`: `--fix` prints suggestions; it does not make repairs.

There is no general flag validation or documented stable machine-output schema. An unknown long option can be accepted by the parser and ignored by commands that do not read it.

## Current Presets

| ID | Best for | Stages | Initial artifacts |
|---|---|---|---|
| `lightweight` | Small, obvious, low-risk work | brief → context → build → verify → review | `TASK.md`, `CONTEXT.md`, `REVIEW.md` |
| `standard` | Ordinary work in an existing codebase | brief → context → plan → build → verify → review → PR | adds `PLAN.md`, `PR.md` |
| `spec-driven` | Complex or ambiguous work | discover → spec → context → plan → build → verify → review → PR | adds `SPEC.md` |
| `strict-review` | Security-sensitive, data, payments, migration, or shared infrastructure work | brief → context → plan → build → verify → security → review → PR | standard artifacts; optional `RISK.md` with `--risk-doc` or `workflow.riskDocumentation` |

`standard` is the configured default. Presets define generated artifacts and displayed stages; they do not themselves enforce every stage.

## Current Workflow Stages

Stages are metadata from `src/core/presets.js`. Operational commands may be run independently; readiness checks generated reports plus a checked decision in `REVIEW.md` rather than enforcing stage transitions.

## Current Artifacts

Generated task artifacts include `TASK.md`, `CONTEXT.md`, `PLAN.md`, `REVIEW.md`, `PR.md`, `SPEC.md`, `RISK.md`, and `TASK.json`. Operational artifacts include `TASK-PACKET.md`, `EVIDENCE.md`, `CHECKPOINT.md`, `SCOPE-GUARD.md`, `SECURITY-REPORT.md`, `DEPENDENCY-REVIEW.md`, `REVIEW-FINDINGS.md`, `HANDOFF.md`, `MERGE-READINESS.md`, `POLICY-CHECK.md`, and `PR-DRAFT.md`.

Repository-level generated artifacts include `.maverick/config.json`, `.maverick/context/PROJECT_MAP.md`, `.maverick/policy.json`, `.maverick/LEARNINGS.md`, `.maverick/cache/project-index.json`, adapter instruction files, and optional GitHub workflow files.

## Current Reports

Verification records command, exit code, and trailing output. Checkpoint saves `git status --short` and a diff. Scope, security, dependency, policy, review, handoff, readiness, and PR commands each write their named Markdown report. These are artifacts for inspection; none automatically approves, merges, or opens a pull request.

## Current Adapters

- Codex: copies `adapters/codex/AGENTS.md.example` to `AGENTS.md`.
- Claude Code: copies `adapters/claude-code/CLAUDE.md.example` to `CLAUDE.md`.
- Cursor: copies `adapters/cursor/maverick.mdc.example` to `.cursor/rules/maverick.mdc`.
- Generic: copies `adapters/generic/ROLE_PROMPT.txt` to `.maverick/ROLE_PROMPT.txt`.

Installation refuses to overwrite an existing destination. There is no uninstall command.

## Current Agents

Six Markdown role profiles exist: Builder, Reviewer, Test Engineer, Security Reviewer, Debugger, and Architect. Each points to a role prompt. They are guidance assets, not executable agents or provider integrations.

## Current Project Intelligence Features

- `map` inspects root `package.json`, a fixed manifest list, root directories/files, standard npm scripts (`test`, `lint`, `typecheck`, `build`), and a fixed instruction-file list; it writes `PROJECT_MAP.md`.
- `impact <path>` recursively searches readable text files for the target basename without its extension, capped at 40 matches. It is a textual heuristic, not semantic reference analysis.
- Lens indexes artifacts, docs, source-file names, Git state, adapters, agents, workflows, Lab files, capabilities, and signals. It caches locally and can watch the local tree.

## Current Review Features

- `review --diff` lists changed files and signals an empty diff, sensitive-looking paths, dependency/lockfile paths, and missing evidence for strict review.
- `guard` compares changed files with backtick-delimited `Expected Changed Files` in `TASK.md`; it applies `maxChangedFilesGuideline` (default 8).
- `readiness` requires selected reports and a checked review decision before writing its status.

No automated finding means only that these implemented checks did not signal; it is not approval.

## Current Verification Features

`verify` detects the standard npm scripts from `package.json`, optionally filters them with `defaultVerification`, executes them sequentially without a shell, stores up to 12,000 trailing output characters per command, writes `EVIDENCE.md`, and fails the CLI when any selected command fails. Passing commands do not establish correctness beyond the executed checks.

## Current Security Features

`security` scans the selected Git diff for private-key material, likely token/password assignments, and selected dynamic-execution patterns. It writes a report with mandatory human checks. `policy check` can identify configured sensitive paths and require the configured preset. Neither behavior is a complete security scan, secret-management solution, or authorization review.

## Current Governance Features

`policy init` writes a JSON policy template with `maxChangedFiles`, `sensitivePaths`, and `requiredPresetForSensitivePaths`; `policy check` writes `POLICY-CHECK.md`. `learn` appends unchecked, proposed rules to `.maverick/LEARNINGS.md`. Learnings are not promoted automatically.

## Current Collaboration Features

`handoff` records available and missing reports plus a named next owner. `REVIEW.md` carries the human review checklist and decision. `readiness` requires a human decision checkbox but does not perform merge actions.

## Current Automation Features

- `ci github <task>` writes a task workflow that runs `validate` and `policy check` through `npx`.
- Repository CI runs docs link checks, lint, typecheck, CLI tests, demo tests, build, package dry run, docs build, and Pages deployment.
- Release workflow calculates Conventional Commit bump type, validates the candidate, changes version, tags, pushes, and runs npm publish. This is release automation in this repository, not a Maverick CLI feature.

## Current Lab Features

The Lab consists of `lab/experiment-template.md` and `lab/scorecard.csv`, plus brief public pages. It provides an experiment structure and scorecard data file; it does not implement automated experiments or comparative conclusions.

## Current Architecture

- `bin/maverick.js` launches the built app.
- `src/cli/app.tsx` selects Ink `HomeScreen` only for an empty interactive invocation; otherwise it delegates to `src/cli.js`.
- `src/cli.js` combines command dispatch and much of the command business logic.
- `src/core/` contains presets, command registry, suggestion, project helpers, and Lens index construction.
- `src/dashboard/` contains local HTTP server and a single-file browser UI.
- `src/ui/` contains Ink presentation components.

The core is not wholly UI-independent because `app.tsx` imports `main` from the large CLI module and command logic remains in that module. The dashboard uses a local HTTP server constrained to loopback hosts.

## Current Documentation Pages

`site/` is the VitePress source. It currently contains a home page, getting-started, installation, first-task, workflow, Lens, concepts, integrations, reference pages, Lab pages, contributing, FAQ, and security. `docs/` mixes older public content, an operational guide, reference snippets, and internal reports. The README links to both trees.

## Documentation Coverage Gaps

- Command coverage is incomplete and the help text does not reflect all dispatched commands.
- No comprehensive documentation exists for map, impact, packets, checkpoints, scope guard, dependency review, policy, learnings, handoff, readiness, CI generation, JSON output, exit behavior, reports, or file layout.
- Presets are summarized but not treated as separate decision guides.
- Lens needs its source-of-data, cache/watch behavior, search limits, and module-discovery limitation documented in public docs.
- Architecture and Ink boundary documentation is absent.

## Features Missing From Public Docs

The project map, impact search limitation, local Lens cache/watch/API behavior, policy check, learning proposal behavior, CI generator, strict-review evidence condition, compatibility `init <slug>` behavior, adapter non-overwrite behavior, and report artifacts are missing or too shallow.

## Documentation Pages That Are Too Shallow

The existing installation, getting-started, first-task, workflow, CLI, configuration, all integration, Lab, verification, review, and security pages are brief relative to implemented behavior. The Lens page was expanded in the current working tree but is duplicated outside `site/`.

## Duplicated Documentation

Public-oriented documentation exists in both `docs/` and `site/`. `site/` is the only tree built by VitePress; `docs/internal/` is appropriate for audit and implementation reports. Public content under `docs/` should be migrated, redirected, or made clearly archival to avoid two sources of truth.

## Outdated Documentation

- CLI help omits operational commands despite dispatch supporting them.
- `maverick info`, package metadata, changelog, and Lens report inconsistent versions.
- `site/.vitepress/config.mjs` links GitHub to the generic GitHub homepage rather than the repository.
- Existing installation text says package publication has not been externally verified, while README presents install commands as current. This needs precise publication-status wording or external verification.

## Broken / Wrong Links

No broken local Markdown links were found by `npm run docs:check` before this audit. The VitePress GitHub navigation destination is wrong. The README currently links to public-style documents in both the built `site/` and unbuilt `docs/` trees.

## Recommended Information Architecture

Make `site/` the sole public documentation source and retain `docs/internal/` for audits, design notes, and implementation reports. Use groups for Start Here, Work With Maverick, Workflows, Project Governance, Maverick Lens, Recipes, Concepts, Reference, Lab, Developers, and Security. Derive command and preset lists from `src/core/command-registry.js` and `src/core/presets.js` wherever practical. Add a lightweight docs quality check to complement link checking.
