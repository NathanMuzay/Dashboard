//! Mistral API assistant. Historical module/subscription IDs remain compatible.
use crate::{AppState, auth::AuthUser, error::ApiError};
use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Ask {
    prompt: String,
}
#[derive(Serialize, utoipa::ToSchema)]
pub struct Answer {
    text: String,
    incomplete: bool,
}
const MISTRAL_URL: &str = "https://api.mistral.ai/v1";
fn config() -> (String, String) {
    let key = std::env::var("MISTRAL_API_KEY")
        .unwrap_or_default()
        .trim()
        .to_owned();
    let model = std::env::var("MISTRAL_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "ministral-3b-2512".into());
    (key, model.trim().to_owned())
}
fn client(timeout: u64) -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Configuration HTTP indisponible.",
            )
        })
}
fn model_present(data: &Value, model: &str) -> bool {
    data["data"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|item| item["id"].as_str() == Some(model))
}
fn upstream_error(status: StatusCode) -> ApiError {
    ApiError(
        StatusCode::SERVICE_UNAVAILABLE,
        match status.as_u16() {
            401 | 403 => {
                "Clé API Mistral invalide ou accès refusé. Vérifiez la configuration du serveur."
            }
            402 => "Le compte Mistral ne dispose plus de crédits. Vérifiez la facturation.",
            404 => "Le modèle Mistral sélectionné est indisponible.",
            429 => "Quota ou limite Mistral atteint. Patientez ou vérifiez les crédits du compte.",
            _ => "Mistral est momentanément indisponible. Réessayez plus tard.",
        },
    )
}
pub async fn status(_user: AuthUser) -> Json<Value> {
    let (key, model) = config();
    let result = async {
        if key.is_empty() {
            return Err(ApiError(StatusCode::SERVICE_UNAVAILABLE, "Ajoutez MISTRAL_API_KEY dans le fichier .env du serveur puis redémarrez le backend."));
        }
        let response = client(10)?.get(format!("{MISTRAL_URL}/models"))
            .bearer_auth(&key).send().await
            .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE, "Connexion à Mistral impossible."))?;
        if !response.status().is_success() {
            return Err(upstream_error(response.status()));
        }
        let data = response.json::<Value>().await
            .map_err(|_| ApiError(StatusCode::BAD_GATEWAY, "Réponse Mistral illisible."))?;
        if !model_present(&data, &model) {
            return Err(upstream_error(StatusCode::NOT_FOUND));
        }
        Ok(())
    }.await;
    let message = match &result {
        Ok(()) => "Le modèle Mistral est prêt.",
        Err(error) => error.1,
    };
    Json(json!({"configured":result.is_ok(),"provider":"mistral","model":model,"message":message}))
}
fn extract_answer(data: &Value) -> Result<Answer, ApiError> {
    let text = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("");
    if text.trim().is_empty()
        || !matches!(
            data["choices"][0]["finish_reason"].as_str(),
            Some("stop" | "length")
        )
    {
        return Err(ApiError(
            StatusCode::BAD_GATEWAY,
            "Aucune réponse complète reçue. Reformulez votre demande.",
        ));
    }
    Ok(Answer {
        text: text.into(),
        incomplete: data["choices"][0]["finish_reason"] == "length",
    })
}
const SYSTEM_PROMPT: &str = "Tu es l’assistant de Lumi. Réponds en français, clairement et brièvement, sauf si une autre langue est demandée. Réponds aux questions générales à partir de tes connaissances. N’invente pas de faits, de chiffres, de citations ni de sources. Si tu ne sais pas, dis-le ; si la question est ambiguë, demande une précision. Tu n’as pas accès à Internet, aux autres widgets, aux comptes ni aux fichiers de l’utilisateur. Pour la météo actuelle, les actualités, les prix, les scores, les horaires ou toute information demandée en temps réel, explique que tu ne peux pas vérifier les données actuelles et ne donne pas de valeur présentée comme actuelle. Ne prétends pas avoir consulté une source ou exécuté une action. Pour les calculs, vérifie le résultat avant de répondre. Chaque demande est indépendante des précédentes.";

async fn generate(url: &str, key: &str, model: &str, prompt: &str) -> Result<Answer, ApiError> {
    if crate::calculator::is_expression(prompt) {
        return crate::calculator::evaluate(prompt)
            .map(calculation_answer)
            .map_err(ApiError::invalid);
    }
    if key.is_empty() {
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "Ajoutez MISTRAL_API_KEY dans le fichier .env du serveur puis redémarrez le backend.",
        ));
    }
    let calculate = crate::calculator::wants_calculation(prompt);
    let system = if calculate {
        "Traduis la demande en un plan JSON sans calculer le résultat. Pour une somme des entiers d’un intervalle inclusif, retourne {\"range\":{\"start\":1,\"end\":12,\"exclude\":[11]}} (exemple : somme de 1 à 12 sauf 11). Pour les autres calculs, retourne {\"expression\":\"12 * 3.1 * 2 - 31.4\"}. Utilise uniquement les nombres présents dans la demande, en conservant leurs décimales. Ne développe jamais un intervalle en expression. Ne retourne aucune autre propriété. Si la demande est ambiguë ou nécessite d’inventer des nombres, retourne {\"expression\":\"\"}."
    } else {
        SYSTEM_PROMPT
    };
    let mut body = json!({
        "model":model,"stream":false,
        "messages":[{"role":"system","content":system},{"role":"user","content":prompt}],
        "max_tokens":if calculate {256} else {384},"temperature":0.1
    });
    if calculate {
        body["response_format"] = json!({"type":"json_object"});
    }
    let response = client(60)?.post(format!("{url}/chat/completions")).bearer_auth(key).json(&body).send().await.map_err(|error| ApiError(StatusCode::SERVICE_UNAVAILABLE, if error.is_timeout() { "Mistral n’a pas répondu à temps. Aucun nouvel envoi automatique n’a été effectué." } else { "Connexion à Mistral impossible." }))?;
    if !response.status().is_success() {
        return Err(upstream_error(response.status()));
    }
    let data: Value = response
        .json()
        .await
        .map_err(|_| ApiError(StatusCode::BAD_GATEWAY, "Réponse Mistral illisible."))?;
    let answer = extract_answer(&data)?;
    if calculate {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Plan {
            expression: Option<String>,
            range: Option<Range>,
        }
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Range {
            start: i64,
            end: i64,
            exclude: Vec<i64>,
        }
        let invalid = || {
            ApiError::invalid(
                "Je n’ai pas pu interpréter ce calcul. Écrivez une expression avec +, -, *, / et des parenthèses.",
            )
        };
        let plan: Plan = serde_json::from_str(&answer.text).map_err(|_| invalid())?;
        if answer.incomplete {
            return Err(invalid());
        }
        let calculation = match (plan.expression, plan.range) {
            (Some(expression), None) => {
                if !crate::calculator::same_numbers(prompt, &expression) {
                    return Err(invalid());
                }
                crate::calculator::evaluate(&expression).map_err(ApiError::invalid)?
            }
            (None, Some(range)) => {
                let operands = format!(
                    "{} {} {}",
                    range.start,
                    range.end,
                    range
                        .exclude
                        .iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                        .join(" ")
                );
                if !crate::calculator::same_numbers(prompt, &operands) {
                    return Err(invalid());
                }
                crate::calculator::sum_range(range.start, range.end, &range.exclude)
                    .map_err(ApiError::invalid)?
            }
            _ => return Err(invalid()),
        };
        return Ok(calculation_answer(calculation));
    }
    Ok(answer)
}
fn calculation_answer(calculation: crate::calculator::Calculation) -> Answer {
    Answer {
        text: format!(
            "Expression interprétée : {}\nRésultat calculé{} : {}",
            calculation.expression,
            if calculation.approximate {
                " (arrondi)"
            } else {
                ""
            },
            calculation.result
        ),
        incomplete: false,
    }
}
#[utoipa::path(post,path="/api/ai/ask",request_body=Ask,responses((status=200,body=Answer),(status=401,description="Session requise"),(status=429,description="Limite atteinte"),(status=503,description="Mistral indisponible")))]
pub async fn ask(
    user: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<Ask>,
) -> Result<Json<Answer>, ApiError> {
    if input.prompt.trim().is_empty() || input.prompt.chars().count() > 8000 {
        return Err(ApiError::invalid(
            "Saisissez une demande de 1 à 8 000 caractères.",
        ));
    }
    let subscribed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM service_subscriptions WHERE user_id=$1 AND service='openai')",
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await?;
    if !subscribed {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Activez l’assistant IA Mistral dans Mon compte → Mes services.",
        ));
    }
    let count:i32=sqlx::query_scalar("INSERT INTO ai_requests(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET requests=CASE WHEN ai_requests.window_start<now()-interval '1 minute' THEN 1 ELSE ai_requests.requests+1 END, window_start=CASE WHEN ai_requests.window_start<now()-interval '1 minute' THEN now() ELSE ai_requests.window_start END RETURNING requests").bind(user.id).fetch_one(&state.pool).await?;
    if count > 5 {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Maximum cinq demandes par minute. Patientez avant de réessayer.",
        ));
    }
    static GENERATION: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
    let _permit = GENERATION.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "L’assistant Mistral répond déjà à une demande. Patientez avant de réessayer.",
        )
    })?;
    let (key, model) = config();
    Ok(Json(
        generate(MISTRAL_URL, &key, &model, input.prompt.trim()).await?,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_returns_visible_content_and_marks_truncation() {
        let answer = extract_answer(&json!({"choices":[{"message":{"content":"Bonjour","thinking":"private"},"finish_reason":"length"}]})).ok().unwrap();
        assert_eq!(answer.text, "Bonjour");
        assert!(answer.incomplete);
        assert!(
            extract_answer(&json!({"choices":[{"message":{"content":""},"finish_reason":"stop"}]}))
                .is_err()
        );
        assert!(
            extract_answer(
                &json!({"choices":[{"message":{"content":"partial"},"finish_reason":null}]})
            )
            .is_err()
        );
    }
    #[test]
    fn readiness_checks_the_selected_model() {
        let tags = json!({"data":[{"id":"ministral-3b-2512"},{"id":"other"}]});
        assert!(model_present(&tags, "ministral-3b-2512"));
        assert!(model_present(&tags, "other"));
        assert!(!model_present(&tags, "missing"));
        assert!(!model_present(&Value::Null, "ministral-3b-2512"));
    }
    #[tokio::test]
    async fn natural_language_calculation_is_computed_and_invented_operands_are_rejected() {
        use axum::{Router, routing::post};
        let app = Router::new().route("/chat/completions", post(|Json(body):Json<Value>| async move {
            assert_eq!(body["response_format"]["type"], "json_object");
            if body["model"] == "range" || body["model"] == "invented-range" {
                let excluded = if body["model"] == "range" { 11 } else { 10 };
                return Json(json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"range":{"start":1,"end":12,"exclude":[excluded]}}).to_string()}}]}));
            }
            let expression = if body["model"] == "invented" { "123.1 - 31.4" } else { "12 * 3.1 * 2 - 31.4" };
            Json(json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"expression":expression}).to_string()}}]}))
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let range_question = "c'est quoi la somme des nombres de 1 à 12 en excluant 11";
        let range_answer = generate(&url, "test-key", "range", range_question)
            .await
            .ok()
            .unwrap();
        assert!(range_answer.text.ends_with("Résultat calculé : 67"));
        assert!(
            generate(&url, "test-key", "invented-range", range_question)
                .await
                .is_err()
        );
        let question = "fais moi la multiplication des nombres 12 3.1 et 2 puis tu soustrait 31.4";
        let answer = generate(&url, "test-key", "local", question)
            .await
            .ok()
            .unwrap();
        assert!(answer.text.ends_with("Résultat calculé : 43"));
        assert_eq!(
            generate(&url, "test-key", "invented", question)
                .await
                .err()
                .unwrap()
                .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            generate("http://127.0.0.1:1", "", "unused", "1 / 0")
                .await
                .err()
                .unwrap()
                .0,
            StatusCode::BAD_REQUEST
        );
        // An explicit expression works without any model/network connection.
        assert!(
            generate("http://127.0.0.1:1", "", "unused", "12 * 3.1 * 2 - 31.4")
                .await
                .ok()
                .unwrap()
                .text
                .ends_with("43")
        );
        server.abort();
    }
    #[tokio::test]
    async fn sends_mistral_chat_with_server_key_and_handles_missing_model() {
        use axum::{Router, http::HeaderMap, routing::post};
        let app = Router::new().route(
            "/chat/completions",
            post(|headers: HeaderMap, Json(body): Json<Value>| async move {
                assert_eq!(headers["authorization"], "Bearer test-key");
                assert_eq!(body["stream"], false);
                assert!(body.get("think").is_none());
                assert_eq!(body["max_tokens"], 384);
                assert_eq!(body["temperature"], 0.1);
                assert!(
                    body["messages"][0]["content"]
                        .as_str()
                        .unwrap()
                        .contains("temps réel")
                );
                assert_eq!(body["messages"][1]["content"], "Bonjour");
                let failure = match body["model"].as_str() {
                    Some("missing") => Some(StatusCode::NOT_FOUND),
                    Some("invalid-key") => Some(StatusCode::UNAUTHORIZED),
                    Some("quota") => Some(StatusCode::TOO_MANY_REQUESTS),
                    _ => None,
                };
                if let Some(status) = failure {
                    return (status, Json(json!({"error":"internal-detail"})));
                }
                (
                    StatusCode::OK,
                    Json(
                        json!({"choices":[{"finish_reason":"stop","message":{"content":"Salut"}}]}),
                    ),
                )
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        assert_eq!(
            generate(&url, "test-key", "ministral-3b-2512", "Bonjour")
                .await
                .ok()
                .unwrap()
                .text,
            "Salut"
        );
        let error = generate(&url, "test-key", "missing", "Bonjour")
            .await
            .err()
            .unwrap();
        assert_eq!(error.0, StatusCode::SERVICE_UNAVAILABLE);
        assert!(!error.1.contains("internal-detail"));
        for (model, message) in [("invalid-key", "Clé API"), ("quota", "Quota")] {
            let error = generate(&url, "test-key", model, "Bonjour")
                .await
                .err()
                .unwrap();
            assert_eq!(error.0, StatusCode::SERVICE_UNAVAILABLE);
            assert!(error.1.contains(message));
            assert!(!error.1.contains("internal-detail"));
        }
        let error = generate("http://127.0.0.1:1", "", "unused", "Bonjour")
            .await
            .err()
            .unwrap();
        assert!(error.1.contains("MISTRAL_API_KEY"));
        server.abort();
    }
}
