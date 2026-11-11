use crate::{AppState, auth::AuthUser, error::ApiError};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Serialize, FromRow)]
pub struct Dashboard {
    id: Uuid,
    name: String,
    widgets: Value,
    revision: i64,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DashboardInput {
    name: String,
    widgets: Value,
    revision: Option<i64>,
}
fn validate(input: &DashboardInput) -> Result<(), ApiError> {
    if input.name.trim().is_empty() || input.name.chars().count() > 80 {
        return Err(ApiError::invalid(
            "Nom du dashboard invalide (1 à 80 caractères).",
        ));
    }
    let widgets = input
        .widgets
        .as_array()
        .ok_or(ApiError::invalid("Liste de widgets invalide."))?;
    if widgets.len() > 100 {
        return Err(ApiError::invalid("Maximum 100 widgets par dashboard."));
    }
    let mut ids = std::collections::HashSet::new();
    for widget in widgets {
        let obj = widget
            .as_object()
            .ok_or(ApiError::invalid("Widget invalide."))?;
        let kind = widget["type"].as_str().unwrap_or("");
        let specific: &[&str] = match kind {
            "habits" => &["habits"],
            "notes" => &["content"],
            "focus" => &["duration", "completed"],
            "weather" => &["city", "temperature", "condition"],
            "agenda" | "calendar_week" | "openai_chat" => &[],
            "github_pushes" | "github_graph" => &["githubRepo", "githubLimit"],
            "gmail_unread" | "gmail_compose" => &["gmailClientId", "gmailLimit", "gmailAccount"],
            "spotify_player" | "spotify_top" => &["clientId", "timeRange", "limit"],
            _ => return Err(ApiError::invalid("Type de widget inconnu.")),
        };
        for (key, value) in obj {
            if ![
                "id",
                "type",
                "title",
                "x",
                "y",
                "width",
                "height",
                "refreshInterval",
            ]
            .contains(&key.as_str())
                && !specific.contains(&key.as_str())
            {
                return Err(ApiError::invalid("Paramètre de widget non autorisé."));
            }
            if kind == "habits" && key == "habits" {
                crate::habits::validate(value)?;
                continue;
            }
            if value.is_object()
                || value.is_array()
                || value.as_str().is_some_and(|s| s.len() > 8000)
            {
                return Err(ApiError::invalid("Paramètre trop long ou invalide."));
            }
        }
        for key in [
            "content",
            "city",
            "temperature",
            "condition",
            "githubRepo",
            "gmailClientId",
            "gmailAccount",
            "clientId",
        ] {
            if obj.get(key).is_some_and(|value| !value.is_string()) {
                return Err(ApiError::invalid("Paramètre texte invalide."));
            }
        }
        if kind == "weather"
            && obj.get("city").is_some_and(|v| {
                !v.as_str()
                    .is_some_and(|s| s.trim().chars().count() >= 2 && s.chars().count() <= 80)
            })
        {
            return Err(ApiError::invalid("Ville invalide (2 à 80 caractères)."));
        }
        if kind.starts_with("github_") {
            let repo = widget["githubRepo"].as_str().unwrap_or("");
            let parts: Vec<_> = repo.split('/').collect();
            if parts.len() != 2
                || parts.iter().any(|part| part.is_empty())
                || parts[1] == ".."
                || !parts[0]
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
                || !parts[1]
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
            {
                return Err(ApiError::invalid("Dépôt GitHub invalide."));
            }
        }
        if let Some(seconds) = obj.get("refreshInterval").and_then(|v| v.as_u64()) {
            let min = if kind.starts_with("github_") || kind == "weather" {
                300
            } else if kind == "spotify_player" {
                5
            } else {
                30
            };
            let max = if kind == "spotify_player" { 120 } else { 3600 };
            if seconds < min || seconds > max {
                return Err(ApiError::invalid(
                    "Intervalle de rafraîchissement invalide.",
                ));
            }
        }
        let id = &widget["id"];
        if !(id.is_string() || id.is_u64()) || !ids.insert(id.to_string()) {
            return Err(ApiError::invalid(
                "Identifiants de widgets invalides ou dupliqués.",
            ));
        }
        if !widget["title"]
            .as_str()
            .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 80)
        {
            return Err(ApiError::invalid("Titre de widget invalide."));
        }
        for (key, max) in [("x", 12), ("y", 1000), ("width", 12), ("height", 6)] {
            if !widget[key].as_u64().is_some_and(|v| v >= 1 && v <= max) {
                return Err(ApiError::invalid("Taille ou position invalide."));
            }
        }
        if widget["x"].as_u64().unwrap() + widget["width"].as_u64().unwrap() > 13 {
            return Err(ApiError::invalid("Le widget dépasse la grille."));
        }
        for (key, min, max) in [
            ("refreshInterval", 5, 3600),
            ("duration", 5, 120),
            ("gmailLimit", 1, 20),
            ("githubLimit", 1, 20),
            ("limit", 1, 10),
        ] {
            if let Some(v) = obj.get(key) {
                if !v.as_u64().is_some_and(|n| n >= min && n <= max) {
                    return Err(ApiError::invalid("Paramètre numérique hors limites."));
                }
            }
        }
        if let Some(v) = obj.get("timeRange") {
            if !matches!(v.as_str(), Some("short_term" | "medium_term" | "long_term")) {
                return Err(ApiError::invalid("Période Spotify invalide."));
            }
        }
    }
    Ok(())
}
// Existing instances remain stored when a service is disabled; the UI pauses them.
// New instances (including imports and type changes) require an active subscription.
async fn validate_subscriptions(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    widgets: &Value,
    previous: &Value,
) -> Result<(), ApiError> {
    let active: Vec<String> =
        sqlx::query_scalar("SELECT service FROM service_subscriptions WHERE user_id=$1")
            .bind(user_id)
            .fetch_all(&mut **tx)
            .await?;
    for widget in widgets.as_array().into_iter().flatten() {
        let service = match widget["type"].as_str().unwrap_or("") {
            "agenda" | "calendar_week" => "google_calendar",
            "gmail_unread" | "gmail_compose" => "gmail",
            "spotify_player" | "spotify_top" => "spotify",
            "github_pushes" | "github_graph" => "github",
            "openai_chat" => "openai",
            _ => continue,
        };
        let existing = previous
            .as_array()
            .into_iter()
            .flatten()
            .any(|old| old["id"] == widget["id"] && old["type"] == widget["type"]);
        if !existing && !active.iter().any(|s| s == service) {
            return Err(ApiError(
                StatusCode::FORBIDDEN,
                "Activez le service dans Mes services avant d’ajouter ou d’importer ses widgets.",
            ));
        }
    }
    Ok(())
}
#[utoipa::path(get, path = "/api/dashboards", responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn list(
    user: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<Dashboard>>, ApiError> {
    Ok(Json(sqlx::query_as("SELECT id,name,widgets,revision FROM user_dashboards WHERE user_id=$1 ORDER BY created_at,id").bind(user.id).fetch_all(&state.pool).await?))
}
#[utoipa::path(post, path = "/api/dashboards", request_body = DashboardInput, responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn create(
    user: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<DashboardInput>,
) -> Result<(StatusCode, Json<Dashboard>), ApiError> {
    validate(&input)?;
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    validate_subscriptions(&mut tx, user.id, &input.widgets, &Value::Null).await?;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM user_dashboards WHERE user_id=$1")
        .bind(user.id)
        .fetch_one(&mut *tx)
        .await?;
    if count >= 20 {
        return Err(ApiError::invalid("Maximum 20 dashboards par compte."));
    }
    let item = sqlx::query_as("INSERT INTO user_dashboards(id,user_id,name,widgets) VALUES($1,$2,$3,$4) RETURNING id,name,widgets,revision").bind(Uuid::new_v4()).bind(user.id).bind(input.name.trim()).bind(input.widgets).fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(item)))
}
#[utoipa::path(put, path = "/api/dashboards/{id}", request_body = DashboardInput, params(("id" = Uuid, Path, description = "Identifiant")), responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn update(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<DashboardInput>,
) -> Result<Json<Dashboard>, ApiError> {
    validate(&input)?;
    let revision = input
        .revision
        .ok_or(ApiError::invalid("Version de sauvegarde requise."))?;
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    let previous: Option<Value> =
        sqlx::query_scalar("SELECT widgets FROM user_dashboards WHERE id=$1 AND user_id=$2")
            .bind(id)
            .bind(user.id)
            .fetch_optional(&mut *tx)
            .await?;
    validate_subscriptions(
        &mut tx,
        user.id,
        &input.widgets,
        &previous.unwrap_or(Value::Null),
    )
    .await?;
    let item = sqlx::query_as("UPDATE user_dashboards SET name=$3,widgets=$4,revision=revision+1 WHERE id=$1 AND user_id=$2 AND revision=$5 RETURNING id,name,widgets,revision").bind(id).bind(user.id).bind(input.name.trim()).bind(input.widgets).bind(revision).fetch_optional(&mut *tx).await?;
    tx.commit().await?;
    item.map(Json).ok_or(ApiError(
        StatusCode::CONFLICT,
        "Dashboard modifié ailleurs ou inaccessible. Rechargez la sauvegarde avant de réessayer.",
    ))
}
#[utoipa::path(delete, path = "/api/dashboards/{id}", params(("id" = Uuid, Path, description = "Identifiant")), responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn remove(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("DELETE FROM user_dashboards WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(user.id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get, path = "/api/services", responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn services(
    user: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<String>>, ApiError> {
    Ok(Json(
        sqlx::query_scalar(
            "SELECT service FROM service_subscriptions WHERE user_id=$1 ORDER BY service",
        )
        .bind(user.id)
        .fetch_all(&state.pool)
        .await?,
    ))
}
#[utoipa::path(put, path = "/api/services/{service}", params(("service" = String, Path, description = "Service")), responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn subscribe(
    user: AuthUser,
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> Result<StatusCode, ApiError> {
    if !["spotify", "gmail", "google_calendar", "github", "openai"].contains(&service.as_str()) {
        return Err(ApiError::invalid("Service inconnu."));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO service_subscriptions(user_id,service) VALUES($1,$2) ON CONFLICT DO NOTHING",
    )
    .bind(user.id)
    .bind(service)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(delete, path = "/api/services/{service}", params(("service" = String, Path, description = "Service")), responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn unsubscribe(
    user: AuthUser,
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> Result<StatusCode, ApiError> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM service_subscriptions WHERE user_id=$1 AND service=$2")
        .bind(user.id)
        .bind(service)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
