# Pendências de implementação (estratégia 2026)

Este arquivo substitui o estudo `STRATEGY-2026.md`, que não está mais no repositório, e guarda só o que **falta** implementar. Já foram entregues o v1.9 "Prove" e o v1.10 "Remember", descritos no `CHANGELOG.md` e no `ROADMAP.md`.

A tese continua a mesma: o Maverick deixa de ser só um harness e passa a ser um **sistema de prova**. Agentes escrevem, o Maverick prova, engenheiros decidem.

Para priorizar, cada item tem uma nota `D × U × A / (E × R)`:
- **D** é a diferenciação, **U** o desejo do usuário e **A** quanto reaproveita do código; os três vão de 1 a 5;
- **E** é o esforço: P = 1, P–M = 1,5, M = 2, M–G = 2,5, G = 3;
- **R** é o risco, de 1 a 3.

## Ordem sugerida

| Versão | Conteúdo | Por quê nesta ordem |
|---|---|---|
| **v2.0 "Proof layer"** | F1 concorrência, G1 grafo de trabalho guiado pelo código, G2 Arena, G4 replay, H3 recibo de prova, G3 flows v2, F6, F7 | Exige a refatoração de concorrência (F1) e aproveita tudo o que veio antes |

## v1.11 “Decide” implementado (Unreleased)

D2, D4, P4, a triagem inicial do D1, D3 e H4 estão no CLI e no Lens. Os selados têm revisão independente opt-in, lint de superfície, amend/suspend/restore, varredura de transcripts, runners por subprojeto (já presentes) e ratchet opt-in. Rotas e autonomia continuam sendo patches revisáveis; decisões tipadas continuam consultivas.

A configuração, os limites de análise estática, a calibração e as métricas estão em [Decide](../../site/concepts/decide.md) e [Sealed tests](../../site/concepts/sealed-tests.md). Os alvos de 90% de falha na base, menos de 20% de amend e até 15% de custo/tempo extra são medidos pelo painel; não são resultados que se possam afirmar antes de acumular dados reais.

## ESCALAR: o grafo de trabalho (v2.0)

### F1 Fundação de concorrência (pré-requisito de G1 e G2)
- Captura de saída por invocação com `AsyncLocalStorage`, como `withCommandScope` já faz em `src/core/project-tools.js`.
- Chaves de loop por subtask (`src/loop/git.js`).
- Lock no `_tasks.md` (`src/subtasks/graph.js`).
- SIGINT por loop.

### G1 Grafo de trabalho guiado pelo grafo de código · nota 8,3
- Para cada par de subtasks prontas, prever a colisão pelos `Files` declarados, por `impactOf` em 2 saltos e pelo change coupling histórico.
- Subtasks sem colisão vão para pistas paralelas em worktrees; subtasks acopladas vão para a mesma pista, em série.
- **Fan-in:** o merge das pistas acontece num worktree de integração, que roda o oráculo completo, os selados e a arquitetura.
- **No Lens:** pistas, colisões previstas e colisões reais.
- **Métrica:** tempo de parede por task; colisões previstas versus reais.

### G2 Arena · nota 12
- `maverick arena <task> --subtask 03 --providers a,b,c` roda a mesma subtask em N worktrees.
- **O vencedor sai da evidência:** oráculo, selados, integridade, ablation, delta de arquitetura, tamanho do diff e um juiz de família diferente de todos os competidores.
- O humano confirma. Os perdedores viram patches rejeitados no ledger e alimentam o placar (D2).
- **Métrica:** quantas vezes o vencedor por evidência coincide com a escolha humana.

### G4 Gravador de voo e simulador de políticas · nota 22,5
- `maverick loop replay <task> [--set stall.window=3]` reexecuta as funções **puras** de política sobre `state.iterations` gravados: `compare`, `isProgress`, `diagnose`, `nextRung`, `checkBudget`, `wouldExceed`, `decideOutcome`.
- Responde perguntas como: "com esta política, o loop teria parado na iteração 5 e economizado US$ 0,40".
- **No Lens:** viagem no tempo pelos checkpoints e fork a partir de um checkpoint com outro provider.

### G3 Flows v2 como grafo · nota 3
- `maverick.flow/v2` com nós `agent`, `gate`, `decision` (D1), `human`, `fan-out` e `join`.
- Contratos tipados nas arestas e política de contexto por nó.
- Detecção de ciclo e renderização ao vivo no Lens.
- **Cuidado:** não virar um LangGraph. Continua um DAG tipado em arquivo, com desfechos explícitos.

## ENTREGAR

### H3 Recibo de prova · nota 12
- **Formato:** Statement in-toto num envelope DSSE assinado com ed25519 via `node:crypto`, sem dependência nova.
- **Predicado `maverick.dev/proof/v1`:** digests do PRD e do SPEC, cabeça do ledger, gates, selados e OI, integridade, vereditos, aprovações e modelos usados.
- **Onde fica:** `refs/notes/maverick` e `PROOF.json`.
- **Verificação:** `maverick proof verify` e um check de CI.
- **Interoperabilidade:** Agent Trace e AI-BOM. O diferencial é dizer *o que provou*, não só *quem escreveu*.

### H2 Explain-back (experimental) · nota 8
- Antes da aprovação, um agente read-only gera 3 perguntas sobre o comportamento da mudança, a partir do SPEC e do diff.
- O revisor responde no Lens, e a resposta fica no `REVIEW.md`.
- Opt-in, nunca bloqueia.

## Sobras do v1.10 "Remember"

- Exportar os registros do `why` no formato Agent Trace.
- Árvore de prova por critério no Lens. Hoje ela está só no `REVIEW-BUDGET.md`.
- Medir a precisão do grounding: arquivos sugeridos versus arquivos de fato alterados por task.
- Usar os snapshots do grafo (`.maverick/cache/graph/`) como cache do gate de arquitetura em monorepos grandes.

## FUNDAÇÕES restantes

| Id | O quê | Onde |
|---|---|---|
| F6 | Juiz em blocos acima de `maxDiffBytes` | `src/flows/judge.js` |
| F7 | Remover o `.maverick/` v1 da raiz e o `maverick.config.json`; registrar `rollback` no ledger ou tirá-lo do `loop log` | raiz, `src/commands/loop.js` |

## O que não fazer

- Não decidir roteamento ou autonomia pela taxa de aprovação bruta: integridade e OI sempre pesam contra.
- Não deixar o holdout virar oráculo escondido. Uma falha selada vai para um humano e nunca gera rollback automático.
- Não aplicar sozinho nenhuma mudança de política (autonomia, rotas, regras). Sempre propor um diff revisável.
- Não transformar os flows num framework genérico de grafos.
