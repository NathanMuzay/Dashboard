use axum::{Router, body::Body, http::Request};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
async fn request(app: &Router, method: &str, path: &str, token: &str, body: Value) -> (u16, Value) {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if !token.is_empty() {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = res.status().as_u16();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
async fn account(pool: &PgPool, app: &Router, email: &str) -> (String, String) {
    let (status, _) = request(
        app,
        "POST",
        "/api/auth/register",
        "",
        json!({"email":email,"name":"Test","password":"test-password","role":"perso"}),
    )
    .await;
    assert_eq!(status, 201);
    sqlx::query("UPDATE users SET email_verified_at=now() WHERE email=$1")
        .bind(email)
        .execute(pool)
        .await
        .unwrap();
    let (status, data) = request(
        app,
        "POST",
        "/api/auth/login",
        "",
        json!({"email":email,"password":"test-password"}),
    )
    .await;
    assert_eq!(status, 200);
    (
        data["token"].as_str().unwrap().into(),
        data["user"]["id"].as_str().unwrap().into(),
    )
}
#[sqlx::test]
async fn dashboards_isolate_accounts_validate_and_detect_conflicts(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (a, _) = account(&pool, &app, "a@test.local").await;
    let (b, _) = account(&pool, &app, "b@test.local").await;
    assert_eq!(
        request(&app, "GET", "/api/dashboards", "", Value::Null)
            .await
            .0,
        401
    );
    let body = json!({"name":"Travail","widgets":[{"id":"note","type":"notes","title":"Notes","x":1,"y":1,"width":6,"height":2,"content":"Privé"}]});
    let (status, item) = request(&app, "POST", "/api/dashboards", &a, body.clone()).await;
    assert_eq!(status, 201, "{item}");
    let path = format!("/api/dashboards/{}", item["id"].as_str().unwrap());
    assert_eq!(
        request(&app, "GET", "/api/dashboards", &b, Value::Null)
            .await
            .1,
        json!([])
    );
    let mut edit = body.clone();
    edit["revision"] = json!(0);
    assert_eq!(request(&app, "PUT", &path, &b, edit.clone()).await.0, 409);
    assert_eq!(request(&app, "DELETE", &path, &b, Value::Null).await.0, 204);
    assert_eq!(request(&app, "PUT", &path, &a, edit.clone()).await.0, 200);
    assert_eq!(request(&app, "PUT", &path, &a, edit).await.0, 409);
    let mut invalid = body.clone();
    invalid["widgets"][0]["token"] = json!("secret");
    assert_eq!(
        request(&app, "POST", "/api/dashboards", &a, invalid)
            .await
            .0,
        400
    );
    let mut invalid = body;
    invalid["widgets"][0]["x"] = json!(12);
    assert_eq!(
        request(&app, "POST", "/api/dashboards", &a, invalid)
            .await
            .0,
        400
    );
    assert_eq!(
        request(&app, "GET", "/api/dashboards", &a, Value::Null)
            .await
            .1[0]["widgets"][0]["content"],
        "Privé"
    );
    assert_eq!(request(&app, "DELETE", &path, &a, Value::Null).await.0, 204);
    assert_eq!(
        request(&app, "GET", "/api/dashboards", &a, Value::Null)
            .await
            .1,
        json!([])
    );
}
#[sqlx::test]
async fn subscriptions_and_admin_permissions(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (a, aid) = account(&pool, &app, "a@test.local").await;
    let (b, bid) = account(&pool, &app, "b@test.local").await;
    assert_eq!(
        request(&app, "PUT", "/api/services/github", &a, Value::Null)
            .await
            .0,
        204
    );
    assert_eq!(
        request(&app, "GET", "/api/services", &a, Value::Null)
            .await
            .1,
        json!(["github"])
    );
    assert_eq!(
        request(&app, "GET", "/api/services", &b, Value::Null)
            .await
            .1,
        json!([])
    );
    assert_eq!(
        request(&app, "PUT", "/api/services/unknown", &a, Value::Null)
            .await
            .0,
        400
    );
    assert_eq!(
        request(&app, "GET", "/api/admin/users", &a, Value::Null)
            .await
            .0,
        403
    );
    sqlx::query("INSERT INTO user_roles(user_id,role) VALUES($1::uuid,'admin')")
        .bind(&aid)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE sessions SET role='admin' WHERE user_id=$1::uuid")
        .bind(&aid)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(&app, "GET", "/api/admin/users", &a, Value::Null)
            .await
            .0,
        200
    );
    assert_eq!(
        request(
            &app,
            "PUT",
            &format!("/api/admin/users/{aid}/roles"),
            &a,
            json!({"roles":["perso"]})
        )
        .await
        .0,
        400
    );
    assert_eq!(
        request(
            &app,
            "PUT",
            &format!("/api/admin/users/{bid}/roles"),
            &a,
            json!({"roles":["employe"]})
        )
        .await
        .0,
        204
    );
    assert_eq!(
        request(&app, "GET", "/api/auth/me", &b, Value::Null)
            .await
            .0,
        401
    );
}
#[sqlx::test]
async fn login_attempts_are_limited_before_password_work(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (token, _) = account(&pool, &app, "limit@test.local").await;
    assert!(!token.is_empty());
    use sha2::{Digest, Sha256};
    let hash = format!("{:x}", Sha256::digest(b"limit@test.local"));
    sqlx::query("INSERT INTO login_attempts(address_hash,attempts) VALUES($1,10)")
        .bind(&hash)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/auth/login",
            "",
            json!({"email":"limit@test.local","password":"test-password"})
        )
        .await
        .0,
        429
    );
    sqlx::query(
        "UPDATE login_attempts SET window_start=now()-interval '16 minutes' WHERE address_hash=$1",
    )
    .bind(hash)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/auth/login",
            "",
            json!({"email":"limit@test.local","password":"test-password"})
        )
        .await
        .0,
        200
    );
}

#[sqlx::test]
async fn openai_subscription_and_prompt_validation(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    assert_eq!(
        request(&app, "POST", "/api/ai/ask", "", json!({"prompt":"Bonjour"}))
            .await
            .0,
        401
    );
    assert_eq!(
        request(&app, "GET", "/api/ai/status", "", Value::Null)
            .await
            .0,
        401
    );
    let (token, user) = account(&pool, &app, "ai@test.local").await;
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/ai/ask",
            &token,
            json!({"prompt":"Bonjour"})
        )
        .await
        .0,
        403
    );
    sqlx::query("INSERT INTO service_subscriptions(user_id,service) VALUES($1,'openai')")
        .bind(uuid::Uuid::parse_str(&user).unwrap())
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(&app, "GET", "/api/ai/status", &token, Value::Null)
            .await
            .0,
        200
    );
    for prompt in [" ".to_string(), "a".repeat(8001)] {
        assert_eq!(
            request(
                &app,
                "POST",
                "/api/ai/ask",
                &token,
                json!({"prompt":prompt})
            )
            .await
            .0,
            400
        );
    }
}

/// Same fixture is validated by the frontend POC: API -> SQL -> API round trip.
#[sqlx::test]
async fn poc_stack_persists_two_weather_widgets(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (token, _) = account(&pool, &app, "poc@test.local").await;
    let body: Value = serde_json::from_str(include_str!("../../poc/dashboard.json")).unwrap();
    let (status, created) = request(&app, "POST", "/api/dashboards", &token, body.clone()).await;
    assert_eq!(status, 201, "{created}");
    let (status, stored) = request(&app, "GET", "/api/dashboards", &token, Value::Null).await;
    assert_eq!(status, 200);
    assert_eq!(stored[0]["widgets"], body["widgets"]);
    let path = format!("/api/dashboards/{}", created["id"].as_str().unwrap());
    let mut invalid = body.clone();
    invalid["widgets"][0]["refreshInterval"] = json!(30);
    assert_eq!(
        request(&app, "POST", "/api/dashboards", &token, invalid)
            .await
            .0,
        400
    );
    assert_eq!(
        request(&app, "DELETE", &path, &token, Value::Null).await.0,
        204
    );
}

#[sqlx::test]
async fn local_ai_migration_preserves_custom_titles_and_widget_order(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (_, user) = account(&pool, &app, "migration@test.local").await;
    let widgets = json!([
        {"id":"a","type":"openai_chat","title":"ChatGPT · Demander à l’IA"},
        {"id":"b","type":"openai_chat","title":"Mon assistant"},
        {"id":"c","type":"weather","title":"ChatGPT · Demander à l’IA"}
    ]);
    let id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO user_dashboards(id,user_id,name,widgets) VALUES($1,$2,'Migration',$3)",
    )
    .bind(id)
    .bind(uuid::Uuid::parse_str(&user).unwrap())
    .bind(widgets.clone())
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../migrations/202610050001_local_ai_title.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let result: Value = sqlx::query_scalar("SELECT widgets FROM user_dashboards WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        result[0]["title"],
        "Assistant IA local · Poser une question"
    );
    assert_eq!(result[0]["id"], "a");
    assert_eq!(result[1], widgets[1]);
    assert_eq!(result[2], widgets[2]);
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM user_dashboards WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(revision, 1);
    sqlx::raw_sql(include_str!(
        "../migrations/202610050001_local_ai_title.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM user_dashboards WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(revision, 1);
}

#[sqlx::test]
async fn mistral_ai_migration_preserves_custom_titles_and_widget_order(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (_, user) = account(&pool, &app, "migration@test.local").await;
    let widgets = json!([
        {"id":"a","type":"openai_chat","title":"Assistant IA local · Poser une question"},
        {"id":"b","type":"openai_chat","title":"Mon assistant"},
        {"id":"c","type":"weather","title":"Assistant IA local · Poser une question"}
    ]);
    let id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO user_dashboards(id,user_id,name,widgets) VALUES($1,$2,'Migration',$3)",
    )
    .bind(id)
    .bind(uuid::Uuid::parse_str(&user).unwrap())
    .bind(widgets.clone())
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../migrations/202610190001_mistral_title.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let result: Value = sqlx::query_scalar("SELECT widgets FROM user_dashboards WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        result[0]["title"],
        "Assistant IA"
    );
    assert_eq!(result[0]["id"], "a");
    assert_eq!(result[1], widgets[1]);
    assert_eq!(result[2], widgets[2]);
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM user_dashboards WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(revision, 1);
    sqlx::raw_sql(include_str!(
        "../migrations/202610190001_mistral_title.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM user_dashboards WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(revision, 1);
}

#[sqlx::test]
async fn calculator_requires_subscription_and_preserves_request_quota(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (token, _) = account(&pool, &app, "calculator@test.local").await;
    let input = json!({"prompt":"12 * 3.1 * 2 - 31.4"});
    assert_eq!(
        request(&app, "POST", "/api/ai/ask", &token, input.clone())
            .await
            .0,
        403
    );
    assert_eq!(
        request(&app, "PUT", "/api/services/openai", &token, Value::Null)
            .await
            .0,
        204
    );
    for _ in 0..5 {
        let (status, answer) = request(&app, "POST", "/api/ai/ask", &token, input.clone()).await;
        assert_eq!(status, 200);
        assert!(
            answer["text"]
                .as_str()
                .unwrap()
                .ends_with("Résultat calculé : 43")
        );
    }
    assert_eq!(
        request(&app, "POST", "/api/ai/ask", &token, input).await.0,
        429
    );
}

#[sqlx::test]
async fn habits_history_is_validated_persisted_and_private(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (token, _) = account(&pool, &app, "habits@test.local").await;
    let (other, _) = account(&pool, &app, "other-habits@test.local").await;
    let widget = json!({"id":"tracker","type":"habits","title":"Rituels","x":1,"y":1,"width":12,"height":4,"habits":[{"id":"read","name":"Lire","days":["2024-02-29","2026-10-09"]}]});
    let body = json!({"name":"Habitudes","widgets":[widget.clone()]});
    let (status, created) = request(&app, "POST", "/api/dashboards", &token, body).await;
    assert_eq!(status, 201, "{created}");
    let restarted = lumi_backend::app(pool);
    let (status, boards) = request(&restarted, "GET", "/api/dashboards", &token, Value::Null).await;
    assert_eq!(status, 200);
    assert_eq!(boards[0]["widgets"][0], widget);
    assert_eq!(
        request(&restarted, "GET", "/api/dashboards", &other, Value::Null)
            .await
            .1,
        json!([])
    );
    for habits in [
        json!({}),
        json!([{"id":"a","name":" ","days":[]}]),
        json!([{"id":"a","name":"Lire","days":["2026-02-29"]}]),
        json!([{"id":"a","name":"Lire","days":["2026-10-09","2026-10-09"]}]),
        json!([{"id":"a","name":"Lire","days":[],"token":"private"}]),
    ] {
        let mut invalid = widget.clone();
        invalid["habits"] = habits;
        assert_eq!(
            request(
                &restarted,
                "POST",
                "/api/dashboards",
                &token,
                json!({"name":"Invalide","widgets":[invalid]})
            )
            .await
            .0,
            400
        );
    }
}

#[sqlx::test]
async fn subscriptions_guard_new_instances_but_preserve_paused_widgets(pool: PgPool) {
    let app = lumi_backend::app(pool.clone());
    let (token, _) = account(&pool, &app, "subscription-guard@test.local").await;
    let widget =
        json!({"id":"calendar","type":"agenda","title":"Agenda","x":1,"y":1,"width":6,"height":2});
    let body = json!({"name":"Services","widgets":[widget.clone()]});
    assert_eq!(
        request(&app, "POST", "/api/dashboards", &token, body.clone())
            .await
            .0,
        403
    );
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/services/google_calendar",
            &token,
            Value::Null
        )
        .await
        .0,
        204
    );
    let (status, board) = request(&app, "POST", "/api/dashboards", &token, body.clone()).await;
    assert_eq!(status, 201);
    assert_eq!(
        request(
            &app,
            "DELETE",
            "/api/services/google_calendar",
            &token,
            Value::Null
        )
        .await
        .0,
        204
    );
    let path = format!("/api/dashboards/{}", board["id"].as_str().unwrap());
    let mut edit = body.clone();
    edit["revision"] = json!(0);
    // Saving a dormant existing instance remains possible; no data is deleted.
    assert_eq!(
        request(&app, "PUT", &path, &token, edit.clone()).await.0,
        200
    );
    edit["revision"] = json!(1);
    let mut additional = widget.clone();
    additional["id"] = json!("second");
    edit["widgets"].as_array_mut().unwrap().push(additional);
    assert_eq!(
        request(&app, "PUT", &path, &token, edit.clone()).await.0,
        403
    );
    // Importing into another dashboard is a new instance, even with the same ID.
    assert_eq!(
        request(&app, "POST", "/api/dashboards", &token, body)
            .await
            .0,
        403
    );
    edit["widgets"] = json!([]);
    assert_eq!(request(&app, "PUT", &path, &token, edit).await.0, 200);
}
