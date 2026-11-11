use axum::{Json, extract::ConnectInfo, http::HeaderMap};
use serde_json::{Value, json};
use std::{
    net::{IpAddr, SocketAddr},
    time::{SystemTime, UNIX_EPOCH},
};

pub async fn about(ConnectInfo(peer): ConnectInfo<SocketAddr>, headers: HeaderMap) -> Json<Value> {
    // Only enable behind the private reverse proxy, which overwrites this header.
    let ip = if std::env::var("TRUST_PROXY").as_deref() == Ok("true") {
        headers
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<IpAddr>().ok())
            .unwrap_or(peer.ip())
    } else {
        peer.ip()
    };
    Json(json!({
        "client": { "host": ip.to_string() },
        "server": {
            "current_time": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
            "services": catalog()
        }
    }))
}

fn widget(name: &str, description: &str, params: &[(&str, &str)]) -> Value {
    let mut parameters = vec![json!({"name": "title", "type": "string"})];
    if ![
        "openai_chat",
        "habits",
        "notes",
        "focus",
        "gmail_compose",
        "spotify_player",
    ]
    .contains(&name)
    {
        parameters.push(json!({"name":"refreshInterval", "type":"integer"}));
    }
    parameters.extend(
        params
            .iter()
            .map(|(name, kind)| json!({"name": name, "type": kind})),
    );
    json!({"name": name, "description": description, "params": parameters})
}

pub fn catalog() -> Value {
    json!([
        {"name":"mistral", "widgets":[widget("openai_chat", "Question au modèle Mistral", &[])]},
        {"name": "github", "widgets": [
            widget("github_pushes", "Push récents du dépôt", &[("githubRepo", "string"), ("githubLimit", "integer")]),
            widget("github_graph", "Graphe des commits", &[("githubRepo", "string")])
        ]},
        {"name": "spotify", "widgets": [
            widget("spotify_player", "Lecture Spotify en cours", &[("clientId", "string"), ("refreshInterval", "integer")]),
            widget("spotify_top", "Titres Spotify favoris", &[("clientId", "string"), ("timeRange", "string"), ("limit", "integer")])
        ]},
        {"name": "gmail", "widgets": [
            widget("gmail_unread", "Messages non lus", &[("gmailClientId", "string"), ("gmailLimit", "integer")]),
            widget("gmail_compose", "Rédaction et envoi de messages", &[("gmailClientId", "string"), ("gmailAccount", "string")])
        ]},
        {"name": "google_calendar", "widgets": [
            widget("agenda", "Échéances du mois", &[]),
            widget("calendar_week", "Planning semaine et jour", &[])
        ]},
        {"name": "weather", "widgets": [widget("weather", "Conditions actuelles Open-Meteo", &[("city", "string")])]},
        {"name": "local", "widgets": [
            widget("habits", "Suivi quotidien des habitudes", &[]),
            widget("notes", "Notes personnelles persistées", &[("content", "string")]),
            widget("focus", "Minuteur local", &[("duration", "integer")])
        ]}
    ])
}
