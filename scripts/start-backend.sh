#!/usr/bin/env bash
# Runs the whole RoboCraft backend inside one container (Render free tier = one
# public port). The gateway takes $PORT — Render's public port — and every
# other service binds an internal-only port that nothing outside the container
# can reach, which keeps the private topology from DEPLOY.md: the browser only
# ever talks to the gateway.
#
# If any process dies, the container exits so the platform restarts it whole,
# rather than silently serving a half-working stack.
set -uo pipefail

# The platform injects PORT (Render/Railway: 10000, Back4App: 8001). The
# fallback matches this image's EXPOSE so a platform that routes without
# injecting PORT still reaches the gateway rather than an empty port.
GATEWAY_PORT="${PORT:-8001}"
export NODE_ENV="${NODE_ENV:-production}"

pids=()
spawn() { "$@" & pids+=($!); }

echo "[start-backend] gateway :${GATEWAY_PORT} | internals :3001-:3005,:3007"

spawn env PORT="$GATEWAY_PORT" bun apps/api-gateway/src/index.ts
spawn env PORT=3001 bun services/auth-service/src/index.ts
spawn env PORT=3002 bun services/inventory-service/src/index.ts
spawn env PORT=3003 bun services/cart-service/src/index.ts
spawn env PORT=3004 bun services/billing-service/src/index.ts
spawn env PORT=3005 EMAIL_SERVICE_PORT=3005 bun services/email-service/src/index.ts
spawn env PORT=3007 bun services/admin-service/src/index.ts

shutdown() {
  echo "[start-backend] shutting down" >&2
  kill "${pids[@]}" 2>/dev/null
  wait 2>/dev/null
}
trap shutdown TERM INT

# Exit as soon as the first service stops; the platform then restarts the
# container, which brings every process back together.
wait -n "${pids[@]}"
echo "[start-backend] a service exited — failing the container" >&2
exit 1
