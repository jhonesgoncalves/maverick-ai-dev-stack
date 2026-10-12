// Shared vocabularies with no dependencies, so configuration validation does not pull
// in the runtime modules that implement them.

/** Portable agent permission levels, ordered from least to most capable. */
export const PERMISSIONS = ['read-only', 'edit', 'full'];

/** Events that configured hooks can subscribe to. */
export const HOOK_EVENTS = ['before-agent-run', 'after-agent-run', 'after-flow-run', 'before-loop-iteration', 'after-loop-iteration', 'after-loop'];

/** Reasoning effort levels, from least to most; each provider accepts a subset. */
export const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

/** Workflow steps an agent runs in; each can have its own provider, model and effort. */
export const AGENT_STAGE_IDS = ['prd', 'spec', 'techspec', 'tasks', 'build', 'fix', 'judge'];

/** How a stuck loop escalates, one rung at a time, until a human decides. */
export const LOOP_LADDER_STEPS = ['retry-with-diagnosis', 'raise-effort', 'switch-provider', 'human'];

/** Where a loop works: the user's checkout (hidden checkpoint refs) or its own worktree and branch. */
export const LOOP_ISOLATION = ['in-place', 'worktree'];

/** Git providers a task's pull request can be opened on (`pr.provider`). */
export const GIT_PROVIDERS = ['github', 'gitlab', 'azure', 'bitbucket'];

/** How strictly the integrity guard treats changes to the checks themselves. */
export const INTEGRITY_LEVELS = ['strict', 'standard', 'off'];

/** What the integrity guard can find in a change. */
export const FINDING_KINDS = ['protected-path-modified', 'undeclared-test-modified', 'test-deleted', 'test-count-decreased', 'assertion-count-decreased', 'assertion-weakened', 'skip-or-only-added', 'lint-or-type-suppression-added', 'test-literal-special-casing', 'oracle-config-modified', 'blast-radius-exceeded', 'overclaim', 'claim-mismatch', 'reviewer-directed-text', 'disputed-check-modified'];
