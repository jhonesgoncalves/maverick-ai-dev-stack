# Quick start

This page gets Lens running on your repository, then walks through the five things most people do in their first session.

## Prerequisites

- Node.js 20 or newer.
- A repository. Maverick does not have to be initialized: Lens indexes any folder. To create and track tasks you need `.maverick/config.json`, which `maverick init` writes.
- Git is optional. Without it, Changes, Team, Hotspots and the activity feed have nothing to show.

## 1. Start Lens

From the root of the repository you want to inspect:

::: code-group

```bash [npx]
npx maverick-ai-dev-stack lens --open
```

```bash [global install]
npm install -g maverick-ai-dev-stack
maverick lens --open
```

```bash [project dependency]
npm install --save-dev maverick-ai-dev-stack
npx maverick lens --open
```

:::

The terminal confirms what was indexed and prints the address:

```text
MAVERICK AI / LENS

✓ project indexed
✓ tasks indexed
✓ specs indexed
✓ docs indexed
✓ git state indexed

Open:
http://127.0.0.1:4173

Local only. No project data is uploaded.
```

`--open` launches your default browser. Leave the terminal open while you use Lens; press `Ctrl+C` to stop the server. `maverick dashboard` and `maverick dash` are aliases of `maverick lens`. Every flag is listed in the [CLI reference](./cli.md).

<LensShot src="lens-inbox" path="/#/inbox" caption="Lens opens on the Inbox: decisions waiting on you, work in progress and recent runs." />

::: tip Another port
If `4173` is taken, choose another: `maverick lens --port 4300 --open`.
:::

## 2. Try it on the example project

Contributors to Maverick can open a fictional project instead of a real one. From a clone of the Maverick repository:

```bash
npm run lens:example
```

It writes a temporary project called **Northstar Orders** and serves it on `http://127.0.0.1:4175`. The tasks, docs, source files and signals are made up for demos and screenshots; nothing from your machine is indexed. `npm run docs:shots` captures the screenshots on this site from that project.

## 3. A five-minute tour

1. **Read the Inbox.** Lens opens on `#/inbox`: decisions waiting on you, work in progress, the gate pass rate and what is ready to ship. On a new project it offers to create the first task. → [Inbox and tasks](./inbox-and-tasks.md)
2. **Create a task.** Press `N` (or **New task**), write the goal, add context and pick a workflow. Lens runs `maverick new` and opens the task page. → [The task page](./task-page.md)
3. **Follow the next step.** The task page always shows one next step with its command: copy the PRD instructions for your agent, start a ready subtask, run `verify`, or open the gates.
4. **Explore the code.** Open **Codebase → Overview** for the health score, then **Entry points** or **Architecture**. Select any file and press **⧉ AI context** to copy a brief for your agent. → [Devtools](./devtools.md)
5. **Press `⌘K` / `Ctrl+K`.** The command palette reaches every task, view and common action. → [The interface](./interface.md)

## 4. Let an agent do the build

When a task reaches the Build stage and a subtask is ready:

1. Open **System → Agents** and press **Trust** on an installed provider, such as Claude Code or Codex. Lens runs `maverick agent trust <provider>` and records it in `.maverick/config.json`.
2. Back on the task, press **Start** on the ready subtask. Choose the agent, model, reasoning effort and permission, add an instruction if you like, and press **Start agent**.
3. Watch the events stream in **Runs**. When the agent finishes, Lens shows its summary, changed files, questions and cost, and refreshes the task.

→ [Agents](./agents.md) · [Runs](./runs.md)

## 5. Ship it

When the build is verified, open **Gates & approvals** on the task and press **Run ship**. Lens evaluates every gate of the `ship` flow. Fix failures with **Fix with agent**; when only the human gate is left, record your decision and run the flow again. At the PR stage, **Draft pull request** runs `maverick pr`.

## Next steps

- Learn how every part of the screen works in [The interface](./interface.md).
- Tune component boundaries and agent defaults in [Configuration](./configuration.md).
- Read what Lens protects against in the [Security model](./security.md).
