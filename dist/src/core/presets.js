// A task moves through one pipeline: the idea becomes a PRD, the PRD a technical spec, the
// spec a graph of tasks, and the tasks are built, verified and reviewed. Every planning
// artifact is written by a stage skill, never copied from a template; the sections listed
// here are what the validator requires. The strict workflow adds a security gate and a
// checkpoint for high-risk work. The spec-driven workflow puts a behavioral specification
// (SPEC.md) between the PRD and the technical spec: the contract the code and tests are
// written against, approved before any design starts.

export const PRESET_IDS = ['standard', 'spec-driven', 'strict'];

const artifact = (id, file, stage, sections) => ({ id, file, stage, sections });

const PRD = artifact('PRD', 'PRD.md', 'prd', ['Overview', 'Goals', 'User Stories', 'Requirements', 'Acceptance Criteria', 'Business Rules', 'Edge Cases', 'Non-Goals', 'Open Questions']);
const SPEC = artifact('SPEC', 'SPEC.md', 'spec', ['Summary', 'Behavior', 'Contracts', 'States and Data', 'Invariants', 'Errors', 'Traceability', 'Open Questions']);
const TECHSPEC = artifact('TECHSPEC', 'TECHSPEC.md', 'techspec', ['Summary', 'Current State', 'Approach', 'File References', 'Interfaces and Data', 'Impact', 'Test Plan', 'Build Order', 'Risks and Rollback', 'Commands', 'Do Not Touch']);

/** Every planning artifact any workflow can write, in pipeline order. The `tasks` stage writes the subtask graph instead of a file. */
export const ARTIFACTS = [PRD, SPEC, TECHSPEC];

/** Every planning stage any workflow can have, in pipeline order. */
export const PLANNING_STAGES = ['prd', 'spec', 'techspec', 'tasks'];

const DEFAULT_ARTIFACTS = [PRD, TECHSPEC];

export const presets = {
  standard: { id: 'standard', name: 'Standard', description: 'PRD, technical spec and task graph, then build, verify and human review.', bestFor: 'Features, fixes and refactors.', artifacts: DEFAULT_ARTIFACTS, stages: ['prd', 'techspec', 'tasks', 'build', 'verify', 'review', 'pr'] },
  'spec-driven': { id: 'spec-driven', name: 'Spec Driven', description: 'PRD, then an approved behavioral spec (SPEC.md) that the technical spec, tasks and tests trace to, then build, verify and human review.', bestFor: 'APIs, integrations, shared contracts, complex domain rules or work several people must agree on.', artifacts: ARTIFACTS, stages: ['prd', 'spec', 'techspec', 'tasks', 'build', 'verify', 'review', 'pr'] },
  strict: { id: 'strict', name: 'Strict', description: 'The standard pipeline plus a security gate and a checkpoint before merge.', bestFor: 'Security, data, payment, migration or shared-infrastructure work.', artifacts: DEFAULT_ARTIFACTS, stages: ['prd', 'techspec', 'tasks', 'build', 'verify', 'security', 'review', 'pr'], strict: true }
};

export function getPreset(id = 'standard') { return presets[id]; }
export function requirePreset(id) { const preset = getPreset(id); if (!preset) throw new Error(`invalid workflow "${id}"; choose: ${PRESET_IDS.join(', ')}`); return preset; }
export function stagesForPreset(id) { return requirePreset(id).stages; }

/** The planning stages of a workflow, in order: `prd`, `spec` (spec-driven only), `techspec`, `tasks`. */
export function planningStages(preset = presets.standard) { return preset.stages.filter(stage => PLANNING_STAGES.includes(stage)); }

/** The planning artifact a stage writes, or undefined for `tasks`. */
export function artifactForStage(stage) { return ARTIFACTS.find(item => item.stage === stage); }
