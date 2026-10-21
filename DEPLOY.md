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

apps/admin (Vercel) ──/admin-api/* (same-origin rewrite)──▶ admin-service :3007
                          └─▶ email-service :3005 + Redis   (internal, worker)

The admin console proxies `/admin-api/*` to admin-service from its own origin
(`apps/admin/vercel.json`), so the session cookie stays first-party and
`SameSite=Strict` keeps working. Do not point the console at the absolute
admin-service origin from Vercel — that is a cross-site call and the cookie
would never be sent.
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

**billing-service can stay deployed without Razorpay keys.** Order creation
(`POST /api/orders`), promo validation, payment intents and order tracking all
live behind gateway routes to billing-service — skipping the deployable
doesn't skip payments, it breaks checkout. Deploy it with the Razorpay vars
unset and it runs in `paymentMode: "mock"` (settles without charging), which is
the supported way to go live before payments are configured.

## Railway setup

One project for the storefront stack, a **separate project** for the admin pair.

Create one service per deployable, and for **every** service set:

- **Root Directory** = the repository root (not the service folder). The
  services import the workspace packages (`shared-utils`, `database`,
  `shared-types`), so `bun install` has to run once against the workspace —
  installing inside `services/x` would not resolve `"*"` workspace ranges.
- **Config-as-code path** = the file in the table below. Because the root is
  shared, each service points at its own `railway.json` instead of inheriting
  one from its folder.
- **Watch paths** = that service's folder plus `packages/**`, so a change to a
  shared package redeploys its consumers.

| Config file | Service | Start command (already in the file) |
| --- | --- | --- |
| `apps/api-gateway/railway.json` | api-gateway | `bun apps/api-gateway/src/index.ts` |
| `services/auth-service/railway.json` | auth-service | `bun services/auth-service/src/index.ts` |
| `services/inventory-service/railway.json` | inventory-service | `bun services/inventory-service/src/index.ts` |
| `services/cart-service/railway.json` | cart-service | `bun services/cart-service/src/index.ts` |
| `services/billing-service/railway.json` | billing-service | `bun services/billing-service/src/index.ts` |
| `services/email-service/railway.json` | email-service | `bun services/email-service/src/index.ts` |
| `services/admin-service/railway.json` | admin-service (separate project) | `bun services/admin-service/src/index.ts` |

Each file runs `bun install --frozen-lockfile` once and then starts the
TypeScript entrypoint directly, so there is no `dist/` step to drift out of
sync. Nixpacks detects Bun from the root `bun.lock`.

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

**auth-service** — `ADMIN_EMAILS`, `NEON_AUTH_JWKS_URL`, `NEON_AUTH_BASE_URL`.
  The JWKS/issuer are read at module load and **throw if unset**, so the service
  crash-loops on Railway without them. `VITE_NEON_AUTH_URL` (same value the
  storefront uses) points the sign-out call at the right Neon Auth base; it is
  optional but should be set so it doesn't fall back to a hardcoded URL.

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

**email-service** — `REDIS_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAILS`.
  `EMAIL_REDIRECT_TO` is a local/staging convenience: when set, every message is
  delivered to that address instead of the real recipient (the original
  recipient is kept in the subject and `Reply-To`). Leave it **unset** in
  production — pre-orders must reach the customer's own address.

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

`20261020_orders_legacy_fks.sql` drops the `orders.userId → users` and
`order_items.productId → products` foreign keys. Those tables were retired in
favour of Neon Managed Auth and `inventory_items`; while the keys existed, every
checkout failed with a 409. Run `bun run db:migrate` again after pulling this
change into an environment that predates it.

## Frontends

Both are client-only Vite builds, so `VITE_*` values are **baked in at build
time** — each environment needs its own build.

- `apps/web` → any static host. Build with `VITE_NEON_AUTH_URL` and
  `VITE_BACKEND_URL` (the gateway). `VITE_INVENTORY_SERVICE_URL` is only needed
  if the storefront is to bypass the gateway and call inventory directly.
- `apps/admin` → Vercel, separate project (Root Directory `apps/admin`).
  `apps/admin/vercel.json` pins build/output, adds the SPA fallback and rewrites
  `/admin-api/*` to admin-service — **edit that rewrite's destination to your
  admin-service Railway URL before deploying** (it is a literal placeholder;
  Vercel rewrites cannot read env vars). Leave `VITE_ADMIN_SERVICE_URL` unset so
  the app calls the same-origin proxy; only set it to an absolute origin if you
  deliberately move API calls off the proxy, which then requires changing the
  cookie to `SameSite=None` — don't.

There is one name per setting now: `VITE_INVENTORY_SERVICE_URL` (not
`VITE_INVENTORY_URL`) and `VITE_BACKEND_URL` (not `VITE_API_URL`). An older
`VITE_INVENTORY_URL` alias and the `VITE_API_URL` override were removed so a
deployment cannot silently disagree with itself.

## Frontends on Vercel

Both apps are static Vite builds with no server runtime, so each deploys to
Vercel as its own project.

1. Import the repo, set **Root Directory** to `apps/web` (the framework preset
   is detected as Vite; `apps/web/vercel.json` pins build/output).
2. Set the environment variables for **Production** and **Preview**:
   - `VITE_BACKEND_URL` = the Railway gateway origin (`https://api.example.com`)
   - `VITE_NEON_AUTH_URL` = the Neon Managed Auth base URL
3. Redeploy after changing any `VITE_*` value — they are inlined at build time.
4. Add the Vercel domain to `CUSTOMER_FRONTEND_URL` on every Railway service
   (CORS is an allow-list) and set `ADMIN_DASHBOARD_URL` to the admin console
   origin so the pre-order emails deep-link correctly.

For `apps/admin` (separate Vercel project, Root Directory `apps/admin`):

1. Set the rewrite destination in `apps/admin/vercel.json` to the deployed
   admin-service URL (one-time edit — see the Frontends section above).
2. Environment variables for Production and Preview:
   - `VITE_STOREFRONT_URL` = the deployed storefront origin (the console loads
     seeded `/assets/*` product images from there; without it images 404)
   - leave `VITE_ADMIN_SERVICE_URL` and `VITE_BACKEND_URL` unset (same-origin
     `/admin-api` proxy)
3. On admin-service set `ADMIN_ALLOWED_ORIGINS` to the admin Vercel origin and
   `ADMIN_COOKIE_SECURE=true`.
4. Keep the console behind Cloudflare Access (email allowlist) as below — the
   static host itself is public, Access is the wall.

## Admin isolation

admin-service is an internet-facing API protected by a password alone, which is
the weakest option. Put both admin surfaces behind Cloudflare Access:

1. Deploy `apps/admin` on Vercel (project of its own) and `services/admin-service`
   in its own Railway project.
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
- [ ] Verify a sending domain in Resend and set `EMAIL_FROM` to an address on
      it. Until then Resend's sandbox only delivers to the account owner's
      address and rejects every customer email with `403 validation_error`
      (the job now fails loudly instead of silently completing).
- [ ] Confirm `EMAIL_REDIRECT_TO` is **unset** in production after the domain is
      verified, otherwise every customer confirmation goes to that one inbox.
