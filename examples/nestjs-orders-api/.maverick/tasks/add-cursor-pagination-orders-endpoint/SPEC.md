# Especificação — Paginação por cursor no endpoint de pedidos

## Resumo

`GET /api/v1/orders` passa a aceitar a paginação por cursor opaco. Quando a consulta contém `cursor` ou `limit`, a resposta é `{ data, nextCursor }`; sem esses parâmetros, a paginação por offset e seu envelope atual permanecem inalterados. Esta especificação define o comportamento externo para AC-01 a AC-12 do `PRD.md`.

## Comportamento

### Requisito: Listagem por cursor

O endpoint DEVE usar paginação por cursor quando a consulta contiver `cursor` ou `limit`, ordenar os pedidos por `createdAt` crescente e retornar no máximo o limite solicitado.

#### Cenário: SC-01 Mais pedidos que o limite

- **DADO** três pedidos, `o-1`, `o-2` e `o-3`, com `createdAt` estritamente crescente nessa ordem
- **QUANDO** o cliente chama `GET /api/v1/orders?limit=2`
- **ENTÃO** recebe `200` com `data: [o-1, o-2]`, sem `total`, `page` ou `pageSize`, e com `nextCursor` não vazio

#### Cenário: SC-02 Página seguinte e última página

- **DADO** o `nextCursor` retornado em SC-01
- **QUANDO** o cliente chama `GET /api/v1/orders?limit=2&cursor=<nextCursor>`
- **ENTÃO** recebe `200` com `data: [o-3]` e `nextCursor: null`, sem repetir `o-1` ou `o-2`

#### Cenário: SC-03 Limite padrão com cursor

- **DADO** 21 pedidos posteriores à posição codificada por um cursor válido
- **QUANDO** o cliente chama `GET /api/v1/orders?cursor=<cursor>` sem `limit`
- **ENTÃO** recebe `200` com exatamente 20 pedidos e um `nextCursor` não vazio

#### Cenário: SC-04 Primeira página sem pedidos

- **DADO** que não há pedidos que atendam aos filtros da consulta
- **QUANDO** o cliente chama `GET /api/v1/orders?limit=20`
- **ENTÃO** recebe `200` com `data: []` e `nextCursor: null`

### Requisito: Filtros vinculados ao cursor

O endpoint DEVE aplicar `customerId` e `status` no modo cursor e DEVE aceitar um cursor somente com a mesma combinação desses filtros que o originou.

#### Cenário: SC-05 Paginação filtrada

- **DADO** três pedidos de `customerId=c-1` e dois pedidos de `customerId=c-2`, todos em ordem crescente de criação
- **QUANDO** o cliente percorre `GET /api/v1/orders?customerId=c-1&limit=2` até `nextCursor` ser `null`
- **ENTÃO** as páginas contêm os três pedidos de `c-1` exatamente uma vez e nenhum pedido de `c-2`

#### Cenário: SC-06 Filtro alterado durante a paginação

- **DADO** um cursor emitido para `GET /api/v1/orders?status=paid&limit=2`
- **QUANDO** o cliente chama `GET /api/v1/orders?status=pending&cursor=<cursor>`
- **ENTÃO** recebe `400` com `code: "invalid_cursor"`

### Requisito: Sequência estável sob escritas concorrentes

O endpoint DEVE preservar a progressão após a posição do cursor, de modo que inserções e remoções entre páginas não causem repetição nem salto dos pedidos que permanecem elegíveis.

#### Cenário: SC-07 Pedido criado entre páginas

- **DADO** `o-1`, `o-2` e `o-3`, uma primeira resposta de `limit=2` com `[o-1, o-2]`, e um novo pedido `o-4` criado depois dessa resposta
- **QUANDO** o cliente continua a paginação com o `nextCursor` da primeira resposta
- **ENTÃO** recebe `o-3` antes de `o-4`, sem repetir `o-1` ou `o-2`, e `o-4` aparece ao final da sequência

#### Cenário: SC-08 Pedido removido entre páginas

- **DADO** `o-1`, `o-2` e `o-3`, uma primeira resposta de `limit=2` com `[o-1, o-2]`, e `o-3` removido antes da próxima consulta
- **QUANDO** o cliente chama a próxima página com o `nextCursor` recebido
- **ENTÃO** recebe `200` com `data: []` e `nextCursor: null`, sem erro

#### Cenário: SC-09 Mudança de status em sequência filtrada

- **DADO** uma paginação com `status=pending`, cuja primeira página foi entregue, e um pedido posterior que muda para `paid` antes da próxima consulta
- **QUANDO** o cliente chama a próxima página com o mesmo cursor e `status=pending`
- **ENTÃO** o pedido que mudou de status é omitido e os demais pedidos `pending` posteriores não são pulados nem repetidos

### Requisito: Parâmetros inválidos são rejeitados

O endpoint DEVE rejeitar `limit` inválido e cursores vazios, malformados, alterados ou não emitidos pelo próprio endpoint.

#### Cenário: SC-10 Limite inválido

- **DADO** cada valor `0`, `-5`, `1.5`, `101` e `abc` para `limit`
- **QUANDO** o cliente chama `GET /api/v1/orders?limit=<valor>`
- **ENTÃO** recebe `400` com `code: "invalid_limit"`

#### Cenário: SC-11 Cursor inválido

- **DADO** cada cursor `""`, `garbage`, um valor alterado manualmente e um valor emitido por outro ambiente
- **QUANDO** o cliente chama `GET /api/v1/orders?cursor=<cursor>`
- **ENTÃO** recebe `400` com `code: "invalid_cursor"`

### Requisito: Modos de paginação exclusivos

O endpoint DEVE rejeitar uma consulta que combine qualquer parâmetro de offset com qualquer parâmetro de cursor.

#### Cenário: SC-12 Parâmetros de modos misturados

- **DADO** a consulta `page=2&limit=10`
- **QUANDO** o cliente chama `GET /api/v1/orders?page=2&limit=10`
- **ENTÃO** recebe `400` com `code: "conflicting_pagination"`

### Requisito: Compatibilidade da paginação por offset

O endpoint DEVE manter exatamente o comportamento atual por offset quando a consulta não contiver `cursor` nem `limit`.

#### Cenário: SC-13 Sem parâmetros de paginação

- **DADO** pelo menos um pedido existente
- **QUANDO** o cliente chama `GET /api/v1/orders`
- **ENTÃO** recebe `200` no formato `{ data, page: 1, pageSize: 20, total }`

#### Cenário: SC-14 Limite máximo do modo offset

- **DADO** pelo menos 101 pedidos existentes
- **QUANDO** o cliente chama `GET /api/v1/orders?page=2&pageSize=500`
- **ENTÃO** recebe `200` com `page: 2`, `pageSize: 100` e o mesmo conjunto que a segunda página de 100 itens retornaria antes desta mudança

### Requisito: Documentação do contrato

A documentação da API DEVE descrever o contrato cursor, seus erros e a obsolescência de `page` e `pageSize`.

#### Cenário: SC-15 Consulta à documentação

- **DADO** o arquivo `docs/api.md`
- **QUANDO** um integrador consulta a documentação de `GET /api/v1/orders`
- **ENTÃO** encontra `cursor`, `limit`, o envelope `{ data, nextCursor }`, os códigos `invalid_limit`, `invalid_cursor` e `conflicting_pagination`, e `page` e `pageSize` marcados como obsoletos

## Contratos

`GET /api/v1/orders` (alterado, compatível com versões anteriores)

```http
GET /api/v1/orders?customerId=c-1&status=paid&limit=2&cursor=<opaque-cursor>
x-api-key: <api-key>

200 OK
{
  "data": [
    {
      "id": "<uuid>",
      "customerId": "c-1",
      "items": [{ "sku": "book", "quantity": 1, "unitPrice": 25 }],
      "status": "paid",
      "paymentId": "pay_1",
      "createdAt": "2026-09-27T12:00:00.000Z"
    }
  ],
  "nextCursor": "<opaque-cursor>"
}
```

- `cursor` (novo): string opaca emitida por este endpoint; ausente na primeira página; não pode ser vazia e é válida somente para os mesmos valores de `customerId` e `status` que a geraram.
- `limit` (novo): inteiro de 1 a 100; seu padrão é `20`. Sua presença, mesmo sem `cursor`, seleciona o modo cursor.
- `customerId` e `status` (inalterados): filtros opcionais; aplicam-se igualmente aos dois modos.
- `page` e `pageSize` (obsoletos): inteiros opcionais do modo offset; não podem ser enviados com `cursor` ou `limit`.
- No modo cursor, `nextCursor` é uma string não vazia quando existe pelo menos um pedido posterior elegível; caso contrário é `null`. O formato do cursor não é público.
- No modo offset, sem `cursor` e `limit`, a resposta inalterada é `200 { "data": Order[], "page": number, "pageSize": number, "total": number }`.

Erros de paginação (novo):

```http
400 Bad Request
{ "code": "invalid_limit" | "invalid_cursor" | "conflicting_pagination", "message": "<human-readable message>" }
```

O cabeçalho `x-api-key` continua obrigatório; sua ausência retorna o `401` inalterado.

## Estados e Dados

- A listagem lê `Order`: `id`, `customerId`, `items`, `status`, `paymentId?` e `createdAt`; não cria campos nem altera pedidos.
- A ordem no modo cursor é `createdAt` crescente. Cada pedido criado possui um `createdAt` distinto, portanto essa ordem identifica uma posição única na sequência.
- Um cursor representa uma posição após o último pedido devolvido e a combinação de filtros usada para criar essa posição. Ele não representa uma página, total ou tempo de expiração.
- `status` permanece um de `pending`, `paid` ou `cancelled`. Durante uma sequência filtrada, um pedido que deixa de atender ao filtro pode ser omitido nas próximas páginas.

## Invariantes

- Uma resposta do modo cursor nunca contém mais pedidos que `limit` e nunca expõe `total`, `page` ou `pageSize`.
- Ao avançar com `nextCursor` e filtros idênticos, um pedido já devolvido nunca é devolvido novamente.
- Pedidos elegíveis posteriores à posição do cursor não são pulados por inserções ou remoções de outros pedidos.
- Um cursor não pode ser reutilizado com filtros diferentes nem ser interpretado pelo cliente como formato estável.
- O modo offset preserva seus padrões, máximo de `pageSize` e envelope enquanto `cursor` e `limit` estiverem ausentes.
- Autorização por `x-api-key` não é alterada.

## Erros

| Condição | Status / código | Mensagem | Tenta novamente? |
| --- | --- | --- | --- |
| `limit` ausente no intervalo inteiro de 1 a 100, incluindo valor não numérico | 400 `invalid_limit` | mensagem legível que informa que `limit` deve ser um inteiro entre 1 e 100 | não |
| `cursor` vazio, malformado, alterado, de outro ambiente ou vinculado a filtros diferentes | 400 `invalid_cursor` | mensagem legível que informa que o cursor é inválido | não |
| `page` ou `pageSize` enviados com `cursor` ou `limit` | 400 `conflicting_pagination` | mensagem legível que informa que os modos de paginação não podem ser combinados | não |
| `x-api-key` ausente ou inválida | 401 existente | resposta de autenticação existente | não |

## Rastreabilidade

| Critério | Cenários | Contratos |
| --- | --- | --- |
| AC-01 | SC-01 | `GET /api/v1/orders` 200 do modo cursor |
| AC-02 | SC-02 | `GET /api/v1/orders` 200 do modo cursor |
| AC-03 | SC-03 | `limit` padrão no modo cursor |
| AC-04 | SC-05 | filtros `customerId` e `status` no cursor |
| AC-05 | SC-06 | erro `invalid_cursor` |
| AC-06 | SC-07 | sequência cursor sob inserção |
| AC-07 | SC-08 | sequência cursor sob remoção |
| AC-08 | SC-10 | erro `invalid_limit` |
| AC-09 | SC-11 | erro `invalid_cursor` |
| AC-10 | SC-12 | erro `conflicting_pagination` |
| AC-11 | SC-13, SC-14 | resposta do modo offset inalterada |
| AC-12 | SC-15 | documentação de `GET /api/v1/orders` |

## Questões em Aberto

- O status da ADR-001 deve mudar de `Proposed` para `Accepted` nesta entrega? → Assumido que sim, conforme o PRD; confirmar durante a revisão.

## Approval

- [ ] Spec approved
