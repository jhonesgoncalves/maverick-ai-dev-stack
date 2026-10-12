---
title: "Domínio de produtos: repository, DTOs, config e service"
status: done
type: backend
complexity: medium
---

# Domínio de produtos: repository, DTOs, config e service

## Objetivo
`ProductsService` cria, lista, consulta, edita e desativa produtos sobre um `ProductsRepository` em memória, com `sku` único e imutável, paginação por offset e relógio monotônico. Os DTOs e as chaves de configuração `products.*` ficam prontos para o controller da task 02. Nada é exposto por HTTP ainda.

## Critérios de Aceite
- [x] AC-01: Given um corpo válido, when `create` é chamado, then devolve o produto com `id`, `active=true`, `createdAt` e `updatedAt`
- [x] AC-02: Given um produto com `sku` "A-1", when `create` usa "A-1" de novo, then lança 409 `sku_conflict` e nada é criado
- [x] AC-03: Given um produto desativado com `sku` "A-1", when `create` usa "A-1", then lança 409 `sku_conflict`
- [x] AC-06: Given um id inexistente, when `get`, `update` ou `deactivate` são chamados, then lançam 404
- [x] AC-07: Given 3 produtos ativos, when `list` usa `pageSize=2`, then devolve 2 produtos, `page=1`, `pageSize=2` e `total=3`, em ordem de criação
- [x] AC-08: Given um produto desativado, when `list` roda sem parâmetros, then ele não aparece nem entra em `total`, e com `includeInactive=true` ele aparece
- [x] AC-09: Given `pageSize=500`, when `list` roda, then `pageSize` na resposta é 100
- [x] AC-10: Given um produto, when `update` recebe `price`, `name`, `description` ou `active` válidos, then os campos mudam, os demais ficam intactos e `updatedAt` é renovado
- [x] AC-12: Given um produto desativado, when `update` recebe `active=true`, then ele volta à listagem padrão
- [x] AC-13: Given um produto ativo, when `deactivate` é chamado, then `active=false` e `get` ainda o devolve
- [x] AC-14: Given um produto inativo, when `deactivate` é chamado de novo, then não lança e nada muda

## Arquivos
- `src/products/product.entity.ts` (new) — interface `Product`
- `src/products/products.repository.ts` (new) — `Map` por id, índice por `sku`, relógio monotônico (modelo: `src/orders/orders.repository.ts:9-16` e `src/customers/customers.repository.ts:9-27`)
- `src/products/products.service.ts` (new) — regras e erros (modelo: `src/customers/customers.service.ts:5-24` e `src/orders/orders.service.ts:35-45`)
- `src/products/dto/create-product.dto.ts` (new) — validação da criação
- `src/products/dto/update-product.dto.ts` (new) — validação do `PATCH`, com `sku` e `id` proibidos
- `src/products/dto/list-products.dto.ts` (new) — `page`, `pageSize`, `includeInactive` (modelo: `src/orders/dto/list-orders.dto.ts:6-11`)
- `src/config/configuration.ts:5-15` — tipo e valores `products.defaultPageSize` (20) e `products.maxPageSize` (100)
- `src/products/products.service.spec.ts` (new) — UT-01 a UT-11 (modelo: `src/orders/orders.service.spec.ts:28-44`)

## Passos
- [x] Criar `Product` em `product.entity.ts` com `id`, `sku`, `name`, `description?`, `price`, `active`, `createdAt`, `updatedAt`.
- [x] Adicionar `products: { defaultPageSize; maxPageSize }` ao tipo `AppConfig` e aos valores 20 e 100 em `configuration.ts`.
- [x] Implementar `ProductsRepository` com `insert`, `find`, `findBySku`, `all` (ordenado por `createdAt`) e `update`, usando `Math.max(Date.now(), last + 1)` para `createdAt` e `updatedAt`.
- [x] Criar `CreateProductDto` com as validações de `sku`, `name`, `description` e `price` (`maxDecimalPlaces: 2`, `@Min(0)`).
- [x] Criar `UpdateProductDto` com campos opcionais e `@Equals(undefined)` em `sku` e `id`.
- [x] Criar `ListProductsDto` com `page`, `pageSize` e `includeInactive` (`@Transform` de `'true'`/`'false'` para booleano e `@IsBoolean()`).
- [x] Implementar `create` no service: checar `findBySku` e inserir no mesmo tick síncrono, lançando `ConflictException({ code: 'sku_conflict', message })`.
- [x] Implementar `get` e `update` no service, lançando `NotFoundException` com `product <id> not found`; `update` com corpo sem campos não altera nada nem renova `updatedAt`.
- [x] Implementar `list` no service: filtrar inativos salvo `includeInactive`, aplicar `pageSize = min(pageSize ?? default, max)` e devolver `{ data, page, pageSize, total }`.
- [x] Implementar `deactivate` no service como `update(id, { active: false })`, idempotente e com 404 para id inexistente.
- [x] Escrever `products.service.spec.ts` com os casos de Verificação, montando o service com `Test.createTestingModule` e `ConfigModule.forRoot({ load: [configuration] })`.

## Verificação
```bash
npm run test -- products.service
npm run typecheck
npm run lint
```
- [x] UT-01: `create` devolve `id` UUID, `active=true`, `createdAt` e `updatedAt`
- [x] UT-02: `create` com `sku` repetido lança `ConflictException` com `code=sku_conflict` e o total não muda
- [x] UT-03: `create` com `sku` de produto desativado lança `sku_conflict`
- [x] UT-04: `get`, `update` e `deactivate` de id inexistente lançam `NotFoundException`
- [x] UT-05: `list` com 3 produtos e `pageSize=2` devolve 2, `page=1`, `pageSize=2`, `total=3`, em ordem de criação
- [x] UT-06: `list` omite inativos e não os conta em `total`; com `includeInactive=true` os inclui
- [x] UT-07: `list` com `pageSize=500` devolve `pageSize=100`
- [x] UT-08: `update` altera `price`, `name`, `description` e `active`, mantém os demais campos e `updatedAt` fica maior que o anterior
- [x] UT-09: `update` com `active=true` reativa e o produto volta à listagem padrão
- [x] UT-10: `deactivate` marca `active=false` e `get` ainda devolve o produto
- [x] UT-11: `deactivate` repetido não lança e não muda o produto
