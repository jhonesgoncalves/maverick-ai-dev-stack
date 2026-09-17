# Operational toolkit

Maverick turns task artifacts into work that can be verified and reviewed.

```bash
maverick map
maverick task add-search --preset standard
maverick packet add-search --agent codex
maverick verify add-search
maverick checkpoint add-search
maverick impact src/search/service.ts
maverick guard add-search
maverick learn add-search --rule "Run focused tests before review."
maverick handoff add-search --to reviewer
maverick readiness add-search
maverick policy init
maverick policy check add-search
maverick adapter install codex
maverick ci github add-search
maverick security add-search
maverick deps add-search
maverick review add-search --diff --against main
maverick pr add-search
maverick status
```

`maverick map` writes `.maverick/context/PROJECT_MAP.md`, detecting common manifests, top-level areas, repository instructions, and npm verification scripts.

`maverick packet <task>` writes `TASK-PACKET.md` in the task folder. It contains only the task artifacts relevant to implementation and the project map if available. `maverick run <task> --agent codex` produces the same packet with the selected agent recorded; it deliberately does not couple Maverick to a provider executable.

`maverick verify <task>` runs detected `test`, `lint`, `typecheck`, and `build` scripts and saves command output in `EVIDENCE.md`. A failing check returns a non-zero exit code.

`maverick review <task> --diff` creates `REVIEW-FINDINGS.md`, listing changed files and warnings for sensitive paths or dependency lockfiles. It is an aid to the mandatory human review, not an approval decision.

`maverick checkpoint <task>` captures the current Git status and diff for a recoverable task record. `maverick security <task>` detects high-signal secret and dangerous execution patterns in the current diff; a signal requires human review. `maverick deps <task>` records changed manifests and lockfiles. `maverick pr <task>` writes `PR-DRAFT.md` from the task and captured evidence, without creating a remote pull request.

## Scope and learning

`maverick impact <path>` searches project text for references to a file name before work begins. It is intentionally a fast local signal, not a replacement for language-server references.

`maverick guard <task>` writes `SCOPE-GUARD.md` and compares current changed files with `Expected Changed Files` in the task when that section is completed. It warns if the configured change-file budget is exceeded or an unexpected path is changed.

`maverick learn <task> --rule "..."` records a proposed rule in `.maverick/LEARNINGS.md`. Maverick never automatically converts learnings into binding agent instructions; a team member must review and promote them.

## Collaboration and merge readiness

`maverick handoff <task> --to <owner>` writes `HANDOFF.md`, listing completed evidence and the next reports required by the next human or agent.

`maverick readiness <task>` writes `MERGE-READINESS.md` and returns a non-zero exit code until the required reports and an explicit human decision in `REVIEW.md` are present. It reports readiness; it never merges or approves a change.

## Repository policy

`maverick policy init` creates a versioned `.maverick/policy.json` with a change budget and example sensitive paths. Customize it for the repository, then run `maverick policy check <task>` to compare the current diff with that policy. The initial policy is advisory; teams can use the command's non-zero exit status as a CI gate when ready.

## Adapters and CI

`maverick adapter list` shows bundled adapters. `maverick adapter install codex`, `claude-code`, `cursor`, or `generic` copies a non-overwriting instruction file into the repository.

`maverick ci github <task>` writes a task-specific GitHub Actions workflow that validates the artifacts and policy on pull requests. Review the generated workflow before committing it; it is intentionally a narrow starting gate rather than a replacement for the repository's existing CI.

Use `--json` with `map`, `packet`, `verify`, `review`, `status`, and `doctor` when integrating CI or another tool.
