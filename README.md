# Robocraft E-Commerce Platform

A microservices e-commerce platform built with Elysia, Next.js, Neon Lakebase Postgres, Neon Managed Auth, and TypeScript.

## Architecture

### Services

- **auth-service** (Port 3001) - Neon Managed Auth JWT validation API
- **inventory-service** (Port 3002) - Product management and analytics
- **cart-service** (Port 3003) - Shopping cart with Redis
- **billing-service** (Port 3004) - Razorpay payment processing
- **email-service** (Port 3005) - BullMQ + Resend email queue

### Frontend Applications

- **customer-frontend** (Port 3000) - Next.js customer shopping experience
- **admin-dashboard** (Port 3006) - Next.js admin panel with analytics

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

# Run specific frontend
cd apps/customer-frontend
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
│   ├── customer-frontend/     # Next.js customer site
│   ├── admin-dashboard/       # Next.js admin panel
│   └── api-gateway/           # Nginx config
├── services/
│   ├── auth-service/          # Elysia + Neon Managed Auth
│   ├── billing-service/       # Elysia + Razorpay
│   ├── email-service/         # Elysia + BullMQ + Resend
│   ├── cart-service/          # Elysia + Redis
│   └── inventory-service/     # Elysia + Neon Postgres
├── packages/
│   ├── shared-types/          # Shared TypeScript types
│   ├── database/              # Drizzle schema + migrations
│   └── shared-utils/          # Common utilities
└── docker-compose.yml
```

## Environment Variables

See `.env.example` for required environment variables.

## Inventory administration

The inventory API is intentionally admin-only. It verifies a Neon Managed Auth
Bearer token and then checks `inventory_admins`; it never accepts an admin role
from the request body. Apply
`packages/database/migrations/sql/20260923_inventory.sql` with the direct
`DATABASE_URL_UNPOOLED` on a Neon branch before production. Grant the first
administrator from a trusted terminal after the migration:

```bash
cd services/inventory-service
bun run admin:grant -- <neon-auth-user-id>
```

Admin endpoints are under `/admin/inventory`:

- `GET|POST /items`, `GET|PATCH|DELETE /items/:id`
- `POST /items/:id/stock-adjustments` (requires a unique idempotency key)
- `POST /items/:id/discounts`
- `GET|POST /coupons`, `DELETE /coupons/:id`

Monetary values use integer paise (`*_minor`), avoiding floating-point currency
rounding. Product-image values are Neon Object Storage keys, not public URLs.

## Deployment

Designed for deployment on Render with:
- Redis (Render Redis)
- Neon Lakebase Postgres
- Docker for services

## License

MIT
