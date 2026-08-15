# The zone is named after the domain it serves, but the resource label is not:
# `dns_name` is ForceNew, so a domain change is always a destroy-and-create. Keeping
# the label domain-neutral means the next migration is a one-line edit to local.domain
# rather than a rename that churns every reference in this file.
#
# The zone `name` deliberately differs from the previous zone's ("parastats-info").
# Managed-zone names are unique per project and Terraform does not guarantee it
# destroys the old zone before creating the new one; reusing the name risks the
# create colliding with a zone that has not been torn down yet.
resource "google_dns_managed_zone" "primary" {
  name          = "ploufbag-com"
  dns_name      = "${local.domain}."
  description   = local.domain
  force_destroy = "true"
}

# Google's fixed anycast addresses for Cloud Run / App Engine custom domains. These
# are not per-project or per-service values and do not change; the domain mapping
# routes on the Host header once traffic arrives.
locals {
  ghs_ipv4 = [
    "216.239.32.21",
    "216.239.34.21",
    "216.239.36.21",
    "216.239.38.21",
  ]
  ghs_ipv6 = [
    "2001:4860:4802:32::15",
    "2001:4860:4802:34::15",
    "2001:4860:4802:36::15",
    "2001:4860:4802:38::15",
  ]

  # Every subdomain fronted by a Cloud Run domain mapping. Keep in step with the
  # google_cloud_run_domain_mapping resources in function.*.tf.
  service_subdomains = ["api", "tasks", "webhooks"]
}

# The apex cannot be a CNAME (RFC 1034 forbids a CNAME coexisting with the zone's
# own SOA and NS records), so the site is reached via A/AAAA to the ghs addresses
# rather than the ghs.googlehosted.com. alias used for the subdomains below.
resource "google_dns_record_set" "apex_ipv4" {
  name         = google_dns_managed_zone.primary.dns_name
  managed_zone = google_dns_managed_zone.primary.name
  type         = "A"
  ttl          = 300
  rrdatas      = local.ghs_ipv4
}

resource "google_dns_record_set" "apex_ipv6" {
  name         = google_dns_managed_zone.primary.dns_name
  managed_zone = google_dns_managed_zone.primary.name
  type         = "AAAA"
  ttl          = 300
  rrdatas      = local.ghs_ipv6
}

resource "google_dns_record_set" "services" {
  for_each = toset(local.service_subdomains)

  name         = "${each.key}.${google_dns_managed_zone.primary.dns_name}"
  managed_zone = google_dns_managed_zone.primary.name
  type         = "CNAME"
  ttl          = 300
  rrdatas      = ["ghs.googlehosted.com."]
}

# Surfaced so the delegation can be copied into the registrar. The nameservers are
# assigned by Google at zone-create time and differ from the destroyed zone's, so
# Namecheap must be repointed at these values before the domain mappings can
# finish provisioning their managed certificates.
output "dns_name_servers" {
  description = "Set these as the nameservers for the primary domain at the registrar."
  value       = google_dns_managed_zone.primary.name_servers
}
