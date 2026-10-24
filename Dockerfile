# Single-image backend for Render: all seven services run in one container via
# scripts/start-backend.sh (gateway on the public $PORT, internals private).
# Bun is pinned to the same version the Railway/Nixpacks configs used.
FROM oven/bun:1.2.22

WORKDIR /app

# Workspace manifests first, so the install layer stays cached while only
# application code changes.
COPY package.json bun.lock ./
COPY apps/api-gateway/package.json apps/api-gateway/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/customer-frontend/package.json apps/customer-frontend/
COPY services/auth-service/package.json services/auth-service/
COPY services/inventory-service/package.json services/inventory-service/
COPY services/cart-service/package.json services/cart-service/
COPY services/billing-service/package.json services/billing-service/
COPY services/email-service/package.json services/email-service/
COPY services/admin-service/package.json services/admin-service/
COPY packages/database/package.json packages/database/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-utils/package.json packages/shared-utils/
RUN bun install --frozen-lockfile

# Application code (secrets are excluded by .dockerignore — they arrive as
# platform env vars at runtime).
COPY . .
RUN chmod +x scripts/start-backend.sh

ENV NODE_ENV=production

# Only the gateway is public; it binds the platform's PORT. Do not pin PORT here:
# a baked-in default silently disagrees with the port the platform routes to when
# it does not inject its own (Back4App routes :8001 and published whichever port
# answered). EXPOSE documents the contract; Back4App's Port setting and its
# injected $PORT are what scripts/start-backend.sh actually binds.
EXPOSE 8001

CMD ["./scripts/start-backend.sh"]
