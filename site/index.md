---
layout: home
hero:
  name: MAVERICK AI DEV STACK
  text: Context before code. Evidence before merge.
  tagline: A local-first engineering workflow for AI-assisted development that keeps intent, context, verification evidence, and human review connected from task to PR.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/jhonesgoncalves/maverick-ai-dev-stack
---

<MaverickHome />

## Why Maverick

An agent can produce a diff quickly; engineering confidence comes from making the intent, relevant context, scope, checks, and review decision inspectable. Maverick is the workflow around the coding agent, not a competing agent or model.

```text
Without: prompt → agent → diff → “looks good”
With:    intent → context → plan → build → verify → review → PR
```

## Core capabilities

- Preset-driven task artifacts for lightweight through strict-review work.
- Repository mapping, textual impact lookup, and focused task packets.
- Recorded command evidence, diff and scope review, dependency and security signals.
- Policy checks, handoffs, merge readiness, local adapters, and a local Lens dashboard.

## Maverick Lens

Inspect tasks, documentation, Git state, available commands, and workflow signals from a local dashboard—without uploading the repository. Start with `maverick dashboard --open`, then read the [Lens guide](/guide/dashboard) or the [feature announcement](/announcements/maverick-lens).

## Quickstart

```bash
npx maverick-ai-dev-stack init
npx maverick-ai-dev-stack map
npx maverick-ai-dev-stack task add-orders-pagination --preset standard
npx maverick-ai-dev-stack packet add-orders-pagination --agent codex
```

Continue with [Getting started](/guide/getting-started). AI writes; engineers decide.
