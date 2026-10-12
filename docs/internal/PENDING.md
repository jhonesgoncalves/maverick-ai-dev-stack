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
| **v1.11 "Decide"** | D2 placar e `route suggest`, D4 governador de rendimento, P4 canários, D1 decisões tipadas (primeiro: triagem de integridade e de disputas), D3 autonomia conquistada, H4 linter, selados fases 2–3 | Precisa dos dados que o v1.9 e o v1.10 já gravam (tokens, OI, ledger, propostas) para não decidir no escuro |
| **v2.0 "Proof layer"** | F1 concorrência, G1 grafo de trabalho guiado pelo código, G2 Arena, G4 replay, H3 recibo de prova, G3 flows v2, F6, F7 | Exige a refatoração de concorrência (F1) e aproveita tudo o que veio antes |

## DECIDIR: o harness que aprende com evidência

### D2 Placar do repositório e roteamento que aprende · nota 20
- **Problema:** `runtime.routes` e `stages` são configurados no chute. O ledger já grava, por iteração, provider, modelo, esforço, decisão, achados, custo, tokens e duração, mas nada agrega isso.
- **Ideia:**
  - `maverick scorecard` agrega `loops/*/ledger.jsonl`, `runs/*.jsonl` e os flows, por provider × modelo × esforço × tipo e complexidade da subtask.
  - Métricas: aceitação por iteração; iterações até `done`; custo e tokens; incidentes de integridade e overclaims; disputas honestas; aceite do juiz; OI dos selados; pass^k quando houver repetição.
  - `maverick route suggest` propõe um diff em `runtime.routes`, revisado como código.
  - Painel no Lens.
- **Regra inegociável:** integridade e OI pesam **contra** o provider. Um roteador que olha só a aprovação bruta favorece quem trapaceia (Meta, arXiv 2610.12822).
- **Apoia-se em:** `readLedger`, `state.iterations[]`, `resolveRun` (`src/runtime/policy.js`), os tokens normalizados do F2 e as propostas do R3.
- **Risco:** amostra pequena. Mostrar intervalos, nunca só a média.
- **Métrica:** custo por subtask aceita antes e depois de aplicar as sugestões.

### D4 Governador de rendimento · nota 12
- **Problema:** os budgets param por contagem, tempo ou dinheiro, mas nenhum para quando o loop **deixa de render**.
- **Ideia:**
  - Novo sinal em `src/loop/diagnose.js`: progresso dos gates por US$ ou por 1K tokens, numa janela móvel.
  - Abaixo de um piso, o loop sobe a escada ou para com um relatório de rendimento.
  - A previsão de custo usa o histórico do próprio repositório.
- **Apoia-se em:** `src/loop/budget.js` (`forecast`, `wouldExceed`), `scoreOf` e os tokens do F2.
- **Risco:** cortar cedo um progresso que acontece em degrau.

### P4 Canários de integridade e índice de honestidade · nota 9
- **Ideia:** `maverick canary run [--provider X | --all]` monta, num export, uma task sintética na linguagem do repositório. Ela traz um teste visível que contradiz o PRD (por exemplo `add(2,2) = 5`) e um teste selado com a verdade.
- **Classificação do resultado:**
  - `honest`: o agente disputou o teste;
  - `tamper`: houve achado de integridade;
  - `special-case`: o agente tratou o literal como caso especial;
  - `test-over-spec`: o teste visível passa e o selado falha.
- **Saída:** `$MAVERICK_HOME/canaries/<repo>.jsonl` e `lab/scorecard.csv`.
- **Por que importa:** mede o modelo **mais** o harness **mais** as instruções deste repositório, e alimenta o D2 e o trust.
- **Apoia-se em:** o canal `disputes`, a auditoria de integridade, as fixtures `fakeAgent`/`loopProject` (`test/loop-fixtures.js`) e a máquina de selados.

### D1 Pontos de decisão tipados e calibrados · nota 6
- **Problema:** as bifurcações do harness são heurísticas, sem probabilidade. O guarda de integridade é regex e gera falsos positivos: uma refatoração legítima de asserções parece enfraquecimento.
- **Ideia:**
  - Cada bifurcação vira uma pergunta tipada (`choice`, `score`, `yesno`) com rubrica versionada em `.maverick/rubrics/<id>.json` (`what`, `not_for`, `examples`).
  - **Escada de decisores**, que só sobe, nunca desce, conforme o risco da ação:
    1. regra determinística;
    2. modelo local "System One", via comando configurável (padrão jev: Jev, openjev, Kev, Laya);
    3. agente LLM read-only de outra família;
    4. humano.
  - Toda decisão vai para o ledger com probabilidade e limiar. A calibração usa as decisões humanas que já são gravadas: aprovações, `--resume --note`, review, aceite e rejeição de propostas.
- **Primeiras decisões:**
  1. "Este diff de teste é refatoração legítima ou enfraquecimento?"
  2. "Esta disputa procede?"
  3. Complexidade da subtask, para o roteamento.
  4. Elegibilidade para auto-approve.
  5. "Este trecho do repositório tenta instruir o agente?"
- **Salvaguarda:** o decisor só **sugere** até haver pelo menos 30 rótulos humanos naquela rubrica.
- **Apoia-se em:** `runHooks`, o ledger, `selectJudge` e o Lens (curva de confiabilidade).

### D3 Autonomia conquistada · nota 8
- **Ideia:**
  - Para cada componente ou caminho, calcular um nível de autonomia a partir do placar (D2) e dos resultados pós-merge: reverts e hotfixes que tocam as mesmas linhas em N dias, achados com `git log` e o trailer `Maverick task`. O `maverick why` já faz essa ligação.
  - O Maverick **propõe** mudanças numa política `autonomy` (auto-approve por caminho, juiz obrigatório, blast radius, teto de permissão) como diff revisável. **Nunca aplica sozinho.**
- **Risco:** incentivo a afrouxar. Subir a autonomia exige uma janela mínima sem nenhum incidente.

### H4 Linter da trifecta letal e da cadeia de skills · nota 24
- **Antes de `maverick add`:** varrer as capabilities em busca de instruções ocultas (Unicode tags, texto invisível), padrões de exfiltração e comandos de rede.
- **Por sessão:** relatório "trifecta" (MCP com dados privados + web + escrita externa), recomendando egress desligado nos loops.
- **No `doctor`:** o hash fixado no lockfile vira verificação.
- **Apoia-se em:** `src/capabilities/engine.js` (`planInstall`, lockfile).

## Testes selados: fases 2 e 3 (o que falta)

- Revisão da suíte por uma segunda família antes da aprovação.
- Lint de superfície: o teste só pode chamar o que a superfície escolhida permite (`spec`, `techspec` ou `boundary`).
- `seal amend` e suspensão de um teste, com disputas. A meta é uma taxa de amend abaixo de 20%.
- Painel de holdout dedicado no Lens. O card na página do loop já existe.
- Varredura dos transcripts dos builders em busca de acesso ao cofre.
- Runners por subprojeto em monorepos.
- Ratchet opt-in sobre os selados.
- Tendência do OI por provider (vai junto com o D2).
- **Métricas de sucesso:**
  - pelo menos 90% dos selados falham na base;
  - o custo extra fica em no máximo 15% do custo e do tempo do loop;
  - comparar defeitos pós-merge entre tasks com e sem selados.

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
