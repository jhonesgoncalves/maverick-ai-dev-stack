# Maverick Lens Product Audit

Audit date: 2026-09-17. The repository, rather than the initial Lens brief, is the source of truth.

## Current CLI Commands

`init`, `task` (`create`), `map`, `packet` (`run`), `checkpoint`, `impact`, `guard`, `learn`, `handoff`, `readiness`, `policy`, `adapter`, `ci`, `verify`, `security`, `deps`, `pr`, `presets`, `suggest`, `validate`, `context`, `plan`, `review`, `doctor`, `status`, `info`, and `version`.

## Current Aliases

`create`, `run`, `info`/`version`/`--version`/`-v`; `init <slug>` is backwards-compatible task creation.

## Current Presets

Lightweight, Standard, Spec Driven, and Strict Review. Their stages and artifacts are defined centrally in `src/core/presets.js`.

## Current Workflows

Feature, bugfix, refactor, migration, and code-review workflow guides; task stages are preset-driven.

## Current Artifacts

Task, context, plan, spec, review, PR, risk, task packet, verification evidence, checkpoint, review findings, scope guard, security report, dependency review, policy check, handoff, merge readiness, and project map.

## Current Project Metadata

Canonical `.maverick/config.json` (with legacy `maverick.config.json` support), package scripts/manifests, repository instructions, and project map metadata.

## Current Scanners

Project inspection detects package metadata, manifests, top-level areas, verification scripts, and instruction files. Impact lookup is a bounded text-reference scanner.

## Current Git Features

Diff review, checkpointing, changed-file scope guard, dependency-change detection, and Git availability/repository doctor checks.

## Current Validation Features

Preset-aware artifact/section validation; detected verification command execution with captured evidence; doctor checks; policy checks.

## Current Review Features

Diff findings, scope guard, dependency review, security signals, merge-readiness gates, human review decision, PR drafts, and handoff reports.

## Current Agents

Builder, Reviewer, Test Engineer, Security Reviewer, Debugger, and Architect guides.

## Current Adapters

Codex, Claude Code, Cursor, and Generic adapters, installed without overwriting existing target files.

## Current Lab Features

Experiment template, scorecard CSV, measurement and experiment-design documentation.

## Current Security Features

High-signal diff scanner, security review template/checklist, sensitive-path policy enforcement, and local/no-telemetry posture.

## Current Experimental Features

Maverick Lab measurement material and scorecard; no runtime experimental feature flag registry exists.

## Newly Discovered Features

Beyond the Lens brief: project-map generation, focused agent packets, preset recommendation, impact lookup, checkpoints, scope guard, proposed learnings, repository policy, CI workflow generation, dependency review, handoffs, merge-readiness gates, PR drafting, doctor diagnostics, adapter installation, JSON automation output, and documentation-site/release automation.

## Lens Integration Opportunities

Lens consumes the same preset definitions and an exported CLI command registry. It indexes task/report artifacts, adapters, agents, workflows, Lab material, Git state, project metadata, docs, and observable security/validation signals. Deep AST architecture analysis and dependency graphs remain explicitly inferred/future work because the core has no AST scanner.
