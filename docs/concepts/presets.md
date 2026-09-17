# Workflow presets

Maverick has one core workflow: intent, context, plan, build, verification, review, and PR. Presets choose the right amount of ceremony for a task; they do not create separate frameworks.

| Preset | Use when | Avoid when |
|---|---|---|
| Lightweight | Low risk, small scope, obvious behavior | Domain ambiguity, migrations, security-sensitive work |
| Standard | A normal feature in an existing codebase | The work has unusually high risk or unclear domain requirements |
| Spec Driven | Requirements are unclear, the domain is complex, stakeholders differ, or architecture changes | A small, obvious local change |
| Strict Review | Sensitive code, data, security, payments, migrations, or shared infrastructure | A low-risk local change |

`standard` is the default for existing projects and new projects. A task can override it with `maverick task my-task --preset strict-review`. Each task stores its choice in `TASK.json`; older tasks without it are treated as Standard.

Built-in presets are currently fixed. Custom presets under `.maverick/presets/` are planned, so the CLI uses a central preset registry rather than preset-specific command paths.

Review-driven always: every preset includes a human review.
