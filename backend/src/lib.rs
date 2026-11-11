#[path = "../../bonus/backend/habits.rs"]
pub mod habits;
use axum::{
    Json, Router,
    http::StatusCode,
    routing::{get, post},
};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::{
    Modify, OpenApi, ToSchema,
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
};
use utoipa_swagger_ui::SwaggerUi;

pub mod about;
#[path = "../../bonus/backend/admin.rs"]
pub mod admin;
pub mod auth;
mod calculator;
pub mod email_auth;
mod error;
pub mod google_auth;
pub mod mail;
mod middleware;
pub mod openai;
pub mod workspace;

pub const DEMO_EMAIL: &str = "demo@lumi.local";
pub const DEMO_PASSWORD_HASH: &str = "$2b$12$VUVLb5qMxqmDrARbU8ZH6ehBHOxOuja0z4nCTCeFyK2xPWoi8/EJO";
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub mailer: mail::Mailer,
}

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    status: &'static str,
    message: &'static str,
}
#[derive(Serialize, ToSchema)]
pub struct MessageResponse {
    message: &'static str,
}

struct Security;
impl Modify for Security {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer",
                SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)),
            );
        }
    }
}
#[derive(OpenApi)]
#[openapi(
    info(title = "Lumi API", version = "0.3.0"),
    paths(openai::ask, workspace::list, workspace::create, workspace::update, workspace::remove, workspace::services, workspace::subscribe, workspace::unsubscribe, admin::list, admin::roles, admin::revoke, google_auth::challenge, google_auth::login, google_auth::link, health, auth::register, auth::login, auth::current_user, auth::logout, email_auth::resend_verification, email_auth::confirm_email, email_auth::request_magic, email_auth::consume_magic, email_auth::forgot_password, email_auth::reset_password),
    components(schemas(HealthResponse, MessageResponse)),
    modifiers(&Security)
)]
struct ApiDoc;

#[utoipa::path(get, path = "/api/health", responses((status = 200, body = HealthResponse)))]
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        message: "Connexion réussie ! Le backend Rust répond au frontend React.",
    })
}
async fn not_found() -> (StatusCode, Json<MessageResponse>) {
    (
        StatusCode::NOT_FOUND,
        Json(MessageResponse {
            message: "Route introuvable.",
        }),
    )
}

/// The caller supplies a migrated pool, also allowing isolated databases in tests.
pub fn app(pool: PgPool) -> Router {
    app_with_mailer(pool, mail::Mailer::unavailable())
}

pub fn app_with_mailer(pool: PgPool, mailer: mail::Mailer) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/ai/status", get(openai::status))
        .route("/api/ai/ask", post(openai::ask))
        .route(
            "/api/dashboards",
            get(workspace::list).post(workspace::create),
        )
        .route(
            "/api/dashboards/{id}",
            axum::routing::put(workspace::update).delete(workspace::remove),
        )
        .route("/api/admin/users", get(admin::list))
        .route(
            "/api/admin/users/{id}/roles",
            axum::routing::put(admin::roles),
        )
        .route(
            "/api/admin/users/{id}/sessions",
            axum::routing::delete(admin::revoke),
        )
        .route("/api/services", get(workspace::services))
        .route(
            "/api/services/{service}",
            axum::routing::put(workspace::subscribe).delete(workspace::unsubscribe),
        )
        .route("/about.json", get(about::about))
        .route(
            "/api/auth/google/challenge",
            axum::routing::post(google_auth::challenge),
        )
        .route(
            "/api/auth/google/login",
            axum::routing::post(google_auth::login),
        )
        .route(
            "/api/auth/google/link",
            axum::routing::post(google_auth::link),
        )
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/me", get(auth::current_user))
        .route("/api/auth/logout", post(auth::logout))
        .route(
            "/api/auth/email/resend",
            post(email_auth::resend_verification),
        )
        .route("/api/auth/email/confirm", post(email_auth::confirm_email))
        .route("/api/auth/magic/request", post(email_auth::request_magic))
        .route("/api/auth/magic/consume", post(email_auth::consume_magic))
        .route(
            "/api/auth/password/forgot",
            post(email_auth::forgot_password),
        )
        .route("/api/auth/password/reset", post(email_auth::reset_password))
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", ApiDoc::openapi()))
        .fallback(not_found)
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024))
        .layer(axum::middleware::from_fn(middleware::request_context))
        .with_state(AppState { pool, mailer })
}
