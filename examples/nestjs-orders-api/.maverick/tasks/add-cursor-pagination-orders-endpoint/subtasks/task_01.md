---
title: Cursor assinado e DTO de consulta
status: pending
type: backend
complexity: medium
---

# Cursor assinado e DTO de consulta

## Goal
Disponibilizar o codec de cursor opaco e assinado e os campos de consulta necessários, sem alterar a resposta do modo offset.

## Acceptance Criteria
- [ ] AC-03: Cursor válido sem `limit` permite que o serviço use o limite padrão de 20
- [ ] AC-05: Cursor vinculado a filtros diferentes é identificado como inválido
- [ ] AC-08: Entradas de `limit` inválidas podem ser classificadas como `invalid_limit`
- [ ] AC-09: Cursor vazio, malformado, adulterado ou assinado em outro ambiente é identificado como inválido
- [ ] AC-10: A presença dos parâmetros de ambos os modos pode ser detectada

## Files
- `src/orders/order-cursor.ts` (new) — codec base64url/HMAC e tipo `CursorPayload`
- `src/orders/order-cursor.spec.ts` (new) — testes do codec para round-trip, adulteração e segredo diferente
- `src/orders/dto/list-orders.dto.ts:1-10` — adiciona `cursor` e preserva `limit` bruto para validação explícita posterior
- `src/orders/order.entity.ts:1-15` — tipo `OrderStatus` usado pelo payload; somente referência, não alterar
- `src/config/configuration.ts:1-15` — origem de `apiKey` e limites; somente referência, não alterar

## Passos

- [ ] Definir `CursorPayload` com `createdAt`, `customerId` normalizado para `string | null` e `status` normalizado para `OrderStatus | null`.
- [ ] Implementar codificação canônica em base64url com HMAC-SHA-256 usando `node:crypto`.
- [ ] Implementar decodificação que retorna `null` para estrutura inválida.
- [ ] Implementar decodificação que retorna `null` para assinatura inválida, com comparação em tempo constante.
- [ ] Implementar decodificação que retorna `null` para payload inválido.
- [ ] Ampliar `ListOrdersDto` com `cursor?: string` e `limit?: string`, mantendo as regras e os tipos atuais de `customerId`, `status`, `page` e `pageSize`.
- [ ] Testar round-trip do codec com filtros.
- [ ] Testar round-trip do codec sem filtros.
- [ ] Testar cursor vazio ou malformado.
- [ ] Testar conteúdo adulterado.
- [ ] Testar assinatura produzida com segredo diferente.

## Verification
```bash
npm run test -- --runInBand src/orders/order-cursor.spec.ts
npm run typecheck
```

- [ ] `CT-01`: um payload válido é decodificado com a mesma posição e filtros.
- [ ] `CT-02`: cursor vazio retorna `null`.
- [ ] `CT-03`: cursor malformado retorna `null`.
- [ ] `CT-04`: cursor alterado retorna `null`.
- [ ] `CT-05`: cursor assinado com segredo diferente retorna `null`.
