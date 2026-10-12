// src/core/enums.js
var PERMISSIONS = ["read-only", "edit", "full"];
var HOOK_EVENTS = ["before-agent-run", "after-agent-run", "after-flow-run", "before-loop-iteration", "after-loop-iteration", "after-loop"];
var EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
var AGENT_STAGE_IDS = ["prd", "spec", "techspec", "tasks", "build", "fix", "judge", "seal"];
var LOOP_LADDER_STEPS = ["retry-with-diagnosis", "raise-effort", "switch-provider", "human"];
var LOOP_ISOLATION = ["in-place", "worktree"];
var GIT_PROVIDERS = ["github", "gitlab", "azure", "bitbucket"];
var INTEGRITY_LEVELS = ["strict", "standard", "off"];
var FINDING_KINDS = ["protected-path-modified", "undeclared-test-modified", "test-deleted", "test-count-decreased", "assertion-count-decreased", "assertion-weakened", "skip-or-only-added", "lint-or-type-suppression-added", "test-literal-special-casing", "oracle-config-modified", "blast-radius-exceeded", "overclaim", "claim-mismatch", "reviewer-directed-text", "disputed-check-modified", "vacuous-test"];

export {
  PERMISSIONS,
  HOOK_EVENTS,
  EFFORTS,
  AGENT_STAGE_IDS,
  LOOP_LADDER_STEPS,
  LOOP_ISOLATION,
  GIT_PROVIDERS,
  INTEGRITY_LEVELS,
  FINDING_KINDS
};
