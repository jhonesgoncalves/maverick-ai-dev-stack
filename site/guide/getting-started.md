# Introduction

<p class="mv-kicker">GET STARTED</p>

Maverick AI is a vendor-neutral workflow for AI-assisted changes in existing repositories. It is not another coding agent: it is the structure *around* the agent — a PRD, a technical spec grounded in your code, a graph of tasks, recorded evidence and a human review decision — so a diff produced in minutes can still be defended in review.

<AnimatedTerminal title="demo — zsh" :loop="false" :lines="[
  { kind: 'cmd', text: 'npx @maverick-ai/cli init' },
  { kind: 'ok', text: '✓ project initialized: .maverick/config.json' },
  { kind: 'cmd', text: 'npx @maverick-ai/cli new &quot;Add pagination to the orders API&quot;' },
  { kind: 'ok', text: '✓ task created: add-pagination-orders-api' },
  { kind: 'muted', text: 'Pipeline: [PRD] → TECHSPEC → TASKS' },
  { kind: 'muted', text: '▶ opening Claude Code with the maverick-new skill' },
  { kind: 'cmd', text: 'npx @maverick-ai/cli validate add-pagination-orders-api --strict' },
  { kind: 'ok', text: 'PASS PRD, TECHSPEC and tasks are complete and traceable' }
]" />

## Why it exists

An agent can produce a diff quickly. Engineering confidence comes from being able to answer, later, *what was intended, what the agent was allowed to touch, how it was verified and who decided it was ready*. Maverick keeps those answers as plain files next to your code.

```text
Without: prompt → agent → diff → “looks good”
With:    idea → PRD → techspec → tasks → build → verify → review → PR
```

The CLI only starts the flow. Every stage then runs inside your AI coding agent as a skill (`maverick-new`, `maverick-build`, `maverick-review`, `maverick-ship` and six more), written in your project's docs language while the code keeps its own. See [Everything happens in the agent](/guide/planning#everything-happens-in-the-agent).

## When to use it

Use it for features, bug fixes, refactors, migrations and reviews where a human remains accountable. Every task follows one pipeline. Risky work gets the `strict` workflow, which adds a security gate before review: a one-line fix and a payment migration should not carry the same ceremony.

<PresetPicker />

## Where to go next

<div class="mv-cards">
  <a href="./installation"><b>Installation →</b><span>Node 20+, run with npx or install globally.</span></a>
  <a href="./first-task"><b>Your first task →</b><span>From an idea to review-ready evidence.</span></a>
  <a href="../lens/"><b>Maverick Lens →</b><span>Run tasks, agents and gates, and explore the architecture, locally.</span></a>
  <a href="../reference/cli"><b>CLI reference →</b><span>Search every command, alias and usage.</span></a>
</div>

::: tip Common mistake
Asking for implementation before the acceptance criteria exist. Write the PRD first — it is also what the reviewer reads.
:::
