terraform {
  required_version = ">= 1.9.0"

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
