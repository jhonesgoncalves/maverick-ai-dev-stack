# Contributing

Thanks for helping make AI-assisted engineering more reviewable.

## Setup

Use Node 20+, run `npm install`, then `npm run check`. Create a focused branch and keep changes small. Run `npm run docs:build` for documentation changes.

## Adding material

- Adapters must keep the core workflow vendor-neutral and reference task artefacts.
- Templates must be broadly useful and avoid organization-specific policy.
- Agents use the headings Role, Mission, Inputs, Constraints, Process, Output, and Stop Conditions.
- Documentation should explain what, why, when, an example, common mistakes, a checklist, and a next step.

Please include tests for CLI behavior and explain any compatibility impact in the pull request.
