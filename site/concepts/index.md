# Concepts

<p class="mv-kicker">CONCEPTS · OVERVIEW</p>

Maverick is built on six ideas. Each one answers a single question about AI-assisted change, owns part of the pipeline, and is enforced by an artifact you can read and a command that checks it. Hover a concept to see where it lives.

<ConceptMap />

## Why these six

An AI coding agent is fast, fluent and confident. Those are exactly the properties that make its mistakes hard to see. Each concept closes one gap between "the agent says it is done" and "a person can merge this with confidence":

| Gap | What goes wrong without it | Concept that closes it | Where it shows up |
|---|---|---|---|
| The agent does not know the codebase | It invents paths, duplicates helpers, edits the wrong layer | [Context engineering](/concepts/context-engineering) | Grounding from `maverick new`, `maverick instructions` |
| Nobody agreed on the outcome | The implementation quietly becomes the specification | [Task brief](/concepts/brief) | `PRD.md`, `SPEC.md`, `AC-NN` ids |
| The approach is invisible until the diff | Design mistakes surface after hundreds of lines | [Planning](/concepts/planning) | `TECHSPEC.md`, `subtasks/` |
| "Tests pass" is a claim | Weakened tests, drive-by changes, leaked secrets | [Verification](/concepts/verification) | `verify`, `guard`, `security`, `deps` |
| Plausible is not correct | The reviewer reads the explanation, not the change | [Review](/concepts/review) | `REVIEW.md`, `review --diff`, `readiness` |
| Accountability drifts to the tool | Broad permissions, silent approvals, auto-merge | [Human in the loop](/concepts/human-in-the-loop) | Trust, permission ceilings, hooks, approval gates |

## How they fit together

Context feeds every stage. The brief and the plan are written **before** code, so a human can correct them while they are cheap. Verification and review happen **after**, against what the brief promised. Human decisions sit at the joints: approving a behavior spec, saying yes before each subtask, recording the review decision and merging.

```text
           ┌──────────────────── context (grounding) ─────────────────────┐
  idea ──▶ │ BRIEF ─▶ PLAN ─▶ BUILD ─▶ VERIFY ─▶ REVIEW ─▶ PR            │ ──▶ merge
           │  PRD    TECHSPEC  subtask   evidence   REVIEW.md  PR-DRAFT   │   (human)
           │  SPEC◆  tasks     ◆yes      gates      ◆decision  ◆open     │
           └──────────────────────────────────────────────────────────────┘
                                    ◆ = a human decides
```

## Read in order

<div class="mv-cards">
  <a href="./context-engineering"><b>1 · Context engineering</b><span>Give the agent the smallest set of real files, tests and commands it needs.</span></a>
  <a href="./brief"><b>2 · Task brief</b><span>State the outcome as acceptance criteria someone can check.</span></a>
  <a href="./planning"><b>3 · Planning</b><span>Ground the approach in real code and split it into a task graph.</span></a>
  <a href="./verification"><b>4 · Verification</b><span>Collect evidence from the diff, not claims from the agent.</span></a>
  <a href="./review"><b>5 · Review</b><span>Check the diff against every criterion, then decide.</span></a>
  <a href="./human-in-the-loop"><b>6 · Human in the loop</b><span>Trust, permission ceilings, hooks and the decisions only a person makes.</span></a>
</div>

## Beyond the six

<div class="mv-cards">
  <a href="./loop-engineering"><b>Loop engineering</b><span>Leave an agent running on a planned task: the harness decides every iteration, keeps what makes nothing worse and rolls back the rest.</span></a>
</div>

New to Maverick? Start with [The Maverick Method](/guide/method) for the stage-by-stage view, then come back here for the reasoning behind each stage.
