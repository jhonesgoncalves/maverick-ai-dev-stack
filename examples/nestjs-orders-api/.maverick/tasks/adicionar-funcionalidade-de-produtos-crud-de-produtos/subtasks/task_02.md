---
title: Rotas HTTP e módulo de produtos
status: done
type: backend
complexity: medium
---

# Rotas HTTP e módulo de produtos

## Objetivo
`/api/v1/products` expõe criar, listar, consultar, editar e desativar, protegido por `x-api-key`, com validação, ids UUID e os códigos de status do PRD. `ProductsModule` fica registrado no `AppModule`.

## Critérios de Aceite
- [x] AC-01: Given um corpo válido, when o cliente envia `POST /products`, then recebe 201 com `id`, `active=true`, `createdAt` e `updatedAt`
- [x] AC-02: Given um produto com `sku` "A-1", when o cliente cria outro com "A-1", then recebe 409 `sku_conflict`
- [x] AC-03: Given um produto desativado com `sku` "A-1", when o cliente cria outro com "A-1", then recebe 409 `sku_conflict`
- [x] AC-04: Given `price` negativo ou com mais de 2 casas, ou `name`/`sku` ausentes, vazios ou com espaços nas pontas, when o cliente cria, then recebe 400 e nada é criado
- [x] AC-05: Given um produto existente, when o cliente consulta `GET /products/:id`, then recebe 200, inclusive se estiver inativo
- [x] AC-06: Given um UUID inexistente, when o cliente consulta, edita ou remove, then recebe 404
- [x] AC-07: Given 3 produtos ativos, when o cliente lista com `pageSize=2`, then recebe 2, `page=1`, `pageSize=2` e `total=3`
- [x] AC-08: Given um produto desativado, when o cliente lista, then ele só aparece com `includeInactive=true`
- [x] AC-09: Given `pageSize=500`, when o cliente lista, then `pageSize` na resposta é 100
- [x] AC-10: Given um produto, when o cliente envia `PATCH` com campos válidos, then recebe 200 com os campos alterados e `updatedAt` renovado
- [x] AC-11: Given um `PATCH` com `sku` ou `id`, when o cliente envia, then recebe 400 e o produto não muda
- [x] AC-12: Given um produto desativado, when o cliente envia `PATCH` com `active=true`, then ele volta à listagem padrão
- [x] AC-13: Given um produto ativo, when o cliente envia `DELETE`, then recebe 204 e o produto continua consultável com `active=false`
- [x] AC-14: Given um produto inativo, when o cliente envia `DELETE` de novo, then recebe 204 e nada muda
- [x] AC-15: Given `x-api-key` ausente ou inválido, when o cliente chama qualquer rota de `/products`, then recebe 401
- [x] AC-17: Given um id que não é UUID, when o cliente chama `GET`, `PATCH` ou `DELETE` em `/products/:id`, then recebe 400

## Arquivos
- `src/products/products.controller.ts` (new) — `@Controller('products')`, `@UseGuards(ApiKeyGuard)`, `ParseUUIDPipe`, `@HttpCode(204)` (modelo: `src/orders/orders.controller.ts:10-40`)
- `src/products/products.module.ts` (new) — controller, repository e service (modelo: `src/customers/customers.module.ts:1-10`)
- `src/app.module.ts:15-24` — importar `ProductsModule`
- `src/common/guards/api-key.guard.ts:8-15` — guard reutilizado, sem alteração
- `test/products.e2e-spec.ts` (new) — IT-01 a IT-10 e IT-12 (modelo: `test/orders.e2e-spec.ts:7-18`)

## Passos
- [x] Criar `ProductsController` com `POST`, `GET`, `GET :id`, `PATCH :id` e `DELETE :id` (204), delegando ao `ProductsService`.
- [x] Aplicar `ParseUUIDPipe` nos parâmetros `:id` e `@UseGuards(ApiKeyGuard)` no controller.
- [x] Criar `ProductsModule` e registrá-lo em `AppModule`.
- [x] Criar `test/products.e2e-spec.ts` com o mesmo bootstrap de `test/orders.e2e-spec.ts` (prefixo `api`, versão 1, `ValidationPipe` com `whitelist` e `transform`).
- [x] Escrever os casos de criação e validação (IT-01, IT-02, IT-03), incluindo `price=19.9` e `10.99` válidos e duas criações simultâneas com o mesmo `sku`.
- [x] Escrever os casos de consulta, listagem e edição (IT-04, IT-05, IT-06, IT-07, IT-08).
- [x] Escrever os casos de desativação, autenticação e id malformado (IT-09, IT-10, IT-12).
- [x] Cobrir os casos de borda: catálogo vazio, `page` além da última, `page=0`, `PATCH` vazio sem renovar `updatedAt` e `active` não booleano.

## Verificação
```bash
npm run test:e2e -- products
npm run typecheck
npm run lint
```
- [x] IT-01: `POST /api/v1/products` válido responde 201 com o produto
- [x] IT-02: `POST` com `sku` repetido (ativo e desativado) responde 409 `sku_conflict`, e duas criações simultâneas dão um 201 e um 409
- [x] IT-03: `POST` com `price=-1`, `price=10.999`, `name` ausente, `sku` vazio e `sku=" a"` responde 400 e `GET` não mostra o produto
- [x] IT-04: `GET /:id` responde 200, inclusive para produto inativo
- [x] IT-05: `GET`, `PATCH` e `DELETE` de um UUID inexistente respondem 404
- [x] IT-06: listagem paginada, filtro `includeInactive` e `pageSize=500` limitado a 100
- [x] IT-07: `PATCH` com campos válidos responde 200, e `PATCH` com `active=true` reativa
- [x] IT-08: `PATCH` com `sku` ou `id` (inclusive `null`) responde 400 e o produto não muda
- [x] IT-09: `DELETE` responde 204 duas vezes e o produto continua em `GET /:id` com `active=false`
- [x] IT-10: sem `x-api-key` ou com chave errada, as cinco rotas respondem 401
- [x] IT-12: `GET`, `PATCH` e `DELETE` em `/products/abc` respondem 400
