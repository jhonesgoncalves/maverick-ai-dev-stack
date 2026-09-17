# Repository audit

Date: 2026-09-16

## Current state

Maverick already has a sound, tool-agnostic workflow and useful source material: a dependency-free ESM CLI, templates, prompts, adapters, agents, playbooks, checklists, a small orders demo, and an example task. The CLI currently exposes `init <slug>`, `validate`, `status`, and `prompt`; it stores tasks below `.maverick/tasks` but reads its configuration from a legacy root `maverick.config.json`.

The repository is not yet publish-ready: `package.json` is private and has only minimal scripts; there is no lockfile, TypeScript configuration, lint/format setup, GitHub Actions, Pages site, release guidance, standard community files, or package-content boundary. The checkout available for this audit has no `.git` directory, so remote metadata and link verification cannot be inferred locally.

## Strengths

- Clear thesis: workflow and human review over vendor-specific prompting.
- Small runtime footprint and Node 20 baseline already established.
- Existing content covers the core workflow well and should be retained.
- Templates and CLI already agree on the basic task artefacts.
- The example and dependency-free demo provide a safe learning path.

## Debt and risks

- CLI command names conflict with the intended product UX (`init` currently creates a task rather than initializing a project).
- Configuration location and schema diverge from the intended `.maverick/config.json` contract.
- Validation only checks headings and does not distinguish placeholder content or workflow requirements.
- `prompt` maps to filenames that do not exist, making the command unusable.
- No robust overwrite protection at individual-file level, no project doctor, and no portable path-focused coverage.
- Documentation is flat, non-site Markdown and has no navigation, publishing instructions, or Pages deployment.
- `LICENSE-CONTENT` is a placeholder rather than a license text; the content licensing decision must remain explicit.
- Package metadata cannot safely claim a repository, homepage, npm availability, or badges until a remote is confirmed.
- `bonus/` is marketing material and should remain repository-only, not be shipped to npm.

## Proposed decisions

1. Keep JavaScript ESM for now. The runtime is compact and Node's built-in test runner avoids a build dependency; `// @ts-check` plus strict JSDoc provides incremental type safety without a gratuitous migration.
2. Use VitePress for a lightweight Markdown documentation site. Its dependency is development-only and it has direct GitHub Pages support.
3. Retain `maverick-ai-dev-stack` as the package name because availability is unverified; expose the `maverick` executable and document `npx maverick-ai-dev-stack` as the safe verified local name.
4. Make `.maverick/config.json` canonical while accepting the legacy root config as a compatibility fallback.
5. Use `package.json#files` as the npm allowlist; do not add `.npmignore` unless it becomes necessary.

## Migration plan

1. Establish community, security, release, package, quality, and CI foundations.
2. Refactor the CLI into small modules and provide project initialization, task creation, validation, context, review, doctor, information, and compatibility aliases.
3. Standardize templates, agents, adapters, playbooks, example, and lab while preserving existing concepts.
4. Build the VitePress site and GitHub Pages workflow with a configurable base path.
5. Add behavior-focused tests, build/package checks, and a local install smoke test.

## Files expected to change or be added

- `package.json`, `bin/`, `src/`, `test/`, templates, adapters, agents, playbooks, README, docs, lab, and demo documentation.
- New `.github/` workflows/templates, `site/`, `scripts/`, and root community/release files.
- Existing legacy configuration is retained as a compatibility bridge; repository-only material is not removed without a reason recorded in the implementation report.
