---
title: Pedidos inalterados e documentação da API
status: done
type: backend
complexity: low
---

# Pedidos inalterados e documentação da API

## Objetivo
Fica provado que `POST /orders` continua aceitando `sku` e `unitPrice` livres, sem consultar o catálogo, e `docs/api.md` descreve as rotas de produtos.

## Critérios de Aceite
- [x] AC-16: Given um `sku` fora do catálogo, when o cliente cria um pedido, then o pedido é criado com o `unitPrice` enviado, como hoje

## Arquivos
- `test/orders.e2e-spec.ts:7-35` — novo caso e2e de pedido com `sku` fora do catálogo (IT-11)
- `src/orders/dto/create-order.dto.ts:4-8` — referência, sem alteração
- `docs/api.md` — seção das rotas de produtos

## Passos
- [x] Adicionar em `test/orders.e2e-spec.ts` um caso que cria um pedido com `sku` inexistente em `/products` e confere 201 e o `unitPrice` enviado.
- [x] Confirmar com `git diff` que `src/orders/**` e `src/customers/**` não foram alterados.
- [x] Documentar em `docs/api.md` as cinco rotas de produtos, o formato do produto, a paginação, `includeInactive`, o 409 `sku_conflict` e a desativação.

## Verificação
```bash
npm run test:e2e
npm run test
npm run lint
npm run typecheck
npm run build
```
- [x] IT-11: `POST /api/v1/orders` com um `sku` fora do catálogo responde 201 com o `unitPrice` enviado
- [x] A suíte de pedidos existente segue verde
