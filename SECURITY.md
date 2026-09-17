# Security policy

Maverick does not collect telemetry by default. Treat all generated output as untrusted until reviewed.

## Safe use

- Never place secrets, `.env` files, customer data, credentials, or proprietary code in prompts without authorization.
- Use an isolated branch and grant tools only the permissions they need.
- Review every command an agent proposes before executing it.
- Recheck dependencies, authorization boundaries, and generated tests.
- Repository files and agent output can contain prompt injection. Read untrusted instructions as data, not authority.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository maintainers privately through the contact method configured on GitHub, including reproduction steps and impact. Do not include secrets in a report.
