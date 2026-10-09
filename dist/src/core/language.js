// Two languages per project: `docs` for everything the flow writes and says (PRD, technical
// spec, tasks, review, questions to the user) and `code` for what ends up in the codebase
// (identifiers, comments, test names, log and error messages, commit messages).
// Section headings are localized for the languages below; every reader accepts any of them,
// so a PRD written in Portuguese validates in a project configured for English and back.

export const DEFAULT_LANGUAGE = { docs: 'en', code: 'en' };

const NAMES = { en: 'English', 'pt-BR': 'Brazilian Portuguese', pt: 'Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian' };

/** Canonical heading → localized headings. Canonical (English) names are what the code uses. */
const HEADINGS = {
  Overview: { 'pt-BR': 'Visão Geral', es: 'Visión General' },
  Goals: { 'pt-BR': 'Objetivos', es: 'Objetivos' },
  'User Stories': { 'pt-BR': 'Histórias de Usuário', es: 'Historias de Usuario' },
  Requirements: { 'pt-BR': 'Requisitos', es: 'Requisitos' },
  'Acceptance Criteria': { 'pt-BR': 'Critérios de Aceite', es: 'Criterios de Aceptación' },
  'Business Rules': { 'pt-BR': 'Regras de Negócio', es: 'Reglas de Negocio' },
  'Edge Cases': { 'pt-BR': 'Casos de Borda', es: 'Casos Límite' },
  'Non-Goals': { 'pt-BR': 'Fora de Escopo', es: 'Fuera de Alcance' },
  'Open Questions': { 'pt-BR': 'Questões em Aberto', es: 'Preguntas Abiertas' },
  Summary: { 'pt-BR': 'Resumo', es: 'Resumen' },
  Behavior: { 'pt-BR': 'Comportamento', es: 'Comportamiento' },
  Contracts: { 'pt-BR': 'Contratos', es: 'Contratos' },
  'States and Data': { 'pt-BR': 'Estados e Dados', es: 'Estados y Datos' },
  Invariants: { 'pt-BR': 'Invariantes', es: 'Invariantes' },
  Errors: { 'pt-BR': 'Erros', es: 'Errores' },
  Traceability: { 'pt-BR': 'Rastreabilidade', es: 'Trazabilidad' },
  'Current State': { 'pt-BR': 'Estado Atual', es: 'Estado Actual' },
  Approach: { 'pt-BR': 'Abordagem', es: 'Enfoque' },
  'File References': { 'pt-BR': 'Referências de Arquivos', es: 'Referencias de Archivos' },
  'Interfaces and Data': { 'pt-BR': 'Interfaces e Dados', es: 'Interfaces y Datos' },
  Impact: { 'pt-BR': 'Impacto', es: 'Impacto' },
  'Test Plan': { 'pt-BR': 'Plano de Testes', es: 'Plan de Pruebas' },
  'Build Order': { 'pt-BR': 'Ordem de Construção', es: 'Orden de Construcción' },
  'Risks and Rollback': { 'pt-BR': 'Riscos e Rollback', es: 'Riesgos y Rollback' },
  Commands: { 'pt-BR': 'Comandos', es: 'Comandos' },
  'Do Not Touch': { 'pt-BR': 'Não Alterar', es: 'No Tocar' },
  Goal: { 'pt-BR': 'Objetivo', es: 'Objetivo' },
  Files: { 'pt-BR': 'Arquivos', es: 'Archivos' },
  Steps: { 'pt-BR': 'Passos', es: 'Pasos' },
  Verification: { 'pt-BR': 'Verificação', es: 'Verificación' },
  Tasks: { 'pt-BR': 'Tarefas', es: 'Tareas' },
  Checks: { 'pt-BR': 'Checagens', es: 'Comprobaciones' },
  Findings: { 'pt-BR': 'Achados', es: 'Hallazgos' },
  Decision: { 'pt-BR': 'Decisão', es: 'Decisión' },
  'Human Explanation': { 'pt-BR': 'Explicação Humana', es: 'Explicación Humana' }
};

/** Requirement structure keywords. Readers accept every language; writers use the docs language. */
export const KEYWORDS = {
  requirement: { en: 'Requirement', 'pt-BR': 'Requisito', es: 'Requisito' },
  scenario: { en: 'Scenario', 'pt-BR': 'Cenário', es: 'Escenario' },
  must: { en: 'SHALL / MUST', 'pt-BR': 'DEVE', es: 'DEBE' },
  when: { en: 'WHEN', 'pt-BR': 'QUANDO', es: 'CUANDO' },
  then: { en: 'THEN', 'pt-BR': 'ENTÃO', es: 'ENTONCES' }
};
export const MUST_WORDS = /\b(SHALL|MUST|DEVE|DEVERÁ|DEVERA|DEBE|DEBERÁ|DEBERA)\b/;
export const WHEN_WORDS = /\b(WHEN|QUANDO|CUANDO)\b/;
export const THEN_WORDS = /(?<![\p{L}])(THEN|ENTÃO|ENTAO|ENTONCES)(?![\p{L}])/u;
export const REQUIREMENT_HEADING = /^###\s+(?:Requirement|Requisito):\s*/im;
export const SCENARIO_HEADING = /^####\s+(?:Scenario|Cenário|Cenario|Escenario):/im;

export const fold = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Normalizes user input: "pt_BR", "pt-br", "PT-BR" → "pt-BR"; "EN" → "en". */
export function normalizeLanguage(value) {
  const match = String(value || '').trim().replace('_', '-').match(/^([a-z]{2,3})(?:-([a-z]{2,4}))?$/i);
  if (!match) throw new Error(`"${value}" is not a language code; use one such as en, pt-BR or es`);
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
}

/** The heading table to write in: Portuguese variants share pt-BR, unknown languages use English. */
function table(language) { return language?.startsWith('pt') ? 'pt-BR' : language?.startsWith('es') ? 'es' : 'en'; }

export function languageName(code) { return NAMES[code] ? `${NAMES[code]} (${code})` : code; }

/** A heading in the docs language, e.g. heading('Acceptance Criteria', 'pt-BR') → 'Critérios de Aceite'. */
export function heading(canonical, language = 'en') { return HEADINGS[canonical]?.[table(language)] || canonical; }

export function keyword(name, language = 'en') { return KEYWORDS[name][table(language)] || KEYWORDS[name].en; }

/** Every accepted spelling of a heading, folded for comparison. */
export function headingAliases(name) {
  const entry = Object.entries(HEADINGS).find(([canonical, localized]) => [canonical, ...Object.values(localized)].some(item => fold(item) === fold(name)));
  return entry ? [entry[0], ...Object.values(entry[1])].map(fold) : [fold(name)];
}

/** The language configuration with defaults. */
export function projectLanguage(config = {}) { return { ...DEFAULT_LANGUAGE, ...config.language }; }

/** The rule every writer follows, in one sentence per language. */
export function languageRule({ docs, code }) {
  return `Write the flow's documents (PRD, behavioral spec, technical spec, tasks, review) and talk to the user in ${languageName(docs)}, using the section headings given for that language. Write code, identifiers, comments, test names, log and error messages and commit messages in ${languageName(code)}.`;
}
