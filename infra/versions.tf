terraform {
  required_version = ">= 1.9.0"

  # State lives in GCS, created out of band (a Terraform-managed state bucket is
  # a chicken-and-egg problem, and this bucket's whole job is to survive). Object
  # versioning is enabled with 10 noncurrent versions retained, so a bad write is
  # a restore rather than a catastrophe. The GCS backend locks natively via object
  # generation numbers — no separate lock table.
  #
  # Treat this bucket as a secret store: secrets are passed as Terraform
  # variables, so state holds the DB password, SESSION_SECRET, the Strava client
  # secret and the webhook secret in plaintext. Public access prevention is
  # enforced and access is limited to the owner plus the CI service account.
  backend "gcs" {
    bucket = "para-stats-tfstate"
    prefix = "infra"
  }

  # Pinned to the versions recovered from the .terraform.lock.hcl that was
  # deleted in commit cef21ee. These are the providers that actually created
  # the live infrastructure, so importing under them avoids schema-drift diffs
  # that would otherwise read as "replace the database". Upgrading is a
  # deliberate, separately-reviewable change.
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.29"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.29"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}
