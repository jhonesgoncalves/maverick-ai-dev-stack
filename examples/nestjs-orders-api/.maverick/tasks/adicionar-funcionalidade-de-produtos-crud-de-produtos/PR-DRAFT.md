# feat(products): add products CRUD

## Resumo
A API de pedidos não tinha catálogo: `sku` e `unitPrice` eram campos livres em cada item do pedido. Esta mudança adiciona o recurso `/api/v1/products` com criar, listar, consultar, editar e desativar, no mesmo desenho dos módulos `customers` e `orders` (repository em memória, `ApiKeyGuard`, ids UUID, erros com `code`, paginação por `page`/`pageSize`).

- `sku` é único e imutável; um `sku` repetido, mesmo de produto desativado, responde 409 `sku_conflict`.
- `DELETE` desativa (204, idempotente) e mantém o registro e o `sku` reservado; `PATCH` com `active=true` reativa.
- `GET /products` lista só os ativos por padrão (`includeInactive=true` inclui os demais), com padrão 20 e máximo 100.
- `PATCH` com `sku` ou `id` responde 400, em vez de ignorar o campo em silêncio.
- O catálogo é independente: `POST /orders` continua aceitando qualquer `sku` e `unitPrice`. Nenhum arquivo de `src/orders/` ou `src/customers/` mudou.

## Critérios de aceite
| Critério | Testes que o provam |
|---|---|
| AC-01 criar produto (201) | unit `creates an active product with id and timestamps`; `IT-01` |
| AC-02 `sku` duplicado (409) | unit `rejects a duplicated sku and creates nothing`; `IT-02` |
| AC-03 `sku` de produto desativado (409) | unit `keeps the sku of a deactivated product reserved`; `IT-02` |
| AC-04 validação do corpo (400) | `IT-03` |
| AC-05 consulta por id, inclusive inativo | `IT-04` |
| AC-06 404 para id inexistente | unit `throws NotFoundException for unknown ids`; `IT-05` |
| AC-07 listagem paginada | unit `paginates in creation order`; `IT-06` |
| AC-08 inativos ocultos por padrão | unit `hides inactive products unless includeInactive is set`; `IT-06` |
| AC-09 `pageSize` limitado a 100 | unit `caps pageSize at the maximum`; `IT-06` |
| AC-10 `PATCH` parcial | unit `updates fields, keeps the rest and renews updatedAt`; `IT-07` |
| AC-11 `sku`/`id` no `PATCH` (400) | `IT-08` |
| AC-12 reativação | unit `reactivates a product so it returns to the default listing`; `IT-07` |
| AC-13 desativação | unit `deactivates but keeps the product readable`; `IT-09` |
| AC-14 desativação idempotente | unit `deactivates idempotently`; `IT-09` |
| AC-15 `x-api-key` obrigatória (401) | `IT-10` |
| AC-16 pedidos inalterados | `creates an order with a sku that is not in the catalog` em `test/orders.e2e-spec.ts` |
| AC-17 id malformado (400) | `IT-12` |

## Verificação
Em `EVIDENCE.md` (todos com exit code 0): `npm run lint`, `npm run typecheck`, `npm run test` (3 suítes, 33 testes) e `npm run build`.

`npm run test:e2e` não faz parte do `EVIDENCE.md`. Rodei à parte ao preparar este PR: 2 suítes, 18 testes, todos passando (`orders` e `products`).

## Riscos e rollback
- `@Equals(undefined)` em `sku`/`id` não rejeitar o campo com o `whitelist` ativo → coberto por `IT-08`, inclusive com `null`.
- `maxDecimalPlaces: 2` rejeitar valores como `19.9` por ponto flutuante → `IT-01` cria `19.9` e `10.99` e espera 201.
- Estado em memória perdido no restart → igual aos outros recursos e declarado no PRD.
- Rollback: reverter o commit. Não há migração, dependência nova nem alteração de contrato existente; remover `ProductsModule` do `AppModule` desliga a funcionalidade.

## Notas para o revisor
- **Orçamento de escopo:** o `SCOPE-GUARD.md` avisa `14/8` arquivos alterados. Todos estão nas Referências de Arquivos do TECHSPEC.md (10 novos em `src/products/` e `test/`, mais `app.module.ts`, `configuration.ts`, `docs/api.md` e `test/orders.e2e-spec.ts`).
- **REVIEW.md incompleto:** a decisão `approve` está marcada, mas os critérios de aceite, as Checagens e a "Explicação Humana" continuam vazios. Os itens humanos de `SECURITY-REPORT.md` (autorização, segredos) e `DEPENDENCY-REVIEW.md` também estão sem marcar. Os dois últimos dizem pouco aqui: não há dependência nova nem lockfile alterado, e o guard é o mesmo dos outros recursos.
- **Fora desta mudança:** `.maverick/config.json` tem uma alteração não relacionada (`flows.autoApprove: ["ship"]`). Não deve entrar neste commit.
- **Ver primeiro:** `src/products/dto/update-product.dto.ts` (regra de `sku`/`id` proibidos) e `src/products/products.service.ts` (checagem de `sku` e inserção no mesmo tick síncrono).
