// Instruction templates `maverick adapter install` copies into a project: one standing
// rule file per AI tool, in the project-level location that tool reads (verified 2026-09).
// Tools that already read AGENTS.md (OpenCode, Antigravity, Copilot) could share the codex
// file, but each gets its native location so it also works without AGENTS.md.

export const INSTRUCTION_ADAPTERS = [
  { id: 'claude-code', name: 'Claude Code', source: 'adapters/claude-code/CLAUDE.md.example', target: 'CLAUDE.md' },
  { id: 'codex', name: 'OpenAI Codex', source: 'adapters/codex/AGENTS.md.example', target: 'AGENTS.md' },
  { id: 'cursor', name: 'Cursor', source: 'adapters/cursor/maverick.mdc.example', target: '.cursor/rules/maverick.mdc' },
  { id: 'copilot', name: 'GitHub Copilot', source: 'adapters/copilot/copilot-instructions.md.example', target: '.github/copilot-instructions.md' },
  { id: 'gemini', name: 'Gemini CLI', source: 'adapters/gemini/GEMINI.md.example', target: 'GEMINI.md' },
  { id: 'antigravity', name: 'Google Antigravity', source: 'adapters/antigravity/maverick.md.example', target: '.agents/rules/maverick.md' },
  { id: 'windsurf', name: 'Windsurf / Devin Desktop', source: 'adapters/windsurf/maverick.md.example', target: '.windsurf/rules/maverick.md' },
  { id: 'kiro', name: 'Kiro', source: 'adapters/kiro/maverick.md.example', target: '.kiro/steering/maverick.md' },
  { id: 'opencode', name: 'OpenCode', source: 'adapters/codex/AGENTS.md.example', target: 'AGENTS.md' },
  { id: 'generic', name: 'Any other tool', source: 'adapters/generic/ROLE_PROMPT.txt', target: '.maverick/ROLE_PROMPT.txt' }
];

export const instructionAdapter = id => INSTRUCTION_ADAPTERS.find(adapter => adapter.id === id);
