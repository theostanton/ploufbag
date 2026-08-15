resource "google_cloud_run_v2_service" "site" {
  name     = "site"
  location = local.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  connection {
    port = 80
  }

  template {
    containers {
      env {
        name  = "SESSION_SECRET"
        value = local.functions_variables.SESSION_SECRET
      }
      env {
        name  = "DATABASE_HOST"
        value = "/cloudsql/${local.functions_variables.INSTANCE_CONNECTION_NAME}"
      }
      env {
        name  = "DATABASE_NAME"
        value = local.functions_variables.DATABASE_NAME
      }
      env {
        name  = "DATABASE_USER"
        value = local.functions_variables.DATABASE_USER
      }
      env {
        name  = "DATABASE_PASSWORD"
        value = local.functions_variables.DATABASE_PASSWORD
      }
      env {
        name  = "TASKS_URL"
        value = local.functions_variables.TASKS_URL
      }
      image = "europe-west1-docker.pkg.dev/para-stats/parastats/parastats-site:${var.site_tag}"
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.instance.connection_name]
      }
    }
  }
}

resource "google_cloud_run_domain_mapping" "site" {
  name     = local.domain
  location = google_cloud_run_v2_service.site.location
  metadata {
    namespace = local.project_id
  }
  spec {
    route_name = google_cloud_run_v2_service.site.name
  }

  # GCP injects system labels onto domain mappings (cloud.googleapis.com/location,
  # run.googleapis.com/overrideAt). Labels are ForceNew on this legacy v1 resource,
  # so the provider reconciling them means destroy-and-recreate — which restarts
  # managed-certificate provisioning and, with DNS currently resolving nothing,
  # would leave the mapping stuck pending indefinitely.
  #
  # DO NOT "tidy this away". Terraform emits "Redundant ignore_changes element"
  # here because terraform_labels is provider-computed, but removing it brings
  # the destroy straight back — verified. Nor is labels/effective_labels a
  # substitute; terraform_labels is specifically the ForceNew path. This is a
  # rough edge in the google provider's three-way label model.
  lifecycle {
    ignore_changes = [metadata[0].terraform_labels]
  }
}

resource "google_cloud_run_v2_service_iam_binding" "site" {
  name     = google_cloud_run_v2_service.site.name
  location = local.region
  role     = "roles/run.invoker"
  members = ["allUsers"]
}
