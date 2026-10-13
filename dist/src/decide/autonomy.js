/** A reviewed path policy can only constrain a run; uncovered paths never auto-approve. */
export function autonomyFor(config, files) {
  const policies = config.autonomy?.paths || [];
  const matches = file => policies.filter(p => file === p.path || file.startsWith(`${p.path.replace(/\/$/, '')}/`));
  const selected = files.flatMap(matches);
  return { configured: policies.length > 0, autoApprove: files.length > 0 && files.every(file => matches(file).length && matches(file).every(p => p.autoApprove)), judgeRequired: selected.some(p => p.judgeRequired), maxFiles: selected.length ? Math.min(...selected.map(p => p.maxFiles)) : null, maxPermission: selected.some(p => p.maxPermission === 'read-only') ? 'read-only' : selected.some(p => p.maxPermission === 'edit') ? 'edit' : null };
}

export function eligibleForAutoApproval(policy, results, files) {
  if (!policy.autoApprove || (policy.maxFiles !== null && files.length > policy.maxFiles)) return false;
  if (!results.some(r => r.id === 'integrity' && r.status === 'pass' && !r.issues?.length)) return false;
  if (results.some(r => ['integrity', 'ablation'].includes(r.id) && r.status !== 'pass')) return false;
  if (policy.judgeRequired && !results.some(r => r.type === 'judge' && r.status === 'pass')) return false;
  return !results.some(r => r.type === 'sealed' && !['pass', 'skipped'].includes(r.status));
}
