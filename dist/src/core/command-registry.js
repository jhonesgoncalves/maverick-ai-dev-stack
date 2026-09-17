export const commandRegistry = [
  ['dashboard', 'Open the local project-intelligence dashboard.', ['dash', 'lens'], 'dashboard --open'],
  ['init', 'Initialize a project or create a task with a legacy slug.', [], 'init [task]'], ['task', 'Create preset-driven task artifacts.', ['create'], 'task <slug> --preset <preset>'],
  ['map', 'Build a repository context map.', [], 'map [--json]'], ['packet', 'Compile a focused agent packet.', ['run'], 'packet <task> --agent <name>'],
  ['checkpoint', 'Save current Git state and diff.', [], 'checkpoint <task>'], ['impact', 'Find bounded project references to a file.', [], 'impact <path>'],
  ['guard', 'Compare changed files with declared task scope.', [], 'guard <task>'], ['learn', 'Capture a proposed reusable engineering rule.', [], 'learn <task> --rule <text>'],
  ['handoff', 'Create a task handoff with remaining gates.', [], 'handoff <task> --to <owner>'], ['readiness', 'Evaluate merge-readiness gates.', [], 'readiness <task>'],
  ['policy', 'Initialize, show, or check repository policy.', [], 'policy init|show|check <task>'], ['adapter', 'List or install an AI adapter.', [], 'adapter list|install <name>'],
  ['ci', 'Generate a GitHub Actions task gate.', [], 'ci github <task>'], ['verify', 'Run detected checks and save evidence.', [], 'verify <task> [--json]'],
  ['security', 'Scan a changed diff for high-signal security risks.', [], 'security <task>'], ['deps', 'Report changed manifests and lockfiles.', [], 'deps <task>'],
  ['pr', 'Generate an evidence-backed PR draft.', [], 'pr <task>'], ['presets', 'List or inspect workflow presets.', [], 'presets [show <preset>]'],
  ['suggest', 'Recommend a preset from local rules.', [], 'suggest [--risk high]'], ['validate', 'Validate task artifacts and required sections.', [], 'validate <task> [--json]'],
  ['context', 'Show a task context artifact.', [], 'context <task>'], ['plan', 'Show a task plan artifact.', [], 'plan <task>'],
  ['review', 'Show review or review a diff.', [], 'review <task> --diff'], ['doctor', 'Inspect local setup and project checks.', [], 'doctor [--fix]'],
  ['status', 'Show task stage and pending gates.', [], 'status [--json]'], ['info', 'Show Maverick information.', ['version', '--version', '-v'], 'info']
].map(([id, description, aliases, example]) => ({ id, command: `maverick ${id}`, description, aliases, example }));
