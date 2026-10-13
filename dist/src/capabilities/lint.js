/** Static findings are evidence for a review, never instructions to execute a capability. */
export function lintCapability(capability) {
  const findings = [];
  for (const [path, bytes] of Object.entries(capability.contents || {})) {
    const text = String(bytes);
    if (/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\uFEFF\u{e0000}-\u{e007f}]/u.test(text)) findings.push({ path, kind: 'hidden-instruction', severity: 'block', message: 'Invisible Unicode or bidirectional controls can hide instructions.' });
    if (/\b(curl|wget|nc|netcat|ssh|scp)\b|\b(fetch|https?\.request)\s*\(|https?:\/\//i.test(text)) findings.push({ path, kind: 'network', severity: 'warn', message: 'Network access: inspect destinations and disable egress in loops.' });
    if (/(?:curl|wget|fetch|https?\.request|scp|netcat)[\s\S]{0,500}(?:\.env\b|credentials|private[_ -]?key|process\.env|\/\.ssh)|(?:\.env\b|credentials|private[_ -]?key|process\.env|\/\.ssh)[\s\S]{0,500}(?:curl|wget|fetch|https?\.request|scp|netcat)/i.test(text)) findings.push({ path, kind: 'exfiltration', severity: 'block', message: 'A network operation appears beside private data access.' });
    if (/ignore (?:all |the |previous )*(?:instructions|rules)|disregard (?:the |previous )*(?:instructions|rules)|(?:send|upload|transmit)\s+(?:all\s+)?(?:secrets|credentials|tokens)/i.test(text)) findings.push({ path, kind: 'instruction-override', severity: 'block', message: 'The capability asks to bypass instructions or disclose private data.' });
  }
  return { ok: !findings.some(i => i.severity === 'block'), findings };
}

/** Explicit session declarations keep the report honest about what the harness can observe. */
export function trifectaReport({ privateData = false, web = false, externalWrite = false } = {}) {
  return { privateData, web, externalWrite, complete: privateData && web && externalWrite, recommendation: privateData && web && externalWrite ? 'Disable egress in loops; separate private reads from external writes.' : 'Keep permissions scoped to the task.', observational: true };
}
