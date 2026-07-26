resource "google_cloudfunctions2_function" "api" {
  name     = "api"
  location = local.region

  timeouts {
    create = "10m"
    update = "10m"
  }
  build_config {
    runtime     = "nodejs20"
    entry_point = "api"
    source {
      storage_source {
        bucket = google_storage_bucket.functions.name
        object = google_storage_bucket_object.functions_zip.name
      }
    }
  }

  service_config {
    available_memory   = "128Mi"
    timeout_seconds    = 60
    ingress_settings   = "ALLOW_ALL"
    max_instance_count = 1
    environment_variables = merge(local.functions_variables, {
      DATABASE_HOST = "/cloudsql/${google_sql_database_instance.instance.connection_name}"
    })
  }
}

resource "google_cloud_run_v2_service_iam_binding" "api" {
  name     = google_cloudfunctions2_function.api.name
  location = local.region
  role     = "roles/run.invoker"
  members = ["allUsers"]
}

resource "google_cloud_run_domain_mapping" "api" {
  name     = "api.${local.domain}"
  location = google_cloudfunctions2_function.api.location
  metadata {
    namespace = local.project_id
  }
  spec {
    route_name = google_cloudfunctions2_function.api.name
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