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
maverick dashboard|dash|lens [--open]
```

Run `maverick help` for the current command reference. Most operational commands also support `--json`, making them useful in CI and other developer tools.

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
