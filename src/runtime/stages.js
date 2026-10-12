// The workflow steps an agent runs in, and the model and reasoning effort Maverick
// recommends for each when the configuration names none (reviewed 2026-09).
//
// The rule behind the table: planning artifacts are short, read-only and decide everything
// downstream, so they get the strongest model with high reasoning; building is long and
// tool-heavy, so it gets the provider's coding workhorse at high effort; fixing named gate
// failures is narrow, so it uses the workhorse at a lower effort. Vendors agree that more
// effort pays off on agentic work (fewer wasted turns), and that the top effort levels are
// only worth it where evaluations show a gain, so `max` and `ultra` are never the default.

import { AGENT_STAGE_IDS, EFFORTS } from '../core/enums.js';

export { EFFORTS };

export const AGENT_STAGES = [
  { id: 'prd', name: 'PRD', description: 'Writes PRD.md: the problem, goals and acceptance criteria.' },
  { id: 'spec', name: 'Spec', description: 'Writes SPEC.md, the behavioral contract (spec-driven workflow).' },
  { id: 'techspec', name: 'Tech spec', description: 'Writes TECHSPEC.md: design, file references, risks and commands.' },
  { id: 'tasks', name: 'Tasks', description: 'Breaks the tech spec into the subtask graph.' },
  { id: 'build', name: 'Build', description: 'Implements a subtask or the whole task.' },
  { id: 'fix', name: 'Fix', description: 'Fixes the blocking issues of a failed flow.' },
  { id: 'judge', name: 'Judge', description: 'Reviews a change read-only against its criteria, for a judge gate.' }
];

export const STAGE_IDS = AGENT_STAGE_IDS;

// A judge reads a whole change and decides it, so it gets the planning model: the strongest.
const planning = (model, effort) => ({ prd: { model, effort }, spec: { model, effort }, techspec: { model, effort }, judge: { model, effort: effort && 'high' } });

export const RECOMMENDED = {
  // Anthropic: plan with Opus at xhigh, execute with Sonnet; Sonnet 5 supports xhigh at the lowest xhigh price.
  'claude-code': { ...planning('opus', 'xhigh'), tasks: { model: 'opus', effort: 'high' }, build: { model: 'sonnet', effort: 'xhigh' }, fix: { model: 'sonnet', effort: 'high' } },
  // OpenAI: Astra for the most demanding work, Sol as the coding workhorse; medium is the everyday level.
  codex: { ...planning('gpt-6-astra', 'high'), tasks: { model: 'gpt-6-astra', effort: 'medium' }, build: { model: 'gpt-6-sol', effort: 'high' }, fix: { model: 'gpt-6-sol', effort: 'medium' } },
  // Antigravity encodes the thinking level in the model id, so no separate effort.
  antigravity: { ...planning('gemini-3.1-pro-high'), tasks: { model: 'gemini-3.1-pro-high' }, build: { model: 'gemini-3.8-flash-high' }, fix: { model: 'gemini-3.8-flash-medium' } },
  gemini: { ...planning('pro'), tasks: { model: 'pro' }, build: { model: 'pro' }, fix: { model: 'flash' } },
  kiro: { ...planning('claude-opus-5', 'xhigh'), tasks: { model: 'claude-opus-5', effort: 'high' }, build: { model: 'claude-sonnet-5', effort: 'xhigh' }, fix: { model: 'claude-sonnet-5', effort: 'high' } }
};

/** The recommendation for a provider at a stage, dropping an effort the provider cannot take. */
export function recommendedFor(provider, stage) {
  const entry = RECOMMENDED[provider?.id]?.[stage];
  if (!entry) return {};
  return { model: entry.model, effort: entry.effort && provider.efforts?.includes(entry.effort) ? entry.effort : undefined };
}

/** Which stage an agent run is: planning stages by name, fixes when it gets blocking issues, otherwise build. */
export function stageOf({ stage, issues } = {}) {
  if (stage) return stage;
  return issues?.length ? 'fix' : 'build';
}
