#!/usr/bin/env bash
# Provision the AWS backend host and/or push the current checkout to it.
#
#   ./deploy/aws/deploy.sh            # ensure infra exists, then build + restart
#   ./deploy/aws/deploy.sh provision  # terraform apply only, no code push
#   ./deploy/aws/deploy.sh status     # instance + container health
#   ./deploy/aws/deploy.sh logs       # follow backend/caddy logs
#   ./deploy/aws/deploy.sh destroy    # tear the whole stack down
#
# Prerequisites: terraform, aws CLI with credentials, rsync, ssh, curl.
# Code is delivered by rsync over SSH rather than a git clone on the host, so
# deploying does not need a GitHub credential on the instance and an uncommitted
# fix can be tested before it is committed.
set -euo pipefail

TF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TF_DIR/../.." && pwd)"
KEY="${SSH_KEY:-$HOME/.ssh/robocraft-aws}"
REMOTE_USER="ubuntu"
REMOTE_ROOT="/srv/robocraft"
ACTION="${1:-up}"

die() { echo "error: $*" >&2; exit 1; }
info() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# ------------------------------------------------------------------ preflight
command -v terraform >/dev/null || die "terraform is not installed (brew install terraform)"
command -v rsync >/dev/null || die "rsync is not installed"
if [ "$ACTION" != "status" ] && [ "$ACTION" != "logs" ]; then
  command -v aws >/dev/null || die "aws CLI is not installed (brew install awscli)"
  aws sts get-caller-identity >/dev/null 2>&1 || die "no usable AWS credentials — run 'aws configure' or 'aws sso login' first"
fi

# The deploy key is generated once and never enters the repo or terraform state.
if [ ! -f "$KEY" ]; then
  info "generating deploy key at $KEY"
  ssh-keygen -t ed25519 -N "" -C "robocraft-aws-deploy" -f "$KEY" >/dev/null
fi

SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15)

tf() { terraform -chdir="$TF_DIR" "$@"; }
remote() { local ip="$1"; shift; ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$ip" "$@"; }

# ------------------------------------------------------------------ actions
terraform_up() {
  tf init -input=false >/dev/null

  # Only the operator's current address may reach SSH. Re-applied on every run so
  # a changed home/office IP just works; pass SSH_CIDR to pin it deliberately.
  local cidr="${SSH_CIDR:-}"
  if [ -z "$cidr" ]; then
    local detected
    detected="$(curl -fsS https://api.ipify.org 2>/dev/null || true)"
    [ -n "$detected" ] || die "could not detect your public IP; pass SSH_CIDR=1.2.3.4/32"
    cidr="$detected/32"
  fi

  info "terraform apply (ssh from $cidr)"
  tf apply -auto-approve -input=false -var "ssh_cidr=$cidr"
}

wait_for_host() {
  local ip="$1"
  for _ in $(seq 1 60); do
    if remote "$ip" "true" 2>/dev/null; then return 0; fi
    sleep 5
  done
  die "host $ip did not accept SSH within 5 minutes — check the instance's console output in EC2"
}

deploy_code() {
  local ip="$1" site="$2"

  [ -f "$TF_DIR/backend.env" ] || die "missing $TF_DIR/backend.env — copy backend.env.example and fill it in"

  info "uploading stack definition"
  remote "$ip" "mkdir -p $REMOTE_ROOT/app $REMOTE_ROOT/caddy"
  scp "${SSH_OPTS[@]}" -q \
    "$TF_DIR/compose.yaml" "$REMOTE_USER@$ip:$REMOTE_ROOT/compose.yaml"
  scp "${SSH_OPTS[@]}" -q \
    "$TF_DIR/caddy/Caddyfile" "$REMOTE_USER@$ip:$REMOTE_ROOT/caddy/Caddyfile"
  scp "${SSH_OPTS[@]}" -q \
    "$TF_DIR/backend.env" "$REMOTE_USER@$ip:$REMOTE_ROOT/backend.env"
  remote "$ip" "printf 'SITE_ADDRESS=%s\n' '$site' > $REMOTE_ROOT/.env && chmod 600 $REMOTE_ROOT/backend.env"

  info "syncing code"
  # --delete keeps removed files from lingering in the image; excludes protect
  # local-only artifacts that must never ship (secrets, caches, build output).
  rsync -az --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '*.pem' \
    --exclude 'cookies.txt' \
    --exclude 'specific.local' \
    --exclude '.specific' \
    --exclude '.preview' \
    --exclude '.logs' \
    --exclude '.turbo' \
    --exclude '.vercel' \
    --exclude 'screenshots' \
    --exclude 'dist' \
    --exclude 'package-lock.json' \
    --exclude '.terraform' \
    -e "ssh ${SSH_OPTS[*]}" \
    "$REPO_ROOT/" "$REMOTE_USER@$ip:$REMOTE_ROOT/app/"

  info "building and starting containers (first build takes several minutes)"
  remote "$ip" "cd $REMOTE_ROOT && docker compose up -d --build --remove-orphans"
}

wait_for_health() {
  local url="$1"
  info "waiting for $url"
  for i in $(seq 1 40); do
    if curl -fsS -m 10 "$url" >/dev/null 2>&1; then
      info "healthy after ~$((i * 5))s"
      return 0
    fi
    sleep 5
  done
  echo
  echo "Not healthy yet. Common causes:" >&2
  echo "  - certificate not issued yet (Caddy needs port 80 and a moment); retry in a minute" >&2
  echo "  - a service crashed on boot: ./deploy/aws/deploy.sh logs" >&2
  echo "  - missing env var in backend.env (auth-service throws without NEON_AUTH_*)" >&2
  return 1
}

case "$ACTION" in
  provision)
    terraform_up
    tf output
    ;;

  up)
    terraform_up
    ip="$(tf output -raw public_ip)"
    site="$(tf output -raw site_address)"
    wait_for_host "$ip"
    deploy_code "$ip" "$site"
    wait_for_health "https://$site/health"
    echo
    info "backend live at https://$site"
    echo "  storefront: set VITE_BACKEND_URL=https://$site and redeploy apps/web"
    echo "  admin:      set the /admin-api rewrite destination in apps/admin/vercel.json to https://$site and redeploy"
    echo "  CORS:       CUSTOMER_FRONTEND_URL / ADMIN_DASHBOARD_URL / ADMIN_ALLOWED_ORIGINS in backend.env must name the Vercel origins"
    ;;

  status)
    ip="$(tf output -raw public_ip)"
    site="$(tf output -raw site_address)"
    echo "host:  $ip   site: https://$site"
    remote "$ip" "cd $REMOTE_ROOT && docker compose ps"
    curl -fsS -m 10 "https://$site/health" && echo || echo "(health endpoint unreachable)"
    ;;

  logs)
    ip="$(tf output -raw public_ip)"
    remote "$ip" "cd $REMOTE_ROOT && docker compose logs -f --tail=100 backend caddy"
    ;;

  destroy)
    info "destroying every resource this stack created (EIP, instance, SG, key pair)"
    tf destroy -auto-approve -input=false
    ;;

  *)
    die "unknown action '$ACTION' (up|provision|status|logs|destroy)"
    ;;
esac
