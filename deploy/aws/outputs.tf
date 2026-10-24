locals {
  /**
   * sslip.io resolves `<anything>-<dashed-ip>.sslip.io` to that IP, which lets
   * Let's Encrypt issue a real certificate without owning a domain — required,
   * because both Vercel frontends are HTTPS and would otherwise block calls to
   * a plain-HTTP API as mixed content. Point SITE_ADDRESS at a real domain
   * instead once you have one; nothing else needs to change.
   */
  site_address = "${var.name}-${replace(aws_eip.backend.public_ip, ".", "-")}.sslip.io"
}

output "instance_id" {
  description = "EC2 instance id (for `aws ec2 stop-instances`, CloudWatch, etc.)."
  value       = aws_instance.backend.id
}

output "public_ip" {
  description = "Elastic IP of the backend host."
  value       = aws_eip.backend.public_ip
}

output "site_address" {
  description = "Hostname Caddy serves and gets a certificate for."
  value       = local.site_address
}

output "api_base_url" {
  description = "Gateway origin. This is the storefront's VITE_BACKEND_URL and the admin console's /admin-api rewrite destination."
  value       = "https://${local.site_address}"
}

output "ssh_command" {
  description = "SSH into the host with the deploy key."
  value       = "ssh -i ${pathexpand(var.ssh_public_key_path)} ubuntu@${aws_eip.backend.public_ip}"
}

output "deploy_command" {
  description = "Push the current checkout and restart the stack."
  value       = "./deploy/aws/deploy.sh"
}

output "health_check" {
  description = "Readiness endpoint once Caddy has its certificate (allow ~60s after the first apply)."
  value       = "https://${local.site_address}/health"
}
