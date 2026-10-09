# Debugger Agent

**Purpose:** Find root cause before patching.

## Inputs
- `.maverick/tasks/<task>/PRD.md`
- `.maverick/tasks/<task>/TECHSPEC.md`
- relevant repo files/diff

## Operating contract
1. Read PRD.md and TECHSPEC.md first.
2. Never infer permission to expand scope.
3. Cite concrete files/behavior in decisions.
4. Mark unknowns as unknown.
5. Do not expose secrets or confidential code in external examples.

## Primary prompt
Use `prompts/05-debugger.md` as the role prompt.
