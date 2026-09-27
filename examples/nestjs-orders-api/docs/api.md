# Orders API

All routes except `/health` live under `/api/v1` and require the `x-api-key` header.

| Method | Path | Description |
| --- | --- | --- |
| GET | /health | Liveness probe (public) |
| GET | /api/v1/orders | List orders (`customerId`, `status`, `page`, `pageSize`) |
| GET | /api/v1/orders/export | CSV export |
| GET | /api/v1/orders/:id | Order detail |
| POST | /api/v1/orders | Create and charge an order |
| DELETE | /api/v1/orders/:id | Cancel (refunds paid orders) |
| GET | /api/v1/customers | List customers |
| GET/PATCH | /api/v1/customers/:id | Read / update a customer |
| GET | /api/v1/reports/daily | Paid orders and revenue |
| POST | /api/v1/webhooks/payments | Payment provider webhook (no auth — see audit) |

Events: `order.created`, `order.cancelled`, `payment.confirmed`. Job: daily summary at midnight.
