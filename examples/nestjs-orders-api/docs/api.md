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
| POST | /api/v1/products | Create a product |
| GET | /api/v1/products | List products (`page`, `pageSize`, `includeInactive`) |
| GET | /api/v1/products/:id | Product detail (active or not) |
| PATCH | /api/v1/products/:id | Partial update (`name`, `description`, `price`, `active`) |
| DELETE | /api/v1/products/:id | Deactivate (204, idempotent) |
| GET | /api/v1/reports/daily | Paid orders and revenue |
| POST | /api/v1/webhooks/payments | Payment provider webhook (no auth — see audit) |

Events: `order.created`, `order.cancelled`, `payment.confirmed`. Job: daily summary at midnight.

## Products

Product: `{ id, sku, name, description?, price, active, createdAt, updatedAt }`. `id` is a UUID; `price` is a number with at most 2 decimals (>= 0).

- `POST` takes `sku` (1-64 chars, no leading/trailing spaces), `name` (1-120), `price` and optional `description` (max 1000). Responds 201. A `sku` that already exists, even on an inactive product, responds 409 with `code=sku_conflict`.
- `GET /products` returns `{ data, page, pageSize, total }` ordered by `createdAt` ascending. Defaults: `page=1`, `pageSize=20` (max 100). Only active products are listed unless `includeInactive=true`.
- `PATCH` changes only the fields sent. `sku` and `id` cannot be changed and respond 400. An empty body leaves the product untouched.
- `DELETE` deactivates the product (`active=false`) and keeps the record and its `sku` reserved. It stays readable by id, and `PATCH` with `active=true` reactivates it.
- A malformed id responds 400, an unknown id 404. Data lives in memory and is lost on restart.
- Orders do not consult the catalog: `POST /orders` still accepts any `sku` and `unitPrice`.
