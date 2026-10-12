# PRD — CRUD de produtos

## Visão Geral
A API de pedidos não tem catálogo de produtos. Hoje `sku` e `unitPrice` são campos livres em cada item do pedido (`src/orders/order.entity.ts:3-7`, `src/orders/dto/create-order.dto.ts:4-8`) e `POST /orders` aceita qualquer valor. Não há onde cadastrar, consultar ou manter os produtos vendidos. Esta mudança adiciona o recurso `products` em `/api/v1/products`, com criar, listar, consultar, editar e desativar, seguindo as convenções dos módulos existentes: acesso com `x-api-key` (`src/common/guards/api-key.guard.ts`), ids UUID, erros com `code` e listagem paginada por `page`/`pageSize` como em `GET /orders` (`src/orders/orders.service.ts:25-34`). O catálogo é independente: os pedidos não passam a consultá-lo.

## Objetivos
- Operadores da API conseguem manter um catálogo de produtos (criar, listar, consultar, editar e desativar) pela API.
- O `sku` identifica o produto de forma única no catálogo, sem duplicatas.
- Remover um produto o desativa em vez de apagá-lo, preservando o histórico e impedindo a reutilização do `sku`.
- Os pedidos continuam funcionando exatamente como hoje.

## Histórias de Usuário
### US-01: Cadastrar um produto
Como operador da API, quero cadastrar um produto com `sku`, nome, preço e descrição, para ter um catálogo oficial dos itens vendidos.

### US-02: Consultar produtos
Como integrador, quero listar os produtos de forma paginada e consultar um produto pelo id, para exibir e sincronizar o catálogo sem baixar tudo de uma vez.

### US-03: Editar um produto
Como operador da API, quero alterar nome, descrição, preço e situação de um produto, para manter o catálogo atualizado sem recriá-lo.

### US-04: Desativar um produto
Como operador da API, quero remover um produto do catálogo ativo sem perder o registro, para que ele deixe de aparecer nas listagens mas continue consultável e seu `sku` não seja reaproveitado.

### US-05: Manter os pedidos inalterados
Como dono de uma integração de pedidos, quero que `POST /orders` continue aceitando `sku` e `unitPrice` livres, para que nada quebre com a entrega do catálogo.

## Requisitos
### Requisito: Criação de produto
O sistema DEVE permitir criar um produto com `sku`, `name`, `price` e, opcionalmente, `description`. O sistema DEVE gerar o `id` (UUID), definir `active=true` e registrar `createdAt` e `updatedAt`, e DEVE responder 201 com o produto criado.

#### Cenário: Produto válido
- **QUANDO** um cliente autenticado envia `POST /products` com `sku`, `name` e `price` válidos
- **ENTÃO** recebe 201 com o produto, incluindo `id`, `active=true`, `createdAt` e `updatedAt`

#### Cenário: Descrição opcional
- **QUANDO** um cliente cria um produto sem `description`
- **ENTÃO** o produto é criado e `description` vem ausente ou nula na resposta

### Requisito: Unicidade do sku
O sistema DEVE rejeitar a criação de um produto cujo `sku` já exista no catálogo, inclusive de um produto inativo.

#### Cenário: sku duplicado
- **QUANDO** um cliente cria um produto com um `sku` já usado por outro produto
- **ENTÃO** recebe 409 com `code=sku_conflict` e nenhum produto é criado

#### Cenário: sku de produto desativado
- **QUANDO** um cliente cria um produto com o `sku` de um produto desativado
- **ENTÃO** recebe 409 com `code=sku_conflict`

### Requisito: Validação dos campos
O sistema DEVE validar os campos do produto e responder 400 quando forem inválidos, sem criar nem alterar nada. O `sku` DEVE ser texto não vazio de até 64 caracteres, sem espaços nas pontas. O `name` DEVE ser texto não vazio de até 120 caracteres. O `price` DEVE ser um número maior ou igual a 0 com no máximo 2 casas decimais. O `description` DEVE ter no máximo 1000 caracteres.

#### Cenário: Preço negativo
- **QUANDO** um cliente envia `price=-1`
- **ENTÃO** recebe 400 e o produto não é criado

#### Cenário: Campo obrigatório ausente
- **QUANDO** um cliente envia `POST /products` sem `name`
- **ENTÃO** recebe 400

#### Cenário: Casas decimais demais
- **QUANDO** um cliente envia `price=10.999`
- **ENTÃO** recebe 400

### Requisito: Consulta por id
O sistema DEVE retornar um produto pelo seu `id`, esteja ele ativo ou inativo, e DEVE responder 404 quando o produto não existir.

#### Cenário: Produto existente
- **QUANDO** um cliente consulta `GET /products/:id` de um produto existente
- **ENTÃO** recebe 200 com o produto

#### Cenário: Produto desativado
- **QUANDO** um cliente consulta o id de um produto desativado
- **ENTÃO** recebe 200 com o produto e `active=false`

#### Cenário: Produto inexistente
- **QUANDO** um cliente consulta um UUID que não existe
- **ENTÃO** recebe 404

#### Cenário: Id malformado
- **QUANDO** um cliente consulta `GET /products/abc`
- **ENTÃO** recebe 400

### Requisito: Listagem paginada
O sistema DEVE listar produtos em `GET /products` no formato `{ data, page, pageSize, total }`, ordenados por `createdAt` crescente. O padrão DEVE ser `page=1` e `pageSize=20`, e `pageSize` DEVE ser limitado a 100. Por padrão a listagem DEVE conter apenas produtos ativos, e `includeInactive=true` DEVE incluir também os inativos.

#### Cenário: Primeira página
- **QUANDO** existem 3 produtos ativos e um cliente pede `pageSize=2`
- **ENTÃO** recebe os 2 mais antigos, `page=1`, `pageSize=2` e `total=3`

#### Cenário: Segunda página
- **QUANDO** o cliente pede `page=2&pageSize=2`
- **ENTÃO** recebe o terceiro produto e `total=3`

#### Cenário: Inativos ocultos por padrão
- **QUANDO** existe um produto desativado e o cliente lista sem parâmetros
- **ENTÃO** o produto desativado não aparece e não conta em `total`

#### Cenário: Incluir inativos
- **QUANDO** o cliente lista com `includeInactive=true`
- **ENTÃO** os produtos desativados aparecem junto com os ativos

#### Cenário: pageSize acima do máximo
- **QUANDO** o cliente pede `pageSize=500`
- **ENTÃO** recebe no máximo 100 produtos e `pageSize=100`

### Requisito: Edição parcial
O sistema DEVE permitir alterar `name`, `description`, `price` e `active` por `PATCH /products/:id`, enviando apenas os campos a mudar, e DEVE atualizar `updatedAt`. O `sku` e o `id` NÃO DEVEM ser alteráveis. Os campos enviados DEVEM seguir as mesmas validações da criação.

#### Cenário: Alterar preço
- **QUANDO** um cliente envia `PATCH /products/:id` com `price=19.9`
- **ENTÃO** recebe 200 com o produto atualizado, os demais campos intactos e `updatedAt` renovado

#### Cenário: Reativar produto
- **QUANDO** um cliente envia `PATCH` com `active=true` para um produto desativado
- **ENTÃO** o produto volta a ser ativo e reaparece na listagem padrão

#### Cenário: Tentativa de alterar o sku
- **QUANDO** um cliente envia `sku` no corpo do `PATCH`
- **ENTÃO** recebe 400 e o produto não é alterado

#### Cenário: Produto inexistente
- **QUANDO** um cliente envia `PATCH` para um UUID que não existe
- **ENTÃO** recebe 404

### Requisito: Desativação
O sistema DEVE tratar `DELETE /products/:id` como desativação: responder 204, marcar `active=false` e manter o registro e o `sku` reservado. O sistema DEVE responder 404 quando o produto não existir.

#### Cenário: Desativar produto ativo
- **QUANDO** um cliente envia `DELETE /products/:id` de um produto ativo
- **ENTÃO** recebe 204 e o produto passa a ter `active=false`, ficando consultável por id

#### Cenário: Desativar produto já inativo
- **QUANDO** um cliente envia `DELETE` de um produto que já está inativo
- **ENTÃO** recebe 204 e nada muda

#### Cenário: Produto inexistente
- **QUANDO** um cliente envia `DELETE` de um UUID que não existe
- **ENTÃO** recebe 404

### Requisito: Autenticação
O sistema DEVE exigir o header `x-api-key` válido em todas as rotas de produtos, como nos demais recursos, e DEVE responder 401 caso contrário.

#### Cenário: Sem chave
- **QUANDO** um cliente chama qualquer rota de `/products` sem `x-api-key` válido
- **ENTÃO** recebe 401 e nenhum dado é lido nem alterado

### Requisito: Pedidos não são afetados
O sistema DEVE manter `POST /orders` e os demais endpoints de pedidos com o mesmo comportamento de hoje. Os pedidos NÃO DEVEM validar `sku` nem `unitPrice` contra o catálogo.

#### Cenário: Pedido com sku fora do catálogo
- **QUANDO** um cliente cria um pedido com um `sku` que não existe em `/products`
- **ENTÃO** o pedido é criado normalmente, com o `unitPrice` enviado

## Critérios de Aceite
- [ ] AC-01: Given um corpo válido, when o cliente envia `POST /products`, then recebe 201 com `id`, `active=true`, `createdAt` e `updatedAt` (US-01)
- [ ] AC-02: Given um produto com `sku` "A-1", when o cliente cria outro com `sku` "A-1", then recebe 409 `sku_conflict` e nada é criado (US-01)
- [ ] AC-03: Given um produto desativado com `sku` "A-1", when o cliente cria outro com `sku` "A-1", then recebe 409 `sku_conflict` (US-04)
- [ ] AC-04: Given `price` negativo, com mais de 2 casas decimais, ou `name`/`sku` ausentes ou vazios, when o cliente cria um produto, then recebe 400 e nada é criado (US-01)
- [ ] AC-05: Given um produto existente, when o cliente consulta `GET /products/:id`, then recebe 200 com o produto, inclusive se estiver inativo (US-02)
- [ ] AC-06: Given um UUID inexistente, when o cliente consulta, edita ou remove o produto, then recebe 404 (US-02, US-03, US-04)
- [ ] AC-07: Given 3 produtos ativos, when o cliente lista com `pageSize=2`, then recebe 2 produtos, `page=1`, `pageSize=2` e `total=3`, em ordem de criação (US-02)
- [ ] AC-08: Given um produto desativado, when o cliente lista sem parâmetros, then ele não aparece nem entra em `total`, e com `includeInactive=true` ele aparece (US-02, US-04)
- [ ] AC-09: Given `pageSize=500`, when o cliente lista, then `pageSize` na resposta é 100 (US-02)
- [ ] AC-10: Given um produto, when o cliente envia `PATCH` com `price`, `name`, `description` ou `active` válidos, then recebe 200 com os campos alterados, os demais intactos e `updatedAt` renovado (US-03)
- [ ] AC-11: Given um corpo de `PATCH` com `sku` ou `id`, when o cliente envia, then recebe 400 e o produto não muda (US-03)
- [ ] AC-12: Given um produto desativado, when o cliente envia `PATCH` com `active=true`, then ele volta à listagem padrão (US-03, US-04)
- [ ] AC-13: Given um produto ativo, when o cliente envia `DELETE`, then recebe 204, `active=false` e o produto continua consultável por id (US-04)
- [ ] AC-14: Given um produto inativo, when o cliente envia `DELETE` de novo, then recebe 204 e nada muda (US-04)
- [ ] AC-15: Given um `x-api-key` ausente ou inválido, when o cliente chama qualquer rota de `/products`, then recebe 401 (US-01, US-02, US-03, US-04)
- [ ] AC-16: Given um `sku` fora do catálogo, when o cliente cria um pedido, then o pedido é criado com o `unitPrice` enviado, como hoje (US-05)
- [ ] AC-17: Given um id que não é UUID, when o cliente chama `GET`, `PATCH` ou `DELETE` em `/products/:id`, then recebe 400 (US-02, US-03, US-04)

## Regras de Negócio
- O `sku` é único no catálogo, comparado de forma exata (diferencia maiúsculas de minúsculas), e imutável depois da criação.
- O `sku` de um produto desativado continua reservado.
- `price` é um número em unidade monetária principal (por exemplo `19.9`), com no máximo 2 casas decimais, mesma representação de `unitPrice` nos pedidos.
- Produtos novos nascem ativos. A desativação não apaga dados.
- A listagem usa a mesma regra de paginação de `GET /orders`: padrão 20, máximo 100 (`orders.defaultPageSize`/`orders.maxPageSize` em `src/config/configuration.ts:15`), `page` e `pageSize` inteiros maiores ou iguais a 1.
- Os dados seguem o mesmo regime dos outros recursos: guardados em memória, começam vazios e são perdidos ao reiniciar a aplicação.

## Casos de Borda
- Catálogo vazio → `{ data: [], page: 1, pageSize: 20, total: 0 }`
- `page` além da última página → `data: []` com `total` correto
- `page=0`, `pageSize=0` ou valor não inteiro → 400
- `price=0` → aceito (produto gratuito)
- `price` como texto, `null` ou `NaN` → 400
- `sku` com espaços nas pontas → 400
- Campos desconhecidos no corpo do `POST` ou `PATCH` → ignorados, exceto `sku` e `id` no `PATCH`, que geram 400
- `PATCH` com corpo vazio → 200, produto inalterado
- `PATCH` com `active` que não é booleano → 400
- Duas criações simultâneas com o mesmo `sku` → exatamente uma tem sucesso (201) e a outra recebe 409
- `PATCH` e `DELETE` simultâneos no mesmo produto → o produto termina consistente, sem estado intermediário
- Muitos produtos (milhares) → a listagem continua limitada a `pageSize` por resposta

## Fora de Escopo
- Validar `sku` ou usar o preço do catálogo em `POST /orders`.
- Vincular itens de pedido existentes a produtos, ou migrar pedidos antigos.
- Estoque, categorias, imagens, variações, moeda e impostos.
- Busca por texto, filtros além de `includeInactive` e ordenação configurável.
- Paginação por cursor na listagem de produtos.
- Remoção definitiva de produtos e liberação de `sku`.
- Alterar o `sku` de um produto existente.
- Persistência em banco de dados ou Redis.
- Perfis de permissão diferentes da `x-api-key` já existente.

## Questões em Aberto
- Produtos devem vir pré-cadastrados (seed) como os clientes? → Assumido que não; o catálogo começa vazio.
- O `sku` deve ignorar maiúsculas e minúsculas na unicidade? → Assumido que não; comparação exata, igual aos `sku` livres dos pedidos.
- Quem pode reativar um produto? → Assumido que qualquer portador da `x-api-key`, via `PATCH` com `active=true`.
- A listagem de produtos deve usar o cache de 30 segundos dos pedidos? → Assumido que não; decisão de implementação para o technical spec.
