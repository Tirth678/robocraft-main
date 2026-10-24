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

# Back4App also publishes whichever port it detected on the app's first boot and
# keeps routing there even after the Port setting changes — it pinned :3001 while
# auth-service owned it, so the public URL answered as auth-service and every
# /api/* call 404'd. The gateway therefore also listens on that alias port, and
# auth-service moves off it. Both listeners serve the same router, so the public
# hostname reaches the gateway whichever port the platform wired up. Set
# PUBLIC_ALIAS_PORT= to disable it on a platform that honours PORT strictly.
ALIAS_PORT="${PUBLIC_ALIAS_PORT:-3001}"
AUTH_PORT=3101
AUTH_SERVICE_URL="http://localhost:${AUTH_PORT}"

export AUTH_SERVICE_URL

pids=()
spawn() { "$@" & pids+=($!); }

PUBLIC_PORTS="${GATEWAY_PORT}"
if [ -n "$ALIAS_PORT" ] && [ "$ALIAS_PORT" != "$GATEWAY_PORT" ]; then
  PUBLIC_PORTS="${GATEWAY_PORT} +alias :${ALIAS_PORT}"
fi

echo "[start-backend] gateway :${PUBLIC_PORTS} | auth :${AUTH_PORT} | internals :3002-:3005,:3007"

spawn env PORT="$GATEWAY_PORT" bun apps/api-gateway/src/index.ts
if [ -n "$ALIAS_PORT" ] && [ "$ALIAS_PORT" != "$GATEWAY_PORT" ]; then
  spawn env PORT="$ALIAS_PORT" bun apps/api-gateway/src/index.ts
fi
spawn env PORT="$AUTH_PORT" bun services/auth-service/src/index.ts
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
