---
title: Contrato HTTP e documentação da API
status: pending
type: integration
complexity: medium
---

# Contrato HTTP e documentação da API

## Goal
Publicar e verificar o contrato HTTP de cursor, a compatibilidade offset e a documentação destinada a integradores.

## Acceptance Criteria
- [ ] AC-01: resposta HTTP cursor apresenta dois pedidos antigos e `nextCursor`
- [ ] AC-02: continuação HTTP não repete pedidos e termina com `nextCursor: null`
- [ ] AC-04: filtros funcionam no contrato HTTP cursor
- [ ] AC-05: filtros diferentes do cursor retornam `invalid_cursor`
- [ ] AC-08: `limit` inválido retorna `invalid_limit`
- [ ] AC-09: cursor inválido retorna `invalid_cursor`
- [ ] AC-10: modos misturados retornam `conflicting_pagination`
- [ ] AC-11: clientes offset e autenticação existentes continuam compatíveis
- [ ] AC-12: documentação descreve cursor, erros e obsolescência offset

## Files
- `test/orders.e2e-spec.ts:1-30` — IT-01 a IT-05 para o contrato HTTP e verificação documental
- `docs/api.md:1-15` — parâmetros, envelopes de sucesso/erro, exemplos e depreciação de `page`/`pageSize`
- `docs/decisions/adr-001-cursor-pagination.md:1-16` — muda o status da decisão para `Accepted`
- `src/orders/orders.controller.ts:8-14` — encaminhamento de query e guarda; somente referência, não alterar salvo necessidade comprovada pelo teste
- `src/main.ts:1-16` — `ValidationPipe` global; somente referência, não alterar

## Passos

- [ ] Adicionar dados de preparação para três pedidos no teste e2e.
- [ ] Testar por HTTP `limit=2` com os dois pedidos mais antigos.
- [ ] Testar por HTTP a ordem do modo cursor.
- [ ] Testar por HTTP o envelope cursor.
- [ ] Testar por HTTP `nextCursor: null` na última página.
- [ ] Cobrir filtros no endpoint.
- [ ] Cobrir cursor reutilizado com filtro diferente no endpoint.
- [ ] Cobrir o envelope `invalid_limit` no endpoint.
- [ ] Cobrir o envelope `invalid_cursor` no endpoint.
- [ ] Cobrir o envelope `conflicting_pagination` no endpoint.
- [ ] Confirmar por HTTP o envelope offset sem parâmetros.
- [ ] Confirmar por HTTP que `pageSize=500` é reduzido a 100.
- [ ] Confirmar por HTTP que a ausência de `x-api-key` permanece `401`.
- [ ] Atualizar `docs/api.md` com os parâmetros e a ativação de cada modo.
- [ ] Atualizar `docs/api.md` com exemplos de respostas.
- [ ] Atualizar `docs/api.md` com os três códigos de erro.
- [ ] Atualizar `docs/api.md` com a depreciação explícita de `page` e `pageSize`.
- [ ] Mudar o status da ADR-001 para `Accepted`.
- [ ] Acrescentar o teste textual da documentação requerido por IT-05.

## Verification
```bash
npm run test -- --runInBand test/orders.e2e-spec.ts
npm run test
npm run build
```

- [ ] `IT-01` → AC-01 / SC-01 e AC-02 / SC-02: percorre três pedidos com `limit=2`, ordem, envelope e cursor final.
- [ ] `IT-02` → AC-04 / SC-05 e AC-05 / SC-06: verifica filtros e cursor enviado com filtro diferente.
- [ ] `IT-03` → AC-08 / SC-10, AC-09 / SC-11 e AC-10 / SC-12: verifica os três códigos de erro públicos.
- [ ] `IT-04` → AC-11 / SC-13, SC-14: modo offset e autenticação permanecem compatíveis.
- [ ] `IT-05` → AC-12 / SC-15: documentação declara cursor, erros e depreciação offset.
