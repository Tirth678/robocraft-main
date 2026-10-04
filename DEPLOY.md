# Deployment runbook

Topology as the code actually stands. Seven deployables: six services under
`services/` plus the API gateway under `apps/api-gateway`, plus two static
frontends.

```
apps/web  ──(VITE_BACKEND_URL)──▶  apps/api-gateway :8081
                                     ├─▶ cart-service      :3003
                                     ├─▶ billing-service   :3004  ◀── Razorpay webhook (public)
                                     ├─▶ auth-service      :3001
                                     └─▶ inventory-service :3002

apps/admin ──(cookie)──▶ admin-service :3007          (behind Cloudflare Access)
                          └─▶ email-service :3005 + Redis   (internal, worker)
```

The gateway exists so the storefront makes same-origin calls; that is why
`VITE_BACKEND_URL` points at it rather than at each service.

## What must be public

Only two ingress points, everything else stays on Railway private networking:

| Public? | Deployable | Why |
| --- | --- | --- |
| yes | `apps/api-gateway` | storefront calls it |
| yes | `services/billing-service` | Razorpay posts webhooks to `/payments/webhook` |
| no | cart, auth, inventory, email, admin-service | reached only via the gateway or admin-service |

## Railway setup

One project for the storefront stack, a **separate project** for the admin pair.
Create one service per deployable and set **Root Directory** to the paths in the
table — each deployable ships a `railway.json` that Nixpacks picks up from there.

| Root Directory | Service |
| --- | --- |
| `apps/api-gateway` | api-gateway |
| `services/auth-service` | auth-service |
| `services/inventory-service` | inventory-service |
| `services/cart-service` | cart-service |
| `services/billing-service` | billing-service |
| `services/email-service` | email-service |
| `services/admin-service` | admin-service (separate project) |

Add a Redis addon and point `REDIS_URL` at it for cart-service and email-service.

### Do not enable sleep / serverless autoscaling

email-service runs a BullMQ `Worker` in the same process as its HTTP server, and
the Neon pooler connections across services do not survive aggressive idle
cycling. Keep every service always-on.

### Inter-service URLs

Inside a Railway project, services reach each other over the private network by
service name, so set e.g. `CART_SERVICE_URL=http://cart-service:3003`. Only the
gateway and billing need a public domain, and those are the only ones to expose.

## Environment variables

Derived from `process.env` usage per service. `PORT` is injected by Railway and
every service honours it — do not hardcode a port.

**All services**
- `NODE_ENV=production`
- `CUSTOMER_FRONTEND_URL` — public storefront origin
- `ADMIN_DASHBOARD_URL` — private admin origin

**api-gateway** — `DATABASE_URL`, `INTERNAL_SERVICE_SECRET`, `AUTH_SERVICE_URL`,
`INVENTORY_SERVICE_URL`, `CART_SERVICE_URL`, `BILLING_SERVICE_URL`

**auth-service** — `ADMIN_EMAILS`

**inventory-service** — `DATABASE_URL`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`,
`INVENTORY_STORAGE_BUCKET`, `INTERNAL_SERVICE_SECRET`, `INVENTORY_PUBLIC_URL`,
`EMAIL_SERVICE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`.
  Leave `ENABLE_LEGACY_ADMIN_WRITES` unset — the legacy `/admin/*` writes answer
  410 by default because admin-service is the single writer.

**cart-service** — `REDIS_URL`, `INVENTORY_SERVICE_URL`

**billing-service** — `DATABASE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, `INTERNAL_SERVICE_SECRET`, `CART_SERVICE_URL`,
  `INVENTORY_SERVICE_URL`, `EMAIL_SERVICE_URL`.
  `RAZORPAY_WEBHOOK_SECRET` is the per-endpoint webhook secret and is what the
  `x-razorpay-signature` HMAC is verified against; it is **not** the API key
  secret. Without Razorpay keys the service reports `paymentMode: "mock"` and
  settles intents without charging.

**email-service** — `REDIS_URL`, `RESEND_API_KEY`, `ADMIN_EMAILS`

**admin-service** — `DATABASE_URL`, `ADMIN_ALLOWED_ORIGINS` (the deployed admin
  origin — without it a deployed console is rejected by CORS), `ADMIN_COOKIE_SECURE=true`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`,
  `AWS_REGION`, `INVENTORY_STORAGE_BUCKET`.
  `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` only bootstrap the very first admin
  row (password ≥ 12 chars); remove them once that row exists.

## Migrations

`DATABASE_URL_UNPOOLED` (the direct, non-pooler URL) is for schema migrations
only. admin-service and inventory-service both create their own tables on boot,
but run migrations explicitly before the first production deploy rather than
relying on that.

## Frontends

Both are client-only Vite builds, so `VITE_*` values are **baked in at build
time** — each environment needs its own build.

- `apps/web` → any static host. Build with `VITE_NEON_AUTH_URL` and
  `VITE_BACKEND_URL` (the gateway). `VITE_INVENTORY_SERVICE_URL` is only needed
  if the storefront is to bypass the gateway and call inventory directly.
- `apps/admin` → static host, separate project. Leave `VITE_ADMIN_SERVICE_URL`
  unset when a dev-style proxy or same-origin path is in front of admin-service;
  otherwise set it to the absolute admin-service origin.

There is one name per setting now: `VITE_INVENTORY_SERVICE_URL` (not
`VITE_INVENTORY_URL`) and `VITE_BACKEND_URL` (not `VITE_API_URL`). An older
`VITE_INVENTORY_URL` alias and the `VITE_API_URL` override were removed so a
deployment cannot silently disagree with itself.

## Admin isolation

admin-service is an internet-facing API protected by a password alone, which is
the weakest option. Put both admin surfaces behind Cloudflare Access:

1. Deploy `apps/admin` (static) and `services/admin-service` in their own
   Railway project.
2. Put both hostnames behind a Cloudflare Zero Trust Access policy (email
   allowlist).
3. Set `ADMIN_ALLOWED_ORIGINS` to the admin origin and `ADMIN_COOKIE_SECURE=true`.

Cookie auth and bcrypt stay as defence in depth rather than the only wall.

## Before going live

- [ ] Rotate every credential that has appeared in this repo or its history:
      Neon database/storage, `INTERNAL_SERVICE_SECRET`, Resend, and the seeded
      admin password (`ADMIN_SEED_PASSWORD`).
- [ ] Set `ADMIN_DASHBOARD_URL` to the real admin origin — it drives both CORS
      allow-lists and the admin deep links in transactional email.
- [ ] Confirm `NODE_ENV=production` on every service so the localhost CORS
      escape hatch is disabled and the "no origins configured" warnings fire if
      something is unset.
- [ ] Verify a real Razorpay webhook end to end; until then payments run in
      mock mode.
