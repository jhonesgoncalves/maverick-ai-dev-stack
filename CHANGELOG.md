# Changelog

All notable changes follow Semantic Versioning. Write user-facing changes under `[Unreleased]`; the release pipeline moves them under the version it publishes.

## [Unreleased]

### Added: `maverick why`, the reason behind every line
- `maverick why <file:line>` walks from a line to its commit, its Maverick task (the `Maverick task:` trailer), the loop iteration that wrote it (by blaming the current content against each loop's checkpoint chain, so the match is exact), that iteration's agent, model, effort, gates and integrity audit, the subtask and the `AC`/`SC` criteria it serves, the judges, the sealed suite, the flows' approvals, the human review, the pull request, and the contracts and protected paths that guard the line now. What is missing (no Maverick history, cleaned checkpoints) is listed, never invented. `why <task> --ac AC-02` is the reverse walk. Both take `--json`.
- A new MCP tool, `why`, gives agents the same chain without author names and without what the loop's feedback policy withholds from a builder.

### Added: living contracts
- `maverick done` turns a task's SPEC invariants and the criteria its committed sealed tests prove into contracts in `.maverick/contracts/C-NN.md`, anchored to the files that implement them, with an owner and a review date (`--no-contracts` skips it; `maverick contract harvest <task>` does it on demand). `unseal --commit` now records which criteria each committed test proves.
- An agent whose subtask touches an anchored file gets the contract in its prompt. The new `contracts` gate of the `ship` flow (`maverick contract check <task>`) runs the tests of every contract the change touches: they must pass, or the task's PRD must revoke the contract (`Revokes C-07: <why>`); a deleted contract test always fails. Without a task (`contract check --against <ref>`, for CI), a touched anchor is reported as drift, and `--strict` fails on untested drift.
- `contract list|show|revoke|review` manage them; overdue reviews are listed by every check. A revocation in a task's PRD takes effect when `maverick done` finishes the task.

### Added: the error ratchet
- At the end of every `loop run`, rollbacks, judge rejections, escalations and disputes become proposals in `.maverick/proposals/`, one per failure class, with the evidence (ledger entry, rejected diff) and the kind of fix each calls for: an AGENTS.md line, a lint rule, a skill, an integrity rule or a PRD question.
- `maverick proposals accept <id> [--text] [--paths] [--agents-md]` promotes one; `reject <id> --reason` declines it. Accepted rules reach an agent's prompt only when its subtask touches their paths, and `--agents-md` keeps a managed block in `AGENTS.md`. `maverick proposals stats` compares each rule's failure class per loop before and after it was accepted, and flags rules that have not reduced it for pruning.

### Added: the review budget
- `maverick attention <task>` (the `review-budget` gate of the `ship` flow, a warning) ranks every hunk of the diff by risk: blast radius, hotspot, integrity warnings, judge uncertainty or rejection of the criterion it serves, the sealed escape set (only after the seal was opened), and whether a nearby test changed. It compares with the commit the task's newest loop started from, else the merge-base with the base branch. It writes `REVIEW-BUDGET.md` with the hunks to read first, a review time range and a proof tree per criterion; unless `loop.feedback` is `detailed`, the task's copy leaves out detection kinds and the judges' evidence, and the full one is in `$MAVERICK_HOME/reports/`. `PR-DRAFT.md` gets a *Where to look* section.
- `PR-DRAFT.md`'s *Holdout* section shows the last loop's sealed counts only once a reviewer has decided on the seal.

### Changed: grounding remembers
- Grounding ranks files that earlier, similar tasks planned higher, lists files that usually change together with the chosen ones, and names who knows them best (shown to you, never sent to an agent or through MCP). Spanish stopwords join English and Portuguese.
- Every `graph`, `coupling` and `audit` run records a snapshot of the graph in `.maverick/cache/graph/`; `maverick graph --trend` shows architecture health over time.

### Added: sealed tests, acceptance tests the builder never sees
- `maverick seal <task>` has an agent from a model family no builder of the task belongs to (the build agent, `loop.providers`, routes, the fix agent) write acceptance tests from the PRD's `AC-NN` and the SPEC's `SC-NN`, read-only, in an export of the code as it is, through the surface you choose (`--surface spec|techspec|boundary`). `--from-file <dir|bundle.json>` seals a suite you wrote. Every test must fail on the code as it is; one that already passes leaves the holdout.
- The suite is encrypted (AES-256-GCM, `node:crypto`) in `$MAVERICK_HOME/vault/<project>/<task>/<seal>/` with its results and the sealer's transcript, under a hash-chained ledger of its own. The task keeps `SEALED.json`: digests, counts per criterion and the approval, never a path, a test name or a line of test code. Keys come from a file (default, `0600`), `MAVERICK_SEAL_KEY` (never passed to agents) or a command.
- The suite is checked against the code before the change: `--base <ref>`, else the tree the task's newest loop started from, else the working tree. A suite in which no test fails there is refused.
- `maverick seal approve`, `maverick seal status [--reveal]` (the tests, their results and the escape set, only at an interactive terminal) and `maverick unseal --commit [--protect] | --discard` (at review; `--protect` adds the tests to `loop.protectedPaths`). `REVIEW.md` gets a *Sealed acceptance tests* section, merge readiness waits for the decision, and `PR-DRAFT.md` gets a *Holdout* section.
- Loops query the suite at the baseline, when a subtask is done (`sealed.when`, up to `sealed.maxQueries`) and at done, in exports outside the repository. Below `sealed.threshold` a loop stops as the new outcome **`holdout-gap`** with the **overfitting index** (OI = criteria the visible evidence claims − criteria the sealed tests confirm, in points), never rolling work back. The builder learns nothing from the holdout unless `sealed.feedback` is `count` or `ac`. A loop whose builder shares the sealer's family refuses to start, and the escalation ladder skips that family. `loop.sealed` (`auto`, `required`, `off`, or `--sealed`) says whether the seal decides the loop.
- A new `sealed` flow gate runs the suite against the working tree; below its threshold with `feedback: none` it is `pending` for a human, never `revise`, and `flow approve` binds the decision to the suite and the exact tree. Sealed results never enter `EVIDENCE.md`, the ratchet or a judge's evidence.
- Maverick's own tests hold it to the invariant: after a full loop, a random marker in a sealed test is in no project file, no git object, no prompt and no leftover temporary file.
- Lens: a loop's page has a *Holdout* card (the seal, its queries and, once the loop stopped, the counts and the overfitting index; never a test), tokens in the budget, and the integrity warnings it kept with its quarantined notes. `holdout-gap` loops wait in the Inbox.

### Added: checks of the checks
- `maverick ablation <task>` (the `ablation` gate) runs each new or changed test file with the change, where it must pass, and on the code before it with only the new tests on top, where it must fail. A test that passes both ways is the new integrity kind `vacuous-test` (warn, block at `strict`); a regression guard named in the TECHSPEC Test Plan is expected to pass. Writes `ABLATION.md`.
- `maverick structure <task>` (the `architecture` gate) compares the import graphs before and after a change: a new import cycle, a new import that `architecture.rules` forbids, or a health drop beyond `architecture.maxHealthDrop` (default 5) fails it, unless TECHSPEC declares the edge under `## Architecture`. Graphs are cached by tree in `$MAVERICK_HOME/cache/`. Writes `ARCHITECTURE-CHECK.md`.
- `verification.runners` says how to run chosen test files (`{files}`, `{file}`, `{dir}`, `{name}`, `{report}` for JUnit XML); runners are otherwise inferred for node:test, Vitest, Jest, Mocha, AVA, pytest, unittest, Go, Cargo, RSpec, Minitest, PHPUnit, ExUnit and Dart.
- The built-in `ship` flow runs `ablation` and `architecture` as warnings; the built-in `loop` flow blocks on `architecture`, so no iteration can add a cycle.

### Changed: loop feedback names criteria, not detections
- New `loop.feedback` (`--feedback`): with `criteria`, the default, the next agent reads regressed visible checks in full, but integrity findings become one generic line (no rule, file or pattern) and a judge's verdict becomes its unmet criteria, never its reasoning. `generic` says only that the attempt was rejected; `detailed` keeps the 1.8 behavior. Humans always get the detail: `LOOP.md` and `LOOP-ESCALATION.md` in the task follow the policy, and their full copies, the judges' reports and transcripts live in `$MAVERICK_HOME/reports/`. `LOOP-ESCALATION.md` leaves the task once you resume. The MCP `loop_status` tool, which agents call, follows the same policy, and so do `flow run --agent` fixes.
- Notes from an iteration kept despite integrity warnings are quarantined outside the work tree instead of reaching `LOOP-NOTES.md`, and its checkpoint (and every one derived from it) is marked tainted. `maverick loop release <task>` releases the notes and acknowledges the taint, on the record.
- A resumed loop records `drift` in its ledger: changed loop, runtime, verification, architecture or sealed configuration, a changed flow, a new or dropped seal, and oracle files you edited while it was stopped. `loop.judge.isolation: "live"`, which never had an effect, is now warned about.

### Added: tokens and costs for every provider
- Claude Code, Codex, Gemini CLI and OpenCode report token usage (and Cursor, Copilot, Kiro and Antigravity when their stream carries it), normalised to input, cached input, output and reasoning tokens. `runtime.prices` estimates the cost of runs whose provider reports tokens but no cost; estimates are marked as such.
- `MAVERICK_SEAL_KEY` never reaches an agent or a command a check runs.
- Loops count tokens across providers, judges included: `loop.budgets.maxTokens` and `--max-tokens` with a forecast, tokens in `LOOP.md`, `loop status`, the ledger and `agent run`.

### Fixed: a loop that stops right after deciding an iteration keeps it
- A loop killed after an iteration's decision was in the ledger but before its state was saved (for example while marking the subtask done) rolled the accepted work back on resume and used the iteration's number again. Recovery now keeps any iteration the ledger decided, rebuilds its record, and only rolls back an iteration that was never decided.

### Changed: `flow run --agent` fixes get the guarantees of a loop iteration
- Before each fix the working tree is snapshotted through a private index, the task and check configuration are backed up, and HEAD, the branch, the index and the stash are recorded. After it, protected files are put back, a commit or checkout by the agent stops the flow, and the fix's own diff is audited: a blocking finding rolls the whole fix back.

## [1.8.1] - 2026-10-12

### Fixed: the changelog has a section for every version
- `CHANGELOG.md` listed every change since 1.0.0 under `[Unreleased]`. Each release now has its own section, 1.1.0 to 1.8.0 rebuilt from the release tags.
- The release pipeline moves the `[Unreleased]` entries under the version it publishes and uses them as the GitHub release notes; when nobody wrote an entry, it lists the `feat:`, `fix:`, `perf:`, `refactor:` and `docs:` commit subjects since the last tag (`scripts/release-changelog.mjs`).

## [1.8.0] - 2026-10-12

### Added: the `pr` flow opens the pull request on your git provider
- A new built-in `pr` flow runs the PR stage: it checks the review decision (`- [x] approve` in `REVIEW.md`) and merge readiness, writes `PR-DRAFT.md` (or keeps the one you edited), waits for the draft's `approval` gate, then opens the pull request. Approve the draft in Lens, with `maverick flow approve pr <task> approval`, or by checking its box; `flow run pr <task> --auto-approve` and `flow auto-approve pr on` approve it once the other gates pass.
- `maverick pr open <task>` (the flow's `open` gate) finds the provider from the remote's URL: GitHub (`gh`, Enterprise hosts included), GitLab (`glab`, self-hosted included), Azure DevOps (`az repos`, `dev.azure.com` and `visualstudio.com`) and Bitbucket; `pr.provider` decides for a host that does not say. On the base branch the change moves to `maverick/<task>` first; uncommitted changes outside `.maverick/` are committed with the draft's title through your hooks; the branch is pushed without force; a pull request already open for the branch is reused. Without the provider's CLI (and for Bitbucket) the branch is pushed and the provider's new-pull-request page is given. The pull request is recorded as `pullRequest` in `TASK.json`. New configuration: `pr` (`provider`, `remote`, `base`, `draft`, `commit`).
- Gates that act (the `open` gate) run only once every blocking gate before them passed, approvals included: until then they show **waiting**, so nothing is pushed before the approval. Approving in Lens or with `flow approve` runs them at once.
- `PR-DRAFT.md` now starts with the pull request's title instead of `PR Draft — <task>`; `maverick pr <task> --keep` keeps a draft that exists.

### Added: finish a task, in the CLI and in Lens
- Every workflow ends with a `done` stage. `maverick done <task> [--by] [--note]` (alias `finish`) records who finished the task and when in `TASK.json`; before the PR stage it takes `--force`, and the stage it was finished at is kept. `maverick reopen <task>` undoes it.
- Lens: at the PR stage **Next step** offers **Open pull request**, then **Review and approve** for the draft, then a link to the pull request and **Finish task**; the Run card has **Open pull request** and **Finish task** (or **Reopen task**) at any stage. **Details** shows the pull request and who finished the task, Activity records both, the Inbox lists tasks with an open pull request with **Finish**, and finished tasks leave the Inbox for a **Done** lane on the board and a **Done** filter. New `POST /api/action` actions: `done` and `reopen`; `GET /api/task` returns `pullRequest` and `done`.
- The `maverick-ship` skill drafts with the `pr` flow, asks you to approve the draft before anything is pushed, and finishes the task once you confirm the merge.

### Added: `maverick loop`, agent loops the harness decides
- `maverick loop run <task>` builds a planned task one subtask at a time, each iteration with a fresh agent context, and decides every iteration itself: it audits the diff, runs the oracle gates (the new built-in `loop` flow, or `--flow`) and compares the result with the last checkpoint. What makes nothing worse becomes a checkpoint; anything else is rolled back, verified, and the reason goes into the next prompt. A task without subtasks is looped toward its flow's goal.
- **Ratchet.** A blocking gate that passed never fails again, and more failing tests (named per runner: node:test, Jest, Vitest, pytest, Go, Cargo, Gradle, Surefire, RSpec, .NET, tsc, ESLint) are never kept. A regressed gate is run once more before it counts, so a flaky test does not roll back good work.
- **Isolation.** In place (the default), checkpoints are commits under hidden refs `refs/maverick/loops/<task>/`, written through the loop's own index: HEAD, your branch and your index are never touched. `--worktree` runs the loop in its own worktree on the branch `maverick/loop/<task>`, outside your checkout, after `loop.setup`. A loop never commits to your branch and never pushes.
- **Guardrails.** Hard budgets (`--max-iterations`, `--max-minutes`, `--max-cost`) with a forecast that stops before an iteration that would cross one; protected paths and a blast radius per iteration; the task, the flows and `.maverick/config.json` restored after every agent run, before any gate reads them; an agent that commits, checks out or forges a ref ends the loop as an integrity violation.
- **Escalation.** A diagnosis (no progress, oscillation, churn, overclaiming, empty iterations, rollback streaks, missing results) climbs a ladder per subtask: retry with the diagnosis, more reasoning, another provider from `loop.providers` (a model family not tried yet first), then a human with `LOOP-ESCALATION.md`.
- **Record.** A hash-chained ledger (`ledger.jsonl`) records every decision before it takes effect and is tied to each checkpoint commit; `maverick loop verify` detects edited, reordered, truncated or detached records. A loop recovers from a crash by rolling back the half-finished iteration. `loop status`, `stop` (`--after-iteration`), `log` and `clean` (`--delete-branch`) complete the command; `LOOP.md` and `LOOP-NOTES.md` sit in the task.
- New configuration: `loop` (providers, isolation, setup, budgets, stall, escalation, maxEffort, protectedPaths, blastRadius, integrity, ratchet, judge) and `runtime.families`. New hook events: `before-loop-iteration` (blocking), `after-loop-iteration`, `after-loop`.

### Added: an integrity guard that catches weakened checks
- `maverick integrity <task> [--against <ref>] [--level strict|standard|off] [--oracle]` audits a change for deleted, skipped or focused tests, fewer or looser assertions, lint and type suppressions, test values special-cased in conditions, and edits to check configuration, CI, protected paths and TECHSPEC's *Do Not Touch* (now enforced), in JavaScript/TypeScript, Python, Go, Rust, JVM languages, .NET, Ruby, PHP, Elixir, Dart, Swift and C/C++. It writes `INTEGRITY.md`; `--oracle` lists what it protects.
- It runs on every loop iteration, as the new `integrity` Maverick gate, blocking in `fix-checks` and as a warning in `ship`. Planned changes to a check are declared in TECHSPEC or allowed with `loop.integrity.allow`.

### Added: cross-model judge gates
- A `judge` gate asks an independent agent from a different model family (the model name decides first; unknown families are never assumed independent) to decide the criteria: inline rubric items, a rubric file, or the subtask's or PRD's acceptance criteria. It runs read-only in an export of the change outside the repository and sees the criteria, the harness's evidence and the diff, never the author's summary or transcripts. Verdicts are a validated `maverick-verdict` block; an unsure judge brings in a third family, and a disagreement waits for `maverick flow approve`, bound to the exact change. `loop run --judge` judges each finished subtask and the whole change before `done`.

### Added: Lens Loops, the `maverick-loop` skill and the `loop_status` MCP tool
- Lens **Loops** (`#/loops`): every loop of the project, live, including loops started in a terminal; a loop's ratchet chart, budget burn with the forecast, every iteration with its findings and judge verdict, the escalation, the commands to continue, a ledger check, and **Stop**, which works across processes. Loops that need you appear first in the Inbox. New endpoints: `GET /api/loops`, `GET /api/loop`, `GET /api/loop/ledger`, `POST /api/loops/stop`, and the `loop` and `loop-end` events. A judge gate the judges could not settle can be decided on the task's Gates tab.
- The `maverick-loop` skill (installed with the other flow skills) starts, watches and unblocks loops from your agent; the read-only MCP tool `loop_status` reports where a loop stands.

### Changed: headless agents report disputes instead of editing checks
- The result block gains `disputes` (a check the agent believes is wrong, with its reason) and `notes` (learnings for the next run), and every headless agent is told never to edit, skip or weaken a test or check, and never to run git commands that change the repository.

### Fixed: flow fixes and gates
- `flow run --agent` no longer reads a missing result block as "done": the gates decide, and an agent that did not say how it ended gets no second turn while they still fail. `--agent --dry-run` prints the fix prompt instead of crashing; each fix run is recorded with the flow run it produced; and `runtime.routes` apply to fixes of the subtask in progress.
- The `policy` gate in flows ran `policy <task>` and always failed; it runs `policy check <task>`.
- The diff gates (`guard`, `security`, `deps`, `review`, `policy`) used `git diff` with your git settings, so `diff.noprefix` or `color.ui=always` hid every change from them; the diff flags are now fixed.
- Check and command gates name the failing tests, so going from ten failures to three counts as progress instead of a stall. Commands that gates run inherit a flow's or loop's timeout and stop signal, and are stopped with every process they started.

## [1.7.1] - 2026-10-11

### Documentation
- Troubleshooting for `npx @maverick-ai/cli` failing with "could not determine executable" behind company registry mirrors (Azure Artifacts, Artifactory, Nexus) that cached the `0.0.0-stage` placeholder: how to check the resolved version and route the `@maverick-ai` scope to the public registry.

## [1.7.0] - 2026-10-09

### Changed: the npm package is now `@maverick-ai/cli`
- Install with `npm install -g @maverick-ai/cli` or run `npx @maverick-ai/cli`; the `maverick` command, its configuration and the repository are unchanged. `maverick-ai-dev-stack` no longer receives releases; if it is installed globally, uninstall it first (`npm uninstall -g maverick-ai-dev-stack`), since both packages provide the `maverick` command.
- The bundled MCP server and the generated GitHub Actions gate run `npx @maverick-ai/cli`. Projects that installed them earlier keep using the old package until they reinstall them.

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

## [1.6.0] - 2026-09-17

### Added
- Lens **Devtools Hub**: an application map with a static relative-import coupling ledger, Markdown previews of docs and specs, improvement proposals derived from unresolved specs and missing evidence, and **Create spec + task**, which creates a local spec-driven task (`POST /api/improvements`).

## [1.5.0] - 2026-09-17

### Added
- A redesigned Lens dashboard: evidence health, delivery lanes, attention signals and workflow composition, clickable metrics and task details (goal, verification, scope, artifacts and reports).
- `npm run dash:example` serves a fictional project (Northstar Orders) for screenshots and demos.
- `npm run ci:local` runs the same checks as CI locally.

### Fixed
- The interactive CLI works on Ink 6 and React 19.
- Lint of the dashboard's browser interactions.

### Documentation
- A Maverick Lens guide.

## [1.4.1] - 2026-09-17

### Fixed
- npm repository metadata, so the package links back to GitHub. First version published to npm (as `maverick-ai-dev-stack`).

## [1.4.0] - 2026-09-17

### Added
- Maverick Lens, a local, loopback-only project-intelligence dashboard (`maverick dashboard`, aliases `dash` and `lens`; `--open`, `--port`, `--host`, `--no-watch`, `--json`): tasks, specs, docs, Git state, CLI commands, capabilities, adapters, agents and Lab assets, with search and a live index.

## [1.3.0] - 2026-09-17

### Fixed
- The release workflow checks the npm credentials before publishing and pushes the release tag.

## [1.2.0] - 2026-09-17

### Fixed
- The npm package is published with public access.

## [1.1.0] - 2026-09-17

### Added
- Automatic releases: every push to `main` is versioned from its Conventional Commits (`feat:` minor, `!` or `BREAKING CHANGE:` major, anything else patch), tagged and published to npm with provenance.

### Fixed
- The release workflow reads the version it generated.

## [1.0.0] - 2026-09-16

- Established the public-package foundation, project-oriented CLI, documentation site, quality gates, and community files.
- Preserved the original Maverick workflow, templates, adapters, agents, playbooks, example, demo, and Lab.
