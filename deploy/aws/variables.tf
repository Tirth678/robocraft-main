variable "name" {
  description = "Prefix for every resource this creates."
  type        = string
  default     = "robocraft"
}

variable "region" {
  description = "AWS region. ap-south-1 keeps latency to India low; anything else works."
  type        = string
  default     = "ap-south-1"
}

variable "instance_type" {
  description = <<-EOT
    Host size. The seven Bun processes plus Redis and Caddy need real memory:
    t4g.small (2 GB, ~$12/mo) builds the image comfortably. t4g.micro (1 GB) is
    cheaper and works with the swap the provisioning script adds, but image
    builds get slow. Fargate-style sizing does not apply here — it is one box.
  EOT
  type        = string
  default     = "t4g.small"
}

variable "architecture" {
  description = "ami architecture: arm64 for t4g.*, x86_64 for t3.*. Must match instance_type."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "amd64"], var.architecture)
    error_message = "architecture must be arm64 (t4g.*) or amd64 (t3.*/t2.*)."
  }
}

variable "root_volume_gb" {
  description = "Root EBS size. The Bun image install plus Docker layers fit in ~10 GB; 30 is the free-tier ceiling."
  type        = number
  default     = 30
}

variable "ssh_cidr" {
  description = <<-EOT
    CIDR allowed to reach port 22. Always narrow this to your own address —
    deploy/deploy.sh passes $(curl -s ifconfig.me)/32 automatically. The default
    is open only so a plan/apply without flags still validates; do not leave it.
  EOT
  type        = string
  default     = "0.0.0.0/0"
}

variable "ssh_public_key_path" {
  description = "Public key registered for the deploy user. deploy.sh generates it if missing."
  type        = string
  default     = "~/.ssh/robocraft-aws.pub"
}
