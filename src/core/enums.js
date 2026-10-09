// Shared vocabularies with no dependencies, so configuration validation does not pull
// in the runtime modules that implement them.

/** Portable agent permission levels, ordered from least to most capable. */
export const PERMISSIONS = ['read-only', 'edit', 'full'];

/** Events that configured hooks can subscribe to. */
export const HOOK_EVENTS = ['before-agent-run', 'after-agent-run', 'after-flow-run'];

/** Reasoning effort levels, from least to most; each provider accepts a subset. */
export const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

/** Workflow steps an agent runs in; each can have its own provider, model and effort. */
export const AGENT_STAGE_IDS = ['prd', 'spec', 'techspec', 'tasks', 'build', 'fix'];
