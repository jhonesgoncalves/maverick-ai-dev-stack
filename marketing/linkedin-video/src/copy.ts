export type Lang = "pt" | "en";

export type SceneProps = {
  readonly lang: Lang;
};

const en = {
  hookLine1: "Your AI agent just wrote",
  hookLine2: "1,200 lines.",
  newDependency: "+ new dependency",
  authTouched: "auth guard touched",
  moreFiles: "+ 6 more files",
  allTestsPass: "“All tests pass.”",
  quoteBy: "your agent",
  question: "Would you merge it?",
  problem1: "AI made diffs cheap.",
  problem2a: "Trust got ",
  problem2b: "expensive.",
  tagline1: "Your AI agent writes the code.",
  tagline2a: "Maverick makes it ",
  tagline2b: "mergeable.",
  planTitle: "One sentence in.",
  planOut:
    "Out come a PRD, a spec grounded in your code, a task graph and evidence.",
  gatesTitle: "7 gates before any merge.",
  gates: [
    "PRD · SPEC · TECHSPEC · TASKS traced",
    "lint · typecheck · test · build",
    "every changed file was declared",
    "no high-signal risks in the diff",
    "0 manifests, 0 lockfiles changed",
    "findings written for the reviewer",
    "waiting for a human decision",
  ],
  decision1: "Maverick never merges.",
  decision2: "You do.",
  compareTitle: "Prompt → diff vs. Maverick",
  compare: [
    { label: "What was asked", before: "A chat you closed", after: "PRD.md" },
    { label: "Tests pass", before: "Trust me", after: "EVIDENCE.md" },
    { label: "Who said “ship it”", before: "¯\\_(ツ)_/¯", after: "REVIEW.md" },
  ],
  lensTitle: "A local cockpit\nfor every task.",
  lensShots: ["Task", "Gates & approvals", "Architecture health"],
  lensCaption: "Tasks, gates, runs and architecture. Nothing leaves your machine.",
  agentsTitle: "Not another\ncoding agent.",
  agentsSub: "Keep the one you like.\nMaverick works with all of them.",
  facts: ["100% local", "no telemetry", "MIT"],
  ctaTagline1: "AI writes.",
  ctaTagline2: "Engineers decide.",
  ctaFacts: "Open source · MIT · Node 20+",
};

type Copy = typeof en;

const pt: Copy = {
  hookLine1: "Seu agente de IA escreveu",
  hookLine2: "1.200 linhas.",
  newDependency: "+ dependência nova",
  authTouched: "guard de auth alterado",
  moreFiles: "+ 6 arquivos",
  allTestsPass: "“Todos os testes passam.”",
  quoteBy: "seu agente",
  question: "Você faria o merge?",
  problem1: "A IA barateou o diff.",
  problem2a: "A confiança ficou ",
  problem2b: "cara.",
  tagline1: "Seu agente escreve o código.",
  tagline2a: "O Maverick faz ele ",
  tagline2b: "merecer o merge.",
  planTitle: "Uma frase entra.",
  planOut:
    "Saem um PRD, uma spec ancorada no seu código, o grafo de tarefas e evidências.",
  gatesTitle: "7 gates antes de qualquer merge.",
  gates: [
    "PRD · SPEC · TECHSPEC · TASKS rastreados",
    "lint · typecheck · test · build",
    "todo arquivo alterado estava declarado",
    "nenhum risco relevante no diff",
    "0 manifests, 0 lockfiles alterados",
    "achados escritos para o revisor",
    "aguardando a decisão de um humano",
  ],
  decision1: "O Maverick nunca faz merge.",
  decision2: "Quem decide\né você.",
  compareTitle: "Prompt → diff vs. Maverick",
  compare: [
    { label: "O que foi pedido", before: "Um chat que você fechou", after: "PRD.md" },
    { label: "Os testes passam", before: "Confia", after: "EVIDENCE.md" },
    { label: "Quem disse “pode subir”", before: "¯\\_(ツ)_/¯", after: "REVIEW.md" },
  ],
  lensTitle: "Um cockpit local\npara cada tarefa.",
  lensShots: ["Tarefa", "Gates e aprovações", "Saúde da arquitetura"],
  lensCaption:
    "Tarefas, gates, execuções e arquitetura. Nada sai da sua máquina.",
  agentsTitle: "Não é mais um\nagente de código.",
  agentsSub: "Fique com o que você já usa.\nO Maverick funciona com todos.",
  facts: ["100% local", "sem telemetria", "MIT"],
  ctaTagline1: "A IA escreve.",
  ctaTagline2: "Engenheiros decidem.",
  ctaFacts: "Open source · MIT · Node 20+",
};

export const COPY: Record<Lang, Copy> = { en, pt };
