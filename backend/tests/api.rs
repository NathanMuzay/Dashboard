use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Value,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
fn signup(role: &str) -> Value {
    let mut body = json!({"email":format!("{role}@test.local"), "name":"Test", "password":"test-password", "role":role});
    if role == "entreprise" {
        body["company_name"] = json!("Entreprise Test");
    }
    body
}
async fn login(app: &Router, role: &str) -> Value {
    let (status, body) = request(
        app,
        "POST",
        "/api/auth/login",
        None,
        json!({"email":format!("{role}@test.local"), "password":"test-password"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

#[tokio::test]
async fn public_routes_and_removed_widgets() {
    let app = lumi_backend::app(
        PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@localhost/unused")
            .unwrap(),
    );
    for path in ["/api/health", "/api/openapi.json", "/api/docs/"] {
        assert_eq!(
            request(&app, "GET", path, None, Value::Null).await.0,
            StatusCode::OK
        );
    }
    assert_eq!(
        request(&app, "GET", "/api/auth/me", None, Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, "GET", "/api/v1/dashboard", None, Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let (_, spec) = request(&app, "GET", "/api/openapi.json", None, Value::Null).await;
    assert!(spec["paths"]["/api/auth/register"].is_object());
    assert!(spec["paths"]["/api/v1/dashboard"].is_null());
}

#[sqlx::test]
async fn register_login_and_persistent_sessions_for_each_public_role(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    for role in ["perso", "employe", "entreprise"] {
        let (status, body) = request(&app, "POST", "/api/auth/register", None, signup(role)).await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE email=$1")
            .bind(format!("{role}@test.local"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_ne!(hash, "test-password");
        assert!(bcrypt::verify("test-password", &hash).unwrap());
        // This suite isolates account/session behavior; email proof is tested in email_auth.rs.
        sqlx::query("UPDATE users SET email_verified_at=now() WHERE email=$1")
            .bind(format!("{role}@test.local"))
            .execute(&pool)
            .await
            .unwrap();
        let login = login(&app, role).await;
        assert_eq!(login["user"]["role"], role);
        assert_eq!(login["user"]["roles"], json!([role]));
        assert_eq!(
            login["user"]["companies"].as_array().unwrap().len(),
            usize::from(role == "entreprise")
        );
        let token = login["token"].as_str().unwrap();
        let restarted = lumi_backend::app(
            PgPoolOptions::new()
                .connect_with((*pool.connect_options()).clone())
                .await
                .unwrap(),
        );
        assert_eq!(
            request(&restarted, "GET", "/api/auth/me", Some(token), Value::Null)
                .await
                .1,
            login["user"]
        );
        assert_eq!(
            request(
                &restarted,
                "POST",
                "/api/auth/logout",
                Some(token),
                Value::Null
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            request(&app, "GET", "/api/auth/me", Some(token), Value::Null)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('widgets','dashboards')").fetch_one(&pool).await.unwrap();
    assert_eq!(count, 0);
}

#[sqlx::test]
async fn roles_are_checked_and_revocation_invalidates_sessions(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    assert_eq!(
        request(&app, "POST", "/api/auth/register", None, signup("admin"))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    request(&app, "POST", "/api/auth/register", None, signup("perso")).await;
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/auth/login",
            None,
            json!({"email":"perso@test.local", "password":"incorrect"})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    // Login cannot be used to request an elevated role.
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/auth/login",
            None,
            json!({"email":"perso@test.local", "password":"test-password", "role":"admin"})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    sqlx::query("UPDATE users SET email_verified_at=now() WHERE email='perso@test.local'")
        .execute(&pool)
        .await
        .unwrap();
    let personal = login(&app, "perso").await;
    let id: Uuid = sqlx::query_scalar("SELECT id FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO user_roles VALUES ($1,'employe'),($1,'admin')")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, admin) = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        json!({"email":"PERSO@test.local", "password":"test-password"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(admin["user"]["roles"], json!(["admin", "employe", "perso"]));
    assert_eq!(admin["user"]["role"], "admin");
    sqlx::query("DELETE FROM user_roles WHERE user_id=$1 AND role='admin'")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "GET",
            "/api/auth/me",
            admin["token"].as_str(),
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            "GET",
            "/api/auth/me",
            personal["token"].as_str(),
            Value::Null
        )
        .await
        .0,
        StatusCode::OK
    );
    let automatic = login(&app, "perso").await;
    assert_eq!(automatic["user"]["role"], "employe");
    sqlx::query("UPDATE sessions SET expires_at=now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "GET",
            "/api/auth/me",
            personal["token"].as_str(),
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn validates_registration_and_concurrent_unique_emails(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    for (key, value) in [
        ("email", json!("invalid")),
        ("password", json!("short")),
        ("password", json!("a".repeat(73))),
        ("name", json!("  ")),
    ] {
        let mut body = signup("perso");
        body[key] = value;
        assert_eq!(
            request(&app, "POST", "/api/auth/register", None, body)
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    let mut company = signup("entreprise");
    company["company_name"] = Value::Null;
    assert_eq!(
        request(&app, "POST", "/api/auth/register", None, company)
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    let (a, b) = tokio::join!(
        request(&app, "POST", "/api/auth/register", None, signup("perso")),
        request(&app, "POST", "/api/auth/register", None, signup("perso"))
    );
    assert!([a.0, b.0].contains(&StatusCode::CREATED));
    assert!([a.0, b.0].contains(&StatusCode::CONFLICT));
    let mut duplicate = signup("perso");
    duplicate["email"] = json!("PERSO@test.local");
    assert_eq!(
        request(&app, "POST", "/api/auth/register", None, duplicate)
            .await
            .0,
        StatusCode::CONFLICT
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test]
async fn demo_bootstrap_is_idempotent(pool: PgPool) {
    lumi_backend::auth::seed_demo(
        &pool,
        lumi_backend::DEMO_EMAIL,
        lumi_backend::DEMO_PASSWORD_HASH,
    )
    .await
    .unwrap();
    lumi_backend::auth::seed_demo(&pool, lumi_backend::DEMO_EMAIL, "wrong")
        .await
        .unwrap();
    let app = lumi_backend::app(pool);
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        json!({"email":"demo@lumi.local", "password":"lumi-demo"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["role"], "perso");
}
