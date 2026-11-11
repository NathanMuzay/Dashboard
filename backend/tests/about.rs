use axum::{body::Body, extract::ConnectInfo, http::Request};
use http_body_util::BodyExt;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

#[tokio::test]
async fn public_catalog_has_client_time_and_typed_parameters() {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://unused:unused@localhost/unused")
        .unwrap();
    let mut request = Request::builder()
        .uri("/about.json")
        .header("x-real-ip", "198.51.100.9")
        .body(Body::empty())
        .unwrap();
    request.extensions_mut().insert(ConnectInfo(
        "192.0.2.42:1234".parse::<std::net::SocketAddr>().unwrap(),
    ));
    let response = lumi_backend::app(pool).oneshot(request).await.unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(response.headers()["x-frame-options"], "DENY");
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    assert_eq!(response.headers()["cache-control"], "no-store");
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["client"]["host"], "192.0.2.42");
    assert!(value["server"]["current_time"].as_u64().unwrap() > 1_700_000_000);
    let services = value["server"]["services"].as_array().unwrap();
    assert_eq!(services.len(), 7);
    let mut count = 0;
    for service in services {
        for widget in service["widgets"].as_array().unwrap() {
            count += 1;
            assert!(!widget["description"].as_str().unwrap().is_empty());
            for param in widget["params"].as_array().unwrap() {
                assert!(matches!(param["type"].as_str(), Some("integer" | "string")));
            }
        }
    }
    assert_eq!(count, 13);
}

#[test]
fn catalog_matches_frontend_widget_types() {
    let source = include_str!("../../frontend/src/widgets/catalog.js");
    let types = source
        .split("export const WIDGET_TYPES = {")
        .nth(1)
        .unwrap()
        .split("export const WIDGET_CONFIG_KEYS")
        .next()
        .unwrap();
    let mut frontend: Vec<_> = types
        .lines()
        .filter_map(|line| {
            if line.starts_with("  ") && !line.starts_with("   ") {
                line.trim()
                    .split_once(": {")
                    .map(|(name, _)| name.to_owned())
            } else {
                None
            }
        })
        .collect();
    let catalog = lumi_backend::about::catalog();
    let mut backend: Vec<_> = catalog
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|service| service["widgets"].as_array().unwrap())
        .map(|widget| widget["name"].as_str().unwrap().to_owned())
        .collect();
    frontend.sort();
    backend.sort();
    assert_eq!(frontend, backend);
}

#[tokio::test]
async fn oversized_json_is_rejected_before_database_work() {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://unused:unused@localhost/unused")
        .unwrap();
    let request = Request::builder()
        .method("POST")
        .uri("/api/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(format!(
            "{{\"name\":\"{}\"}}",
            "x".repeat(1024 * 1024)
        )))
        .unwrap();
    let response = lumi_backend::app(pool).oneshot(request).await.unwrap();
    assert_eq!(response.status(), 413);
    assert_eq!(response.headers()["cache-control"], "no-store");
}

#[test]
fn weather_catalog_declares_live_provider_and_configurable_timer() {
    let services = lumi_backend::about::catalog();
    let service = services.as_array().unwrap().iter().find(|s| s["name"] == "weather").unwrap();
    let widget = &service["widgets"][0];
    assert!(widget["description"].as_str().unwrap().contains("Open-Meteo"));
    assert!(widget["params"].as_array().unwrap().iter().any(|p| p["name"] == "city" && p["type"] == "string"));
    assert!(widget["params"].as_array().unwrap().iter().any(|p| p["name"] == "refreshInterval" && p["type"] == "integer"));
    for service in services.as_array().unwrap() {
        assert!(!service["name"].as_str().unwrap().is_empty());
        for widget in service["widgets"].as_array().unwrap() {
            let mut names = std::collections::HashSet::new();
            for param in widget["params"].as_array().unwrap() {
                assert!(names.insert(param["name"].as_str().unwrap()));
            }
        }
    }
}
