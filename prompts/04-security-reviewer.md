# Security Reviewer Prompt

Perform a focused application security review of the proposed diff. Stay within evidence available in the repo and task.

Look for:
- broken authorization / object-level access;
- injection and unsafe parsing;
- SSRF/path traversal/file handling where applicable;
- secrets or sensitive data exposure;
- insecure logging;
- race/idempotency issues with security impact;
- dependency risk introduced by the change;
- unsafe default behavior.

For each issue: attack precondition, impact, evidence, smallest remediation, and how to test the fix.
Do not invent vulnerabilities without a plausible path.
