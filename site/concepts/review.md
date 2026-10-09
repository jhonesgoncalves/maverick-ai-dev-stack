# Review

<p class="mv-kicker">CONCEPT · DOES THE DIFF DO WHAT WAS PROMISED?</p>

Review checks a change against what it promised: every acceptance criterion, every planned task, its scope, its tests, its security and its dependencies. It ends in a decision that only a person makes. In Maverick, review is `REVIEW.md`, written from the task itself, plus the automated diff findings in `REVIEW-FINDINGS.md`.

<ConceptMap current="review" />

## Why it matters

Generated code is fluent. It compiles, it is well named, it comes with a confident explanation. None of that makes it correct. The real risk of AI-assisted change is not bad code that looks bad, it is plausible code that nobody actually checked against the requirement.

Maverick's review is designed so the reviewer reads **the diff and the evidence**, against **the brief**, and not the agent's description of its own work:

| Reviewing… | …asks | …is |
|---|---|---|
| The agent's explanation | "Does this sound right?" | A trust exercise |
| The diff alone | "Is this code reasonable?" | Necessary, not sufficient |
| The diff against each `AC-NN`, with evidence | "Does this change do what we agreed, and can I prove it?" | Review |

## How Maverick prepares it

```bash
maverick review add-cursor-pagination-orders-endpoint --diff
```

1. **`REVIEW.md` is written from the task**, in your docs language, only if it does not exist yet: one checkbox per PRD acceptance criterion, one per task with its status, the checks every change needs, Findings, the Decision and a Human Explanation. An existing review is never replaced.
2. **`REVIEW-FINDINGS.md` is written from the diff**: changed files, automated findings (sensitive paths, lockfile changes, missing strict evidence, no git baseline) and the **blast radius**, how far each changed source file reaches through the import graph.
3. **The `maverick-review` skill** runs `verify`, `guard`, `security` and `deps`, reviews the diff against each criterion, and fills in everything except the Decision, which it asks you to make.

## Anatomy of REVIEW.md

```md
# Review — add-cursor-pagination-orders-endpoint

## Acceptance Criteria
- [x] AC-01: Given 3 orders, when a client requests limit=2, then it receives 2 orders and a nextCursor. (US-01)
- [x] AC-02: Given an invalid cursor, when a client requests a page, then it receives 400 invalid_cursor. (US-01)

## Tasks
- [x] 01 Keyset pagination in OrdersService (done)
- [x] 02 Reject invalid cursors and document the contract (done)

## Checks
- [x] Scope: the diff stays within TECHSPEC.md File References, with no drive-by refactors.
- [x] Tests: new behavior is tested, and no test was weakened to pass.
- [x] Security: inputs are validated, authorization is preserved, and no secrets or PII were added.
- [x] Dependencies: new, updated or removed packages are justified.

## Findings
- `decodeCursor` accepts base64url and base64; follow-up to restrict to base64url.

## Decision
- [ ] approve
- [x] approve with follow-up
- [ ] request changes

## Human Explanation
Keyset on (createdAt, id) cannot skip or repeat rows under concurrent inserts, which the
e2e test proves with an insert between pages. The cursor is opaque and validated.
```

## Try it: from review to readiness

Check items, pick a decision and remove gate reports to see how `maverick readiness` and the `ship` flow respond. Notice that they are not the same gate.

<ReviewBoard />

Two rules are worth knowing:

- **`maverick readiness`** needs every gate report (`EVIDENCE.md`, `REVIEW-FINDINGS.md`, `SECURITY-REPORT.md`, `DEPENDENCY-REVIEW.md`, `SCOPE-GUARD.md`, plus `CHECKPOINT.md` when strict) and *a* decision. "Request changes" is a decision too, so readiness reports **ready for a human merge decision**, not "approved".
- **The `ship` flow's `human-review` gate** passes only on `approve` or `approve with follow-up`, checked in `REVIEW.md` or recorded with `maverick flow approve ship <task> human-review`.

## Reading a diff with Maverick

<ol class="mv-steps">
  <li><h3>Start from the criteria, not the files</h3><p>For each <code>AC-NN</code>, find the code that implements it and the test that proves it. A criterion with no test is a finding.</p></li>
  <li><h3>Check the scope report</h3><p>Every file in <code>SCOPE-GUARD.md</code> outside the plan is either a missing plan update or a drive-by change.</p></li>
  <li><h3>Follow the blast radius</h3><p>Files with many dependents in <code>REVIEW-FINDINGS.md</code> deserve the most attention. <code>maverick impact &lt;path&gt;</code> shows who depends on them.</p></li>
  <li><h3>Look at what the tests do not do</h3><p>Deleted assertions, new <code>.skip</code>, broadened matchers, mocked-away behavior.</p></li>
  <li><h3>Write the explanation yourself</h3><p>If you cannot explain why the change is safe in two sentences, you are not ready to decide.</p></li>
</ol>

## A fresh perspective

The agent that wrote the code is the worst reviewer of it: it shares every assumption that produced it. Prefer one of:

- **A different session**, with only the PRD, the TECHSPEC and the diff in context.
- **A different agent or model** for the review stage. Configure `runtime.stages.review` in `.maverick/config.json` to route it.
- **A different person** for anything strict: security, data, payments, migrations.

## Common mistakes

- **Reviewing the agent's explanation** instead of the diff and the evidence.
- **Approving with unchecked criteria** because the tests are green. A green suite that does not exercise AC-02 says nothing about AC-02.
- **Letting the agent check the Decision box.** The `maverick-review` skill never does, and a reviewer should never ask it to.
- **An empty Human Explanation.** If nobody can explain the change, nobody owns it.
- **Treating "request changes" as failure.** It is the review working.

## Checklist

- [ ] Every acceptance criterion is checked against code and a test
- [ ] Scope matches the brief, and out-of-scope files are explained
- [ ] High blast-radius files were read, not skimmed
- [ ] No test was weakened to pass
- [ ] Findings are written down, with follow-ups where needed
- [ ] A human checked the Decision and can explain the change

## Commands

| Command | Does |
|---|---|
| `maverick review <task> --diff` | Writes `REVIEW.md` (once) and `REVIEW-FINDINGS.md` from the diff |
| `maverick review <task>` | Writes `REVIEW.md` if missing and prints its path |
| `maverick impact <path>` | Shows dependents, tests and routes of a changed file |
| `maverick readiness <task>` | Checks every gate report and the decision; writes `MERGE-READINESS.md` |
| `maverick flow run ship <task>` | Runs every gate plus the human approval as one contract |
| `maverick pr <task>` | Writes `PR-DRAFT.md`: intent, what changed, how it was verified, the decision |

## Next

<div class="mv-cards">
  <a href="./human-in-the-loop"><b>Human in the loop →</b><span>The decisions that never leave a person's hands.</span></a>
  <a href="../reference/artifacts"><b>Task artifacts</b><span>Every file a task produces, and who writes it.</span></a>
</div>
