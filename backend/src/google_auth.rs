use crate::{
    AppState,
    auth::{AuthUser, LoginResponse, create_session, hash_token, new_token},
    error::ApiError,
};
use axum::{Json, extract::State, http::StatusCode};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::OnceLock;
use tokio::sync::Mutex;
#[derive(Clone, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    email_verified: bool,
    nonce: String,
    name: Option<String>,
    azp: Option<String>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Credential {
    credential: String,
}
fn client_id() -> Result<String, ApiError> {
    std::env::var("GOOGLE_OIDC_CLIENT_ID")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .ok_or(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "La connexion Google n’est pas configurée.",
        ))
}
fn rejected() -> ApiError {
    ApiError(
        StatusCode::UNAUTHORIZED,
        "Identité Google invalide ou expirée. Réessayez la connexion.",
    )
}
fn verify(token: &str, keys: &JwkSet, audience: &str) -> Result<Claims, ApiError> {
    let header = decode_header(token).map_err(|_| rejected())?;
    if header.alg != Algorithm::RS256 {
        return Err(rejected());
    }
    let key = keys
        .find(header.kid.as_deref().ok_or_else(rejected)?)
        .ok_or_else(rejected)?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[audience]);
    validation.set_issuer(&["https://accounts.google.com", "accounts.google.com"]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    validation.leeway = 30;
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_jwk(key).map_err(|_| rejected())?,
        &validation,
    )
    .map_err(|_| rejected())?
    .claims;
    if !claims.email_verified
        || claims.sub.is_empty()
        || claims.sub.len() > 255
        || claims.email.len() > 254
        || !claims.email.contains('@')
        || claims.nonce.len() != 64
        || claims.azp.as_ref().is_some_and(|azp| azp != audience)
    {
        return Err(rejected());
    }
    Ok(claims)
}
async fn keys() -> Result<JwkSet, ApiError> {
    static CACHE: OnceLock<Mutex<Option<(std::time::Instant, JwkSet)>>> = OnceLock::new();
    let mut cache = CACHE.get_or_init(|| Mutex::new(None)).lock().await;
    if let Some((time, keys)) = cache.as_ref() {
        if time.elapsed().as_secs() < 300 {
            return Ok(keys.clone());
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| rejected())?;
    let keys: JwkSet = client
        .get("https://www.googleapis.com/oauth2/v3/certs")
        .send()
        .await
        .map_err(|_| {
            ApiError(
                StatusCode::BAD_GATEWAY,
                "Google est inaccessible. Réessayez.",
            )
        })?
        .error_for_status()
        .map_err(|_| rejected())?
        .json()
        .await
        .map_err(|_| rejected())?;
    *cache = Some((std::time::Instant::now(), keys.clone()));
    Ok(keys)
}
#[utoipa::path(post, path = "/api/auth/google/challenge", responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn challenge(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let client = client_id()?;
    let nonce = new_token();
    sqlx::query("DELETE FROM oidc_challenges WHERE expires_at<now()")
        .execute(&state.pool)
        .await?;
    sqlx::query("INSERT INTO oidc_challenges(nonce_hash) VALUES($1)")
        .bind(hash_token(&nonce))
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({"clientId":client,"nonce":nonce})))
}
async fn identity(state: &AppState, input: Credential) -> Result<Claims, ApiError> {
    if input.credential.len() > 16000 {
        return Err(rejected());
    }
    let claims = verify(&input.credential, &keys().await?, &client_id()?)?;
    consume_nonce(&state.pool, &claims.nonce).await?;
    Ok(claims)
}
async fn consume_nonce(pool: &sqlx::PgPool, nonce: &str) -> Result<(), ApiError> {
    let result =
        sqlx::query("DELETE FROM oidc_challenges WHERE nonce_hash=$1 AND expires_at>now()")
            .bind(hash_token(nonce))
            .execute(pool)
            .await?;
    if result.rows_affected() != 1 {
        return Err(rejected());
    }
    Ok(())
}
#[utoipa::path(post, path = "/api/auth/google/login", request_body = Credential, responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<Credential>,
) -> Result<(axum::http::HeaderMap, Json<LoginResponse>), ApiError> {
    let claims = identity(&state, input).await?;
    let mut tx = state.pool.begin().await?;
    // Serialize creation for one Google subject, including the first connection.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(&claims.sub)
        .execute(&mut *tx)
        .await?;
    let existing: Option<uuid::Uuid> =
        sqlx::query_scalar("SELECT user_id FROM google_identities WHERE subject=$1")
            .bind(&claims.sub)
            .fetch_optional(&mut *tx)
            .await?;
    let id = if let Some(id) = existing {
        id
    } else {
        let email_exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=lower($1))")
                .bind(&claims.email)
                .fetch_one(&mut *tx)
                .await?;
        if email_exists {
            return Err(ApiError(
                StatusCode::CONFLICT,
                "Un compte Lumi utilise déjà cette adresse. Connectez-vous avec votre méthode habituelle, puis associez Google depuis Mon compte.",
            ));
        }
        let id = uuid::Uuid::new_v4();
        let password =
            tokio::task::spawn_blocking(|| bcrypt::hash(new_token(), bcrypt::DEFAULT_COST))
                .await
                .map_err(|_| rejected())?
                .map_err(|_| rejected())?;
        let name = claims
            .name
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "Utilisateur Google".into())
            .chars()
            .take(100)
            .collect::<String>();
        sqlx::query("INSERT INTO users(id,email,name,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())").bind(id).bind(&claims.email).bind(name).bind(password).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO user_roles(user_id,role) VALUES($1,'perso')")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO google_identities(subject,user_id) VALUES($1,$2)")
            .bind(&claims.sub)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        id
    };
    let session = create_session(&mut tx, id).await?;
    tx.commit().await?;
    Ok(crate::auth::session_response(session))
}
#[utoipa::path(post, path = "/api/auth/google/link", request_body = Credential, responses((status = 200, description = "Succès"), (status = 400, description = "Paramètres invalides"), (status = 401, description = "Authentification requise")))]
pub async fn link(
    user: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<Credential>,
) -> Result<StatusCode, ApiError> {
    let claims = identity(&state, input).await?;
    let mut tx = state.pool.begin().await?;
    let email: String = sqlx::query_scalar("SELECT email FROM users WHERE id=$1 FOR UPDATE")
        .bind(user.id)
        .fetch_one(&mut *tx)
        .await?;
    if !email.eq_ignore_ascii_case(&claims.email) {
        return Err(ApiError::invalid(
            "Utilisez le compte Google portant la même adresse e-mail que votre compte Lumi.",
        ));
    }
    let existing: Option<String> =
        sqlx::query_scalar("SELECT subject FROM google_identities WHERE user_id=$1")
            .bind(user.id)
            .fetch_optional(&mut *tx)
            .await?;
    if existing
        .as_ref()
        .is_some_and(|subject| subject != &claims.sub)
    {
        return Err(ApiError::invalid(
            "Un autre compte Google est déjà associé.",
        ));
    }
    sqlx::query(
        "INSERT INTO google_identities(subject,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    )
    .bind(&claims.sub)
    .bind(user.id)
    .execute(&mut *tx)
    .await?;
    let owner: uuid::Uuid =
        sqlx::query_scalar("SELECT user_id FROM google_identities WHERE subject=$1")
            .bind(claims.sub)
            .fetch_one(&mut *tx)
            .await?;
    if owner != user.id {
        return Err(ApiError::invalid(
            "Ce compte Google est déjà associé à un autre compte Lumi.",
        ));
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unsigned_or_malformed_credentials() {
        let keys = JwkSet { keys: vec![] };
        for token in ["", "not-a-jwt", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhIn0."] {
            assert!(verify(token, &keys, "expected").is_err());
        }
    }
    #[test]
    fn validates_signature_audience_issuer_expiration_nonce_and_verified_email() {
        let keys: JwkSet =
            serde_json::from_str(include_str!("../tests/fixtures/oidc-test-jwks.json")).unwrap();
        let key = jsonwebtoken::EncodingKey::from_rsa_pem(include_bytes!(
            "../tests/fixtures/oidc-test-key.pem"
        ))
        .unwrap();
        let mut header = jsonwebtoken::Header::new(Algorithm::RS256);
        header.kid = Some("test".into());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let claims = json!({"sub":"google-user","email":"test@example.com","email_verified":true,"nonce":"a".repeat(64),"iss":"https://accounts.google.com","aud":"client","azp":"client","exp":now+300});
        let sign = |value: &Value| jsonwebtoken::encode(&header, value, &key).unwrap();
        assert!(verify(&sign(&claims), &keys, "client").is_ok());
        for (field, value) in [
            ("aud", json!("wrong")),
            ("iss", json!("https://evil.example")),
            ("exp", json!(now - 120)),
            ("email_verified", json!(false)),
            ("nonce", json!("")),
            ("azp", json!("wrong")),
        ] {
            let mut invalid = claims.clone();
            invalid[field] = value;
            assert!(verify(&sign(&invalid), &keys, "client").is_err(), "{field}");
        }
        let mut forged = sign(&claims);
        let last = forged.len() - 5;
        forged.replace_range(last..last + 1, "!");
        assert!(verify(&forged, &keys, "client").is_err());
    }
    #[sqlx::test]
    async fn nonce_is_single_use_and_expires(pool: sqlx::PgPool) {
        let nonce = "a".repeat(64);
        sqlx::query("INSERT INTO oidc_challenges(nonce_hash) VALUES($1)")
            .bind(hash_token(&nonce))
            .execute(&pool)
            .await
            .unwrap();
        assert!(consume_nonce(&pool, &nonce).await.is_ok());
        assert!(consume_nonce(&pool, &nonce).await.is_err());
        sqlx::query("INSERT INTO oidc_challenges(nonce_hash,expires_at) VALUES($1,now()-interval '1 second')").bind(hash_token(&nonce)).execute(&pool).await.unwrap();
        assert!(consume_nonce(&pool, &nonce).await.is_err());
    }
}
