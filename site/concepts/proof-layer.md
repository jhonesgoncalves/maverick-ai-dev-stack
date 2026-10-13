# The proof layer

<p class="mv-kicker">CONCEPTS · AGENTS WRITE, MAVERICK PROVES, ENGINEERS DECIDE</p>

Loops, sealed tests and the checks of the checks produce evidence for one change. The proof layer scales that evidence: several agents working at once without stepping on each other, several providers competing on the same work, a recorded loop replayed under another policy, and a signed receipt that says what proved a change, not only who wrote it.

## Parallel work: lanes and the work graph

```sh
maverick loop graph <task> --plan     # predicted collisions and lanes, nothing runs
maverick loop graph <task> [--max-lanes 4] [--max-iterations 6]
```

For every pair of subtasks that are ready, Maverick predicts a collision from three signals: files both declare under `## Files`, files one changes that the other's files import within two hops of the import graph, and files the history says change together. Subtasks that may collide share a **lane** and run in series; the others run in parallel lanes. Each lane is a loop in a worktree of its own, from the same integration commit, with its own checkpoint refs (`refs/maverick/loops/<task>/lanes/<lane>/`), branch (`maverick/lane/<task>/<lane>`), lock and `LOOP-<lane>.md`. A lane is done when its subtasks are; the judge of the whole change and the sealed holdout never run inside a lane.

The lanes meet at the **fan-in**: an integration worktree merges their branches and runs the whole oracle. A merge conflict, or a gate that passed before and fails on the merged code, is a **real collision**: it is recorded next to the prediction (`predicted: false` when nobody saw it coming), and the subtasks involved go back to pending and run again in the next wave, on the merged code. When every subtask is done, every blocking gate passes on the merged work and the sealed tests (if the task is sealed) decide the whole change once. The merged work stays on `maverick/graph/<task>-<id>` for you to merge.

`.maverick/tasks/<task>/graphs/<id>.json` keeps every wave: lanes, predicted and real collisions, the fan-in score, wall-clock time against the lanes' total time. Lens shows them under **Loops → Work graphs**.

A loop can also be started as a lane by hand: `maverick loop run <task> --lane <id> --only 01,02 [--start-point <ref>]`.

## The arena

```sh
maverick arena run <task> --subtask 03 --providers claude-code,codex[,gemini] [--max-iterations 4]
maverick arena status <task> [<arena-id>]
maverick arena confirm <task> <arena-id> [--winner <id> --reason "..."] [--by <name>]
maverick arena stats
```

The same subtask is built by every provider at once, each by a bounded loop in a worktree of its own, from one snapshot of your working copy and a private copy of the task, so competitors never share state. The winner comes out of evidence, in this order, each step only breaking the ties of the one before: the subtask finished, the oracle passes, the sealed holdout's score, integrity findings, a judge from a model family **none** of the competitors belongs to, vacuous tests (ablation), the architecture delta, and the smaller diff. A tie is reported as a tie.

Nothing reaches your working copy until a human confirms. `confirm` applies the winner's change (the working copy must still be the arena's base), marks the subtask done and records whether you agreed with the evidence; choosing against it needs `--reason`. The other attempts stay as rejected patches in their loops' ledgers, and every competitor's loop joins the task's loops, so the [scorecard](/concepts/decide) counts them; decided arenas add a win rate per provider. `arena stats` says how often the winner by evidence was the human's choice.

## The flight recorder

```sh
maverick loop replay <task> [--loop <id>] --set stall.window=3 --set escalation=human
maverick loop fork <task> --from <iteration> --provider codex [--loop <id>]
```

`loop replay` runs a recorded loop's iterations again through the pure policy functions (budgets and their forecast, the ratchet, the stall diagnosis, the escalation ladder) under other settings. Nothing runs: the agents' work is the recording. It answers questions such as "with a stall window of 3, the loop would have stopped after iteration 5 and saved $0.40". The replay is exact until its first decision differs from the recorded one; from there the real agent would have seen another checkpoint, provider or prompt, so the replay says it diverged instead of guessing. Settings you can change: `budgets.*`, `stall.*`, `yield.*`, `escalation`, `maxEffort`, `ratchet.newFailures`.

`loop fork` is time travel with a new run: a loop from a recorded checkpoint, with another provider, model or effort, in a worktree of its own at that checkpoint's commit, on a copy of the task whose subtasks are as they were then. The original loop, its task and your checkout are untouched; the result stays on `refs/maverick/forks/<task>/<id>`.

In Lens, a loop's page has a **Flight recorder** card: every checkpoint with its score and spend, a fork command for each, and a form that replays the loop under other settings.

## The proof receipt

```sh
maverick proof keygen
maverick proof sign <task> [--commit <ref>]
maverick proof verify [<task>] [--commit <ref> | --file PROOF.json] [--key pub.pem]
maverick proof show <task>
maverick proof export <task> --format agent-trace|aibom
```

The receipt is an [in-toto](https://in-toto.io) Statement in a DSSE envelope, signed with ed25519 from `node:crypto`. Its subject is the code: the git tree without `.maverick/`, so writing the receipt into the task never changes what it signs. Its predicate, `https://maverick.dev/proof/v1`, says what proved the change: the digests of the PRD, SPEC and TECHSPEC it was built against, the head and outcome of every loop ledger, the gates, the sealed holdout and its overfitting index (only once a reviewer decided on the seal), the integrity findings, the judges' verdicts, the human approvals and the models that built, judged and sealed it.

`sign` writes `PROOF.json` in the task and, when the change is committed, attaches the receipt to the commit as a note in `refs/notes/maverick` (share it with `git push origin refs/notes/maverick`). With `proof.onPullRequest`, the `pr` flow signs the commit it pushes and pushes the note. `verify` checks the signature against the keys the repository trusts (`.maverick/proof-keys/*.pem`, written by `keygen` and `sign`), then that the code is the tree the receipt names, that the PRD and SPEC are the ones it was proved against, and that every loop ledger still has the head it recorded; ledgers are local, so in CI their absence is a note, not a failure. The GitHub Actions workflow from `maverick ci github <task>` verifies the pull request's head commit.

The signing key comes from `MAVERICK_PROOF_KEY` (a PEM, for CI; never passed to an agent or a check), `proof.keyFile`, or `$MAVERICK_HOME/keys/proof-ed25519.pem`.

`export --format agent-trace` writes [Agent Trace](https://agent-trace.dev) 0.1: for each file the task's loops changed, the line ranges each loop iteration wrote in the current content, with the agent's model, the checkpoint and the ledger position, found by blaming the files against each loop's checkpoint chain; lines edited by hand since are left out. `--format aibom` writes a CycloneDX 1.6 bill of materials of the models and their roles. Both point back at the receipt.

## Explain-back (experimental)

```json
{ "review": { "explainBack": true } }
```

Before approval, a read-only agent reads the SPEC and the diff in an export of the change and asks the reviewer three questions about what the change does: an input, an error, an edge case, each tied to files of the diff. A reviewer who read the change can answer them; one who skimmed it knows where to look. Answer in Lens (the task's overview) or with `maverick explain <task> --answer Q1 --text "..."`; the answers go into `REVIEW.md` under `## Explain-back` and into `EXPLAIN-BACK.md`. It is the `explain-back` gate of the `ship` flow and never blocks. The same diff keeps its questions; `--force` asks again.

## Flows v2

A `maverick.flow/v2` file is a typed DAG, never a general graph framework:

```yaml
apiVersion: maverick.flow/v2
name: guarded
description: Checks in parallel, an integrity decision, then a human; a failure goes to a read-only agent.
contract:
  goal: "{{task}} passes and a human approves it"
nodes:
  - { id: start, type: fan-out }
  - { id: checks, type: gate, gate: { type: check } }
  - { id: keep, type: gate, gate: { type: maverick, run: architecture } }
  - { id: both, type: join }
  - { id: integrity, type: decision, rubric: integrity, risk: low }
  - { id: approve, type: human, prompt: Approve the change }
  - { id: explain, type: agent, prompt: Explain why the checks fail, context: { include: [gates, diff] } }
  - { id: shipped, type: end, outcome: done }
  - { id: fix, type: end, outcome: revise }
  - { id: ask, type: end, outcome: stalled }
edges:
  - { from: start, to: checks }
  - { from: start, to: keep }
  - { from: checks, to: both, when: pass }
  - { from: keep, to: both, when: pass }
  - { from: checks, to: explain, when: fail }
  - { from: explain, to: fix }
  - { from: both, to: integrity, when: pass }
  - { from: integrity, to: approve, when: refactor }
  - { from: integrity, to: ask, when: [weakening, uncertain, needs-human] }
  - { from: approve, to: shipped, when: approve }
  - { from: approve, to: ask, when: reject }
```

| Node | Runs | Outputs an edge can follow |
|---|---|---|
| `gate` | any v1 gate under `gate:` | `pass`, `fail`, `pending`, `skipped` |
| `agent` | an agent with a context policy (`context.include`: `prd`, `spec`, `techspec`, `subtask`, `diff`, `gates`, `notes`, `review`), read-only in an export by default, or `permission: edit` under the guarantees of a loop iteration | `done`, `partial`, `blocked`, `needs-input`, `failed`, `no-result`, `rolled-back` |
| `decision` | a typed [decision](/concepts/decide) (`rubric`, `risk`) | the rubric's answers, or `needs-human` |
| `human` | an approval (`flow approve`) | `approve`, `reject`, `pending` |
| `fan-out`, `join` | split and meet; a join passes only when every branch reached it | `pass` (and `fail` for a join) |
| `end` | an explicit outcome: `done`, `revise` or `stalled` | none |

The edge `when` is the typed contract: a file that routes on an output its source cannot produce, has a cycle, has no `end`, or lets an advisory decision lead straight to a `done` end is refused when it loads (`maverick flow validate`). One run is one pass in topological order; the contract's iteration cap and no-progress window still decide whether another may follow. A v2 flow's gate and human nodes are also its `gates`, so a loop can use it as its oracle and `flow approve` works on its human nodes. Lens draws the DAG on the task's gates tab, each node colored by its last output and the path the run took lit.

## Smaller pieces

- **Judge in parts.** A diff larger than a judge gate's `maxDiffBytes` is judged in up to `maxParts` parts (default 4), each with the same criteria and evidence; a criterion is met when a part shows it with evidence, every issue counts, and the confidence is the lowest of the parts.
- **Grounding precision.** `maverick new` keeps the files grounding suggested in `TASK.json`; `maverick grounding [<task>]` compares them with the files the task's loops kept: precision (how much of the suggestion was used) and recall (how much of the change was suggested).
- **Proof tree in Lens.** `maverick attention` also writes `review-budget.json`, and the task's overview shows each criterion with its files, tests, judges and verdict.
- **A shared graph for unchanged structure.** The architecture gate reuses the base tree's cached import graph when a change touches no source file and no file that changes import resolution, so most iterations in a large repository build no graph at all.
- **Concurrency.** Loops of one process each get their own captured output, a lock keeps the subtask graph consistent when lanes update it at once, the harness journals its own writes so one lane's guard never undoes another's, and one Ctrl-C handler stops every loop.
