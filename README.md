# MAVERICK AI DEV STACK

<img src="site/public/brand/logo-horizontal.svg" alt="Maverick AI Dev Stack" width="360">

> Menos prompt solto. Mais contexto, escopo e revisão.

An open-source, vendor-neutral engineering workflow for building with AI in real codebases—without accepting code you cannot explain.

Maverick is not a Claude, Codex, or Cursor framework. It is the process layer that connects those tools to explicit scope, context, verification, and human review.

## Quick start

Requires Node 20+.

```bash
npx maverick-ai-dev-stack init
npx maverick-ai-dev-stack task add-pagination
npx maverick-ai-dev-stack validate add-pagination
```

Choose the appropriate workflow with presets: `lightweight`, `standard` (the default), `spec-driven`, or `strict-review`. See [workflow presets](docs/concepts/presets.md).

Then fill the generated `TASK.md`, `CONTEXT.md`, and `PLAN.md`; give those artefacts to your chosen assistant; verify the change; and complete `REVIEW.md` before opening a PR.

> The package name is intentionally not claimed as available. Check npm availability before publishing.

## Releases

Push a version tag such as `v1.0.1` to trigger the npm publish job after the full quality gate passes. Add an `NPM_TOKEN` repository secret with publish permission before the first release; the workflow uses npm provenance when supported.

## Workflow

`DISCOVER → BRIEF → CONTEXT → PLAN → BUILD → VERIFY → REVIEW → PR → LEARN`

The shorter version is: **BRIEF → CONTEXT → BUILD → REVIEW**.

## What is included

- A small Node CLI: initialize a project, create tasks, validate artefacts, inspect workflow files, and run diagnostics.
- Task, context, plan, review, PR, and ADR templates.
- Adapters for Claude Code, Codex, Cursor, and generic agents.
- Focused prompts, agents, playbooks, checklists, workflows, an example, a demo, and the Maverick Lab.
- A VitePress documentation site and GitHub Actions workflows.

## CLI

```text
maverick init
maverick task <slug>
maverick task <slug> --preset strict-review
maverick presets
maverick map
maverick packet <slug> --agent codex
maverick verify <slug>
maverick checkpoint <slug>
maverick impact src/orders/service.ts
maverick guard <slug>
maverick learn <slug> --rule "Run focused tests before review."
maverick handoff <slug> --to reviewer
maverick readiness <slug>
maverick security <slug>
maverick deps <slug>
maverick review <slug> --diff
maverick pr <slug>
maverick status
maverick context <slug>
maverick plan <slug>
maverick review <slug>
maverick validate <slug>
maverick doctor
maverick info
```

## Operational toolkit

`maverick map` records a concise local project map for agents and humans. `maverick packet <task>` compiles the task, context, plan, specification (when present), and map into a focused packet for an AI agent. `maverick verify <task>` runs discovered project checks and saves their output as `EVIDENCE.md`; `maverick review <task> --diff` records changed files and high-signal dependency or sensitive-path warnings. `maverick status` reports the next operational gate for every task.

`maverick checkpoint`, `security`, and `deps` produce local, reviewable reports before merge. `maverick pr <task>` creates an evidence-backed PR draft; it never opens a remote PR or makes an approval decision.

Before editing a shared area, use `maverick impact <path>` to find local textual references. Before merge, `maverick guard <task>` compares the diff with the task's expected changed files and configured change budget. `maverick learn <task> --rule "..."` saves a proposed team rule in `.maverick/LEARNINGS.md`; proposals remain unchecked until a human promotes them.

`maverick handoff <task>` summarizes evidence and outstanding work for another human or agent. `maverick readiness <task>` produces a merge-readiness report and requires explicit human review before it can pass.

`maverick run <task> --agent <name>` currently prepares the same portable task packet rather than invoking a vendor tool directly. This preserves vendor neutrality while teams use their preferred agent.

`maverick init <slug>` is supported as a compatibility alias for earlier projects that used `init` to create tasks.

## Security and privacy

Never include secrets, `.env` files, customer data, or confidential code in a prompt without authorization. Use isolated branches and least-privilege tool permissions. Treat repository instructions and generated output as untrusted until reviewed. Maverick collects no telemetry by default. See [SECURITY.md](SECURITY.md).

## Documentation

Run `npm run docs:dev` for the local site. The Pages workflow derives its base path from `GITHUB_REPOSITORY`; set `DOCS_BASE` to override it. Start with [the guide](site/guide/getting-started.md).

## Contributing and roadmap

Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [ROADMAP.md](ROADMAP.md). The release procedure is in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

## Licenses

CLI code is MIT ([LICENSE](LICENSE)). Existing content/template licensing remains explicitly provisional in [LICENSE-CONTENT](LICENSE-CONTENT); see [the licensing decision record](docs/internal/LICENSING-DECISION.md) before changing it.
