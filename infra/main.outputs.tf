locals {
  functions_variables = {
    SESSION_SECRET                  = random_id.session_secret.b64_std
    INSTANCE_CONNECTION_NAME        = google_sql_database_instance.instance.connection_name
    DATABASE_HOST                   = google_sql_database_instance.instance.public_ip_address
    DATABASE_NAME                   = google_sql_database.database.name
    DATABASE_PORT                   = 5432
    DATABASE_USER                   = google_sql_user.functions.name
    DATABASE_PASSWORD               = random_password.database.result
    CLIENT_ID                       = var.client_id
    CLIENT_SECRET                   = var.client_secret
    QUEUE_ID_FETCH_ACTIVITIES       = google_cloud_tasks_queue.fetch_activities.id
    QUEUE_ID_WING_ACTIVITY          = google_cloud_tasks_queue.wing_activity.id
    QUEUE_ID_UPDATE_SINGLE_ACTIVITY = google_cloud_tasks_queue.update_single_activity.id
    TASKS_URL                       = "https://tasks.${local.domain}"
    API_URL                         = "https://api.${local.domain}"

    # The session cookie is set by the webhooks service on webhooks.<domain> but has
    # to be readable by the site on the apex, so it is scoped to the apex rather than
    # the subdomain that sets it. SITE_URL is where OAuth hands the browser back.
    # Both were previously hardcoded to the old domain in functions/src/jwt.ts and
    # functions/src/webhooks/handleCode.ts.
    COOKIE_DOMAIN            = local.domain
    SITE_URL                 = "https://${local.domain}"
    SITE_PORT                = 80
    TASKS_PORT               = 3000
    WEBHOOKS_PORT            = 4000
    API_PORT                 = 81
    FFVL_KEY                 = var.ffvl_key
    NEXT_PUBLIC_MAPBOX_TOKEN = var.mapbox_token
  }
  compose_variables = {
    SESSION_SECRET              = random_id.session_secret.b64_std
    PRODUCION_DATABASE_HOST     = google_sql_database_instance.instance.public_ip_address
    PRODUCION_DATABASE_NAME     = google_sql_database.database.name
    PRODUCION_DATABASE_PORT     = 5432
    PRODUCION_DATABASE_USER     = google_sql_user.functions.name
    PRODUCION_DATABASE_PASSWORD = random_password.database.result
    CLIENT_ID                   = var.client_id
    CLIENT_SECRET               = var.client_secret
    TASKS_PORT                  = 3000
    TASKS_URL                   = "http://tasks:3000"
    LOCAL_DATABASE_HOST         = "database"
    LOCAL_DATABASE_USER         = "functions"
    LOCAL_DATABASE_PASSWORD     = "password"
    LOCAL_DATABASE_NAME         = "local"
    SITE_PORT                   = 80
    WEBHOOKS_PORT               = 4000
    API_PORT                    = 81
    API_URL                     = "http://api:81"

    # Cookies on localhost must be set with no Domain attribute at all — a literal
    # "localhost" is rejected by browsers as a domain scope. jwt.ts treats an empty
    # COOKIE_DOMAIN as "host-only cookie", which is the correct local behaviour.
    COOKIE_DOMAIN = ""
    SITE_URL      = "http://localhost"
    DEBUG         = 1
    FFVL_KEY      = var.ffvl_key
  }
}


resource "local_file" "functions_envs" {
  content = join("\n", flatten([
    for key, value in local.functions_variables : [
      "${key}=${value}"
    ]
  ]))
  filename = "${path.module}/../functions/.env"
}

resource "local_file" "compose_envs" {
  content = join("\n", flatten([
    for key, value in local.compose_variables : [
      "${key}=${value}"
    ]
  ]))
  filename = "${path.module}/../.env"
}