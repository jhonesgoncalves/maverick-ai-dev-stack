# Pendências de implementação (estratégia 2026)

Este arquivo substitui o estudo `STRATEGY-2026.md`, que não está mais no repositório, e guarda só o que **falta** implementar. Já foram entregues o v1.9 "Prove", o v1.10 "Remember" e o v1.11 "Decide" (publicado como 1.10.0), descritos no `CHANGELOG.md` e no `ROADMAP.md`.

A tese continua a mesma: o Maverick deixa de ser só um harness e passa a ser um **sistema de prova**. Agentes escrevem, o Maverick prova, engenheiros decidem.

## v2.0 "Proof layer" implementado (Unreleased)

Todos os itens do v2.0 estão no CLI e no Lens, com testes (`test/lanes.test.js`, `test/arena.test.js`, `test/workgraph.test.js`, `test/proof-layer.test.js`, `test/proof-receipt.test.js`, `test/flows-v2.test.js`). A documentação pública está em [The proof layer](../../site/concepts/proof-layer.md).

| Id | O quê | Onde |
|---|---|---|
| F1 | Saída capturada por invocação (`AsyncLocalStorage`), chaves de loop por lane, lock e diário de escritas do harness no grafo de subtasks, um handler de Ctrl-C para todos os loops | `src/core/util.js`, `src/core/lock.js`, `src/subtasks/graph.js`, `src/loop/git.js`, `src/loop/signals.js`, `src/loop/guards.js` |
| G1 | `loop graph`: colisões previstas (Files, `impactOf` em 2 saltos, change coupling), pistas paralelas, fan-in com merge e oráculo completo, colisões reais, Lens | `src/loop/workgraph.js` |
| G2 | `arena`: N worktrees, vencedor por evidência, juiz de família diferente de todos, confirmação humana, perdedores no ledger e no placar | `src/arena/arena.js` |
| G4 | `loop replay` (simulador de políticas) e `loop fork` (fork de um checkpoint com outro provider); card "Flight recorder" no Lens | `src/loop/replay.js`, `src/loop/fork.js` |
| H3 | Recibo de prova in-toto/DSSE/ed25519, `refs/notes/maverick`, `PROOF.json`, `proof verify`, check de CI, Agent Trace e AI-BOM | `src/proof/receipt.js`, `src/proof/interop.js` |
| G3 | `maverick.flow/v2`: DAG tipado com nós agent, gate, decision, human, fan-out, join e end; contratos nas arestas; política de contexto; detecção de ciclo; DAG no Lens | `src/flows/graph.js`, `src/flows/graph-run.js` |
| H2 | Explain-back opt-in, nunca bloqueia; respostas no Lens e no `REVIEW.md` | `src/proof/explain.js` |
| F6 | Juiz em partes acima de `maxDiffBytes` (`maxParts`) | `src/flows/judge.js` |
| F7 | Removidos o `.maverick/` v1 da raiz e o `maverick.config.json`; `loop log` não descreve mais um tipo `rollback` que o ledger nunca teve | raiz, `src/commands/loop.js` |

Sobras do v1.10 também entregues: export Agent Trace (`proof export`), árvore de prova no Lens (`review-budget.json`), precisão do grounding (`maverick grounding`) e reaproveitamento do grafo da base no gate de arquitetura.

## O que ainda falta

Nada do plano ficou sem implementação; o que segue são limites conhecidos e métricas que só os dados reais vão responder.

- **Métricas a acumular:** tempo de parede por task e colisões previstas versus reais (G1), concordância entre o vencedor por evidência e a escolha humana (G2), precisão do grounding. Os comandos medem; os alvos só podem ser afirmados com uso real.
- **Orçamento compartilhado:** cada lane e cada competidor da arena recebe o orçamento inteiro do loop. Falta um orçamento global por work graph e por arena.
- **Flows v2 em paralelo:** um run percorre o DAG em ordem topológica, um nó por vez. Ramos independentes depois de um `fan-out` ainda não rodam ao mesmo tempo (agentes de edição no mesmo working tree colidiriam; só nós read-only poderiam).
- **Settle de aprovações no v2:** uma decisão humana num nó `human` vale na próxima execução do flow; o v1 decide o run na hora.
- **Grafo incremental:** o gate de arquitetura só reaproveita o grafo quando nenhum arquivo de código ou de resolução mudou. Reanalisar só os arquivos alterados exige o contexto de resolução do projeto inteiro (tsconfig, workspaces, namespaces de C# e Elixir).
- **Agent Trace:** o export segue a forma 0.1 da especificação como ela estava em 2026; revisar quando a especificação estabilizar.
- **Fork:** os status das subtasks no ponto do fork são reconstruídos pelo ledger (`subtask-done`); caixas marcadas de subtasks não terminadas são desmarcadas.

## O que não fazer

- Não decidir roteamento ou autonomia pela taxa de aprovação bruta: integridade e OI sempre pesam contra.
- Não deixar o holdout virar oráculo escondido. Uma falha selada vai para um humano e nunca gera rollback automático; nenhuma lane roda o holdout.
- Não aplicar sozinho nenhuma mudança de política (autonomia, rotas, regras). Sempre propor um diff revisável. A arena e o work graph também não aplicam nada no working copy sem um humano.
- Não transformar os flows num framework genérico de grafos: o v2 continua um DAG tipado em arquivo, sem ciclos, com desfechos explícitos.
