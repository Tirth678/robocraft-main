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

# Only the gateway is public: it binds $PORT (default 10000, this image sets
# PORT=8081 below). Declaring it keeps platforms that auto-detect a port from
# guessing an internal one — Back4App routed to auth-service's :3001 until the
# exposed port was pinned, so the domain answered as the wrong service.
ENV PORT=8081
EXPOSE 8081

CMD ["./scripts/start-backend.sh"]
