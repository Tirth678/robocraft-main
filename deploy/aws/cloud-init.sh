#!/usr/bin/env bash
# First-boot provisioning for the RoboCraft backend host (Ubuntu 24.04).
#
# Runs once as root via EC2 user_data. It deliberately does NOT clone the repo:
# code arrives later over rsync from deploy.sh, which keeps this script from
# needing a GitHub credential and keeps `terraform apply` independent of the
# current commit.
set -euo pipefail
exec > >(tee -a /var/log/robocraft-provision.log) 2>&1

echo "[provision] starting $(date -Is)"

# ------------------------------------------------------------------ swap
# Docker builds (bun install + image layers) are the memory peak on a 2 GB
# box; swap keeps a build from being OOM-killed mid-run.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "[provision] 2G swap enabled"
fi

# ------------------------------------------------------------------ docker
# Official convenience script: installs docker-ce + the compose plugin from
# Docker's apt repo. Ubuntu's own docker.io package ships an older Compose v1.
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl rsync
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  echo "[provision] docker installed"
fi

systemctl enable --now docker
usermod -aG docker ubuntu

# ------------------------------------------------------------------ layout
# The deployment root lives outside the repo so a re-sync never touches
# backend.env or Caddy's certificates.
install -d -o ubuntu -g ubuntu /srv/robocraft
install -d -o ubuntu -g ubuntu /srv/robocraft/app
install -d -o ubuntu -g ubuntu /srv/robocraft/caddy

# Unattended security upgrades: this host is internet-facing with a public IP.
if ! dpkg -l unattended-upgrades >/dev/null 2>&1; then
  apt-get install -y unattended-upgrades
fi

echo "[provision] finished $(date -Is) — docker $(docker --version)"
