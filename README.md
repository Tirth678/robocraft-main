# Robocraft E-Commerce Platform

A microservices e-commerce platform built with Elysia, React/Vite, Neon Lakebase Postgres, Neon Managed Auth, and TypeScript.

## Architecture

### Services

- **api-gateway** (Port 8081) - Single edge router for `/api/*` and `/inventory/*`
- **auth-service** (Port 3001) - Neon Managed Auth JWT validation API
- **inventory-service** (Port 3002) - Products, stock, digital deliverables, entitlements
- **cart-service** (Port 3003) - Redis-backed shopping cart
- **billing-service** (Port 3004) - Orders, Razorpay payments, sales analytics
- **email-service** (Port 3005) - BullMQ + Resend email queue

The browser only ever talks to the gateway (plus `/inventory` for product images
and downloads), so service topology, CORS and credentials stay server-side. Each
service strips its public mount point: `/api/cart` reaches cart-service as
`/cart`, `/inventory/products` reaches inventory-service as `/products`.

### Frontend Application

- **web** (Port 8080) - Official storefront and its integrated admin panel (`/admin`)

### Infrastructure

- **Database**: Neon Lakebase Postgres
- **Cache/Queue**: Redis + BullMQ
- **Reverse Proxy**: Nginx
- **Package Manager**: Bun + Turborepo

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Bun >= 1.0.0
- Neon account
- Razorpay account
- Resend account

### Installation

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials
```

### Development

```bash
# Run all services in development mode
bun run dev

# Run specific service
cd services/auth-service
bun run dev

# Run the official storefront and integrated admin
cd apps/web
bun run dev
```

### Build

```bash
# Build all packages
bun run build

# Build specific package
cd services/auth-service
bun run build
```

## Project Structure

```
robocraft-main/
├── apps/
│   ├── api-gateway/              # Elysia edge router for /api + /inventory
│   └── web/                      # Official storefront and admin routes (/admin)
├── services/
│   ├── auth-service/             # Elysia + Neon Managed Auth
│   ├── billing-service/          # Orders, Razorpay, fulfilment orchestration
│   ├── email-service/            # Elysia + BullMQ + Resend
│   ├── cart-service/             # Elysia + Redis
│   └── inventory-service/        # Elysia + Neon Postgres + Object Storage
├── packages/
│   ├── shared-types/             # Shared TypeScript types
│   ├── database/                 # Contract schema + hand-written SQL migrations
│   └── shared-utils/             # Zod schemas, helpers, Neon JWT + service auth
└── docker-compose.yml
```

## Environment Variables

See `.env.example` for required environment variables.

## Inventory administration

The inventory API is intentionally admin-only. It verifies a Neon Managed Auth
Bearer token and then checks `inventory_admins`; it never accepts an admin role
from the request body. Apply
`packages/database/migrations/sql/20260930_digital_inventory.sql` and
`20260930_orders_customer.sql` with the direct `DATABASE_URL_UNPOOLED` before
production:

```bash
cd services/inventory-service
DATABASE_URL="$DATABASE_URL_UNPOOLED" bun run db:migrate
bun run admin:grant -- <neon-auth-user-id>
```

Admin endpoints are under `/admin`:

- `GET|POST /items`, `GET|PATCH|DELETE /items/:id`
- `POST /items/:id/stock-adjustments` (requires a unique idempotency key)
- `POST /items/:id/discounts`
- `GET|POST /coupons`, `DELETE /coupons/:id`

Monetary values use integer paise (`*_minor`), avoiding floating-point currency
rounding. Product-image values are Neon Object Storage keys, not public URLs;
`GET /media?key=…` presigns or streams them.

## Digital inventory

A product is `physical` or `digital` (`inventory_items.kind`). Digital products
deliver files, license keys, or both (`delivery_mode`) and are never stocked by
hand — availability is derived:

| delivery_mode   | Availability                          |
| --------------- | ------------------------------------- |
| `files`         | unlimited (`stock: null`)             |
| `license_keys`  | count of unassigned keys in the pool  |
| `both`          | unassigned keys                       |

Admin routes (admin JWT required):

- `GET|POST /products/:id/digital-assets` — upload/list deliverables
- `DELETE /digital-assets/:assetId` — deactivates; `?purge=true` also deletes the object
- `GET|POST /products/:id/keys` — list / bulk-import license keys (array or pasted text)
- `POST /digital-keys/:keyId/revoke` — unassigned keys only
- `GET /admin/entitlements`, `POST /admin/entitlements/:id/revoke`
- `POST /admin/fulfillments` — grants entitlements for an order (idempotent)
- `POST /internal/fulfillments` — same handler, authenticated by an
  `INTERNAL_SERVICE_SECRET` HMAC over method, path, body digest and timestamp.
  This is an identity for *our own services* (billing calls it after payment);
  it is not an admin bypass, and every `/admin/*` route still needs an admin JWT.

Public delivery (token-gated, no auth header):

- `GET /downloads/:token` — claim payload: license keys, file list, usage
- `GET /downloads/:token/files/:assetId` — serves the bytes, counts the download

Fulfilment is idempotent per order line, so a retried payment webhook never hands
out a second license. On payment, billing-service settles the order, calls
`/internal/fulfillments`, then emails the download links via the email service.

## Smoke tests

The service and gateway smoke tests run against a real database and real object
storage, and clean up after themselves:

```bash
cd services/inventory-service
bun run smoke:storage   # object storage round trip (presign, fetch, delete)
bun run smoke:digital   # create → fulfil twice → claim → download

cd apps/api-gateway     # with every service running
bun run smoke:gateway   # routing, auth rejections, signed fulfilment, delivery
```

## Deployment

Designed for deployment on Render with:
- Redis (Render Redis)
- Neon Lakebase Postgres
- Docker for services

## License

MIT
