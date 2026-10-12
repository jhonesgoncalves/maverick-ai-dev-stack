# Technical Spec — CRUD de produtos

## Resumo
Criar o módulo `ProductsModule` em `src/products/`, com controller, service e repository em memória, espelhando o módulo `customers` e a listagem por offset de `orders`. Expõe `POST/GET/GET :id/PATCH :id/DELETE :id` em `/api/v1/products`, protegido por `ApiKeyGuard`. O módulo é independente: `OrdersModule` não o importa e nenhum código de pedidos muda.

## Estado Atual
- `src/orders/order.entity.ts:1-7` — `sku` e `unitPrice` são campos livres de `OrderItem`; não existe entidade de produto.
- `src/orders/dto/create-order.dto.ts:4-8` — `POST /orders` valida só tipo de `sku` (`@IsString`) e `unitPrice` (`@IsNumber @Min(0)`).
- `src/customers/customers.module.ts:1-10` e `src/customers/customers.repository.ts:9-12` — padrão módulo + repository com `Map` em memória + service que lança `NotFoundException`.
- `src/orders/orders.repository.ts:9-16` — `createdAt` estritamente crescente (`Math.max(Date.now(), last + 1)`), usado como chave de ordenação estável.
- `src/orders/orders.service.ts:35-45` — paginação por offset: `pageSize = min(pageSize ?? default, max)`, resposta `{ data, page, pageSize, total }`, lendo `orders.defaultPageSize`/`orders.maxPageSize` do `ConfigService`.
- `src/orders/dto/list-orders.dto.ts:6-11` — DTO de listagem com `@Type(() => Number) @IsInt @Min(1)`.
- `src/orders/orders.controller.ts:10-40` — rotas com `ParseUUIDPipe` (400 para id malformado) e `@HttpCode(204)` no `DELETE`.
- `src/orders/orders.service.ts:53-56` — erros 400 com `code` via `BadRequestException({ code, message })`.
- `src/main.ts:9` e `test/orders.e2e-spec.ts:11-14` — `ValidationPipe({ whitelist: true, transform: true })`, prefixo `api` e versão `1`; o e2e monta o `AppModule` com as mesmas opções.
- `src/app.module.ts:15-24` — registra os módulos de domínio.
- `src/config/configuration.ts:5,15` — tipo e valores de configuração de paginação de pedidos.

## Abordagem
Módulo novo e autocontido, no mesmo desenho dos vizinhos.
- **Armazenamento:** `ProductsRepository` com `Map<id, Product>` e índice `Map<sku, id>`. A checagem de `sku` e a inserção rodam no mesmo tick síncrono, então duas criações simultâneas com o mesmo `sku` nunca passam as duas (caso de borda do PRD).
- **Relógio monotônico:** `createdAt` e `updatedAt` vêm de um helper do repository (`Math.max(Date.now(), last + 1)`), como em `orders.repository.ts`. Garante ordem estável da listagem e `updatedAt` sempre maior que o anterior.
- **Validação:** DTOs com `class-validator`, como o resto do projeto. `price` usa `@IsNumber({ maxDecimalPlaces: 2 }) @Min(0)`. `sku` usa `@Matches(/^\S(.*\S)?$/)` (sem espaços nas pontas, não vazio) e `@MaxLength(64)`.
- **Proibir `sku`/`id` no `PATCH`:** o `whitelist` do `ValidationPipe` descartaria esses campos em silêncio, e o PRD exige 400. `UpdateProductDto` declara `sku` e `id` com `@Equals(undefined)`: ausentes passam; qualquer valor enviado, inclusive `null`, gera 400. Como a propriedade é decorada, o `whitelist` a mantém.
- **`includeInactive`:** vem como string na query; um `@Transform` converte `'true'`/`'false'` para booleano e `@IsBoolean()` rejeita o resto com 400.
- **Paginação:** mesma regra de `orders` (`pageSize` limitado ao máximo, `page` padrão 1). Novas chaves `products.defaultPageSize` e `products.maxPageSize` em `configuration.ts`, em vez de ler as chaves de `orders`, para não acoplar os dois recursos.
- **Erros:** `ConflictException({ code: 'sku_conflict', message })` para 409; `NotFoundException` com a mensagem `product <id> not found` para 404, como `customers`.
- **Desativação:** `DELETE` chama `update(id, { active: false })`; é idempotente e responde 204 mesmo se já estiver inativo.
- **`PATCH` vazio:** não altera nada e não renova `updatedAt`; com ao menos um campo, renova.

Alternativas rejeitadas:
- Cache de 30 s na listagem como em `orders`: a leitura é um `Map` em memória, e o cache exigiria invalidação em toda escrita sem ganho.
- Ler `orders.maxPageSize` na listagem de produtos: acopla recursos independentes.
- Ignorar `sku` no `PATCH` via `whitelist`: contradiz AC-11.
- Guardar `price` em centavos inteiros: o projeto usa decimais (`unitPrice`, `roundToCents`), e uma representação diferente confundiria a futura integração com pedidos.
- Seed de produtos: o PRD define catálogo vazio.

## Referências de Arquivos
- `src/customers/customers.module.ts:1-10` — modelo do módulo
- `src/customers/customers.repository.ts:9-27` — modelo do repository em memória
- `src/customers/customers.service.ts:5-24` — modelo do service e do 404
- `src/orders/orders.repository.ts:9-16` — relógio monotônico de `createdAt`
- `src/orders/orders.service.ts:35-45` — regra de paginação por offset a replicar
- `src/orders/orders.controller.ts:10-40` — `ParseUUIDPipe`, `@HttpCode(204)`, `@UseGuards(ApiKeyGuard)`
- `src/orders/dto/list-orders.dto.ts:6-11` — padrão de DTO de listagem
- `src/common/guards/api-key.guard.ts:8-15` — guard reutilizado
- `src/app.module.ts:15-24` — registrar `ProductsModule`
- `src/config/configuration.ts:5-15` — chaves de paginação de produtos
- `test/orders.e2e-spec.ts:7-18` — bootstrap do e2e a replicar
- `src/orders/orders.service.spec.ts:28-44` — padrão de teste de service com `Test.createTestingModule`
- `docs/api.md` — documentar as rotas novas
- `src/products/product.entity.ts` (new) — tipo `Product`
- `src/products/products.repository.ts` (new) — armazenamento em memória
- `src/products/products.service.ts` (new) — regras de negócio
- `src/products/products.controller.ts` (new) — rotas HTTP
- `src/products/products.module.ts` (new) — módulo
- `src/products/dto/create-product.dto.ts` (new) — validação da criação
- `src/products/dto/update-product.dto.ts` (new) — validação do `PATCH`
- `src/products/dto/list-products.dto.ts` (new) — validação da listagem
- `src/products/products.service.spec.ts` (new) — testes unitários
- `test/products.e2e-spec.ts` (new) — testes HTTP

## Interfaces e Dados
```ts
// src/products/product.entity.ts
export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```
```ts
// src/products/dto/create-product.dto.ts
export class CreateProductDto {
  @IsString() @MaxLength(64) @Matches(/^\S(.*\S)?$/) sku: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
}

// src/products/dto/update-product.dto.ts
export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @Equals(undefined, { message: 'sku cannot be changed' }) sku?: never;
  @Equals(undefined, { message: 'id cannot be changed' }) id?: never;
}

// src/products/dto/list-products.dto.ts
export class ListProductsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value)) @IsBoolean() includeInactive?: boolean;
}
```
```ts
// src/products/products.repository.ts
insert(input: { sku: string; name: string; description?: string; price: number }): Product;
find(id: string): Product | undefined;
findBySku(sku: string): Product | undefined;
all(): Product[]; // sorted by createdAt ascending
update(id: string, patch: Partial<Pick<Product, 'name' | 'description' | 'price' | 'active'>>): Product | undefined;

// src/products/products.service.ts
type ProductsPage = { data: Product[]; page: number; pageSize: number; total: number };
create(input: CreateProductDto): Product;           // 409 sku_conflict
list(query: ListProductsDto): ProductsPage;
get(id: string): Product;                           // 404
update(id: string, patch: UpdateProductDto): Product; // 404
deactivate(id: string): void;                       // 404, idempotent
```
```ts
// src/config/configuration.ts
products: { defaultPageSize: number; maxPageSize: number }  // 20 and 100
```
Rotas (todas com `@UseGuards(ApiKeyGuard)`, `@Controller('products')`):

| Método | Rota | Sucesso | Erros |
|---|---|---|---|
| POST | `/api/v1/products` | 201 `Product` | 400, 401, 409 `sku_conflict` |
| GET | `/api/v1/products?page&pageSize&includeInactive` | 200 `{ data, page, pageSize, total }` | 400, 401 |
| GET | `/api/v1/products/:id` | 200 `Product` | 400, 401, 404 |
| PATCH | `/api/v1/products/:id` | 200 `Product` | 400, 401, 404 |
| DELETE | `/api/v1/products/:id` | 204 | 400, 401, 404 |

Dados: em memória, começam vazios, perdidos no restart. Não há migração.

## Impacto
| Arquivo | Mudança | Dependentes | Risco |
|---|---|---|---|
| `src/app.module.ts` | importa `ProductsModule` | 1 (`src/main.ts`) e `test/orders.e2e-spec.ts` | baixo: só adiciona um módulo |
| `src/config/configuration.ts` | tipo e valores `products.*` | `src/app.module.ts`, `src/orders/orders.service.spec.ts`, `test/orders.e2e-spec.ts` | baixo: chaves novas, `orders.*` intacto |
| `docs/api.md` | documenta as rotas | nenhum | baixo |
| `src/products/**` (new) | módulo novo | só `src/app.module.ts` | baixo: nenhum código existente o usa |

`src/orders/**` e `src/customers/**` não mudam, o que sustenta AC-16.

## Plano de Testes
Unitários em `src/products/products.service.spec.ts` (`jest`, `rootDir: src`); HTTP em `test/products.e2e-spec.ts` (`npm run test:e2e`).
- `UT-01` → AC-01: `create` devolve `id` UUID, `active=true`, `createdAt` e `updatedAt`
- `UT-02` → AC-02: `create` com `sku` repetido lança `ConflictException` com `code=sku_conflict` e o total não muda
- `UT-03` → AC-03: `create` com `sku` de produto desativado lança `sku_conflict`
- `UT-04` → AC-06: `get`, `update` e `deactivate` de id inexistente lançam `NotFoundException`
- `UT-05` → AC-07: `list` com 3 produtos e `pageSize=2` devolve 2, `page=1`, `pageSize=2`, `total=3`, em ordem de criação
- `UT-06` → AC-08: `list` omite inativos e não os conta em `total`; com `includeInactive=true` os inclui
- `UT-07` → AC-09: `list` com `pageSize=500` devolve `pageSize=100`
- `UT-08` → AC-10: `update` altera `price`, `name`, `description` e `active`, mantém os demais campos e `updatedAt` fica maior que o anterior
- `UT-09` → AC-12: `update` com `active=true` reativa e o produto volta à listagem padrão
- `UT-10` → AC-13: `deactivate` marca `active=false` e `get` ainda devolve o produto
- `UT-11` → AC-14: `deactivate` repetido não lança e não muda o produto
- `IT-01` → AC-01: `POST /api/v1/products` válido responde 201 com o produto
- `IT-02` → AC-02, AC-03: `POST` com `sku` repetido (ativo e desativado) responde 409 `sku_conflict`
- `IT-03` → AC-04: `POST` com `price=-1`, `price=10.999`, `name` ausente, `sku` vazio e `sku=" a"` responde 400 e `GET` não mostra o produto
- `IT-04` → AC-05: `GET /:id` responde 200, inclusive para produto inativo
- `IT-05` → AC-06: `GET`, `PATCH` e `DELETE` de um UUID inexistente respondem 404
- `IT-06` → AC-07, AC-08, AC-09: listagem paginada, filtro `includeInactive` e `pageSize=500` limitado a 100
- `IT-07` → AC-10, AC-12: `PATCH` com campos válidos responde 200; `PATCH` com `active=true` reativa
- `IT-08` → AC-11: `PATCH` com `sku` ou `id` (inclusive `null`) responde 400 e o produto não muda
- `IT-09` → AC-13, AC-14: `DELETE` responde 204 duas vezes e o produto continua em `GET /:id` com `active=false`
- `IT-10` → AC-15: sem `x-api-key` ou com chave errada, as cinco rotas respondem 401
- `IT-11` → AC-16: `POST /api/v1/orders` com um `sku` fora do catálogo responde 201 com o `unitPrice` enviado
- `IT-12` → AC-17: `GET`, `PATCH` e `DELETE` em `/products/abc` respondem 400
- Casos de borda do PRD cobertos em `IT-06` e `IT-07`: catálogo vazio, `page` além da última, `page=0`, `PATCH` vazio sem renovar `updatedAt`, `active` não booleano. Criações simultâneas com o mesmo `sku` (`Promise.all` de dois `POST`) em `IT-02`.

## Ordem de Construção
1. Entidade, repository, DTOs, chaves de configuração e service, com testes unitários (AC-01 a AC-14)
2. Controller, `ProductsModule`, registro no `AppModule` e testes e2e das rotas (AC-01 a AC-15, AC-17)
3. Teste e2e de que pedidos seguem inalterados e documentação em `docs/api.md` (AC-16)

## Riscos e Rollback
- [Risk] `@Equals(undefined)` em `sku`/`id` não rejeitar o campo com o `whitelist` ativo → `IT-08` cobre `sku`, `id` e `null` no `PATCH`.
- [Risk] `maxDecimalPlaces: 2` rejeitar valores como `19.9` por erro de ponto flutuante → `IT-01` cria produtos com `price=19.9` e `price=10.99` e espera 201.
- [Risk] Conflito de nomes de rota com `GET :id` → só há `GET` na raiz e `GET :id`; não há rota literal como `export`.
- [Risk] Estado em memória perdido no restart → comportamento declarado no PRD, igual aos outros recursos.
- Rollback: reverter o commit. Não há migração, dependência nova nem alteração de contrato existente; remover `ProductsModule` do `AppModule` desliga a funcionalidade.

## Comandos
```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## Não Alterar
- `package-lock.json`: nenhuma dependência nova
- `dist/`: gerado pelo build
- `src/orders/order.entity.ts`: sem mudança de schema de pedidos
- `src/orders/dto/create-order.dto.ts`: `POST /orders` continua aceitando `sku` e `unitPrice` livres (AC-16)
- `src/customers/customers.repository.ts`: fora do escopo
