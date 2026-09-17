export function recommendPreset({ risk, type, complexity, openQuestions = 0, estimatedFiles } = {}) {
  if (risk === 'high') return { preset: 'strict-review', reason: 'High-risk changes need explicit verification, security review, and rollback evidence.' };
  if (type === 'migration' || type === 'security') return { preset: 'strict-review', reason: `${type === 'migration' ? 'Migrations' : 'Security-sensitive changes'} need rollback and extra verification.` };
  if (complexity === 'high' && Number(openQuestions) > 0) return { preset: 'spec-driven', reason: 'High complexity with open questions benefits from a shared specification.' };
  if (risk === 'low' && Number(estimatedFiles) <= 2) return { preset: 'lightweight', reason: 'Low risk and a small file footprint support a lightweight workflow.' };
  return { preset: 'standard', reason: 'Standard is the default workflow for routine engineering changes.' };
}
