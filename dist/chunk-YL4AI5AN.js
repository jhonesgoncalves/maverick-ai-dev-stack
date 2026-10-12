// src/core/language.js
var DEFAULT_LANGUAGE = { docs: "en", code: "en" };
var NAMES = { en: "English", "pt-BR": "Brazilian Portuguese", pt: "Portuguese", es: "Spanish", fr: "French", de: "German", it: "Italian" };
var HEADINGS = {
  Overview: { "pt-BR": "Vis\xE3o Geral", es: "Visi\xF3n General" },
  Goals: { "pt-BR": "Objetivos", es: "Objetivos" },
  "User Stories": { "pt-BR": "Hist\xF3rias de Usu\xE1rio", es: "Historias de Usuario" },
  Requirements: { "pt-BR": "Requisitos", es: "Requisitos" },
  "Acceptance Criteria": { "pt-BR": "Crit\xE9rios de Aceite", es: "Criterios de Aceptaci\xF3n" },
  "Business Rules": { "pt-BR": "Regras de Neg\xF3cio", es: "Reglas de Negocio" },
  "Edge Cases": { "pt-BR": "Casos de Borda", es: "Casos L\xEDmite" },
  "Non-Goals": { "pt-BR": "Fora de Escopo", es: "Fuera de Alcance" },
  "Open Questions": { "pt-BR": "Quest\xF5es em Aberto", es: "Preguntas Abiertas" },
  Summary: { "pt-BR": "Resumo", es: "Resumen" },
  Behavior: { "pt-BR": "Comportamento", es: "Comportamiento" },
  Contracts: { "pt-BR": "Contratos", es: "Contratos" },
  "States and Data": { "pt-BR": "Estados e Dados", es: "Estados y Datos" },
  Invariants: { "pt-BR": "Invariantes", es: "Invariantes" },
  Errors: { "pt-BR": "Erros", es: "Errores" },
  Traceability: { "pt-BR": "Rastreabilidade", es: "Trazabilidad" },
  "Current State": { "pt-BR": "Estado Atual", es: "Estado Actual" },
  Approach: { "pt-BR": "Abordagem", es: "Enfoque" },
  "File References": { "pt-BR": "Refer\xEAncias de Arquivos", es: "Referencias de Archivos" },
  "Interfaces and Data": { "pt-BR": "Interfaces e Dados", es: "Interfaces y Datos" },
  Impact: { "pt-BR": "Impacto", es: "Impacto" },
  "Test Plan": { "pt-BR": "Plano de Testes", es: "Plan de Pruebas" },
  "Build Order": { "pt-BR": "Ordem de Constru\xE7\xE3o", es: "Orden de Construcci\xF3n" },
  "Risks and Rollback": { "pt-BR": "Riscos e Rollback", es: "Riesgos y Rollback" },
  Commands: { "pt-BR": "Comandos", es: "Comandos" },
  "Do Not Touch": { "pt-BR": "N\xE3o Alterar", es: "No Tocar" },
  Architecture: { "pt-BR": "Arquitetura", es: "Arquitectura" },
  Goal: { "pt-BR": "Objetivo", es: "Objetivo" },
  Files: { "pt-BR": "Arquivos", es: "Archivos" },
  Steps: { "pt-BR": "Passos", es: "Pasos" },
  Verification: { "pt-BR": "Verifica\xE7\xE3o", es: "Verificaci\xF3n" },
  Tasks: { "pt-BR": "Tarefas", es: "Tareas" },
  Checks: { "pt-BR": "Checagens", es: "Comprobaciones" },
  Findings: { "pt-BR": "Achados", es: "Hallazgos" },
  Decision: { "pt-BR": "Decis\xE3o", es: "Decisi\xF3n" },
  "Human Explanation": { "pt-BR": "Explica\xE7\xE3o Humana", es: "Explicaci\xF3n Humana" },
  "Sealed Acceptance Tests": { "pt-BR": "Testes de Aceite Selados", es: "Pruebas de Aceptaci\xF3n Selladas" }
};
var KEYWORDS = {
  requirement: { en: "Requirement", "pt-BR": "Requisito", es: "Requisito" },
  scenario: { en: "Scenario", "pt-BR": "Cen\xE1rio", es: "Escenario" },
  must: { en: "SHALL / MUST", "pt-BR": "DEVE", es: "DEBE" },
  when: { en: "WHEN", "pt-BR": "QUANDO", es: "CUANDO" },
  then: { en: "THEN", "pt-BR": "ENT\xC3O", es: "ENTONCES" }
};
var MUST_WORDS = /\b(SHALL|MUST|DEVE|DEVERÁ|DEVERA|DEBE|DEBERÁ|DEBERA)\b/;
var WHEN_WORDS = /\b(WHEN|QUANDO|CUANDO)\b/;
var THEN_WORDS = /(?<![\p{L}])(THEN|ENTÃO|ENTAO|ENTONCES)(?![\p{L}])/u;
var REQUIREMENT_HEADING = /^###\s+(?:Requirement|Requisito):\s*/im;
var SCENARIO_HEADING = /^####\s+(?:Scenario|Cenário|Cenario|Escenario):/im;
var fold = (text) => String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function normalizeLanguage(value) {
  const match = String(value || "").trim().replace("_", "-").match(/^([a-z]{2,3})(?:-([a-z]{2,4}))?$/i);
  if (!match) throw new Error(`"${value}" is not a language code; use one such as en, pt-BR or es`);
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
}
function table(language) {
  return language?.startsWith("pt") ? "pt-BR" : language?.startsWith("es") ? "es" : "en";
}
function languageName(code) {
  return NAMES[code] ? `${NAMES[code]} (${code})` : code;
}
function heading(canonical, language = "en") {
  return HEADINGS[canonical]?.[table(language)] || canonical;
}
function keyword(name, language = "en") {
  return KEYWORDS[name][table(language)] || KEYWORDS[name].en;
}
function headingAliases(name) {
  const entry = Object.entries(HEADINGS).find(([canonical, localized]) => [canonical, ...Object.values(localized)].some((item) => fold(item) === fold(name)));
  return entry ? [entry[0], ...Object.values(entry[1])].map(fold) : [fold(name)];
}
function projectLanguage(config = {}) {
  return { ...DEFAULT_LANGUAGE, ...config.language };
}
function languageRule({ docs, code }) {
  return `Write the flow's documents (PRD, behavioral spec, technical spec, tasks, review) and talk to the user in ${languageName(docs)}, using the section headings given for that language. Write code, identifiers, comments, test names, log and error messages and commit messages in ${languageName(code)}.`;
}

export {
  MUST_WORDS,
  WHEN_WORDS,
  THEN_WORDS,
  REQUIREMENT_HEADING,
  SCENARIO_HEADING,
  fold,
  normalizeLanguage,
  languageName,
  heading,
  keyword,
  headingAliases,
  projectLanguage,
  languageRule
};
