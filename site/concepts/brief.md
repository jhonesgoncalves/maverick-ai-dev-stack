# Task brief

<p class="mv-kicker">CONCEPT · WHAT CHANGES, AND HOW WE KNOW</p>

A brief states the problem, the outcome, the acceptance criteria, the boundaries and the open questions of a change, **before** anyone decides how to build it. In Maverick the brief is `PRD.md`, and in spec-driven work it is extended by an approved `SPEC.md`.

<ConceptMap current="brief" />

## Why it matters

An AI agent will happily start coding from a one-line request. The result usually works, for *some* reading of the request. Without a brief, the implementation silently becomes the specification: whatever the agent built is, by default, what was asked for. Nobody can say it is wrong, because nobody wrote down what right looks like.

A brief fixes that by making the outcome **checkable**. Every later stage points back to it:

| Later stage | Uses the brief to… |
|---|---|
| TECHSPEC | map every test in the Test Plan to an `AC-NN` (`UT-01 → AC-01`) |
| Tasks | prove every criterion is covered by at least one task |
| Review | generate one `REVIEW.md` checkbox per criterion |
| PR draft | link intent, what changed and how it was verified |

## How Maverick writes it

```bash
maverick new "Add cursor pagination to the orders endpoint"
```

`maverick new` creates the task, grounds the idea in your code, and opens your agent with the `maverick-prd` skill. The skill:

1. **Reads before asking.** It reads the grounded files, their tests and their callers.
2. **Asks only what the code cannot answer.** One question per message, with a recommendation and A/B/C/D options: page size limits, sort order, what happens on an invalid cursor.
3. **Writes `PRD.md` in full**, then runs `maverick validate <task> --stage prd`.
4. **Asks before moving on.** You decide when the technical spec starts.

## Anatomy of a PRD

| Section | Holds | Validator checks |
|---|---|---|
| Overview, Goals | The problem and the outcome | Heading present |
| User Stories | One `### US-01` heading per story | Heading present |
| Requirements | `### Requirement:` with SHALL or MUST, each with `#### Scenario:` using WHEN and THEN | Keywords present (or localized: DEVE / QUANDO / ENTÃO) |
| Acceptance Criteria | `- [ ] AC-01: Given…, when…, then… (US-01)` | Ids present and unique |
| Business Rules, Edge Cases | Domain constraints and boundary behavior | Heading present |
| Non-Goals | What is explicitly out of scope | Heading present |
| Open Questions | What is still undecided | Heading present |

```md
## Requirements

### Requirement: Cursor pagination
The orders endpoint SHALL return results in pages ordered by creation time.

#### Scenario: Next page
- **WHEN** a client passes the `nextCursor` from the previous page
- **THEN** it receives the following orders with no duplicates and no gaps

## Acceptance Criteria
- [ ] AC-01: Given 3 orders, when a client requests limit=2, then it receives 2 orders and a nextCursor. (US-01)
- [ ] AC-02: Given an invalid cursor, when a client requests a page, then it receives 400 invalid_cursor. (US-01)
- [ ] AC-03: Given limit=500, when a client requests a page, then it receives at most 100 orders. (US-02)

## Non-Goals
- Offset pagination and total counts.
```

## Try it: write a checkable criterion

The most useful skill in writing a brief is writing acceptance criteria that a test, or a reviewer, can answer with yes or no. Pick an example or edit the fields.

<BriefBuilder />

## Outcome vs implementation

<div class="mv-anatomy">
  <div class="bad"><b>Implementation</b><span>"Use a Redis cache and add an index on <code>created_at</code>." This is a design decision. It belongs in TECHSPEC.md, where alternatives are weighed.</span></div>
  <div class="good"><b>Outcome</b><span>"Given 10,000 orders, when a client requests the first page, then it responds in under 200 ms." Any design that meets it passes.</span></div>
  <div class="bad"><b>Vague</b><span>"The list should load fast and work properly." Nobody can fail it, so nobody can pass it.</span></div>
  <div class="good"><b>Concrete</b><span>"Given limit=500, then it receives at most 100 orders." A number makes the edge case visible.</span></div>
</div>

## Brief or behavior spec?

The standard workflow stops at `PRD.md`. The **spec-driven** workflow adds `SPEC.md` between the PRD and the technical spec: every acceptance criterion becomes numbered WHEN/THEN scenarios with exact contracts, states, invariants and errors, plus a traceability table. Code and tests are written against it, and no design starts until a human approves it.

| Use the PRD alone when… | Add SPEC.md (`--spec`) when… |
|---|---|
| The change is local to one module | It changes an API, an integration or a shared contract |
| One person can judge the outcome | Several people or teams must agree on behavior |
| Edge cases fit in a short list | The domain rules need a state table |

`maverick new` picks spec-driven on its own when the idea mentions APIs or integrations. See [Workflows](/reference/workflows).

## Common mistakes

- **Describing a preferred implementation instead of an observable outcome.** Move the "how" to TECHSPEC.md.
- **Leaving Non-Goals empty.** An agent fills silence with scope. Say what this change does *not* do.
- **Burying decisions in prose.** If something is undecided, put it under Open Questions so it is visible and answerable.
- **Criteria without a story.** Every `AC-NN` should cite the `US-NN` it serves, so a reviewer knows why it exists.
- **Editing the brief after the build to match the code.** If the outcome changed, say so in the PRD and review against the new version.

## Checklist

- [ ] The problem and the outcome fit in two sentences
- [ ] Every acceptance criterion is Given / when / then, with a concrete value
- [ ] No criterion names a table, class, library or cache
- [ ] Non-Goals name at least one tempting thing this change will not do
- [ ] Every open question has an owner
- [ ] `maverick validate <task> --stage prd` passes

## Commands

| Command | Does |
|---|---|
| `maverick new "<idea>"` | Creates the task, grounds it and opens the agent at the PRD |
| `maverick new "<idea>" --spec` | Same, with the spec-driven workflow |
| `maverick validate <task> --stage prd` | Checks headings, ids, keywords and placeholders |
| `maverick generate <task> prd --agent <provider>` | Writes the PRD headlessly with a trusted agent |

## Next

<div class="mv-cards">
  <a href="./planning"><b>Planning →</b><span>Turn the brief into a grounded technical spec and a task graph.</span></a>
  <a href="../guide/planning#prd"><b>From idea to tasks</b><span>The full planning pipeline, step by step.</span></a>
</div>
