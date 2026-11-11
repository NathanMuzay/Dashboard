use crate::{
    AppState,
    auth::{AuthUser, Role},
    error::ApiError,
};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
#[derive(Serialize, FromRow)]
pub struct User {
    id: Uuid,
    name: String,
    email: String,
    email_verified: bool,
    roles: Vec<String>,
    sessions: i64,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Roles {
    roles: Vec<Role>,
}
#[utoipa::path(get, path = "/api/admin/users", responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn list(
    user: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<User>>, ApiError> {
    user.require_admin()?;
    Ok(Json(sqlx::query_as("SELECT u.id,u.name,u.email,u.email_verified_at IS NOT NULL AS email_verified,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role) AS roles,(SELECT count(*) FROM sessions WHERE user_id=u.id AND expires_at>now()) AS sessions FROM users u ORDER BY lower(u.email) LIMIT 500").fetch_all(&state.pool).await?))
}
#[utoipa::path(put, path = "/api/admin/users/{id}/roles", request_body = Roles, params(("id" = Uuid, Path, description = "Identifiant")), responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn roles(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<Roles>,
) -> Result<StatusCode, ApiError> {
    user.require_admin()?;
    if id == user.id {
        return Err(ApiError::invalid(
            "Vous ne pouvez pas modifier vos propres rôles.",
        ));
    }
    if input.roles.is_empty() || input.roles.len() > 4 {
        return Err(ApiError::invalid("Sélectionnez au moins un rôle."));
    }
    let mut tx = state.pool.begin().await?;
    let exists: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(ApiError(StatusCode::NOT_FOUND, "Utilisateur introuvable."));
    }
    sqlx::query("DELETE FROM user_roles WHERE user_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for role in input.roles {
        sqlx::query("INSERT INTO user_roles(user_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(id)
            .bind(role)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(delete, path = "/api/admin/users/{id}/sessions", params(("id" = Uuid, Path, description = "Identifiant")), responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn revoke(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    user.require_admin()?;
    if id == user.id {
        return Err(ApiError::invalid(
            "Utilisez la déconnexion pour votre propre session.",
        ));
    }
    sqlx::query("DELETE FROM sessions WHERE user_id=$1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
