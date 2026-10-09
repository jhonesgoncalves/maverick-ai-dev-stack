# Installation

<p class="mv-kicker">SETUP</p>

Maverick is a dependency-free Node.js CLI. It needs **Node 20 or newer** and works in any repository — the language of your project does not matter.

## Run it

::: code-group

```bash [npx (no install)]
npx maverick-ai-dev-stack init
```

```bash [npm (global)]
npm install -g maverick-ai-dev-stack
maverick init
```

```bash [pnpm]
pnpm add -g maverick-ai-dev-stack
maverick init
```

:::

Every example in these docs uses the short `maverick` binary. With `npx`, replace `maverick` with `npx maverick-ai-dev-stack`.

## Check the setup

```bash
maverick doctor
```

`doctor` checks the configuration, the detected stack and that each toolchain binary it would run (for example `npm`, `pytest` or `go`) is on your `PATH`. Add `--fix` for a list of suggested fixes.

## What gets written

`init` creates a single `.maverick/config.json`. Tasks live under `.maverick/tasks/<slug>/` as JSON and Markdown you can commit and review. The Lens cache in `.maverick/cache/` is local and can be ignored.

```text
.maverick/
├── config.json          # project settings and default workflow
├── tasks/
│   └── add-pagination/  # TASK.json, PRD.md, TECHSPEC.md, subtasks/, REVIEW.md
└── cache/               # Lens index (safe to .gitignore)
```

::: info No telemetry
Maverick never sends project data anywhere. Lens listens on loopback only.
:::

Next: [your first task](/guide/first-task).
