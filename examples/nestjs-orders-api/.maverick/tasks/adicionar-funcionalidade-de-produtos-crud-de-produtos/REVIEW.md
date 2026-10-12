# Review — adicionar-funcionalidade-de-produtos-crud-de-produtos

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

## Tarefas
- [ ] 01 Domínio de produtos: repository, DTOs, config e service (done)
- [ ] 02 Rotas HTTP e módulo de produtos (done)
- [ ] 03 Pedidos inalterados e documentação da API (done)

## Checagens
- [ ] Escopo: o diff fica dentro das Referências de Arquivos do TECHSPEC.md, sem refatorações de passagem.
- [ ] Testes: o comportamento novo está testado e nenhum teste foi enfraquecido para passar.
- [ ] Segurança: entradas são validadas, a autorização é preservada e nenhum segredo ou dado pessoal foi adicionado.
- [ ] Dependências: pacotes novos, atualizados ou removidos estão justificados.
- [ ] Rollback: o plano do TECHSPEC.md continua válido.

## Achados
Leia o REVIEW-FINDINGS.md e registre aqui o que importa.

## Decisão
- [x] approve (aprovar)
- [ ] approve with follow-up (aprovar com ressalvas)
- [ ] request changes (pedir mudanças)

## Explicação Humana
Com suas palavras, por que esta mudança é segura para o merge.
