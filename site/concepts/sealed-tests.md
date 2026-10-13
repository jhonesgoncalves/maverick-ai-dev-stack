# Sealed tests

<p class="mv-kicker">CONCEPT · EVIDENCE THE AGENT CANNOT OPTIMISE</p>

Every check a loop runs is something the agent that builds the change can see, and sometimes something it wrote. Sealed tests add a check it **cannot see**: acceptance tests written from the PRD and the spec, before the build, by another model family or by you, kept encrypted outside the work tree, and run only at milestones. A loop is `done` only when they pass too.

```bash
maverick seal add-orders-pagination                  # an independent sealer writes the suite
maverick seal status add-orders-pagination --reveal  # you read it, at a terminal
maverick seal approve add-orders-pagination          # the suite now decides "done"
maverick loop run add-orders-pagination
maverick unseal add-orders-pagination --commit --protect   # at review: keep them as regression tests
```

## Why

Agents saturate the tests they can see. In SpecBench (May 2026) every frontier agent passed nearly all of its visible tests, while the share of hidden tests it passed fell further behind as the code grew. Agents have shipped libraries that passed 222 of 222 tests with the implementation living only in demo code. The integrity guard catches a weakened test; a judge catches an unconvincing change; neither catches a change that passes tests the agent wrote for itself without delivering the behavior. A held-out suite does.

```text
$ maverick loop run add-orders-pagination --judge
…
JUDGE   PASS · gemini (google) 91%
Outcome: HOLDOUT-GAP — the visible checks pass, the sealed tests do not: 7/10 sealed pass · overfitting index +33 pp (threshold 100%)
```

## How a seal is made

1. **The sealer.** `maverick seal <task>` picks a trusted, installed provider from a model family that none of the task's builders belongs to (the build agent, `loop.providers`, routes and the fix agent), the same way a judge is picked. It runs **read-only in an export** of the code as it is, outside the repository, and returns the suite in a `maverick-sealed` block. You can write the suite yourself instead: `--from-file <dir|bundle.json>`, kept outside the project.
2. **The surface.** The tests call what the spec fixes (`--surface spec`, the default: SPEC's contracts), what the technical spec plans (`techspec`), or only the external boundary (`boundary`: HTTP, CLI, a process).
3. **Vacuity.** Every sealed test runs once on the code before the change: it must fail. That code is `--base <ref>`, else the tree the task's newest loop started from (so sealing again after a loop does not measure the built change), else the working tree. A test that already passes cannot tell a built change from none, so it leaves the holdout (unless its kind is `regression`), and a suite in which no test fails is refused.
4. **The vault.** The suite is encrypted (AES-256-GCM) in `$MAVERICK_HOME/vault/<project>/<task>/<seal>/`, with its results and the sealer's transcript. The task keeps `SEALED.json`: digests, counts per criterion and the approval, never a path, a test name or a line of test code. `SEALED.json` is a protected file in every loop.
5. **Approval.** By default a human approves the suite (`maverick seal approve`) before it decides a loop. A seal whose PRD criteria or SPEC behavior changed is stale and must be redone.

## How a loop uses it

| When | What runs | What the builder learns |
|---|---|---|
| Baseline | the sealed suite on the starting tree | nothing |
| A subtask is done (`sealed.when: milestones`, up to `maxQueries`) | the suite on the new checkpoint | nothing (`count` or `ac` on request) |
| The agent says done, the gates pass, the judge agrees | the suite on the final tree | nothing |

At done, the suite decides: at or above `sealed.threshold` the loop is `done`; below it, the loop stops as **`holdout-gap`** for a human. A sealed failure never rolls work back: undoing work for reasons the agent cannot see would turn the holdout into a hidden oracle the loop climbs, which leaks it (Dwork et al., *The reusable holdout*, 2015). Every run is recorded in the seal's own hash-chained ledger and, as a digest, in the loop's ledger.

The builder's prompt says only that an independent holdout exists. The sealer's family never builds: a loop whose builder shares it refuses to start, and the escalation ladder skips it when it switches vendors.

## The numbers

On one tree, let T be the active sealed tests: measured, not flaky (a test whose result changes on a rerun leaves T), not vacuous.

- **S** = sealed tests passing in T / |T|. The threshold applies to S.
- **Sac** = criteria (AC and SC ids) whose every active test passes / criteria with an active test.
- **Vac** = the same criteria the visible evidence claims are met: the judge's criteria when it ran, otherwise every blocking gate passing.
- **Overfitting index** OI = Vac − Sac, in percentage points, at done. Positive means promised and not delivered.
- **Escape set** = criteria claimed and not delivered. Only `maverick seal status --reveal` shows it, to a human at a terminal.

## What the builder never sees

| Channel | How it stays closed |
|---|---|
| The prompt, reports, rollback reasons | Sealed results never enter the oracle, the ratchet, `EVIDENCE.md`, the judge's evidence or the prompt |
| The work tree, git | The suite only exists in exports outside the repository; no object, ref or index entry is ever written for it |
| Caches and temporary files | Runs point temporary and bytecode caches inside the export, which is removed afterwards |
| Transcripts | The sealer's transcript is encrypted in the vault, not in the task's `runs/` |
| Loop reports in the task | `LOOP.md` and `LOOP-ESCALATION.md` say only that the holdout failed; the copies with the numbers are in `$MAVERICK_HOME/reports/` |
| The loop's ledger | Each query is recorded by an HMAC of its results under the vault key, which no one without the key can invert |
| Loop state, MCP, Lens | Counts, and only after the loop stops; the MCP tool, which agents call, says only whether it passed. Never which test or criterion |
| Exports | Overlay files are never written through a symbolic link, and an export's `node_modules` is a folder of its own, so a tool's cache stays in the export |

The test suite of Maverick itself holds it to this: a random marker in a sealed test must not appear in any project file, any git object, any prompt or any leftover temporary file after a full loop.

**Sealing means out of the prompt, out of the tree and out of casual reach. It is not cryptographic secrecy** against an agent with a full shell under your user, which can read the key file. Real secrecy needs operating-system isolation: run agents as another user or in a container, and keep the key with `sealed.encryption.key: "env"` or `"command"` (a keychain).

Two more places hold a sealer's plaintext, outside Maverick's control: the provider CLI's own session log (for example under `~/.codex/sessions` or `~/.claude/projects`), and the transcript path an `after-agent-run` hook receives while the sealer runs. Seal with a provider whose logs your builders cannot read, or clear them after sealing.

## At review

`REVIEW.md` gets a *Sealed acceptance tests* section and merge readiness waits for your decision:

- `maverick unseal <task> --commit --protect` writes the tests into the project for you to commit and adds them to `loop.protectedPaths`: from then on a loop that edits them is rolled back, and they guard the behavior like any other test.
- `maverick unseal <task> --discard` deletes the suite and its results from the vault; the ledger stays.

## In a flow

```yaml
gates:
  - { id: checks, type: check }
  - { id: holdout, type: sealed, threshold: 1.0, feedback: none }
```

Below the threshold with `feedback: none` the gate is `pending`, never `revise`: an agent fix must not work against a signal it cannot see. Approve it with `maverick flow approve <flow> <task> holdout`; the decision is bound to that suite and that exact tree.

## Configuration

```json
{
  "sealed": {
    "surface": "spec", "feedback": "none", "threshold": 1.0, "when": "milestones", "maxQueries": 6,
    "requireApproval": true, "encryption": { "key": "file" }, "sealer": { "provider": "codex", "effort": "high" }
  },
  "loop": { "sealed": "auto" },
  "verification": { "runners": [{ "match": "**/*.test.ts", "run": "npx vitest run {files}" }] }
}
```

`loop.sealed` is `auto` (a ready seal decides the loop), `required` (no loop without one) or `off`. `verification.runners` tells Maverick how to run chosen test files; it is inferred for node:test, Vitest, Jest, Mocha, AVA, pytest, unittest, Go, Cargo, RSpec, Minitest, PHPUnit, ExUnit and Dart, and a file no runner matches is reported, never counted as passing. Every key is in [Configuration](/reference/config#sealed-tests).

## Suite review and disputes

`seal review <task>` asks another model family, independent of the sealer and builders, to review the suite read-only. Its transcript and detailed issues stay encrypted in the vault. Set `sealed.review.required: true` to require a passing review of the exact suite before approval; older configurations preserve manual approval. A missing independent family is reported rather than silently accepting the suite.

Surface lint checks project imports with the existing multi-language resolver. Boundary tests cannot import project source; spec/techspec tests cannot import named symbols absent from their declared contract. Dynamic or unrecognized access is a review warning, not proof that every call is compliant.

`seal amend <task> --from-file <bundle> --reason "<dispute>"` creates a new seal against the original base and records its lineage. `seal suspend <task> ST-01 --reason "<dispute>"` excludes a disputed test; `seal restore` reverses that exclusion. Both revoke prior approval and refuse while the task's loop runs.

`sealed.ratchet: true` stops for a human if a previously passing sealed test fails at a milestone. It never rolls work back or turns the holdout into iterative repair feedback. Builder transcripts are scanned for tool calls accessing the vault. Existing verification runners already select by subproject `cwd` and glob.

Lens's **Sealed holdouts** page shows base failures, review, suspension, amendment rate, OI, measured overhead and observed post-merge defects. Missing usage stays unknown. The success targets (90% fail on the base, less than 20% amended, at most 15% extra cost/time) require accumulated repository evidence.

## Next

- [Loop engineering](/concepts/loop-engineering): the loop the holdout decides.
- [Verification](/concepts/verification): ablation and the architecture ratchet, the other checks of the checks.
- [CLI reference](/reference/cli#sealed-tests): `seal`, `unseal` and their flags.
