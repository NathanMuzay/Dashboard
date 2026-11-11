use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    cookie: &str,
    client: bool,
    account: Option<&str>,
    body: Value,
) -> axum::response::Response {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if !cookie.is_empty() {
        req = req.header("cookie", cookie);
    }
    if client {
        req = req.header("x-lumi-client", "web");
    }
    if let Some(id) = account {
        req = req.header("x-lumi-account", id);
    }
    app.clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap()
}

#[sqlx::test]
async fn persistent_cookie_survives_new_server_and_logout_revokes_it(pool: PgPool) {
    lumi_backend::auth::seed_demo(
        &pool,
        lumi_backend::DEMO_EMAIL,
        lumi_backend::DEMO_PASSWORD_HASH,
    )
    .await
    .unwrap();
    let app = lumi_backend::app(pool.clone());
    let login = call(
        &app,
        "POST",
        "/api/auth/login",
        "",
        true,
        None,
        json!({"email":"demo@lumi.local","password":"lumi-demo"}),
    )
    .await;
    assert_eq!(login.status(), StatusCode::OK);
    let cookie = login.headers()["set-cookie"].to_str().unwrap().to_owned();
    assert!(
        cookie.contains("HttpOnly")
            && cookie.contains("SameSite=Lax")
            && cookie.contains("Max-Age=604800")
            && cookie.contains("Path=/api")
    );
    let cookie = cookie.split(';').next().unwrap();
    let body: Value =
        serde_json::from_slice(&login.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let id = body["user"]["id"].as_str().unwrap();
    let restarted = lumi_backend::app(pool.clone());
    assert_eq!(
        call(
            &restarted,
            "GET",
            "/api/auth/me",
            cookie,
            false,
            None,
            Value::Null
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert_eq!(
        call(
            &restarted,
            "GET",
            "/api/dashboards",
            cookie,
            true,
            Some("another-account"),
            Value::Null
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &restarted,
            "PUT",
            "/api/services/github",
            cookie,
            false,
            Some(id),
            Value::Null
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &restarted,
            "PUT",
            "/api/services/github",
            cookie,
            true,
            Some(id),
            Value::Null
        )
        .await
        .status(),
        StatusCode::NO_CONTENT
    );
    let logout = call(
        &restarted,
        "POST",
        "/api/auth/logout",
        cookie,
        true,
        None,
        Value::Null,
    )
    .await;
    assert_eq!(logout.status(), StatusCode::OK);
    assert!(
        logout.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/auth/me",
            cookie,
            false,
            None,
            Value::Null
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn expired_cookie_and_cross_site_mutations_are_refused(pool: PgPool) {
    lumi_backend::auth::seed_demo(
        &pool,
        lumi_backend::DEMO_EMAIL,
        lumi_backend::DEMO_PASSWORD_HASH,
    )
    .await
    .unwrap();
    let app = lumi_backend::app(pool.clone());
    let login = call(
        &app,
        "POST",
        "/api/auth/login",
        "",
        true,
        None,
        json!({"email":"demo@lumi.local","password":"lumi-demo"}),
    )
    .await;
    let cookie = login.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    sqlx::query("UPDATE sessions SET expires_at=now()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/auth/me",
            &cookie,
            false,
            None,
            Value::Null
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header("content-type", "application/json")
                .header("sec-fetch-site", "cross-site")
                .header("x-lumi-client", "web")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
