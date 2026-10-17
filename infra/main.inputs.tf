variable "site_tag" {
  type = string
}

variable "ffvl_key" {
  type = string
}

variable "mapbox_token" {
  type = string
}

variable "strava_webhook_secret" {
  type      = string
  sensitive = true
}

variable "strava_webhook_verify_token" {
  type      = string
  sensitive = true
}

# Strava OAuth application credentials. Previously sourced by regex-parsing
# infra/.env via file(".env"), which made `terraform plan` impossible anywhere
# that file did not exist — including CI. Supplied as TF_VAR_client_id /
# TF_VAR_client_secret.
variable "client_id" {
  type = string
}

variable "client_secret" {
  type      = string
  sensitive = true
}
# Slack Incoming Webhook URL for #ploufbag-events. The functions post failed
# tasks, failed Strava webhook events, and retried tasks that recovered to it
# (functions/src/monitoring/slackNotifier.ts). Empty disables notifications,
# which is the default so plan and deploy work before the secret exists.
# Supplied as TF_VAR_slack_events_webhook_url.
variable "slack_events_webhook_url" {
  type      = string
  sensitive = true
  default   = ""
}
