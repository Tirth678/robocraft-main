# Backend on AWS

One EC2 instance runs the whole RoboCraft backend — the same single-container
image `Dockerfile` already builds — with Redis beside it and Caddy terminating
TLS on ports 80/443.

```
Vercel storefront ─┐
                   ├─▶ Caddy :443 ─▶ gateway :8081 ─┬─▶ auth / inventory / cart / billing
Vercel admin  ─────┘                                ├─▶ admin-service  (via /admin-api/*)
                                                    └─▶ email-service + Redis :6379
```

Only Caddy is published; every service port stays on the compose bridge network,
so the public surface is exactly the gateway origin (plus `/admin-api`, which the
admin console reaches through its Vercel rewrite).

The instance itself is defined in Terraform ([main.tf](deploy/aws/main.tf)) and
provisioned on first boot by [cloud-init.sh](deploy/aws/cloud-init.sh): 2 GB swap,
Docker + compose plugin, and `/srv/robocraft` for the stack files. Code is **not**
cloned from GitHub — [deploy.sh](deploy/aws/deploy.sh) rsyncs the current
checkout, so deploying never needs a Git credential on the box and an uncommitted
fix can be tested first.

## Prerequisites

- An AWS account with billing enabled.
- `terraform`, `aws`, `rsync`, `ssh`, `curl` locally.
- Credentials configured once, either way:
  ```bash
  aws configure          # access key + secret + region
  aws sso login          # or SSO
  aws sts get-caller-identity   # must print your account
  ```

The first run generates an SSH key at `~/.ssh/robocraft-aws` (override with
`SSH_KEY=...`); it is registered as the `robocraft-deploy` key pair and never
enters the repo or terraform state.

## Deploy

```bash
cp deploy/aws/backend.env.example deploy/aws/backend.env   # fill in real values
./deploy/aws/deploy.sh
```

That single command:

1. `terraform apply`s the security group, key pair, instance and Elastic IP
   (SSH is restricted to your current public IP — re-run after switching
   networks, or pin it with `SSH_CIDR=1.2.3.4/32`).
2. Waits for the host to accept SSH, writes `SITE_ADDRESS` (the TLS hostname).
3. Syncs the checkout to `/srv/robocraft/app` and uploads `compose.yaml`,
   `Caddyfile` and `backend.env`.
4. Runs `docker compose up -d --build` and polls `https://<site>/health`.

First build takes several minutes on the box. Re-running is the normal deploy
path: it re-syncs code, rebuilds the image and restarts the stack (~30 s of
downtime, since the process model is one container).

Other actions:

```bash
./deploy/aws/deploy.sh provision   # infra only, no code push
./deploy/aws/deploy.sh status      # container state + health endpoint
./deploy/aws/deploy.sh logs        # follow backend/caddy logs
./deploy/aws/deploy.sh destroy     # remove every resource it created
```

## Environment

All backend variables live in [backend.env.example](deploy/aws/backend.env.example);
[`DEPLOY.md`](../../DEPLOY.md#environment-variables) documents what each one does.
The two that matter for this host beyond the existing runbook:

- `INVENTORY_PUBLIC_URL` — must be `https://<site_address>/inventory`, because
  digital-delivery links point at the public gateway.
- `ADMIN_COOKIE_SECURE=true` — Caddy serves real HTTPS, so the admin session
  cookie must be `Secure`.

`REDIS_URL` is set by [compose.yaml](deploy/aws/compose.yaml) to the sidecar and
overrides whatever is in `backend.env`. `PORT` is the gateway's public port
(8081) inside the container.

`terraform output` reports `public_ip`, `site_address`, `api_base_url`,
`ssh_command` and `health_check`.

## TLS without a domain

Certificates are issued for `<name>-<dashed-ip>.sslip.io` (e.g.
`robocraft-13-234-56-78.sslip.io`), which resolves to the Elastic IP. This is
required rather than cosmetic: both frontends are served over HTTPS from Vercel,
and a browser blocks calls to a plain-HTTP API as mixed content. Caddy obtains
and renews the certificate automatically through HTTP-01, which is why port 80
stays open.

When you do own a domain, point an A record at the Elastic IP and change the
single `SITE_ADDRESS` line that deploy.sh writes to `/srv/robocraft/.env` —
`Caddyfile`, compose and terraform need no changes.

## Wiring the frontends to it

Both are static builds, so `VITE_*` values are baked in and require a redeploy:

```bash
# storefront
cd apps/web
vercel env rm VITE_BACKEND_URL production
vercel env add VITE_BACKEND_URL production --value "https://<site_address>"
vercel deploy --prod --yes

# admin console — Vercel rewrites cannot read env vars, so edit the file:
#   apps/admin/vercel.json → /admin-api/:path* destination = https://<site_address>/:path*
cd apps/admin && vercel deploy --prod --yes
```

Then confirm the backend's CORS allow-lists name the deployed origins:
`CUSTOMER_FRONTEND_URL`, `ADMIN_DASHBOARD_URL` and `ADMIN_ALLOWED_ORIGINS` in
`backend.env`.

## Cost

Roughly, at on-demand pricing in `ap-south-1` (check the pricing page before
committing):

| Item | Monthly |
| --- | --- |
| `t4g.small` instance (2 GB, ARM) | ~$12–14 |
| 30 GB gp3 root volume | ~$3 |
| Public IPv4 on the Elastic IP | ~$3.60 |
| Data transfer | negligible at demo volume |

`t4g.micro` (1 GB) halves the compute cost and works thanks to the swap the
provisioning script adds, but image builds get slow. To use the 12-month free
tier instead, set `instance_type = "t3.micro"` and `architecture = "amd64"`.

## Limits of this shape

- **Single host, no redundancy.** A reboot or AZ event takes the API down until
  the instance comes back; Docker restarts the containers on boot.
- **Redeploys rebuild on the instance.** Fine at this size (one image, cached
  layers) but not a blue/green rollout.
- **Secrets live in `/srv/robocraft/backend.env`** (mode 600). For real
  operations move them to SSM Parameter Store or Secrets Manager and grant the
  instance role read access.
- **SSH is the deploy path.** That is why the security group narrows port 22 to
  your current address; a CI runner would need its own rule or SSM Session
  Manager instead.
- **The certificate depends on sslip.io** resolving publicly. Replace it with a
  real domain for anything durable.

For a hardened setup the next step is the same image on ECS Fargate behind an
ALB, or App Runner; both need an ECR image built in CI rather than on the host.
