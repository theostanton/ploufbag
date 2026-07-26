locals {
  project_id = "para-stats"
  region     = "europe-west1"
  domain     = "paragliderstats.com"
}

provider "google" {
  project = local.project_id
  region  = local.region
}

provider "google-beta" {
  project = local.project_id
  region  = local.region
}

# This is the service account in which the functions will act
resource "google_service_account" "function-sa" {
  account_id   = "function-sa"
  description  = "Controls the workflow for the cloud pipeline"
  display_name = "function-sa"
  project      = local.project_id
}


resource "google_project_service" "cloudtasks" {
  service = "cloudtasks.googleapis.com"
  project = local.project_id
}

resource "google_project_service" "cloud_run" {
  service = "run.googleapis.com"
  project = local.project_id
}

resource "google_project_service" "compute" {
  service = "compute.googleapis.com"
}

resource "google_project_service" "cloud_functions" {
  service = "cloudfunctions.googleapis.com"
}

resource "google_project_service" "cloud_build" {
  service = "cloudbuild.googleapis.com"
}

resource "google_project_service" "vpcaccess" {
  service = "vpcaccess.googleapis.com"
}

resource "google_artifact_registry_repository" "docker" {
  location      = local.region
  repository_id = "parastats"
  description   = "Docker repository"
  format        = "DOCKER"
}
