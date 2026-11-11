use crate::{AppState, MessageResponse, auth, error::ApiError};
use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;
use sqlx::{PgConnection, Postgres, Transaction};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EmailRequest {
    pub email: String,
}
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TokenRequest {
    pub token: String,
}
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ResetRequest {
    pub token: String,
    pub password: String,
}
const GENERIC: &str = "Si cette adresse correspond à un compte éligible, un lien vous sera envoyé. Vérifiez vos courriers indésirables. Patientez au moins une minute avant un nouvel envoi.";

/// SMTP is bounded, and no raw token is stored or returned by the API.
/// Lock order for every flow is users -> email_tokens to serialize issue/consume/reset.
pub async fn request_link(state: &AppState, email: &str, purpose: &str) -> Result<bool, ApiError> {
    let email = email.trim().to_lowercase();
    if email.len() > 254 || email.parse::<lettre::Address>().is_err() {
        return Err(ApiError::invalid("Adresse e-mail invalide."));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM email_requests WHERE window_start < now() - interval '1 day'")
        .execute(&mut *tx)
        .await?;
    let permitted: Option<i32> = sqlx::query_scalar(
        "INSERT INTO email_requests (address_hash) VALUES ($1)
         ON CONFLICT (address_hash) DO UPDATE SET
           requests = CASE WHEN email_requests.window_start < now() - interval '1 hour' THEN 1 ELSE email_requests.requests + 1 END,
           window_start = CASE WHEN email_requests.window_start < now() - interval '1 hour' THEN now() ELSE email_requests.window_start END,
           last_sent_at = now()
         WHERE email_requests.last_sent_at <= now() - interval '1 minute'
           AND (email_requests.requests < 5 OR email_requests.window_start < now() - interval '1 hour')
         RETURNING requests"
    ).bind(auth::hash_token(&email)).fetch_optional(&mut *tx).await?;
    if permitted.is_none() {
        tx.commit().await?;
        return Ok(false);
    }
    let account: Option<(Uuid, bool)> = sqlx::query_as(
        "SELECT id, email_verified_at IS NOT NULL FROM users WHERE lower(email)=$1 FOR UPDATE",
    )
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some((id, verified)) = account {
        if (purpose == "verify" && !verified)
            || (purpose == "magic" && verified)
            || purpose == "reset"
        {
            let token = auth::new_token();
            let seconds = match purpose {
                "verify" => 86400,
                "magic" => 900,
                _ => 1800,
            };
            // Keep the previous link valid if SMTP fails.
            sqlx::query("SAVEPOINT mail_delivery")
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO email_tokens (token_hash,user_id,purpose,expires_at) VALUES ($1,$2,$3,now()+make_interval(secs => $4))
                ON CONFLICT (user_id,purpose) DO UPDATE SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at")
                .bind(auth::hash_token(&token)).bind(id).bind(purpose).bind(f64::from(seconds)).execute(&mut *tx).await?;
            if state
                .mailer
                .send_link(&email, purpose, &token)
                .await
                .is_err()
            {
                eprintln!("Envoi du courrier {purpose} impossible ; vérifier le service SMTP.");
                sqlx::query("ROLLBACK TO SAVEPOINT mail_delivery")
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await?;
                return Ok(false);
            }
            tx.commit().await?;
            return Ok(true);
        }
    }
    tx.commit().await?;
    Ok(false)
}

macro_rules! request_endpoint {
    ($name:ident, $purpose:literal, $path:literal) => {
        #[utoipa::path(post, path=$path, request_body=EmailRequest, responses((status=200,body=MessageResponse),(status=400,body=MessageResponse)))]
        pub async fn $name(State(state): State<AppState>, Json(input): Json<EmailRequest>) -> Result<Json<MessageResponse>, ApiError> {
            request_link(&state, &input.email, $purpose).await?;
            Ok(Json(MessageResponse { message: GENERIC }))
        }
    };
}
request_endpoint!(resend_verification, "verify", "/api/auth/email/resend");
request_endpoint!(request_magic, "magic", "/api/auth/magic/request");
request_endpoint!(forgot_password, "reset", "/api/auth/password/forgot");

fn invalid_link() -> ApiError {
    ApiError(
        StatusCode::BAD_REQUEST,
        "Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien.",
    )
}
async fn consume(
    tx: &mut Transaction<'_, Postgres>,
    token: &str,
    purpose: &str,
) -> Result<Uuid, ApiError> {
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(invalid_link());
    }
    let hash = auth::hash_token(token);
    let id: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM email_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()",
    )
    .bind(&hash)
    .bind(purpose)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(invalid_link)?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(id)
        .fetch_one(&mut **tx)
        .await?;
    let consumed: Option<Uuid> = sqlx::query_scalar("DELETE FROM email_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id")
        .bind(hash).bind(purpose).fetch_optional(&mut **tx).await?;
    consumed.ok_or_else(invalid_link)
}

#[utoipa::path(post,path="/api/auth/email/confirm",request_body=TokenRequest,responses((status=200,body=MessageResponse),(status=400,body=MessageResponse)))]
pub async fn confirm_email(
    State(state): State<AppState>,
    Json(input): Json<TokenRequest>,
) -> Result<Json<MessageResponse>, ApiError> {
    let mut tx = state.pool.begin().await?;
    let id = consume(&mut tx, &input.token, "verify").await?;
    sqlx::query("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(MessageResponse {
        message: "Votre adresse e-mail est confirmée. Vous pouvez vous connecter.",
    }))
}

#[utoipa::path(post,path="/api/auth/magic/consume",request_body=TokenRequest,responses((status=200,body=auth::LoginResponse),(status=400,body=MessageResponse),(status=403,body=MessageResponse)))]
pub async fn consume_magic(
    State(state): State<AppState>,
    Json(input): Json<TokenRequest>,
) -> Result<(axum::http::HeaderMap, Json<auth::LoginResponse>), ApiError> {
    let mut tx = state.pool.begin().await?;
    let id = consume(&mut tx, &input.token, "magic").await?;
    let result = auth::create_session(&mut tx, id).await?;
    tx.commit().await?;
    Ok(auth::session_response(result))
}

#[utoipa::path(post,path="/api/auth/password/reset",request_body=ResetRequest,responses((status=200,body=MessageResponse),(status=400,body=MessageResponse)))]
pub async fn reset_password(
    State(state): State<AppState>,
    Json(input): Json<ResetRequest>,
) -> Result<Json<MessageResponse>, ApiError> {
    auth::validate_password(&input.password)?;
    let mut tx = state.pool.begin().await?;
    let id = consume(&mut tx, &input.token, "reset").await?;
    let hash =
        tokio::task::spawn_blocking(move || bcrypt::hash(input.password, bcrypt::DEFAULT_COST))
            .await
            .map_err(|_| auth::internal())?
            .map_err(|_| auth::internal())?;
    reset_credentials(&mut tx, id, &hash).await?;
    tx.commit().await?;
    Ok(Json(MessageResponse {
        message: "Mot de passe modifié. Vos sessions ont été fermées. Connectez-vous avec votre nouveau mot de passe.",
    }))
}
async fn reset_credentials(
    connection: &mut PgConnection,
    id: Uuid,
    hash: &str,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE users SET password_hash=$1 WHERE id=$2")
        .bind(hash)
        .bind(id)
        .execute(&mut *connection)
        .await?;
    sqlx::query("DELETE FROM sessions WHERE user_id=$1")
        .bind(id)
        .execute(&mut *connection)
        .await?;
    sqlx::query("DELETE FROM email_tokens WHERE user_id=$1")
        .bind(id)
        .execute(&mut *connection)
        .await?;
    Ok(())
}
