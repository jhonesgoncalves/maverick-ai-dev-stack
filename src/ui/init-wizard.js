import { languageName } from '../core/language.js';

// Pure model behind the `maverick init` wizard: the steps, their options and how answers are
// read back. Kept free of Ink so it is unit-testable; InitScreen only renders and routes keys.

const LANGUAGES = ['en', 'pt-BR', 'es', 'fr', 'de', 'it'];
const languageOptions = suggested => [...new Set([suggested, ...LANGUAGES])].map(code => ({ value: code, label: languageName(code) }));

/**
 * The interview as steps. `skip` lists steps answered by flags; they are left out.
 * Kinds: `text` (one line), `select` (one option), `multi` (checkboxes).
 */
export function wizardSteps({ name, adapters, suggested, docs, commands, skip = [] }) {
  const steps = [
    { id: 'name', kind: 'text', title: 'Project name', value: name, required: true },
    { id: 'description', kind: 'text', title: 'What does this project do, and for whom?', placeholder: 'One or two sentences every agent will read', value: '' },
    {
      id: 'agents', kind: 'multi', title: 'Which AI agents will work on this project?', min: 1,
      hint: 'Skills are written once to .agents/ and linked into each tool.',
      options: adapters.map(adapter => ({ value: adapter.id, label: adapter.name, hint: adapter.home, tag: suggested.includes(adapter.id) ? 'found' : undefined })),
      value: suggested.length ? suggested : ['claude-code']
    },
    { id: 'docs', kind: 'select', title: 'Language for PRDs, specs, tasks and reviews', options: languageOptions(docs), value: docs },
    { id: 'code', kind: 'select', title: 'Language for code, comments, tests and commits', options: languageOptions('en'), value: 'en' },
    {
      id: 'workflow', kind: 'select', title: 'Default workflow', value: 'standard',
      options: [{ value: 'standard', label: 'Standard', hint: 'PRD → tech spec → tasks → build → review → PR' }, { value: 'spec-driven', label: 'Spec Driven (SDD)', hint: 'PRD → approved SPEC → tech spec → tasks → build → review → PR' }, { value: 'strict', label: 'Strict', hint: 'adds security and review gates' }]
    },
    commands.length
      ? { id: 'verify', kind: 'multi', title: 'Which commands prove a change works?', min: 0, hint: 'Detected in the repository.', options: commands.map(command => ({ value: command, label: command })), value: [...commands] }
      : { id: 'verify', kind: 'text', title: 'Which commands prove a change works?', placeholder: 'e.g. npm test; npm run lint (optional)', value: '' }
  ];
  return steps.filter(step => !skip.includes(step.id));
}

/** Toggles one checkbox, keeping the options' order. */
export function toggle(step, values, value) {
  const next = values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  return step.options.map(option => option.value).filter(item => next.includes(item));
}

/** Selects every option, or none when all are already selected. */
export function toggleAll(step, values) { return values.length === step.options.length ? [] : step.options.map(option => option.value); }

/** Why the current answer cannot be accepted, or null. */
export function validate(step, value) {
  if (step.kind === 'text' && step.required && !String(value).trim()) return 'This one is required.';
  if (step.kind === 'multi' && value.length < (step.min || 0)) return `Select at least ${step.min}.`;
  return null;
}

/** The one-line answer shown next to a finished step. */
export function summarize(step, value) {
  if (step.kind === 'multi') return value.length ? step.options.filter(option => value.includes(option.value)).map(option => option.label).join(', ') : 'none';
  if (step.kind === 'select') return step.options.find(option => option.value === value)?.label || value;
  return String(value).trim() || 'skipped';
}

/** Answers keyed by step id, with the verification commands normalized to a list. */
export function answersFrom(steps, values) {
  const answers = Object.fromEntries(steps.map(step => [step.id, values[step.id]]));
  const verify = steps.find(step => step.id === 'verify');
  if (verify?.kind === 'text') answers.verify = String(values.verify || '').split(';').map(item => item.trim()).filter(Boolean);
  return answers;
}
