/**
 * RoboCraft backend on AWS — one EC2 instance running the existing single-image
 * backend (Dockerfile + scripts/start-backend.sh) behind Caddy for TLS.
 *
 * Why one instance instead of ECS/App Runner: the stack is seven Bun processes
 * that share one public port plus a Redis instance. That is exactly what the
 * `Dockerfile` already builds, and a single box keeps the cost near zero and the
 * topology identical to the Render container (see DEPLOY.md). Nothing here is
 * highly available; it is a demo/production-lite target, not an SLA target.
 *
 * Layout on the host (all outside the repo, so `git pull` never fights it):
 *
 *   /srv/robocraft/app         rsync'd checkout (deploy.sh)
 *   /srv/robocraft/compose.yaml
 *   /srv/robocraft/Caddyfile
 *   /srv/robocraft/backend.env  secrets, uploaded by deploy.sh, never committed
 */

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "robocraft"
      Component = "backend"
      ManagedBy = "terraform"
    }
  }
}

# Ubuntu 24.04 LTS from Canonical — Docker's convenience script and apt both
# behave predictably on it, unlike Amazon Linux 2023's dnf-only world.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-${var.architecture}-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# The instance is reachable only by SSH from the operator, plus 80/443 for Caddy
# (Let's Encrypt HTTP-01 needs 80 open; 443 serves the API).
resource "aws_security_group" "backend" {
  name        = "${var.name}-backend"
  description = "RoboCraft backend: HTTP/S from anywhere, SSH from the operator"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (ACME challenge + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS (API + admin proxy target)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH from the operator's current address"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  egress {
    description = "Outbound: Neon Postgres, Neon storage, Resend, Docker Hub, apt"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-backend" }
}

resource "aws_key_pair" "deploy" {
  key_name   = "${var.name}-deploy"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = sort(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids = [aws_security_group.backend.id]
  key_name               = aws_key_pair.deploy.key_name

  user_data = file("${path.module}/cloud-init.sh")

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    encrypted   = true
  }

  # IMDSv2 only: the instance holds production secrets in backend.env, so it
  # must not be readable through the legacy token-less metadata endpoint.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  # Provisioning runs once. deploy.sh handles every later code change, so a
  # user_data edit should not silently replace a live instance.
  user_data_replace_on_change = false

  tags = { Name = "${var.name}-backend" }
}

# A stable address: the TLS certificate is issued for a name derived from this
# IP, so it must not change across stop/start cycles.
resource "aws_eip" "backend" {
  domain = "vpc"
  tags   = { Name = "${var.name}-backend" }
}

resource "aws_eip_association" "backend" {
  instance_id   = aws_instance.backend.id
  allocation_id = aws_eip.backend.id
}
