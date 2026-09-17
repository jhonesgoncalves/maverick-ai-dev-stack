# Playbook — Context Engineering

Context is not "send the whole repo". Context is the minimum evidence needed to make the next decision.

## Layer 1 — invariant context
Architecture, conventions, commands, boundaries. Keep in repo-level instructions.

## Layer 2 — task context
Files, behavior, constraints and examples specific to the current task. Keep in CONTEXT.md.

## Layer 3 — just-in-time context
A file or log opened because the current hypothesis needs it.

## Anti-patterns
- huge dumps with no reading order;
- pasting generated summaries as if they were source-of-truth;
- mixing secrets/logs/customer data into prompts;
- carrying stale conversation context between unrelated tasks.

## Rule
Every context item should answer: "what decision does this help the agent make?"
