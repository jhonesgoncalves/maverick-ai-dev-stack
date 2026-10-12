# Loop engineering

<p class="mv-kicker">CONCEPT · LOOPS THAT CANNOT GRADE THEMSELVES</p>

Loop engineering is designing the loop that drives an agent instead of prompting the agent: what it works on next, how its work is checked, what happens when it gets worse or gets stuck, and when it stops. `maverick loop` is a loop where the **harness decides**. The agent writes code; Maverick runs the checks itself, keeps what makes nothing worse, rolls back the rest, and hands a human the decisions only a human should make.

```bash
maverick loop run add-orders-pagination --dry-run       # the plan, the oracle and the first prompt
maverick loop run add-orders-pagination --max-iterations 8 --judge
maverick loop status add-orders-pagination
maverick loop verify add-orders-pagination             # the ledger and every checkpoint still match
```

## Why autonomous loops fail

Every major coding agent now ships a loop: a goal mode, a stop hook that sends the agent back to work, a cap on continuations. The loops are easy. Knowing when the work is really done is not.

| Failure | What happens | Evidence |
|---|---|---|
| The agent grades itself | "Done" means the agent said so, or a small model read the conversation | Vendor goal modes judge from the transcript or let the agent declare completion |
| Reward hacking | Tests are deleted, skipped or weakened until the check passes | Frontier models cheat on a large share of tasks whose tests conflict with the spec; an explicit way to object cut that sharply ([ImpossibleBench](https://arxiv.org/abs/2510.20270)) |
| Silent regressions | Fixing one thing breaks another, and rewinding misses edits made through the shell | Checkpoints of file-edit tools do not see Bash edits |
| Stuck loops | The same failure again and again, or two failures in turn, until the budget is gone | Detectors that only match repeated actions miss churn without progress |
| Self-preference | A model of the same family reviews the work, and likes it | Models rate their own family's output higher |
| Soft budgets | The limit is checked after the money is spent | Per-run caps that can overshoot |

## What makes a Maverick loop different

| Concern | Typical loop | Maverick loop |
|---|---|---|
| Who says "done" | The agent, or a model reading the transcript | The harness runs the oracle gates on the real tree. The agent's account is advisory, and an account that disagrees with the harness counts against it |
| Test tampering | A rule in the prompt | The **integrity guard** audits every diff for deleted, skipped or focused tests, fewer assertions, looser assertions, silenced lint or types, and edits to check configuration or CI, in twelve languages. Agents get a **dispute** channel instead of a reason to cheat |
| Regressions | Manual rewind | A **checkpoint** per iteration and a **ratchet**: a gate that passed never fails again, more failing tests is never kept, and the import structure never gets worse. Anything worse is rolled back automatically, and the reason goes into the next prompt, as far as `loop.feedback` allows |
| Stuck loops | A hard cap | A **diagnosis** (no progress, oscillation, churn, overclaiming, empty iterations, rollback streaks) and a **ladder**: retry with the diagnosis, more reasoning, **another vendor**, then a human with an escalation packet |
| Judging | Same model family | An optional **judge** from a different model family, read-only, in an export of the change, that sees the criteria, the harness evidence and the diff, never the author's explanation |
| Overfitting to visible tests | Not measured | [Sealed tests](/concepts/sealed-tests): acceptance tests another family wrote before the build, which the builder never sees, decide `done`; the **overfitting index** says what the visible checks promised beyond them |
| Feedback | The reviewer's reasoning goes back to the agent | Criteria, not detections: the agent learns which criterion is unmet, never which integrity rule caught it or how the judge reasoned |
| Budgets | Checked after the spend | Hard limits on iterations, time, tokens and cost (estimated from `runtime.prices` when a provider reports tokens only), plus a **forecast**: an iteration that would cross a limit never starts |
| Audit | Transcripts | A **hash-chained ledger** tied to the checkpoint commits; `loop verify` proves nothing was edited, dropped or moved |

Maverick is vendor-neutral, so all of this works the same for Claude Code, Codex, Cursor, Gemini, Copilot, Kiro, OpenCode and any CLI you configure, including agents that have no hook system of their own.

## Anatomy of an iteration

```text
 STOP? budget? forecast? ──▶ next subtask (or the goal) ──▶ before-loop-iteration hook
        │
        ▼
 back up the task and check config ─▶ agent run, fresh context ─▶ restore anything it must not touch
        │
        ▼
 snapshot ─▶ integrity audit of the diff ─▶ oracle gates ─▶ ratchet against the checkpoint
        │                                                          │
        ▼                                                          ▼
 KEEP: checkpoint + ledger + subtask done (judge first)     ROLL BACK: verified restore + reason forward
        │
        ▼
 dispute or question? ─▶ human        stuck? ─▶ diagnosis ─▶ next rung of the ladder
```

Each iteration starts with a fresh context: the loop's memory is the progress, the last rollback, the diagnosis and the notes Maverick puts in the prompt, rendered from its own state, never from files the agent could edit.

## The integrity guard

At the start, the loop records the **oracle set**: tests, test data, check configuration, CI, the files your verification commands run, `loop.protectedPaths` and TECHSPEC's *Do Not Touch*, with a digest in the ledger. Every iteration's diff is then audited before any gate runs.

| Finding | standard | strict |
|---|---|---|
| Protected path, Do Not Touch | block | block |
| Test deleted, fewer tests, test skipped or focused | block | block |
| Check configuration or CI changed (undeclared) | block | block |
| Change larger than the blast radius | block | block |
| Existing test outside the declared scope changed | warn | block |
| Fewer or looser assertions, a lint or type suppression | warn | block |
| A test's value special-cased in a condition, the agent's account differs from the diff, text addressed to a reviewer | warn | warn |

A finding is evidence, not a verdict. A planned change to a check is declared in TECHSPEC's *File References* (it becomes a warning), or allowed explicitly with `loop.integrity.allow`. The same guard runs outside loops: `maverick integrity <task>`, and as the `integrity` gate in the `fix-checks` and `ship` flows.

The **dispute** channel matters as much as the guard. Every headless agent is told never to weaken a check and, if it believes one is wrong, to report it in `disputes` and stop. The loop then stops for you with the dispute in `LOOP-ESCALATION.md`, after keeping or rolling back the work on its own merits.

Maverick also protects itself: `.maverick/config.json`, the flows, the task's PRD, spec, technical spec and review, and the loop's own ledger are restored after every agent run, before the gates read them. The current subtask file may change only by ticked boxes.

## Feedback that does not teach evasion

Telling an agent how it was caught teaches it to evade. A September 2026 study measured 40.5% evasion when agents received the reviewer's detailed reasoning, against 20.3% with a generic rejection (arXiv 2609.28614). So a loop separates **criterion feedback**, what the agent needs to do the work, from **detection feedback**, how to get past the guard next time.

| `loop.feedback` | A rolled-back attempt | The judge | The integrity gate in a flow |
|---|---|---|---|
| `criteria` (default) | Regressed visible checks in full; integrity findings become one line, "a check was weakened, or a protected file or the repository changed", without rule, file or pattern | Which criteria it does not accept yet, never its reasoning | One generic line |
| `generic` | One line: the change made a check worse or broke a loop rule | One line | One generic line |
| `detailed` | Everything, as before 1.9 | Its issues | Its findings |

What a loop writes into the task follows the same policy: `LOOP.md` and `LOOP-ESCALATION.md` say what the next agent may read, and their full copies, with every reason, live in `$MAVERICK_HOME/reports/<project>/<task>/<loop>/`, as do the judges' reports and transcripts. `LOOP-ESCALATION.md` leaves the task once you resume. The read-only `loop_status` MCP tool, which agents call, says as much as the policy allows, and `flow run --agent` fixes follow the same policy. The loop's own record (`loops/<id>/state.json` and the ledger) keeps the detail for `loop log`, `loop verify` and Lens; an agent in place could go and read it, so for the strongest separation run with `--worktree`, where that record is not in the agent's tree.

**Quarantine.** Agents leave notes for the next iteration in `LOOP-NOTES.md`, and a trick spreads through shared memory as easily as a fix does (Meta, arXiv 2610.12822). Notes from an iteration that was kept despite integrity warnings are quarantined outside the work tree, out of every prompt, and its checkpoint is marked **tainted**, as is every checkpoint derived from it. `maverick loop release <task>` shows the notes to a human, releases them and acknowledges the taint, on the record.

**Drift.** A resumed loop compares what its decisions depend on with what it recorded: the loop, runtime, verification, architecture and sealed configuration, the flow, the seal, and the oracle files a human edited while it was stopped. Anything that changed is written to the ledger as `drift` before the loop goes on, and printed.

## The judge

With `--judge` (or `loop.judge.enabled`), a subtask counts as done only when a judge accepts it, and the loop ends only when a judge accepts the whole change. The judge:

- comes from a **different model family** than every agent that wrote the change. The model name decides first, so Copilot running a Claude model is Anthropic. An unknown family is never assumed independent: set `runtime.families`;
- runs **read-only in an export** of the changed tree outside the repository, so it cannot read the author's transcripts, the git log or the loop's state;
- gets an **evidence packet**: the criteria (the subtask's or the PRD's `AC-NN`, or a rubric), the behavior from the spec, the declared scope, the harness's own gate results and integrity findings, and the diff, but never the author's summary;
- answers in a validated `maverick-verdict` block. A criterion is met only with evidence, and a "pass" with an unmet criterion is not confident. When the first judge is unsure, a judge from a third family breaks the tie; when they disagree, you decide with `maverick flow approve`, and the decision is bound to that exact change.

A judge that is not satisfied keeps the subtask open with its reasons in the next prompt; the work is kept. Judge gates also work in any flow: `{ id: judge, type: judge, rubric: [...] }`.

## When the loop stops

| Outcome | Meaning | What you do |
|---|---|---|
| `done` | Every subtask is done, every blocking gate passes (and the judge agrees) | Review the change, then run the ship flow |
| `budget-exceeded` | A limit was reached, or the next iteration would cross it | Run again with a higher limit |
| `stalled-escalated` | The ladder ran out of rungs | Read `LOOP-ESCALATION.md`, then `--resume --note "<guidance>"` |
| `disputed` | The agent says a check is wrong | Decide, then `--resume --note "<decision>"` |
| `needs-human` | The agent asked, a judge could not decide, or the subtask graph is blocked | Answer, then `--resume --note` |
| `holdout-gap` | Every visible check passes, but the [sealed tests](/concepts/sealed-tests) do not | `maverick seal status <task> --reveal`, then `--resume --note "<missing behavior>"`, reseal, or `--resume --sealed off` |
| `aborted` | Stopped by you, a hook, or a crash | Run again: a half-finished iteration is rolled back first |
| `integrity-violation` | History, refs or the ledger changed outside the loop | `loop verify`, inspect, then `--new` |

Only `done` exits zero. Tamper-evident is not tamper-proof: an agent with `full` permission could rewrite every line and every ref. Keep the default `edit` ceiling, and prefer `--worktree` for long loops.

## Configuration

```json
{
  "loop": {
    "providers": ["claude-code", "codex", "gemini"],
    "budgets": { "maxIterations": 10, "maxMinutes": 120, "maxCostUsd": 5 },
    "escalation": ["retry-with-diagnosis", "raise-effort", "switch-provider", "human"],
    "protectedPaths": ["src/payments/**", "**/.env"],
    "blastRadius": { "maxFiles": 25, "maxLines": 1500 },
    "integrity": "standard",
    "judge": { "enabled": true, "prefer": ["codex"] },
    "feedback": "criteria",
    "sealed": "auto"
  },
  "runtime": { "families": { "copilot": "openai" } }
}
```

Every key is described in [Configuration](/reference/config#loops). Follow a loop live in [Lens](/lens/loops), or from your agent with the `maverick-loop` skill and the read-only `loop_status` MCP tool.

## Next

- [Sealed tests](/concepts/sealed-tests): the holdout that decides `done`, and the overfitting index.
- [Verification](/concepts/verification): the gates a loop runs as its oracle.
- [Human in the loop](/concepts/human-in-the-loop): the decisions a loop always hands back.
- [CLI reference](/reference/cli#loops): every `maverick loop` command and flag.
