# Changelog

All notable changes follow Semantic Versioning.

## [Unreleased]

### Fixed: approving in Lens finishes the flow and moves the task on
- An approval recorded in Lens (or with `maverick flow approve`) went only to the flow state: the flow stayed **Awaiting approval** until it ran again, the form kept asking for a decision, and the task never left the Review stage, because the stage and `maverick readiness` read the decision from `REVIEW.md`. A decision now also lands in the gate's file (approving checks `- [x] approve` in `REVIEW.md` or `- [x] Spec approved` in `SPEC.md`; requesting changes unchecks it), and when the last run was only waiting on approvals it is decided at once instead of running every gate again. Approvals recorded before this fix reach the file on the next run.
- Lens: the **Record your decision** form sits above the gates while the flow awaits approval, a gate with a recorded decision shows it, and the review step's **Next step** card says **Review and approve**.

### Added: run a flow without waiting for an approval
- `maverick flow run <flow> <task> --auto-approve` approves pending approval gates once every blocking check passes; a run with a failing blocking check is never auto-approved. Auto-approvals are recorded with `by: "auto-approve"`, shown as **auto-approved**, and the checked box in the gate's file is followed by a note that no human recorded the decision.
- `maverick flow auto-approve <flow> on|off` makes it the default for a flow (`flows.autoApprove` in `.maverick/config.json`); without arguments it lists the flows that approve themselves. Lens has an **Auto-approve** switch on the task's Gates tab, which asks before turning it on. New endpoint: `POST /api/task-flow/auto-approve`.

### Fixed: agents check the subtask checklist as they work
- A headless subtask run was given the subtask's body but not its file, so it never checked the items and `subtask set … done` then refused with every item open. The prompt now names the task file and asks the agent to change each `- [ ]` to `- [x]` as it becomes true, one at a time, leaving unchecked (with the reason) what it did not do or could not verify, as the interactive `maverick-build` skill already does.
- Lens: marking a subtask done with open items opens a dialog listing them, with **Verify with agent** (a run that checks each item against the code and the verification commands, without redoing the work) and **Mark done anyway** (`subtask set … done --force`, after your own review), instead of an error toast.

### Fixed: `edit` runs can run the project's checks
- An `edit` run of Claude Code could edit files but every Bash call was denied, so it could not run the tests its own prompt asked for and ended in `needs-input`. `edit` now pre-approves the project's verification commands (the ones `maverick verify` runs) with any arguments, plus read-only git (`status`, `diff`, `log`, `show`); every other command is still denied, and `full` still allows everything. Claude Code uses `--allowedTools "Bash(<command> *)"`, Gemini CLI `--allowed-tools run_shell_command(<command>)`, Copilot CLI `--allow-tool shell(<command>:*)`; Codex already runs commands inside its workspace-write sandbox.
- The prompt now has a **Verification commands** section saying which shell the run has: the allowed commands (and to use `npm run test -- <file>` rather than calling a tool directly), every command, or none. Antigravity and Kiro have no per-command allow-list at `edit`, so their runs are told not to try the shell and that Maverick verifies afterwards.

### Added: model and reasoning per run, and defaults for every workflow step
- Agent runs take a model and a **reasoning effort** (`--model`, `--effort`), mapped to each tool's own flag: `--effort` for Claude Code, Antigravity and Kiro, `-c model_reasoning_effort=…` for Codex. A level the tool cannot take is refused with the levels it accepts; Gemini CLI, Cursor, Copilot and OpenCode have no reasoning setting.
- Each workflow step (`prd`, `spec`, `techspec`, `tasks`, `build`, `fix`) has a default agent, model and effort in `runtime.stages`, set with `maverick agent stage <step> --provider --model --effort` (or `--reset`) and listed with `maverick agent stage`. Precedence: flags, then `runtime.routes`, then the step, then `runtime.default`. `maverick generate` resolves each planning stage separately, `maverick new` opens the agent with the PRD step's model and effort, and `flow run --agent` uses the `fix` step.
- Built-in recommendations fill in when nothing is configured: planning gets the strongest model with high reasoning (Claude Code `opus` at `xhigh`, Codex `gpt-6-astra` at `high`, Kiro `claude-opus-5` at `xhigh`, Antigravity `gemini-3.1-pro-high`, Gemini CLI `pro`), building the coding workhorse at high reasoning (`sonnet` at `xhigh`, `gpt-6-sol` at `high`, `claude-sonnet-5` at `xhigh`, `gemini-3.8-flash-high`), fixing failed gates a lighter setting. `max` and `ultra` are never a default.
- Lens: the run dialog has **Model** and **Reasoning**, prefilled with the step's default and updated when you change the agent; **Agents → Workflow defaults** edits every step. Models come from the agent's CLI on this machine when it can list them (`codex debug models`, `agy models`, `kiro-cli chat --list-models`), cached for ten minutes, and are free text otherwise. New endpoints: `GET /api/agents/models`, `POST /api/agents/stage`. Transcripts record the effort.

### Added: Antigravity, Windsurf, Kiro, Gemini CLI and Copilot instruction templates
- `maverick adapter install` (and **Settings** in Lens) now covers Google Antigravity (`.agents/rules/maverick.md`), Windsurf (`.windsurf/rules/maverick.md`), Kiro (`.kiro/steering/maverick.md`), Gemini CLI (`GEMINI.md`), GitHub Copilot (`.github/copilot-instructions.md`) and OpenCode (`AGENTS.md`), alongside Claude Code, Codex, Cursor and the generic prompt. `adapter list` shows where each one is written.
- Fixed: Settings listed instruction templates from the project's own `adapters/` folder, so the card was missing outside the Maverick repository. It now lists every template, the file it writes and whether it is already installed.
- Agent runtime: new built-in providers **Antigravity CLI** (`agy`), **GitHub Copilot CLI** (`copilot`), **Kiro CLI** (`kiro-cli`) and **OpenCode** (`opencode`), listed in Lens **Agents** and usable with `maverick agent run`, `flow run --agent` and `maverick new`. Each maps the portable permission levels to its own flags (Antigravity `--mode plan|accept-edits` or `--dangerously-skip-permissions`; Copilot `--allow-tool`; Kiro `--trust-tools`) and parses its JSON stream; Antigravity's result status is checked because it exits 0 on failed turns. OpenCode offers only `full`, since `opencode run` approves permission questions on its own. Windsurf (Devin) has no headless CLI yet, so it stays an instruction and capability target only.
- Capabilities can target `antigravity`: skills go to `.agents/skills` (shared with Codex, written once); commands, agents and MCP servers are declined with the reason, since Antigravity is replacing workflows with skills and reads MCP servers only from user-level configuration. `.agents/rules`, `.agent/rules`, `.windsurf/rules` and `.kiro/steering` count as repository instructions.

### Changed: Lens is a delivery cockpit
- A new interface on the Maverick AI brand kit: one design system, a sidebar grouped into Workspace, Codebase, Library and System, a URL for every view, and a command palette on `Cmd/Ctrl+K` in every view (`N` creates a task, `/` filters tasks).
- **Inbox** replaces the Overview page: approvals, failing flows, broken subtask graphs, ready subtasks and tasks ready to ship, each with its action; gate pass rate; the delivery pipeline by lane; recent runs and commits.
- **Tasks** as a list grouped by state or a board by lane, with filters, sort and search. The task page shows the workflow stages, the next step and its command, acceptance criteria with spec/test/subtask traceability, files in scope, the subtask dependency graph with editable status, every flow the task uses (not only `ship`) with gate results, history, reset and the approval form, a reader for every task file, and an activity timeline.
- **Run from Lens**: task commands (`validate`, `verify`, `guard`, `security`, `deps`, `review --diff`, `readiness`, `checkpoint`, `pr`), flow runs and subtask status changes execute the real Maverick commands, one at a time, with their output in a side panel. New endpoints: `GET /api/task`, `GET /api/artifact`, `GET /api/runs`, `POST /api/action` (whitelisted commands only, token required).
- **Runs** lists every flow evaluation across tasks, gate by gate. Specs, Docs, Changes, Agents, Capabilities and the CLI reference (now grouped like `maverick help`) are rebuilt on the same design; the codebase views run inside the new shell.
- **Agents from Lens**: start a trusted agent on a ready subtask or a whole task, or let it fix the blocking issues of a failed flow (**Fix with agent**); follow its events live in Runs, stop it, and read the summary, changed files, questions, cost and transcript. The Agents view trusts and untrusts providers and sets the max permission through `maverick agent trust`. The permission ceiling and trust checks apply exactly as on the CLI, and one agent runs per task at a time. `startAgentRun` accepts an abort signal. New endpoints under `/api/agents`.
- **Capabilities** in Lens: installed capabilities with drift and updates, the catalog with search and kind filters, a detail panel with files and the tools to install into, and remove and sync. Every change runs `maverick add|remove|sync` with `--dry-run` first and shows the files it will write, then applies with `--yes`; conflicts with edited files must be confirmed. **Settings** shows `maverick doctor`, the stack and verification commands, configuration layers and the effective configuration, sets the document and code language and installs instruction templates. The codebase views use the Lens fonts, tabs, cards and tables.
- `maverick doctor` recognises a project inside a larger Git repository (a monorepo package or an example) instead of reporting no repository.
- Live refresh now updates every view, not only Devtools. Fixed: apostrophes rendered as "undefined", clicks firing several handlers, Overview lanes that did nothing, the stale task list after a flow run, `Cmd+K` always jumping to Devtools, and the approve button stuck on "Running…".

### Changed: validate checks the task's current stage
- `maverick validate <task>` without `--stage` now checks the planning stages up to the one the task is on, instead of every stage, so a task still writing its technical spec no longer reports TASKS as missing. Once planning is complete it checks everything, as before. `--all` forces every stage. This also applies to `validate` gates in flows (e.g. "Run validation" in Lens) that declare no `stage`.

### Changed: questions use the agent's answer selector
- Every flow skill has an "Asking the user" section: questions, confirmations and decisions go through the agent's answer selector (`AskUserQuestion` in Claude Code, the structured question tool elsewhere), one question per call, 2 to 4 options with the recommendation first. Lettered text options remain only as a fallback for agents without a selector.

### Added: spec-driven workflow (SDD)
- A third workflow, `spec-driven`, puts a behavioral spec in the middle of the pipeline: PRD → **SPEC** → TECHSPEC → TASKS → BUILD → VERIFY → REVIEW → PR. Choose it with `maverick new "<idea>" --spec` or `--workflow spec-driven`, in `maverick init`, or as `workflow.default`; `maverick new` also picks it for API, endpoint, webhook, integration and contract ideas when the default is `standard`.
- New `maverick-spec` skill writes `SPEC.md`: Summary, Behavior (requirements with numbered `SC-NN` WHEN/THEN scenarios), Contracts, States and Data, Invariants, Errors, Traceability (every `AC-NN` → scenarios and contracts) and Open Questions, with localized headings.
- `maverick validate --stage spec`, `maverick instructions <task> spec` and `maverick generate <task> spec` understand the new stage. Validation fails on scenarios without WHEN/THEN and undefined criteria, and under `--strict` on untraced criteria, contracts without code and empty invariants. Planning stages are now per workflow, so `standard` and `strict` tasks never ask for SPEC.md.
- New built-in `spec` flow: `maverick flow run spec <task>` checks SPEC.md and waits for a human to approve it (`- [x] Spec approved` or `maverick flow approve spec <task> spec-approval`) before the technical spec starts. `maverick` flow gates accept `stage` to validate up to one planning stage.
- The techspec, tasks, build and review skills and the builder, reviewer and test-engineer agents read SPEC.md when present: contracts are implemented exactly, the Test Plan cites `AC-NN / SC-NN`, scenario tests come first, and review checks every scenario and contract. Headless runs include SPEC.md in the scope contract.
- `workflows/spec-driven.md`, and the SDD section in the workflow guide.

### Added: init interview and one shared agent store
- `maverick init` interviews the project in an Ink wizard (checkbox list for agents and verification commands, selectable languages and workflow, esc to go back, a summary before anything is written): name, what it does and for whom, which AI agents work on it, the docs and code languages, the default workflow and the verification commands. Each answer has a flag (`--name`, `--description`, `--agents`, `--docs-language`, `--code-language`, `--workflow`, `--verify`) and `--yes` accepts the suggestions.
- Capabilities are written once to `.agents/` and each tool's skills folder is a symlink to `.agents/skills` (`.claude/skills → ../.agents/skills`); skills already in a tool's folder are moved there first (`capabilities.layout: "linked"`, the default except on Windows; `"copy"` keeps per-tool files). This applies to `init`, `new`, `add`, `sync` and `remove`; links are recorded in the lockfile and checked for drift, and `maverick sync` converts existing installs when the layout changes.
- `init` writes `AGENTS.md` from the interview when missing and links `CLAUDE.md` and `GEMINI.md` to it. `maverick init --agents <ids>` adds agents to an initialized project.
- New adapters: Kiro (`.kiro/skills`, `.kiro/agents`, `.kiro/settings/mcp.json`) and OpenCode (`.opencode/skills`, `.opencode/agents`, `.opencode/commands`, `opencode.json`).

### Changed: the CLI starts the flow, skills run it inside the agent
- The whole flow is nine skills, installed together: `maverick-new`, `maverick-prd`, `maverick-spec` (spec-driven only), `maverick-techspec`, `maverick-tasks`, `maverick-build` (ready subtasks one at a time, with their tests and Verification), `maverick-review` (verify, guard, security, deps and `review --diff`, then `REVIEW.md` except the human decision), `maverick-ship` (`readiness` and `pr`; commits, pushes or opens a PR only when asked, never merges) and `maverick-status`.
- `maverick new "<idea>"` opens the agent with all nine skills, prompted with the skill for the task's stage. `maverick new <slug>` (aliases `open`, `start`) resumes with that skill; `maverick new` with no idea lets the agent ask what to build.
- Removed the `maverick-workflow` skill and the `maverick-new`, `review-diff` and `ship-check` commands; skills replace them. Only `command/preflight` remains.
- `maverick instructions <task> --json` also returns `skill`, `language` and `tasks` (total, done, ready with paths, in progress). `maverick status` names the next skill.

### Added: project languages
- `language: { docs, code }` in config (default `en`/`en`): `docs` for everything the flow writes and asks, `code` for identifiers, comments, tests, messages and commits.
- `maverick init` asks both languages (docs defaults from `LANG`) or takes `--docs-language` and `--code-language`, and installs the flow skills for every agent CLI on the machine (`--agents` to choose, `--no-skills` to skip).
- `maverick language` (alias `lang`) shows or sets the languages.
- Headings and requirement keywords are localized for English, Brazilian Portuguese and Spanish, and every reader accepts any of them. `REVIEW.md` is written in the docs language, and the headless `maverick generate` prompt includes the language rule.

### Changed: tasks are planned by skills, not templates
- `maverick new "<idea>"` is the single entry point. It derives the slug, grounds the idea in the code (ranked files with reasons, tests, entry points, shared modules, commands), installs the planning skills into your agent, and opens Claude Code, Codex, Cursor or Gemini to plan with you. `maverick new <slug>` resumes a task.
- Planning is a pipeline, PRD → TECHSPEC → TASKS, with one skill per stage (`maverick-prd`, `maverick-techspec`, `maverick-tasks`) and the `maverick-new` orchestrator. The skills research first, ask one question at a time with a recommendation, and write each artifact in full.
- `maverick instructions <task> [stage] --json` gives a stage skill its context.
- `maverick generate <task> [stage] --agent <provider>` runs the same skills headlessly and read-only. Maverick validates each result strictly and retries once with the failures.
- `maverick validate` checks, per stage:
  - acceptance-criteria ids and requirement scenarios;
  - that referenced paths exist;
  - that the Test Plan covers every criterion;
  - task coverage.
- `REVIEW.md` is written from the PRD's criteria and the tasks. `maverick guard` checks the diff against the spec's File References. `maverick status` shows each task's stage.
- There are now three workflows, `standard`, `spec-driven` and `strict`; strict is picked automatically for security, data, payment and migration ideas.
- The MCP server has a `ground_change` tool.

### Removed
- `maverick task`, `presets`, `suggest`, `context`, `plan` and `init <slug>`.
- The lightweight, spec-driven and strict-review presets.
- The TASK, CONTEXT, PLAN, SPEC, RISK, PR, REVIEW and ADR templates.

### Fixed
- Headless custom agents keep blank lines in their output.
- Placeholder detection is upper-case only, so the Portuguese word "todo" no longer counts as a TODO.

## [1.0.0] - 2026-09-16

- Established the public-package foundation, project-oriented CLI, documentation site, quality gates, and community files.
- Preserved the original Maverick workflow, templates, adapters, agents, playbooks, example, demo, and Lab.
