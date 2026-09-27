---
title: Paginação por cursor no OrdersService
status: pending
type: backend
complexity: high
---

# Paginação por cursor no OrdersService

## Goal
Fazer `OrdersService.list` selecionar a paginação por cursor, emitir e validar cursores, manter uma sequência estável durante escritas e preservar o caminho offset sem mudanças observáveis.

## Acceptance Criteria
- [ ] AC-01: `limit=2` devolve os dois pedidos mais antigos, `nextCursor` não vazio e sem campos offset
- [ ] AC-02: a página seguinte não repete pedidos e a última devolve `nextCursor: null`
- [ ] AC-03: cursor sem `limit` usa no máximo 20 pedidos
- [ ] AC-04: filtros `customerId` e `status` permanecem exatos em todas as páginas cursor
- [ ] AC-05: cursor com filtros alterados retorna `invalid_cursor`
- [ ] AC-06: inserção entre páginas não duplica nem salta pedidos e o novo item fica ao final
- [ ] AC-07: remoção ou mudança de status entre páginas omite somente o item não elegível, sem erro
- [ ] AC-08: `limit` fora de 1–100 ou não inteiro retorna `invalid_limit`
- [ ] AC-09: cursor inválido retorna `invalid_cursor`
- [ ] AC-10: misturar parâmetros cursor e offset retorna `conflicting_pagination`
- [ ] AC-11: ausência de `cursor` e `limit` mantém `data`, `page`, `pageSize`, `total` e redução de `pageSize`

## Files
- `src/orders/orders.service.ts:1-70` — seleção do modo, paginação, erros públicos e chave de cache
- `src/orders/orders.service.spec.ts:1-57` — UT-01 a UT-12 para cursor e regressão offset
- `src/orders/order-cursor.ts` (created in task 01) — criação e leitura de posição/filtros assinados
- `src/orders/dto/list-orders.dto.ts:1-12` — query ampliada criada na tarefa 01
- `src/orders/orders.repository.ts:12-27` — ordem e unicidade de `createdAt`; somente referência, não alterar
- `src/common/cache/cache.service.ts:1-200` — `wrap` e `invalidate`; somente referência, não alterar
- `src/config/configuration.ts:1-15` — limites e `apiKey`; somente referência, não alterar

## Passos

- [ ] Separar em métodos privados, se necessário, o caminho cursor e o caminho offset, deixando o último semanticamente idêntico ao atual.
- [ ] Selecionar modo cursor pela presença de `cursor` ou `limit`.
- [ ] Rejeitar antes da consulta qualquer combinação com `page` ou `pageSize` usando `BadRequestException` com o envelope `conflicting_pagination`.
- [ ] Validar `limit` como inteiro decimal de 1 a `orders.maxPageSize`.
- [ ] Usar `orders.defaultPageSize` quando `limit` estiver ausente no modo cursor.
- [ ] Emitir `invalid_limit` para os demais valores de `limit`.
- [ ] Decodificar o cursor com a `apiKey`.
- [ ] Validar os filtros normalizados do cursor.
- [ ] Emitir `invalid_cursor` para falha de decodificação ou filtros diferentes.
- [ ] Filtrar as linhas atuais pelos filtros da consulta.
- [ ] Restringir a sequência a `createdAt` posterior ao cursor.
- [ ] Ler `limit + 1` itens para determinar se há página seguinte.
- [ ] Emitir o cursor do último item devolvido quando houver página seguinte.
- [ ] Usar uma chave de cache que inclua modo, filtros, cursor e limite.
- [ ] Cobrir a progressão em `OrdersService`.
- [ ] Cobrir página vazia e página final em `OrdersService`.
- [ ] Cobrir filtros em `OrdersService`.
- [ ] Cobrir mudanças concorrentes simuladas em `OrdersService`.
- [ ] Cobrir cada erro público em `OrdersService`.
- [ ] Cobrir compatibilidade offset em `OrdersService`.

## Verification
```bash
npm run test -- --runInBand src/orders/orders.service.spec.ts
npm run lint
npm run typecheck
```

- [ ] `UT-01` → AC-01 / SC-01: dois de três pedidos mais antigos, `nextCursor` não vazio e sem campos offset.
- [ ] `UT-02` → AC-02 / SC-02: página seguinte sem repetição e página final com `nextCursor: null`.
- [ ] `UT-03` → AC-03 / SC-03: cursor válido sem `limit` devolve no máximo 20 pedidos.
- [ ] `UT-04` → AC-04 / SC-05: filtros `customerId` e `status` devolvem cada pedido elegível uma vez.
- [ ] `UT-05` → AC-05 / SC-06: cursor com filtro diferente resulta em `invalid_cursor`.
- [ ] `UT-06` → AC-06 / SC-07: pedido criado entre páginas aparece ao final, sem repetição ou salto.
- [ ] `UT-07` → AC-07 / SC-08, SC-09: remoção e mudança de status omitem somente o item não elegível, sem erro.
- [ ] `UT-08` → AC-08 / SC-10: cada `limit` inválido resulta em `invalid_limit`.
- [ ] `UT-09` → AC-09 / SC-11: cursor vazio, malformado, adulterado ou de outro segredo resulta em `invalid_cursor`.
- [ ] `UT-10` → AC-10 / SC-12: modos misturados resultam em `conflicting_pagination`.
- [ ] `UT-11` → AC-11 / SC-13, SC-14: modo offset preserva envelope, padrões e redução de `pageSize`.
- [ ] `UT-12` → AC-02 / SC-04: primeira página sem pedidos devolve `{ data: [], nextCursor: null }`.
