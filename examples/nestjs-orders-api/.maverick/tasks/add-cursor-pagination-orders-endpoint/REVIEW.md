# Review — add-cursor-pagination-orders-endpoint

## Critérios de Aceite
- [ ] AC-01: Dados 3 pedidos, quando um cliente pede `limit=2`, então recebe os 2 mais antigos e um `nextCursor` não vazio, sem `total` na resposta (US-01)
- [ ] AC-02: Dado um `nextCursor`, quando o cliente pede a página seguinte com ele, então recebe os pedidos posteriores sem repetir nenhum, e na última página `nextCursor` é `null` (US-01)
- [ ] AC-03: Dado apenas `cursor` sem `limit`, quando o cliente lista, então recebe no máximo 20 pedidos (US-01)
- [ ] AC-04: Dados filtros `customerId`/`status`, quando o cliente pagina por cursor, então as páginas contêm exatamente o conjunto filtrado, cada pedido uma vez (US-01)
- [ ] AC-05: Dado um cursor gerado com certos filtros, quando é enviado com filtros diferentes, então o cliente recebe 400 `invalid_cursor` (US-03)
- [ ] AC-06: Dado um pedido criado entre duas páginas, quando o cliente continua paginando, então nenhum pedido é repetido nem pulado e o novo aparece no fim (US-01)
- [ ] AC-07: Dado um pedido removido entre duas páginas, quando o cliente continua paginando, então ele é omitido sem erro (US-01)
- [ ] AC-08: Dado `limit` fora de 1–100 ou não inteiro, quando o cliente lista, então recebe 400 `invalid_limit` (US-03)
- [ ] AC-09: Dado um cursor malformado ou não emitido pelo sistema, quando o cliente lista, então recebe 400 `invalid_cursor` (US-03)
- [ ] AC-10: Dados `page`/`pageSize` junto com `cursor`/`limit`, quando o cliente lista, então recebe 400 `conflicting_pagination` (US-03)
- [ ] AC-11: Dada uma requisição sem `cursor` e sem `limit`, quando o cliente lista, então a resposta é idêntica à atual (`data`, `page`, `pageSize`, `total`, padrões e redução ao máximo) (US-02)
- [ ] AC-12: Dada a documentação `docs/api.md`, quando um integrador a consulta, então encontra o contrato do modo cursor e `page`/`pageSize` marcados como obsoletos (US-02)

## Tarefas
- [ ] 01 Cursor assinado e DTO de consulta (pending)
- [ ] 02 Paginação por cursor no OrdersService (pending)
- [ ] 03 Contrato HTTP e documentação da API (pending)

## Checagens
- [ ] Escopo: o diff fica dentro das Referências de Arquivos do TECHSPEC.md, sem refatorações de passagem.
- [ ] Testes: o comportamento novo está testado e nenhum teste foi enfraquecido para passar.
- [ ] Segurança: entradas são validadas, a autorização é preservada e nenhum segredo ou dado pessoal foi adicionado.
- [ ] Dependências: pacotes novos, atualizados ou removidos estão justificados.
- [ ] Rollback: o plano do TECHSPEC.md continua válido.

## Achados
Leia o REVIEW-FINDINGS.md e registre aqui o que importa.

## Decisão
- [ ] approve (aprovar)
- [ ] approve with follow-up (aprovar com ressalvas)
- [ ] request changes (pedir mudanças)

## Explicação Humana
Com suas palavras, por que esta mudança é segura para o merge.
