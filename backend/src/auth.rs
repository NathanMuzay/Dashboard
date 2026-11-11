use crate::{AppState, MessageResponse, error::ApiError};
use axum::{
    Json,
    extract::{FromRequestParts, State},
    http::{HeaderMap, HeaderValue, StatusCode, request::Parts},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgConnection, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Copy, Deserialize, Serialize, ToSchema, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum Role {
    Perso,
    Employe,
    Entreprise,
    Admin,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RegisterRequest {
    email: String,
    name: String,
    password: String,
    role: Role,
    company_name: Option<String>,
}
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LoginRequest {
    email: String,
    password: String,
}
#[derive(Serialize, ToSchema)]
pub struct LoginResponse {
    token: String,
    user: UserResponse,
}
#[derive(Serialize, FromRow, ToSchema)]
pub struct CompanyResponse {
    id: Uuid,
    name: String,
}
#[derive(Serialize, ToSchema)]
pub struct UserResponse {
    id: Uuid,
    email: String,
    name: String,
    /// Active role, checked against user_roles by the server.
    role: Role,
    roles: Vec<Role>,
    companies: Vec<CompanyResponse>,
    email_verified: bool,
    /// Non-secret fingerprint used to isolate provider state between sessions.
    session_tag: String,
}
#[derive(FromRow)]
struct Account {
    id: Uuid,
    email: String,
    name: String,
    password_hash: String,
    email_verified: bool,
}

pub const SESSION_COOKIE: &str = "lumi_session";

pub fn cookie_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all("cookie")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(key, value)| {
            (key == SESSION_COOKIE
                && value.len() == 64
                && value.bytes().all(|c| c.is_ascii_hexdigit()))
            .then_some(value)
        })
}

pub fn session_cookie(token: &str, seconds: u64) -> HeaderMap {
    let secure = if std::env::var("APP_URL")
        .unwrap_or_default()
        .starts_with("https://")
    {
        "; Secure"
    } else {
        ""
    };
    let mut headers = HeaderMap::new();
    headers.insert(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "{SESSION_COOKIE}={token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age={seconds}{secure}"
        ))
        .expect("server-generated session token"),
    );
    headers
}

pub(crate) fn session_response(session: LoginResponse) -> (HeaderMap, Json<LoginResponse>) {
    (
        session_cookie(&session.token, 7 * 24 * 60 * 60),
        Json(session),
    )
}

pub struct AuthUser {
    pub id: Uuid,
    pub role: Role,
    token_hash: String,
    token: String,
    expires_in: u64,
}
pub(crate) fn hash_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}
pub(crate) fn internal() -> ApiError {
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Erreur interne du serveur.",
    )
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .filter(|v| !v.is_empty())
            .or_else(|| cookie_token(&parts.headers))
            .ok_or_else(ApiError::unauthorized)?;
        let token_hash = hash_token(token);
        let (id, role, expires_in): (Uuid, Role, i64) = sqlx::query_as(
            "SELECT s.user_id, s.role, GREATEST(FLOOR(EXTRACT(EPOCH FROM (s.expires_at - now()))), 0)::bigint FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.email_verified_at IS NOT NULL",
        )
        .bind(&token_hash)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::unauthorized)?;
        if parts
            .headers
            .get("x-lumi-account")
            .is_some_and(|value| value.to_str().ok() != Some(id.to_string().as_str()))
        {
            return Err(ApiError::unauthorized());
        }
        Ok(Self {
            id,
            role,
            token_hash,
            token: token.to_owned(),
            expires_in: expires_in as u64,
        })
    }
}

impl AuthUser {
    /// Use this guard before any future operation restricted to administrators.
    pub fn require_admin(&self) -> Result<(), ApiError> {
        if matches!(self.role, Role::Admin) {
            Ok(())
        } else {
            Err(ApiError(
                StatusCode::FORBIDDEN,
                "Accès administrateur requis.",
            ))
        }
    }
}

async fn response(
    connection: &mut PgConnection,
    account: Account,
    role: Role,
) -> Result<UserResponse, ApiError> {
    let roles = sqlx::query_scalar("SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role")
        .bind(account.id)
        .fetch_all(&mut *connection)
        .await?;
    let companies = sqlx::query_as(
        "SELECT c.id, c.name FROM companies c
         JOIN company_memberships m ON m.company_id = c.id
         WHERE m.user_id = $1 ORDER BY c.id",
    )
    .bind(account.id)
    .fetch_all(&mut *connection)
    .await?;
    Ok(UserResponse {
        id: account.id,
        email: account.email,
        name: account.name,
        role,
        roles,
        companies,
        email_verified: account.email_verified,
        session_tag: String::new(),
    })
}

#[utoipa::path(post, path = "/api/auth/register", request_body = RegisterRequest, responses((status = 201, body = MessageResponse), (status = 400, body = MessageResponse), (status = 403, body = MessageResponse), (status = 409, body = MessageResponse)))]
pub async fn register(
    State(state): State<AppState>,
    Json(input): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<MessageResponse>), ApiError> {
    if matches!(input.role, Role::Admin) {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Le rôle administrateur ne peut pas être choisi à l'inscription.",
        ));
    }
    let email = input.email.trim().to_lowercase();
    let name = input.name.trim();
    let email_parts: Vec<_> = email.split('@').collect();
    if email.len() > 254
        || email_parts.len() != 2
        || email_parts.iter().any(|p| p.is_empty())
        || email.chars().any(char::is_whitespace)
        || !email_parts[1].contains('.')
    {
        return Err(ApiError::invalid("Adresse e-mail invalide."));
    }
    if name.is_empty() || name.chars().count() > 100 {
        return Err(ApiError::invalid(
            "Le nom doit contenir entre 1 et 100 caractères.",
        ));
    }
    validate_password(&input.password)?;
    let company_name = input.company_name.as_deref().map(str::trim);
    if matches!(input.role, Role::Entreprise) {
        if company_name.is_none_or(|s| s.is_empty() || s.chars().count() > 150) {
            return Err(ApiError::invalid(
                "Le nom de l'entreprise est requis (150 caractères maximum).",
            ));
        }
    } else if company_name.is_some() {
        return Err(ApiError::invalid(
            "Le nom d'entreprise est réservé à l'inscription entreprise.",
        ));
    }
    let hash =
        tokio::task::spawn_blocking(move || bcrypt::hash(input.password, bcrypt::DEFAULT_COST))
            .await
            .map_err(|_| internal())?
            .map_err(|_| internal())?;
    let mut tx = state.pool.begin().await?;
    let id = Uuid::new_v4();
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4)
         ON CONFLICT (lower(email)) DO NOTHING RETURNING id",
    )
    .bind(id)
    .bind(&email)
    .bind(name)
    .bind(hash)
    .fetch_optional(&mut *tx)
    .await?;
    if inserted.is_none() {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Cette adresse e-mail est déjà utilisée.",
        ));
    }
    sqlx::query("INSERT INTO user_roles (user_id, role) VALUES ($1,$2)")
        .bind(id)
        .bind(input.role)
        .execute(&mut *tx)
        .await?;
    if let Some(company_name) = company_name {
        let company_id = Uuid::new_v4();
        sqlx::query("INSERT INTO companies (id, name) VALUES ($1,$2)")
            .bind(company_id)
            .bind(company_name)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO company_memberships (user_id, company_id) VALUES ($1,$2)")
            .bind(id)
            .bind(company_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    let sent = crate::email_auth::request_link(&state, &email, "verify")
        .await
        .unwrap_or(false);
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: if sent {
                "Compte créé. Confirmez votre adresse grâce au lien envoyé par e-mail avant de vous connecter."
            } else {
                "Compte créé. L’e-mail n’a pas pu être envoyé. Patientez une minute puis utilisez Renvoyer le lien de confirmation."
            },
        }),
    ))
}

#[utoipa::path(post, path = "/api/auth/login", request_body = LoginRequest, responses((status = 200, body = LoginResponse), (status = 401, body = MessageResponse), (status = 403, body = MessageResponse)))]
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> Result<(HeaderMap, Json<LoginResponse>), ApiError> {
    if input.email.len() > 254 || input.password.len() > 1024 {
        return Err(ApiError::invalid("Identifiants trop longs."));
    }
    let address_hash = hash_token(&input.email.trim().to_lowercase());
    sqlx::query("DELETE FROM login_attempts WHERE window_start < now() - interval '1 day'")
        .execute(&state.pool)
        .await?;
    let attempts: i32 = sqlx::query_scalar("INSERT INTO login_attempts(address_hash) VALUES($1) ON CONFLICT(address_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END, window_start=CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts").bind(&address_hash).fetch_one(&state.pool).await?;
    if attempts > 10 {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Trop de tentatives. Réessayez dans 15 minutes ou utilisez un lien de connexion.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let account: Option<Account> = sqlx::query_as(
        "SELECT id, email, name, password_hash, email_verified_at IS NOT NULL AS email_verified FROM users WHERE lower(email) = lower($1) FOR UPDATE",
    )
    .bind(input.email.trim())
    .fetch_optional(&mut *tx)
    .await?;
    let hash = account
        .as_ref()
        .map(|a| a.password_hash.clone())
        .unwrap_or_else(|| crate::DEMO_PASSWORD_HASH.to_owned());
    let valid = tokio::task::spawn_blocking(move || {
        input.password.len() <= 72 && bcrypt::verify(input.password, &hash).unwrap_or(false)
    })
    .await
    .map_err(|_| internal())?;
    let account = account.filter(|_| valid).ok_or(ApiError(
        StatusCode::UNAUTHORIZED,
        "Adresse e-mail ou mot de passe incorrect.",
    ))?;
    let result = create_session(&mut tx, account.id).await?;
    sqlx::query("DELETE FROM login_attempts WHERE address_hash=$1")
        .bind(address_hash)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(session_response(result))
}

pub(crate) fn new_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

pub(crate) fn validate_password(password: &str) -> Result<(), ApiError> {
    if password.chars().count() < 8 || password.len() > 72 {
        return Err(ApiError::invalid(
            "Le mot de passe doit contenir au moins 8 caractères et au plus 72 octets.",
        ));
    }
    Ok(())
}

pub(crate) async fn create_session(
    connection: &mut PgConnection,
    id: Uuid,
) -> Result<LoginResponse, ApiError> {
    let account: Account = sqlx::query_as("SELECT id,email,name,password_hash,email_verified_at IS NOT NULL AS email_verified FROM users WHERE id=$1 FOR UPDATE")
        .bind(id).fetch_one(&mut *connection).await?;
    if !account.email_verified {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Confirmez votre adresse e-mail avant de vous connecter. Vous pouvez renvoyer le lien de confirmation.",
        ));
    }
    let role: Role = sqlx::query_scalar(
        "SELECT role FROM user_roles WHERE user_id = $1
         ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'entreprise' THEN 1 WHEN 'employe' THEN 2 ELSE 3 END
         LIMIT 1 FOR KEY SHARE"
    ).bind(id).fetch_optional(&mut *connection).await?
        .ok_or(ApiError(StatusCode::FORBIDDEN, "Aucun rôle n'est attribué à votre compte."))?;
    let mut user = response(connection, account, role).await?;
    let token = new_token();
    user.session_tag = hash_token(&token)[..24].to_owned();
    sqlx::query("INSERT INTO sessions (token_hash, user_id, role) VALUES ($1,$2,$3)")
        .bind(hash_token(&token))
        .bind(id)
        .bind(role)
        .execute(&mut *connection)
        .await?;
    Ok(LoginResponse { token, user })
}

#[utoipa::path(get, path = "/api/auth/me", security(("bearer" = [])), responses((status = 200, body = UserResponse), (status = 401, body = MessageResponse)))]
pub async fn current_user(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<(HeaderMap, Json<UserResponse>), ApiError> {
    let account = sqlx::query_as("SELECT id, email, name, password_hash, email_verified_at IS NOT NULL AS email_verified FROM users WHERE id = $1")
        .bind(user.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::unauthorized)?;
    let mut connection = state.pool.acquire().await?;
    let mut result = response(&mut connection, account, user.role).await?;
    result.session_tag = user.token_hash[..24].to_owned();
    Ok((session_cookie(&user.token, user.expires_in), Json(result)))
}
#[utoipa::path(post, path = "/api/auth/logout", security(("bearer" = [])), responses((status = 200, body = MessageResponse), (status = 401, body = MessageResponse)))]
pub async fn logout(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<(HeaderMap, Json<MessageResponse>), ApiError> {
    sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
        .bind(user.token_hash)
        .execute(&state.pool)
        .await?;
    Ok((
        session_cookie("", 0),
        Json(MessageResponse {
            message: "Déconnexion réussie.",
        }),
    ))
}

pub async fn seed_demo(pool: &PgPool, email: &str, password_hash: &str) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO users (id, email, name, password_hash, email_verified_at) VALUES ($1,$2,'Utilisateur Lumi',$3,now())
         ON CONFLICT DO NOTHING RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(email.trim())
    .bind(password_hash)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(id) = id {
        sqlx::query("INSERT INTO user_roles (user_id, role) VALUES ($1,'perso')")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    // Only bootstrap the configured demo identity, never an unrelated existing account.
    sqlx::query("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE lower(email)=lower($1) AND password_hash=$2")
        .bind(email.trim())
        .bind(password_hash)
        .execute(&mut *tx)
        .await?;
    tx.commit().await
}
