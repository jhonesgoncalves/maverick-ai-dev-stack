# Especificação Técnica — Paginação por cursor no endpoint de pedidos

## Resumo

Adicionar ao `GET /api/v1/orders` uma ramificação de paginação por cursor, selecionada por `cursor` ou `limit`, sem mudar o modo offset existente. O cursor será uma string opaca, base64url e autenticada por HMAC com a `apiKey` já disponível na configuração; ele transportará somente a posição `createdAt` e os filtros normalizados. A paginação por chave de `createdAt` aproveita a ordenação crescente e a unicidade de `createdAt` já garantidas pelo repositório.

## Estado Atual

- `src/orders/orders.controller.ts:8-14` protege a rota com `ApiKeyGuard`, transforma a query em `ListOrdersDto` e encaminha-a diretamente a `OrdersService.list`.
- `src/orders/dto/list-orders.dto.ts:5-10` aceita apenas filtros, `page` e `pageSize`; o `ValidationPipe` global transforma e valida a query em `src/main.ts:10`.
- `src/orders/orders.service.ts:25-34` calcula `page` e `pageSize`, cria a chave de cache por filtros e offset, carrega todas as linhas filtradas e responde `{ data, page, pageSize, total }`.
- `src/orders/orders.repository.ts:12-17` atribui `createdAt` estritamente crescente em cada inserção; `all()` devolve as linhas em ordem crescente de `createdAt` (`src/orders/orders.repository.ts:25-27`). Isso já fornece uma chave de progressão estável e única.
- `src/orders/orders.service.ts:37-44,52-54,67-69` invalida o prefixo `orders:` após criar, cancelar ou confirmar pagamento; páginas em cache não sobrevivem a essas escritas.
- `src/orders/orders.service.spec.ts:42-48` cobre somente paginação offset com filtro; `test/orders.e2e-spec.ts:22-27` confirma somente a listagem padrão autenticada.
- `docs/api.md:3-15` apenas enumera `page` e `pageSize`, e `docs/decisions/adr-001-cursor-pagination.md:1-16` ainda registra a decisão como `Proposed`.

## Abordagem

1. Estender `ListOrdersDto` com `cursor?: string` e `limit?: string`, mantendo os campos offset como estão. `limit` permanece string até o serviço para que entradas como `abc`, `1.5` e `0` recebam o envelope obrigatório `invalid_limit`, em vez do envelope genérico do `ValidationPipe`.
2. Criar `src/orders/order-cursor.ts` para serializar o payload canônico `{ createdAt, customerId: string | null, status: OrderStatus | null }`, codificá-lo com base64url e anexar uma assinatura HMAC-SHA-256 derivada de `ConfigService.get('apiKey')`. A decodificação verifica formato, assinatura com comparação em tempo constante e formato do payload; qualquer falha torna o cursor inválido. Isso também torna cursores de outro ambiente inválidos quando têm chave diferente.
3. Em `OrdersService.list`, detectar modo cursor pela presença de `cursor` ou `limit`; se houver também `page` ou `pageSize`, lançar `BadRequestException` com `{ code: 'conflicting_pagination', message }`. No modo cursor, validar `limit` manualmente contra `orders.defaultPageSize` e `orders.maxPageSize`, decodificar o cursor e comparar os filtros incluídos no payload com os filtros da query.
4. Depois de aplicar os filtros atuais, no modo cursor manter somente pedidos com `createdAt` estritamente posterior ao `createdAt` do cursor. Buscar `limit + 1` elementos da sequência em memória para determinar `hasMore`, devolver no máximo `limit` e emitir `nextCursor` a partir do último item devolvido. A chave de cache incluirá o modo, filtros, cursor e limite; as invalidações existentes continuam a cobrir ambas as modalidades.
5. Manter o bloco offset atual logicamente idêntico e extraí-lo apenas se isso tornar a separação clara; seus valores padrão, redução ao máximo, cache e formato não mudam.
6. Atualizar os testes unitários e e2e para cada cenário de `SPEC.md`, e documentar o contrato, a obsolescência e os códigos de erro. Atualizar ADR-001 para `Accepted`, conforme a suposição registrada e aprovada no fluxo.

Decisões e alternativas rejeitadas:

- Cursor HMAC, sem estado, foi escolhido para detectar adulteração e cursores de outro ambiente. Cursor em base64 sem assinatura foi rejeitado porque qualquer cliente poderia fabricar uma posição e filtros; cursor guardado no cache foi rejeitado porque expira, não é compartilhado de forma garantida e criaria estado de sessão fora do contrato.
- A posição usa somente `createdAt`; `id` como segundo componente foi rejeitado porque o repositório garante timestamps estritamente crescentes (`src/orders/orders.repository.ts:13-16`). O cursor continuará opaco, logo uma futura persistência pode ampliar a chave sem mudar o contrato.
- A validação manual de `limit` no serviço foi escolhida para emitir `invalid_limit` exatamente como a especificação exige. Usar somente `@IsInt`, `@Min` e `@Max` foi rejeitado porque as falhas do `ValidationPipe` global não contêm o campo público `code` exigido e uma alteração global afetaria outros endpoints.
- O repositório não será alterado: `all()` já ordena pela chave necessária e é usado também por relatórios. Introduzir uma API de consulta por cursor no repositório foi rejeitado por não reduzir custo no armazenamento em memória atual e aumentaria o risco no endpoint de relatórios.

## Referências de Arquivos

- `src/orders/orders.service.ts:25-34` — ponto de decisão entre os modos, paginação, cache e emissão dos erros públicos.
- `src/orders/dto/list-orders.dto.ts:1-10` — contrato de query e convenções atuais de transformação/validação.
- `src/orders/order-cursor.ts` (new) — codificação, assinatura e validação do cursor opaco; fica ao lado de `src/orders/order-pricing.ts`.
- `src/orders/orders.repository.ts:12-27` — garante ordem e unicidade de `createdAt`; será lido, mas não alterado.
- `src/orders/orders.controller.ts:8-14` — preserva o encaminhamento da query e a autorização atual; será lido, mas não alterado.
- `src/config/configuration.ts:1-15` — define `apiKey`, `orders.defaultPageSize` e `orders.maxPageSize` usados pelo cursor e limites; será lido, mas não alterado.
- `src/common/cache/cache.service.ts:1-200` — contrato de `wrap`/`invalidate` usado pelas duas modalidades; será lido, mas não alterado.
- `src/orders/orders.service.spec.ts:1-57` — testes unitários a ampliar para cursor, validação e compatibilidade.
- `test/orders.e2e-spec.ts:1-30` — testes HTTP a ampliar para contrato, erro e autorização.
- `docs/api.md:1-15` — documentação pública a alterar.
- `docs/decisions/adr-001-cursor-pagination.md:1-16` — decisão a marcar como aceita.

## Interfaces e Dados

```ts
// src/orders/dto/list-orders.dto.ts
export class ListOrdersDto {
  customerId?: string;
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
  cursor?: string;
  limit?: string;
}

// src/orders/order-cursor.ts
export interface CursorPayload {
  createdAt: string;
  customerId: string | null;
  status: OrderStatus | null;
}

export function encodeCursor(payload: CursorPayload, secret: string): string;
export function decodeCursor(cursor: string, secret: string): CursorPayload | null;

// src/orders/orders.service.ts
type OffsetOrdersPage = {
  data: Order[];
  page: number;
  pageSize: number;
  total: number;
};

type CursorOrdersPage = {
  data: Order[];
  nextCursor: string | null;
};

async list(query: ListOrdersDto): Promise<OffsetOrdersPage | CursorOrdersPage>;
```

O modo cursor terá o seguinte fluxo e formatos externos, sem alteração do endpoint nem do cabeçalho de autenticação:

```http
GET /api/v1/orders?customerId=c-1&status=paid&limit=2&cursor=<opaque-cursor>
x-api-key: <api-key>

200 OK
{ "data": [Order], "nextCursor": "<opaque-cursor>" }

400 Bad Request
{ "code": "invalid_limit" | "invalid_cursor" | "conflicting_pagination", "message": "<human-readable message>" }
```

- `limit` ausente no modo cursor usa `orders.defaultPageSize`; valores devem corresponder integralmente a inteiro decimal entre `1` e `orders.maxPageSize`.
- A presença de `cursor` ou `limit` ativa modo cursor. A presença de `page` ou `pageSize` junto a qualquer um deles causa `conflicting_pagination` antes de consultar pedidos.
- `decodeCursor` retorna `null` para cursor vazio, malformado, com assinatura inválida ou payload inválido; o serviço o converte em `BadRequestException` com `invalid_cursor`. Filtros diferentes de `null`/valor do payload recebem o mesmo erro.
- `nextCursor` é produzido apenas quando o item extra (`limit + 1`) existe; a página final e uma primeira página vazia devolvem `null`. Não haverá uma página vazia extra para um múltiplo exato de `limit`.
- A assinatura usa a `apiKey` já configurada como segredo de processo. Não há nova variável de ambiente, dependência, schema ou migração.

## Impacto

| Arquivo | Alteração | Dependentes verificados | Risco |
| --- | --- | --- | --- |
| `src/orders/dto/list-orders.dto.ts` | adiciona campos de query para cursor | controller e service; 8 dependentes transitivos | médio: o DTO participa da validação HTTP |
| `src/orders/order-cursor.ts` (new) | codec HMAC puro | apenas `OrdersService` após a mudança | médio: falha de validação pode aceitar/rejeitar cursor indevidamente |
| `src/orders/orders.service.ts` | ramificação de paginação, erros e cache | controller, módulo/app e 7 dependentes transitivos; 6 entry points afetados | alto: é serviço compartilhado e processa eventos e mutações |
| `src/orders/orders.service.spec.ts` | cobre comportamento interno | suíte de testes | baixo |
| `test/orders.e2e-spec.ts` | cobre contrato HTTP completo | suíte e2e | baixo |
| `docs/api.md` | documenta cursor e deprecia offset | integradores | baixo |
| `docs/decisions/adr-001-cursor-pagination.md` | altera status para `Accepted` | documentação de arquitetura | baixo |

`maverick impact` confirmou que `OrdersRepository` tem também consumidores de relatórios e 10 dependentes transitivos; como não será modificado, não haverá impacto no relatório diário. `OrdersService` e `ListOrdersDto` foram avaliados por seus dependentes antes deste desenho.

## Plano de Testes

- `UT-01` → AC-01 / SC-01: `list({ limit: '2' })` devolve os dois pedidos mais antigos, `nextCursor` não vazio e nenhum campo do envelope offset.
- `UT-02` → AC-02 / SC-02: usar o cursor de `UT-01` devolve somente o pedido seguinte e `nextCursor: null`; com quantidade múltipla exata, a última página cheia também tem `null`.
- `UT-03` → AC-03 / SC-03: cursor válido sem `limit` devolve no máximo 20 pedidos.
- `UT-04` → AC-04 / SC-05: paginação com `customerId` e com `status` devolve exatamente cada pedido filtrado uma vez.
- `UT-05` → AC-05 / SC-06: cursor assinado para `status: paid` falha com objeto `BadRequestException` de código `invalid_cursor` quando a chamada usa `pending`.
- `UT-06` → AC-06 / SC-07: criar `o-4` após a primeira página mantém `o-3` antes de `o-4`, sem duplicatas ou saltos.
- `UT-07` → AC-07 / SC-08 e SC-09: remover o item posterior devolve página vazia sem erro; alterar seu status em paginação filtrada o omite sem afetar os demais.
- `UT-08` → AC-08 / SC-10: cada `limit` `0`, `-5`, `1.5`, `101` e `abc` lança `invalid_limit`.
- `UT-09` → AC-09 / SC-11: cursor vazio, não-base64, payload adulterado e cursor assinado com outro segredo resultam em `invalid_cursor`.
- `UT-10` → AC-10 / SC-12: `page`/`pageSize` com `cursor` ou `limit` lança `conflicting_pagination`.
- `UT-11` → AC-11 / SC-13 e SC-14: sem parâmetros novos e com `page=2&pageSize=500`, conserva dados, `page`, redução de `pageSize` a 100 e `total` do comportamento atual.
- `UT-12` → AC-02 / SC-04: primeira página sem pedidos retorna `{ data: [], nextCursor: null }`.
- `IT-01` → AC-01 / SC-01 e AC-02 / SC-02: cria três pedidos via HTTP e percorre `GET /api/v1/orders?limit=2`, verificando envelopes, ordem, cursor e página final.
- `IT-02` → AC-04 / SC-05 e AC-05 / SC-06: verifica filtros pela API e `400 { code: 'invalid_cursor' }` para filtros alterados.
- `IT-03` → AC-08 / SC-10, AC-09 / SC-11 e AC-10 / SC-12: verifica os três códigos de erro públicos pelo endpoint.
- `IT-04` → AC-11 / SC-13 e SC-14: confirma que a listagem HTTP sem cursor/limit preserva o envelope offset e que o `x-api-key` continua obrigatório.
- `IT-05` → AC-12 / SC-15: verifica textualmente em `docs/api.md` a presença de parâmetros cursor, erros e marcação de obsolescência.

## Ordem de Construção

1. Criar e testar isoladamente o codec HMAC de cursor e ampliar o DTO de listagem, sem alterar o contrato offset.
2. Implementar a ramificação cursor, validações explícitas e chave de cache em `OrdersService`, mantendo a ramificação offset com comportamento idêntico.
3. Cobrir a lógica de serviço — sequência, filtros, concorrência simulada, limites e erros — em testes unitários.
4. Cobrir o contrato HTTP e compatibilidade em testes e2e.
5. Atualizar `docs/api.md` e o status da ADR-001; executar todas as verificações do projeto.

## Riscos e Rollback

- [Assinatura de cursor incorreta ou segredo rotacionado invalida cursores válidos] → testar payload, assinatura, adulteração e segredo distinto; a invalidade retorna o erro público estável `invalid_cursor`.
- [Validação manual diverge dos limites configurados] → usar `orders.defaultPageSize` e `orders.maxPageSize` no serviço, e testar os limites 1 e 100 além dos valores inválidos.
- [Chave de cache colide entre modalidades ou filtros] → prefixar por modalidade e incluir cursor, limite, `customerId` e `status`; manter a invalidação `orders:` existente após toda escrita.
- [Alteração acidental do offset quebra integrações] → manter seu bloco e testes de compatibilidade sem cursor/limit, inclusive redução de `pageSize`.
- [Cursor expõe detalhes internos] → somente o codec interpreta o valor; documentação e tipos públicos o tratam como opaco e a assinatura impede modificação silenciosa.

Rollback: reverter os arquivos desta entrega. Não há migração, alteração de entidade, estado persistido ou nova dependência; cursores já emitidos deixarão de ser aceitos quando o endpoint voltar ao comportamento exclusivamente offset.

## Comandos

```bash
npm run lint
npm run typecheck
npm run test
npm run build
maverick validate add-cursor-pagination-orders-endpoint --stage techspec
```

## Não Alterar

- `dist/` — artefatos gerados.
- `package-lock.json` — a implementação usa apenas `node:crypto`, já disponível, sem nova dependência.
- `src/orders/order.entity.ts` — não há mudança de schema nem campo novo em `Order`.
- `src/orders/orders.repository.ts` — a ordenação crescente e `createdAt` estritamente único existentes são suficientes; alterar este arquivo afetaria também relatórios.
- O contrato offset de `GET /api/v1/orders` sem `cursor` e `limit` — `data`, `page`, `pageSize` e `total` devem permanecer compatíveis.
