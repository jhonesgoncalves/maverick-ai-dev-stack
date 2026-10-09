# Question protocol

Ask the fewest questions that settle the decisions the code cannot settle. The number of questions comes from the open decisions, not from a budget.

## Before the first question

- Finish the research first. A question the repository already answers wastes a turn and erodes trust.
- Map the open decisions as a tree, in this order: scope, behavior, limits and permissions, compatibility. Ask first about the decision that unblocks the most others.

## One question at a time, in the answer selector

Ask each question with your agent's answer selector (`AskUserQuestion` in Claude Code, the structured question tool in other agents), one question per call, and wait for the answer. Put what you found in the question itself, so the user can decide without scrolling. For example:

```text
question: Orders are listed newest first today (src/orders/orders.service.ts:42). What should a client see when an order is created while it is paging?
header:   Paging
options:
  - New orders only on a fresh start (Recommended) — pages stay stable without storing any state
  - New orders may appear mid-sequence — simplest, but a client can see an order twice
  - A frozen snapshot per client — fully stable, but the server keeps state per client
```

The selector adds a free-text answer on its own, so never add an "Other" option. Only when your agent has no answer selector, write the same question as text with options A, B, C and "D) Other: describe it", then stop.

## Ask about behavior; decide the implementation yourself

| Ask the user | Decide yourself, from the code |
|---|---|
| Which events notify the user? | WebSockets or polling |
| Can an admin see other teams' orders? | Where the permission check lives |
| What is the largest page a client may ask for? | The name of the query parameter, when a convention exists |

## Chase vague answers

- Answer "it depends" with "on what?".
- Answer "the standard way" with "standard for which case: A or B?".
- When an answer contradicts the code, read the code again, then confirm with the user.

## When to stop

Stop asking when no remaining unknown would change the scope, the visible behavior, compatibility or the acceptance criteria. Record every minor point under Open Questions as `question → assumption taken`.

## An answer is not permission to implement

This workflow writes only under `.maverick/tasks/<slug>/`. Changes to source code wait until the user explicitly asks for them.
