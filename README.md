# Robocraft E-Commerce Platform

A production-ready e-commerce platform with microservices architecture, built with Elysia, Next.js, Supabase, and TypeScript.

## Architecture

### Services

- **auth-service** (Port 3001) - Clerk authentication integration
- **inventory-service** (Port 3002) - Product management and analytics
- **cart-service** (Port 3003) - Shopping cart with Redis
- **billing-service** (Port 3004) - Razorpay payment processing
- **email-service** (Port 3005) - BullMQ + Resend email queue

### Frontend Applications

- **customer-frontend** (Port 3000) - Next.js customer shopping experience
- **admin-dashboard** (Port 3006) - Next.js admin panel with analytics

### Infrastructure

- **Database**: Supabase (PostgreSQL)
- **Cache/Queue**: Redis + BullMQ
- **Reverse Proxy**: Nginx
- **Package Manager**: Bun + Turborepo

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Bun >= 1.0.0
- Supabase account
- Clerk account
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
│   ├── auth-service/          # Elysia + Clerk
│   ├── billing-service/       # Elysia + Razorpay
│   ├── email-service/         # Elysia + BullMQ + Resend
│   ├── cart-service/          # Elysia + Redis
│   └── inventory-service/     # Elysia + Supabase
├── packages/
│   ├── shared-types/          # Shared TypeScript types
│   ├── database/              # Drizzle schema + migrations
│   └── shared-utils/          # Common utilities
└── docker-compose.yml
```

## Environment Variables

See `.env.example` for required environment variables.

## Deployment

Designed for deployment on Render with:
- Redis (Render Redis)
- PostgreSQL (Render PostgreSQL or Supabase)
- Docker for services

## License

MIT
