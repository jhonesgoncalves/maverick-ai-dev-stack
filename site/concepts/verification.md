# Verification

<p class="mv-kicker">CONCEPT · EVIDENCE, NOT CLAIMS</p>

Verification is the evidence that the intended behavior works and that the constraints still hold. In Maverick it is a set of gates: commands that read the code and the diff, never the agent's summary, and that each write a report next to the task.

<ConceptMap current="verification" />

## Why it matters

An agent that says "all tests pass" is making a claim. A green command alone may not prove the requested outcome either: tests can be skipped, weakened or simply not cover the new behavior. Verification asks three separate questions, and a change has to answer all of them:

| Question | Gate | Report |
|---|---|---|
| Do the checks pass? | `maverick verify` runs the detected lint, typecheck, test and build commands | `EVIDENCE.md` with every command and exit code |
| Did it change only what the plan said? | `maverick guard` compares the diff with TECHSPEC File References and the task Files, and checks the change budget | `SCOPE-GUARD.md` |
| Is it safe? | `maverick security` scans the diff for private keys, secret assignments and unsafe dynamic execution | `SECURITY-REPORT.md` |
| What came in? | `maverick deps` lists changed manifests and lockfiles across ecosystems | `DEPENDENCY-REVIEW.md` |

## Try it: run the gates

Pick what the agent changed. Notice that the tests can pass while other gates still warn, and that the gates react to the diff itself.

<GateSimulator />

## Where the commands come from

`maverick verify` does not guess. It detects your stack (`maverick stack`) and picks commands per check kind, `lint`, `typecheck`, `test` and `build`, from the project's own runners: npm scripts, a Makefile, `pyproject.toml`, `go.mod`, `Cargo.toml` and others, per subproject in a monorepo. When detection is not enough, declare them:

```json
{
  "verification": {
    "commands": [
      "npm run lint",
      { "name": "e2e", "command": "npm run test:e2e", "cwd": "apps/api" }
    ]
  }
}
```

With no detected or declared command, `verify` fails instead of passing silently.

## What evidence looks like

```md
# Verification Evidence — add-cursor-pagination-orders-endpoint

Generated: 2026-10-05T14:02:11.420Z

## PASS — npm run lint
Exit code: 0

## PASS — npx tsc --noEmit
Exit code: 0

## FAIL — npm test
Exit code: 1
  ✕ orders › returns 400 for an invalid cursor (12 ms)
```

Evidence is a file, not a chat message, so it survives the session, is attached to the PR draft and is checked by `maverick readiness`.

## Verification during the build

Verification is not one step at the end. The `maverick-build` skill verifies every subtask before marking it done:

<ol class="mv-steps">
  <li><h3>Take the next ready subtask</h3><p><code>maverick subtask next &lt;task&gt;</code> shows the ones whose dependencies are done; the skill marks one in progress.</p></li>
  <li><h3>Work through its checklist</h3><p>Each Step, test and criterion in <code>task_NN.md</code> is checked as it is done.</p></li>
  <li><h3>Run its Verification</h3><p>The tests named in the task, then <code>maverick verify</code> for the whole stack.</p></li>
  <li><h3>Mark it done, then ask</h3><p><code>subtask set … done</code> refuses while an item is unchecked. The skill asks you before the next subtask.</p></li>
</ol>

When checks fail, the bounded `fix-checks` flow lets an agent iterate on lint, typecheck and test failures, up to five times, and stops early when two iterations make no progress:

```bash
maverick flow run fix-checks add-cursor-pagination-orders-endpoint --agent claude-code
```

## Strict work

The **strict** workflow, chosen for security, data, payments, migrations and shared infrastructure, adds a **SECURITY** stage before review, requires `EVIDENCE.md` before `review --diff` is clean, and requires a `CHECKPOINT.md` (git status and diff, saved with `maverick checkpoint`) before merge readiness.

## Common mistakes

- **Weakening tests to make a generated change pass.** Deleting an assertion, adding `.skip`, or loosening a matcher. The review checklist asks about it explicitly.
- **Trusting the agent's summary.** Read `EVIDENCE.md`, not the message that says it passed.
- **Only running the happy path.** If AC-02 is "invalid cursor returns 400", a test must send an invalid cursor.
- **Starting without a git baseline.** If git tracks nothing, the diff cannot separate the task from the project, and `guard` and `review --diff` say so.
- **Silencing guard.** An out-of-scope file is either a missing plan update or a drive-by change. Decide which.

## Checklist

- [ ] Every acceptance criterion has a test that exercises it, including edge cases
- [ ] `maverick verify` passes and `EVIDENCE.md` is current
- [ ] `maverick guard` findings are explained or fixed
- [ ] `maverick security` signals were read by a person
- [ ] New dependencies in `DEPENDENCY-REVIEW.md` are necessary and maintained
- [ ] No test was weakened, skipped or deleted to pass (`maverick integrity <task>` checks this from the diff)

## Commands

| Command | Does | Fails when |
|---|---|---|
| `maverick verify <task>` | Runs the detected checks, writes `EVIDENCE.md` | Any check fails, or none is detected |
| `maverick guard <task>` | Compares the diff with the declared scope | A file is outside scope, or the budget (default 8) is exceeded |
| `maverick integrity <task>` | Audits the diff for weakened checks: deleted, skipped or focused tests, fewer or looser assertions, silenced lint or types, edited check configuration or CI | A blocking finding is found (see [Loop engineering](/concepts/loop-engineering#the-integrity-guard)) |
| `maverick security <task>` | Scans the diff for high-signal patterns | Any signal is found |
| `maverick deps <task>` | Lists changed manifests and lockfiles | Never: it is a report for the reviewer |
| `maverick policy check <task>` | Applies `.maverick/policy.json` (max files, sensitive paths) | A rule is broken |
| `maverick flow run ship <task>` | Runs every gate in order as one contract | A blocking gate fails |

## Next

<div class="mv-cards">
  <a href="./review"><b>Review →</b><span>Take the evidence to a human decision.</span></a>
  <a href="../guide/workflow"><b>The workflow</b><span>Build, verify and review, end to end.</span></a>
</div>
