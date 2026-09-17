# Playbook — Secure Coding with AI

## Before sharing context
Remove secrets, tokens, internal URLs, customer identifiers, production payloads and proprietary material that should not leave the approved boundary.

## During implementation
Validate at trust boundaries. Authorize resources, not just routes. Use safe parameterized APIs. Avoid logging secrets/PII. Prefer deny-by-default for new permissions.

## Before merge
Run the security checklist. Review dependency additions manually. Check generated configuration and infrastructure with extra care.

AI assistance is not a security control. Human review and your organization's approved tooling/policies remain authoritative.
