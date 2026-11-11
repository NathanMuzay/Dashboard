use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use lumi_backend::mail::{Mailer, SentMail};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

async fn request(
    app: &Router,
    path: &str,
    body: Value,
    token: Option<&str>,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(if path == "/api/auth/me" {
            "GET"
        } else {
            "POST"
        })
        .uri(path)
        .header("content-type", "application/json");
    if let Some(token) = token {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let result = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    assert_eq!(result.headers()["cache-control"], "no-store");
    let status = result.status();
    let body = result.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&body).unwrap_or(Value::Null))
}
fn setup(pool: &PgPool) -> (Router, Arc<Mutex<Vec<SentMail>>>) {
    let (mailer, messages) = Mailer::capture();
    (
        lumi_backend::app_with_mailer(pool.clone(), mailer),
        messages,
    )
}
fn token(mail: &SentMail) -> String {
    let url = url::Url::parse(&mail.link).unwrap();
    assert!(url.query().is_none());
    url::form_urlencoded::parse(url.fragment().unwrap().as_bytes())
        .find(|(k, _)| k == "token")
        .unwrap()
        .1
        .into_owned()
}
async fn register(app: &Router, email: &str) {
    let (status, body) = request(
        app,
        "/api/auth/register",
        json!({"email":email,"password":"initial-password","name":"Test mail","role":"perso"}),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
}
async fn cooldown(pool: &PgPool) {
    sqlx::query("UPDATE email_requests SET last_sent_at=now()-interval '61 seconds'")
        .execute(pool)
        .await
        .unwrap();
}
async fn confirm(app: &Router, messages: &Arc<Mutex<Vec<SentMail>>>) {
    let secret = token(messages.lock().unwrap().last().unwrap());
    assert_eq!(
        request(
            app,
            "/api/auth/email/confirm",
            json!({"token":secret}),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
}
async fn login(app: &Router, email: &str, password: &str) -> (StatusCode, Value) {
    request(
        app,
        "/api/auth/login",
        json!({"email":email,"password":password}),
        None,
    )
    .await
}

#[sqlx::test]
async fn verification_required_badge_and_single_use(pool: PgPool) {
    let (app, messages) = setup(&pool);
    register(&app, "verify@test.local").await;
    assert_eq!(messages.lock().unwrap().len(), 1);
    let mail = messages.lock().unwrap()[0].clone();
    assert_eq!(mail.recipient, "verify@test.local");
    assert_eq!(mail.purpose, "verify");
    let secret = token(&mail);
    let stored: String = sqlx::query_scalar("SELECT token_hash FROM email_tokens")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(stored, secret);
    assert_eq!(stored, format!("{:x}", Sha256::digest(secret.as_bytes())));
    assert_eq!(
        login(&app, "verify@test.local", "initial-password").await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(
            &app,
            "/api/auth/magic/consume",
            json!({"token":secret}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (a, b) = tokio::join!(
        request(
            &app,
            "/api/auth/email/confirm",
            json!({"token":secret}),
            None
        ),
        request(
            &app,
            "/api/auth/email/confirm",
            json!({"token":secret}),
            None
        )
    );
    assert!([a.0, b.0].contains(&StatusCode::OK));
    assert!([a.0, b.0].contains(&StatusCode::BAD_REQUEST));
    let (status, body) = login(&app, "verify@test.local", "initial-password").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["email_verified"], true);
    assert_eq!(
        request(&app, "/api/auth/me", Value::Null, body["token"].as_str())
            .await
            .1["email_verified"],
        true
    );
}

#[sqlx::test]
async fn resend_expiry_cooldown_and_hourly_limit(pool: PgPool) {
    let (app, messages) = setup(&pool);
    register(&app, "rate@test.local").await;
    let first = token(&messages.lock().unwrap()[0]);
    let known = request(
        &app,
        "/api/auth/email/resend",
        json!({"email":"rate@test.local"}),
        None,
    )
    .await;
    let unknown = request(
        &app,
        "/api/auth/email/resend",
        json!({"email":"unknown@test.local"}),
        None,
    )
    .await;
    assert_eq!(known, unknown);
    assert_eq!(messages.lock().unwrap().len(), 1);
    sqlx::query("UPDATE email_tokens SET expires_at=now()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "/api/auth/email/confirm",
            json!({"token":first}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    for _ in 0..4 {
        cooldown(&pool).await;
        request(
            &app,
            "/api/auth/email/resend",
            json!({"email":" RATE@test.local "}),
            None,
        )
        .await;
    }
    assert_eq!(messages.lock().unwrap().len(), 5);
    cooldown(&pool).await;
    request(
        &app,
        "/api/auth/password/forgot",
        json!({"email":"rate@test.local"}),
        None,
    )
    .await;
    assert_eq!(messages.lock().unwrap().len(), 5);
    assert_eq!(
        request(
            &app,
            "/api/auth/email/confirm",
            json!({"token":first}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    confirm(&app, &messages).await;
}

#[sqlx::test]
async fn magic_link_only_for_verified_users_and_cannot_replay(pool: PgPool) {
    let (app, messages) = setup(&pool);
    register(&app, "magic@test.local").await;
    cooldown(&pool).await;
    request(
        &app,
        "/api/auth/magic/request",
        json!({"email":"magic@test.local"}),
        None,
    )
    .await;
    assert_eq!(messages.lock().unwrap().len(), 1);
    confirm(&app, &messages).await;
    cooldown(&pool).await;
    let known = request(
        &app,
        "/api/auth/magic/request",
        json!({"email":"magic@test.local"}),
        None,
    )
    .await;
    assert_eq!(
        known,
        request(
            &app,
            "/api/auth/magic/request",
            json!({"email":"missing@test.local"}),
            None
        )
        .await
    );
    let secret = token(messages.lock().unwrap().last().unwrap());
    let (a, b) = tokio::join!(
        request(
            &app,
            "/api/auth/magic/consume",
            json!({"token":secret}),
            None
        ),
        request(
            &app,
            "/api/auth/magic/consume",
            json!({"token":secret}),
            None
        )
    );
    assert!([a.0, b.0].contains(&StatusCode::OK));
    assert!([a.0, b.0].contains(&StatusCode::BAD_REQUEST));
    let body = if a.0 == StatusCode::OK { a.1 } else { b.1 };
    assert_eq!(body["user"]["email"], "magic@test.local");
    assert_eq!(body["user"]["email_verified"], true);
    assert_eq!(
        request(&app, "/api/auth/me", Value::Null, body["token"].as_str())
            .await
            .0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn password_reset_revokes_sessions_links_and_preserves_other_accounts(pool: PgPool) {
    let (app, messages) = setup(&pool);
    register(&app, "reset@test.local").await;
    confirm(&app, &messages).await;
    let session = login(&app, "reset@test.local", "initial-password").await.1;
    register(&app, "other@test.local").await;
    confirm(&app, &messages).await;
    let other = login(&app, "other@test.local", "initial-password").await.1;
    cooldown(&pool).await;
    request(
        &app,
        "/api/auth/magic/request",
        json!({"email":"reset@test.local"}),
        None,
    )
    .await;
    let magic = token(messages.lock().unwrap().last().unwrap());
    cooldown(&pool).await;
    request(
        &app,
        "/api/auth/password/forgot",
        json!({"email":"reset@test.local"}),
        None,
    )
    .await;
    let reset = token(messages.lock().unwrap().last().unwrap());
    assert_eq!(
        request(
            &app,
            "/api/auth/password/reset",
            json!({"token":reset,"password":"short"}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "/api/auth/password/reset",
            json!({"token":magic,"password":"new-password"}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "/api/auth/password/reset",
            json!({"token":reset,"password":"new-password"}),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            "/api/auth/password/reset",
            json!({"token":reset,"password":"another-password"}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&app, "/api/auth/me", Value::Null, session["token"].as_str())
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, "/api/auth/me", Value::Null, other["token"].as_str())
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            "/api/auth/magic/consume",
            json!({"token":magic}),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        login(&app, "reset@test.local", "initial-password").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        login(&app, "reset@test.local", "new-password").await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn smtp_failure_keeps_existing_link_and_never_verifies_implicitly(pool: PgPool) {
    let (app, messages) = setup(&pool);
    register(&app, "failure@test.local").await;
    let old = token(messages.lock().unwrap().last().unwrap());
    cooldown(&pool).await;
    let unavailable = lumi_backend::app(pool.clone());
    assert_eq!(
        request(
            &unavailable,
            "/api/auth/email/resend",
            json!({"email":"failure@test.local"}),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "/api/auth/email/confirm", json!({"token":old}), None)
            .await
            .0,
        StatusCode::OK
    );
    register(&unavailable, "offline@test.local").await;
    assert_eq!(
        login(&unavailable, "offline@test.local", "initial-password")
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    cooldown(&pool).await;
    request(
        &app,
        "/api/auth/password/forgot",
        json!({"email":"offline@test.local"}),
        None,
    )
    .await;
    let reset = token(messages.lock().unwrap().last().unwrap());
    assert_eq!(
        request(
            &app,
            "/api/auth/password/reset",
            json!({"token":reset,"password":"new-password"}),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        login(&app, "offline@test.local", "new-password").await.0,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test]
async fn expired_magic_and_reset_are_rejected(pool: PgPool) {
    let (app, messages) = setup(&pool);
    register(&app, "expiry@test.local").await;
    confirm(&app, &messages).await;
    for (request_path, consume_path) in [
        ("/api/auth/magic/request", "/api/auth/magic/consume"),
        ("/api/auth/password/forgot", "/api/auth/password/reset"),
    ] {
        cooldown(&pool).await;
        request(
            &app,
            request_path,
            json!({"email":"expiry@test.local"}),
            None,
        )
        .await;
        let secret = token(messages.lock().unwrap().last().unwrap());
        sqlx::query("UPDATE email_tokens SET expires_at=now()-interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();
        let mut body = json!({"token":secret});
        if consume_path.ends_with("reset") {
            body["password"] = json!("new-password");
        }
        assert_eq!(
            request(&app, consume_path, body, None).await.0,
            StatusCode::BAD_REQUEST
        );
    }
}

#[sqlx::test]
async fn demo_bootstrap_repairs_only_matching_demo_credentials(pool: PgPool) {
    let (app, _) = setup(&pool);
    register(&app, "demo@test.local").await;
    lumi_backend::auth::seed_demo(&pool, "demo@test.local", lumi_backend::DEMO_PASSWORD_HASH)
        .await
        .unwrap();
    assert_eq!(
        login(&app, "demo@test.local", "initial-password").await.0,
        StatusCode::FORBIDDEN
    );
    let hash: String =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE email='demo@test.local'")
            .fetch_one(&pool)
            .await
            .unwrap();
    lumi_backend::auth::seed_demo(&pool, "demo@test.local", &hash)
        .await
        .unwrap();
    let (status, body) = login(&app, "demo@test.local", "initial-password").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        request(&app, "/api/auth/me", Value::Null, body["token"].as_str())
            .await
            .0,
        StatusCode::OK
    );
}
