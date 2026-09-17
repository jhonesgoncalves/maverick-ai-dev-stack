// src/core/presets.js
var PRESET_IDS = ["lightweight", "standard", "spec-driven", "strict-review"];
var artifact = (id, file, template, sections) => ({ id, file, template, sections });
var common = {
  task: artifact("TASK", "TASK.md", "task-brief.md", ["Problem", "Goal", "Acceptance Criteria", "In Scope", "Out of Scope", "Verification"]),
  context: artifact("CONTEXT", "CONTEXT.md", "context-pack.md", ["Architecture Summary", "Relevant Paths", "Constraints", "Do Not Touch", "Commands"]),
  plan: artifact("PLAN", "PLAN.md", "plan.md", ["Approach", "Files", "Steps", "Tests"]),
  review: artifact("REVIEW", "REVIEW.md", "review.md", ["Scope", "Behavior", "Tests", "Security", "Decision"]),
  pr: artifact("PR", "PR.md", "pr-description.md", ["Summary", "What Changed", "How Verified", "Human Review"]),
  spec: artifact("SPEC", "SPEC.md", "spec.md", ["Problem", "Desired Behavior", "Functional Requirements", "Non-Functional Requirements", "Acceptance Criteria", "Domain Rules", "Constraints", "Edge Cases", "Out of Scope", "Open Questions", "Risks"]),
  risk: artifact("RISK", "RISK.md", "risk.md", ["Risk Assessment", "Mitigations", "Rollback", "Approval"])
};
var presets = {
  lightweight: { id: "lightweight", name: "Lightweight", description: "Small, low-risk changes.", bestFor: "Small, obvious changes with a narrow scope.", artifacts: [common.task, common.context, common.review], stages: ["brief", "context", "build", "verify", "review"] },
  standard: { id: "standard", name: "Standard", description: "Default engineering workflow.", bestFor: "Normal features and changes in an existing codebase.", artifacts: [common.task, common.context, common.plan, common.review, common.pr], stages: ["brief", "context", "plan", "build", "verify", "review", "pr"] },
  "spec-driven": { id: "spec-driven", name: "Spec Driven", description: "Specification-first workflow for ambiguous or complex work.", bestFor: "Complex or ambiguous features.", artifacts: [common.spec, common.task, common.context, common.plan, common.review, common.pr], stages: ["discover", "spec", "context", "plan", "build", "verify", "review", "pr"] },
  "strict-review": { id: "strict-review", name: "Strict Review", description: "Extra verification for high-risk changes.", bestFor: "High-risk, security-sensitive, data, payment, migration, or shared-infrastructure work.", artifacts: [common.task, common.context, common.plan, common.review, common.pr], stages: ["brief", "context", "plan", "build", "verify", "security", "review", "pr"], strict: true }
};
function getPreset(id = "standard") {
  return presets[id];
}
function requirePreset(id) {
  const preset = getPreset(id);
  if (!preset) throw new Error(`invalid preset "${id}"; choose: ${PRESET_IDS.join(", ")}`);
  return preset;
}
function stagesForPreset(id) {
  return requirePreset(id).stages;
}

export {
  PRESET_IDS,
  presets,
  getPreset,
  requirePreset,
  stagesForPreset
};
