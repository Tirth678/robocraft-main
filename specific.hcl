# Specific infrastructure for the RoboCraft backend.
#
# Seven services, mirroring the topology in DEPLOY.md:
#
#   gateway (public) ──▶ auth, inventory, cart, billing   (private network)
#   admin   (public) ── the Vercel console proxies /admin-api/* here, so the
#                       session cookie stays first-party
#   email   (private, BullMQ worker runs in-process) + managed redis
#
# The storefront (apps/web) and admin console (apps/admin) stay static Vite
# builds on Vercel; the browser only ever talks to gateway (/api/*,
# /inventory/*) or, for staff, to admin through the console's same-origin
# /admin-api rewrite.

# ---------------------------------------------------------------- resources
# Cart sessions (ioredis) and the email queue (BullMQ) share one instance.
redis "cache" {} # non-durable Valkey; fine for both

# ----------------------------------------------------------------- secrets
# Existing external accounts (Neon Postgres, Neon Managed Auth, Neon Object
# Storage, Resend) are injected as secrets rather than re-provisioned, so the
# deployed system keeps the catalog, pre-orders and customer accounts that
# already live there. Values come from the deploy flags / dashboard and never
# enter git; `specific.local` (gitignored) supplies them for local dev.
secret "database_url" {} # Neon Lakebase pooled URL
secret "neon_auth_base_url" {}
secret "neon_auth_jwks_url" {}
secret "aws_access_key_id" {} # Neon Object Storage, S3-compatible
secret "aws_secret_access_key" {}
secret "aws_endpoint_url_s3" {}
secret "resend_api_key" {
  # Local dev may start without it; sending then fails loudly instead of
  # blocking the whole stack.
  dev {
    required = false
  }
}
# Shared HMAC secret for service-to-service calls (billing → inventory
# fulfilment). Auto-generated per environment so nothing has to be invented.
secret "internal_service_secret" {
  generated = true
}

# ------------------------------------------------------------------- config
# Non-sensitive values that differ per environment. Production overrides go in
# the dashboard once the Vercel domains exist.
config "customer_frontend_url" { default = "http://localhost:8080" }
config "admin_dashboard_url" { default = "http://localhost:8082" }
config "admin_allowed_origins" { default = "http://localhost:5173,http://localhost:8082" }
config "admin_cookie_secure" { default = "false" }
config "admin_emails" { default = "admin@robocraft.com,tirth@robocraft.com" }
config "aws_region" { default = "us-east-2" }
config "storage_bucket" { default = "productimages" }
config "email_from" { default = "RoboCraft <onboarding@resend.dev>" }
config "email_redirect_to" { default = "" }

# ------------------------------------------------------------------- builds
# One build for every backend service: the repo is a Bun workspace, so install
# once at the root and start the TypeScript entrypoint directly — no dist step
# to drift out of sync. The node base image ships no Bun, hence the pinned
# global install first (same commands as the railway.json files).
build "backend" {
  base = "node"
  command = "npm install -g bun@1.2.22 && bun install --frozen-lockfile"
}

# ----------------------------------------------------------------- services
service "gateway" {
  build = build.backend
  command = "bun apps/api-gateway/src/index.ts"

  endpoint {
    public = true
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT                  = port
    NODE_ENV              = "production"
    AUTH_SERVICE_URL      = "http://${service.auth.private_url}"
    INVENTORY_SERVICE_URL = "http://${service.inventory.private_url}"
    CART_SERVICE_URL      = "http://${service.cart.private_url}"
    BILLING_SERVICE_URL   = "http://${service.billing.private_url}"
    CUSTOMER_FRONTEND_URL = config.customer_frontend_url
    ADMIN_DASHBOARD_URL   = config.admin_dashboard_url
  }

  dev {
    command = "bun --env-file=.env run --watch apps/api-gateway/src/index.ts"
    env = {
      NODE_ENV = "development"
    }
  }
}

service "auth" {
  build = build.backend
  command = "bun services/auth-service/src/index.ts"

  endpoint {
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT                  = port
    NODE_ENV              = "production"
    ADMIN_EMAILS          = config.admin_emails
    NEON_AUTH_BASE_URL    = secret.neon_auth_base_url
    NEON_AUTH_JWKS_URL    = secret.neon_auth_jwks_url
    # The sign-out client in this service reads the VITE_-prefixed name.
    VITE_NEON_AUTH_URL    = secret.neon_auth_base_url
    CUSTOMER_FRONTEND_URL = config.customer_frontend_url
    ADMIN_DASHBOARD_URL   = config.admin_dashboard_url
  }

  dev {
    command = "bun --env-file=.env run --watch services/auth-service/src/index.ts"
    env = {
      NODE_ENV = "development"
    }
  }
}

service "inventory" {
  build = build.backend
  command = "bun services/inventory-service/src/index.ts"

  endpoint {
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT                     = port
    NODE_ENV                 = "production"
    DATABASE_URL             = secret.database_url
    EMAIL_SERVICE_URL        = "http://${service.email.private_url}"
    # Digital-delivery links in transactional email resolve via the gateway.
    INVENTORY_PUBLIC_URL     = "https://${service.gateway.public_url}/inventory"
    INTERNAL_SERVICE_SECRET  = secret.internal_service_secret
    AWS_ACCESS_KEY_ID        = secret.aws_access_key_id
    AWS_SECRET_ACCESS_KEY    = secret.aws_secret_access_key
    AWS_ENDPOINT_URL_S3      = secret.aws_endpoint_url_s3
    AWS_REGION               = config.aws_region
    INVENTORY_STORAGE_BUCKET = config.storage_bucket
    NEON_AUTH_BASE_URL       = secret.neon_auth_base_url
    NEON_AUTH_JWKS_URL       = secret.neon_auth_jwks_url
    CUSTOMER_FRONTEND_URL    = config.customer_frontend_url
    ADMIN_DASHBOARD_URL      = config.admin_dashboard_url
  }

  dev {
    command = "bun --env-file=.env run --watch services/inventory-service/src/index.ts"
    env = {
      NODE_ENV             = "development"
      INVENTORY_PUBLIC_URL = "http://${service.gateway.public_url}/inventory"
    }
  }
}

service "cart" {
  build = build.backend
  command = "bun services/cart-service/src/index.ts"

  endpoint {
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT                  = port
    NODE_ENV              = "production"
    REDIS_URL             = redis.cache.url
    INVENTORY_SERVICE_URL = "http://${service.inventory.private_url}"
    CUSTOMER_FRONTEND_URL = config.customer_frontend_url
    ADMIN_DASHBOARD_URL   = config.admin_dashboard_url
  }

  dev {
    command = "bun --env-file=.env run --watch services/cart-service/src/index.ts"
    env = {
      NODE_ENV = "development"
    }
  }
}

# Razorpay is intentionally not wired: with no keys the service reports
# paymentMode=mock and settles intents without charging, which keeps checkout
# (order creation, promos, tracking) working. To go live with payments, add
# razorpay_key_id / razorpay_key_secret / razorpay_webhook_secret secrets, wire
# them here, and make the endpoint public so Razorpay can POST /payments/webhook.
service "billing" {
  build = build.backend
  command = "bun services/billing-service/src/index.ts"

  endpoint {
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT                  = port
    NODE_ENV              = "production"
    DATABASE_URL          = secret.database_url
    CART_SERVICE_URL      = "http://${service.cart.private_url}"
    INVENTORY_SERVICE_URL = "http://${service.inventory.private_url}"
    EMAIL_SERVICE_URL     = "http://${service.email.private_url}"
    INTERNAL_SERVICE_SECRET = secret.internal_service_secret
    CUSTOMER_FRONTEND_URL = config.customer_frontend_url
    ADMIN_DASHBOARD_URL   = config.admin_dashboard_url
  }

  dev {
    command = "bun --env-file=.env run --watch services/billing-service/src/index.ts"
    env = {
      NODE_ENV = "development"
    }
  }
}

service "email" {
  build = build.backend
  command = "bun services/email-service/src/index.ts"

  endpoint {
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT              = port
    NODE_ENV          = "production"
    REDIS_URL         = redis.cache.url
    RESEND_API_KEY    = secret.resend_api_key
    EMAIL_FROM        = config.email_from
    # Must stay empty in production once a sending domain is verified.
    EMAIL_REDIRECT_TO = config.email_redirect_to
    ADMIN_EMAILS      = config.admin_emails
  }

  dev {
    command = "bun --env-file=.env run --watch services/email-service/src/index.ts"
    env = {
      NODE_ENV = "development"
    }
  }
}

# Public only because the admin console on Vercel rewrites /admin-api/* to this
# origin — that keeps the session cookie first-party (SameSite=Strict). It is
# still guarded by staff credentials, login throttling and bcrypt; put
# Cloudflare Access in front of both hostnames for a second wall.
service "admin" {
  build = build.backend
  command = "bun services/admin-service/src/index.ts"

  endpoint {
    public = true
    health_check {
      path = "/health"
    }
  }

  env = {
    PORT                   = port
    NODE_ENV               = "production"
    DATABASE_URL           = secret.database_url
    ADMIN_ALLOWED_ORIGINS  = config.admin_allowed_origins
    ADMIN_COOKIE_SECURE    = config.admin_cookie_secure
    AWS_ACCESS_KEY_ID      = secret.aws_access_key_id
    AWS_SECRET_ACCESS_KEY  = secret.aws_secret_access_key
    AWS_ENDPOINT_URL_S3    = secret.aws_endpoint_url_s3
    AWS_REGION             = config.aws_region
    INVENTORY_STORAGE_BUCKET = config.storage_bucket
  }

  dev {
    command = "bun --env-file=.env run --watch services/admin-service/src/index.ts"
    env = {
      NODE_ENV = "development"
    }
  }
}
