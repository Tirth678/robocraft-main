# Specific infrastructure for the RoboCraft backend.
#
# The storefront (apps/web) and admin console (apps/admin) are static Vite
# builds that deploy to a static host; this file describes the backend service
# that is always on: the API gateway. The browser only ever talks to this one
# origin (`/api/*` for commerce, `/inventory/*` for products), and the gateway
# forwards each prefix to the matching microservice.

build "gateway" {
  base = "node"

  # Same commands as apps/api-gateway/railway.json: the repo is a Bun workspace
  # (bun.lock plus "*" workspace ranges), so it installs with Bun rather than
  # npm. The node base image does not ship Bun, hence the pinned install first.
  command = "npm install -g bun@1.2.22 && bun install --frozen-lockfile"
}

service "gateway" {
  build   = build.gateway
  command = "bun apps/api-gateway/src/index.ts"

  endpoint {
    public = true

    health_check {
      path = "/health"
    }
  }

  env = {
    PORT     = port
    NODE_ENV = "production"
  }

  dev {
    # Same as `bun run dev` in apps/api-gateway: watch the TypeScript entrypoint,
    # with the repo's local .env loaded when it exists.
    command = "bun --env-file=.env run --watch apps/api-gateway/src/index.ts"
  }
}
