use axum::{
    extract::{MatchedPath, Request},
    middleware::Next,
    response::{IntoResponse, Response},
};

pub async fn request_context(request: Request, next: Next) -> Response {
    let started = std::time::Instant::now();
    let method = request.method().to_string();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_owned())
        .unwrap_or_else(|| "unmatched".into());
    let request_id = uuid::Uuid::new_v4().to_string();
    // No cross-origin CORS permissions are granted. Cookie-authenticated mutations
    // must be initiated by our JS client, never by a cross-site HTML form.
    let unsafe_method = !matches!(request.method().as_str(), "GET" | "HEAD" | "OPTIONS");
    let cross_site = request
        .headers()
        .get("sec-fetch-site")
        .is_some_and(|value| value == "cross-site");
    let cookie_auth = crate::auth::cookie_token(request.headers()).is_some()
        && !request.headers().contains_key("authorization");
    let client_header = request
        .headers()
        .get("x-lumi-client")
        .is_some_and(|value| value == "web");
    let mut response = if unsafe_method && (cross_site || (cookie_auth && !client_header)) {
        (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({"message":"Requête de session non autorisée."})),
        )
            .into_response()
    } else {
        next.run(request).await
    };
    eprintln!(
        "{}",
        serde_json::json!({"event":"http_request", "request_id":request_id, "method":method, "route":route, "status":response.status().as_u16(), "duration_ms":started.elapsed().as_millis()})
    );
    response
        .headers_mut()
        .insert("x-request-id", request_id.parse().unwrap());
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    for (name, value) in [
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("referrer-policy", "no-referrer"),
    ] {
        response.headers_mut().insert(name, value.parse().unwrap());
    }
    response
}
