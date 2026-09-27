# PRD — Paginação por cursor no endpoint de pedidos

## Visão Geral
`GET /api/v1/orders` pagina por offset (`page`, `pageSize`) e responde `{ data, page, pageSize, total }` (`src/orders/orders.service.ts:25-34`). Com offset, um cliente que pagina enquanto pedidos são criados ou removidos pode ver itens repetidos ou pular itens, e o custo cresce com o número da página. A ADR-001 (`docs/decisions/adr-001-cursor-pagination.md`) propõe um contrato com `cursor` opaco + `limit`. Esta mudança adiciona esse modo ao endpoint, mantendo o modo por offset funcionando sem alterações para os clientes atuais.

## Objetivos
- Clientes conseguem percorrer todos os pedidos, com os filtros atuais (`customerId`, `status`), em páginas de tamanho limitado, sem itens repetidos nem pulados, mesmo com pedidos sendo criados durante a paginação.
- Clientes que usam `page`/`pageSize` ou nenhum parâmetro continuam recebendo exatamente a resposta de hoje.
- O modo por offset passa a ser documentado como obsoleto, preparando sua remoção num release futuro.

## Histórias de Usuário
### US-01: Paginar pedidos por cursor
Como integrador da API de pedidos, quero buscar pedidos página a página usando um cursor, para percorrer listas grandes sem repetir nem perder pedidos.

### US-02: Manter integrações existentes funcionando
Como dono de uma integração que usa `page`/`pageSize`, quero que o endpoint continue respondendo como hoje, para que nada quebre na entrega.

### US-03: Receber erros claros para parâmetros inválidos
Como integrador, quero receber um erro 400 explícito quando envio `limit` ou `cursor` inválidos, para corrigir minha chamada em vez de receber resultados inesperados.

## Requisitos
### Requisito: Listagem paginada por cursor
Quando a requisição traz `cursor` ou `limit`, o sistema DEVE retornar no máximo `limit` pedidos (padrão 20), em ordem do mais antigo para o mais novo, junto com um `nextCursor` quando existirem mais pedidos depois da página. A resposta nesse modo DEVE ter o formato `{ data, nextCursor }` e não inclui `total`, `page` nem `pageSize`.

#### Cenário: Mais pedidos que o limite
- **QUANDO** um cliente pede `limit=2` e existem 3 pedidos
- **ENTÃO** recebe os 2 pedidos mais antigos e um `nextCursor` não vazio

#### Cenário: Próxima página
- **QUANDO** um cliente pede a página seguinte enviando o `nextCursor` recebido
- **ENTÃO** recebe os pedidos imediatamente posteriores ao último da página anterior, sem repetir nenhum

#### Cenário: Última página
- **QUANDO** um cliente pede uma página que contém o último pedido
- **ENTÃO** recebe os pedidos restantes e `nextCursor` igual a `null`

#### Cenário: Limite padrão
- **QUANDO** um cliente envia apenas `cursor`, sem `limit`
- **ENTÃO** recebe no máximo 20 pedidos

### Requisito: Filtros no modo cursor
O sistema DEVE aplicar `customerId` e `status` no modo cursor da mesma forma que no modo por offset. Um cursor DEVE ser válido apenas com os mesmos filtros da requisição que o gerou.

#### Cenário: Paginação filtrada
- **QUANDO** um cliente pagina com `customerId=c-1` e `limit=2`
- **ENTÃO** todas as páginas contêm apenas pedidos de `c-1` e, juntas, contêm todos os pedidos de `c-1` exatamente uma vez

#### Cenário: Filtros alterados no meio da paginação
- **QUANDO** um cliente envia um cursor gerado com `status=paid` junto com `status=pending`
- **ENTÃO** recebe 400 com `code=invalid_cursor`

### Requisito: Estabilidade durante escritas concorrentes
O sistema DEVE garantir que pedidos criados durante a paginação não causem repetição nem salto de pedidos que já existiam.

#### Cenário: Pedido criado entre páginas
- **QUANDO** um pedido é criado depois que o cliente recebeu a primeira página
- **ENTÃO** as páginas seguintes não repetem nenhum pedido já entregue e o novo pedido aparece no fim da sequência

#### Cenário: Pedido removido entre páginas
- **QUANDO** um pedido que ainda não foi entregue deixa de existir entre duas requisições
- **ENTÃO** a próxima página simplesmente não o inclui, sem erro

### Requisito: Validação de limit
O sistema DEVE rejeitar `limit` que não seja um inteiro entre 1 e 100 com 400 e `code=invalid_limit`.

#### Cenário: Limite acima do máximo
- **QUANDO** um cliente envia `limit=101`
- **ENTÃO** recebe 400 com `code=invalid_limit`

#### Cenário: Limite não inteiro
- **QUANDO** um cliente envia `limit=0`, `limit=-5` ou `limit=abc`
- **ENTÃO** recebe 400 com `code=invalid_limit`

### Requisito: Validação de cursor
O sistema DEVE rejeitar com 400 e `code=invalid_cursor` qualquer cursor que ele não tenha emitido ou que esteja malformado.

#### Cenário: Cursor malformado
- **QUANDO** um cliente envia `cursor=garbage`
- **ENTÃO** recebe 400 com `code=invalid_cursor`

### Requisito: Modos exclusivos
O sistema DEVE rejeitar com 400 uma requisição que misture parâmetros dos dois modos (`page` ou `pageSize` junto com `cursor` ou `limit`).

#### Cenário: Parâmetros misturados
- **QUANDO** um cliente envia `page=2&limit=10`
- **ENTÃO** recebe 400 com `code=conflicting_pagination`

### Requisito: Compatibilidade do modo por offset
Sem `cursor` e sem `limit`, o sistema DEVE manter o comportamento atual de `page`/`pageSize`: mesmos padrões, mesma redução de `pageSize` para o máximo e mesmo formato `{ data, page, pageSize, total }`.

#### Cenário: Sem parâmetros de paginação
- **QUANDO** um cliente chama `GET /api/v1/orders` sem parâmetros
- **ENTÃO** recebe `{ data, page: 1, pageSize: 20, total }`, como hoje

#### Cenário: Paginação por offset existente
- **QUANDO** um cliente envia `page=2&pageSize=500`
- **ENTÃO** recebe a segunda página com `pageSize` 100, como hoje

### Requisito: Documentação do contrato
A documentação da API DEVE descrever os parâmetros `cursor` e `limit`, o formato de resposta do modo cursor e os códigos de erro, e DEVE marcar `page`/`pageSize` como obsoletos.

#### Cenário: Consulta à documentação
- **QUANDO** um integrador lê `docs/api.md`
- **ENTÃO** encontra o contrato do modo cursor e o aviso de obsolescência de `page`/`pageSize`

## Critérios de Aceite
- [ ] AC-01: Dados 3 pedidos, quando um cliente pede `limit=2`, então recebe os 2 mais antigos e um `nextCursor` não vazio, sem `total` na resposta (US-01)
- [ ] AC-02: Dado um `nextCursor`, quando o cliente pede a página seguinte com ele, então recebe os pedidos posteriores sem repetir nenhum, e na última página `nextCursor` é `null` (US-01)
- [ ] AC-03: Dado apenas `cursor` sem `limit`, quando o cliente lista, então recebe no máximo 20 pedidos (US-01)
- [ ] AC-04: Dados filtros `customerId`/`status`, quando o cliente pagina por cursor, então as páginas contêm exatamente o conjunto filtrado, cada pedido uma vez (US-01)
- [ ] AC-05: Dado um cursor gerado com certos filtros, quando é enviado com filtros diferentes, então o cliente recebe 400 `invalid_cursor` (US-03)
- [ ] AC-06: Dado um pedido criado entre duas páginas, quando o cliente continua paginando, então nenhum pedido é repetido nem pulado e o novo aparece no fim (US-01)
- [ ] AC-07: Dado um pedido removido entre duas páginas, quando o cliente continua paginando, então ele é omitido sem erro (US-01)
- [ ] AC-08: Dado `limit` fora de 1–100 ou não inteiro, quando o cliente lista, então recebe 400 `invalid_limit` (US-03)
- [ ] AC-09: Dado um cursor malformado ou não emitido pelo sistema, quando o cliente lista, então recebe 400 `invalid_cursor` (US-03)
- [ ] AC-10: Dados `page`/`pageSize` junto com `cursor`/`limit`, quando o cliente lista, então recebe 400 `conflicting_pagination` (US-03)
- [ ] AC-11: Dada uma requisição sem `cursor` e sem `limit`, quando o cliente lista, então a resposta é idêntica à atual (`data`, `page`, `pageSize`, `total`, padrões e redução ao máximo) (US-02)
- [ ] AC-12: Dada a documentação `docs/api.md`, quando um integrador a consulta, então encontra o contrato do modo cursor e `page`/`pageSize` marcados como obsoletos (US-02)

## Regras de Negócio
- `limit` tem padrão 20 e aceita inteiros de 1 a 100, os mesmos valores de `orders.defaultPageSize`/`orders.maxPageSize` em `src/config/configuration.ts:15`.
- A ordem do modo cursor é a mesma do modo atual: `createdAt` crescente (do mais antigo para o mais novo).
- O cursor é opaco para o cliente: o formato não faz parte do contrato e pode mudar.
- O cursor é válido apenas com os mesmos filtros (`customerId`, `status`) da requisição que o gerou.
- Os dois modos são mutuamente exclusivos em uma mesma requisição.
- O endpoint continua exigindo `x-api-key` (`src/orders/orders.controller.ts:8`), sem mudança de permissões.

## Casos de Borda
- Nenhum pedido (ou nenhum que case com os filtros) → `{ data: [], nextCursor: null }`
- Quantidade de pedidos igual a um múltiplo exato de `limit` → a última página cheia vem com `nextCursor: null`, sem uma página vazia extra
- `limit` sem `cursor` → primeira página do modo cursor
- `cursor` vazio (`cursor=`) → 400 `invalid_cursor`
- `limit=0`, `limit=101`, `limit=1.5`, `limit=abc` → 400 `invalid_limit`
- Cursor alterado manualmente ou gerado por outro ambiente → 400 `invalid_cursor`
- Pedido criado durante a paginação → aparece no fim da sequência, sem repetir nem pular pedidos anteriores
- Pedido removido depois de entregue ou antes de ser entregue → omitido nas páginas seguintes, sem erro
- Pedido que muda de status durante uma paginação filtrada por `status` (por exemplo, `pending` → `paid`) → pode deixar de aparecer nas páginas seguintes; nenhum outro pedido é pulado por causa disso
- Mesma página pedida duas vezes com o mesmo cursor → mesmo conjunto de pedidos, desde que não tenha havido escrita entre as requisições
- `page`/`pageSize` junto com `cursor`/`limit` → 400 `conflicting_pagination`
- Requisição sem `x-api-key` → 401, como hoje

## Fora de Escopo
- Remover `page`/`pageSize` (fica para um release futuro, conforme a ADR-001).
- Retornar `total` ou contagem no modo cursor.
- Escolha de direção de ordenação, ordenação por outros campos ou novos filtros.
- Paginação para trás (`prevCursor`).
- Paginação no export CSV (`GET /api/v1/orders/export`) ou em outros endpoints (customers, reports).
- Expiração de cursores por tempo.
- Mudanças no schema do pedido ou migração para um banco de dados real.

## Questões em Aberto
- Qual o código de erro quando os modos são misturados? → Assumido 400 `conflicting_pagination`.
- Um cursor deve continuar válido se os filtros mudarem? → Assumido que não: 400 `invalid_cursor`.
- O status da ADR-001 deve passar de *Proposed* para *Accepted* nesta entrega? → Assumido que sim, junto com a atualização da documentação; confirmar na revisão.
