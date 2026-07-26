resource "random_password" "database" {
  length  = 16
  special = true
}

resource "google_sql_database_instance" "instance" {
  name             = "instance"
  region           = local.region
  database_version = "POSTGRES_14"
  root_password    = random_password.database.result
  settings {
    availability_type = "ZONAL"
    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "Chamonix"
        value = "79.88.5.26/32"
      }
      authorized_networks {
        name  = "Losserands"
        value = "81.220.110.158/32"
      }
    }
    # Was data.google_sql_tiers.tiers.tiers[0].tier — index 0 of an
    # API-returned list, so a reordering upstream would silently propose a tier
    # change on the live database. Pinned to the tier the instance actually runs.
    tier = "db-f1-micro"
  }

  # Deploys now auto-apply on merge to main, so an accidental destroy would run
  # unattended. This is the backstop behind the plan-time destroy guard in
  # .github/workflows/deploy.yml.
  deletion_protection = true
}

resource "google_sql_database" "database" {
  name     = "database"
  instance = google_sql_database_instance.instance.name
}

resource "google_sql_user" "functions" {
  name     = "functions"
  instance = google_sql_database_instance.instance.name
  password = random_password.database.result
}

