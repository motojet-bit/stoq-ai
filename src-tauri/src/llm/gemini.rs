//! Google Gemini のストリーミング実装。

use serde_json::json;
use tauri::ipc::Channel;

use crate::error::Result;
use crate::http;
use crate::llm::{ensure_success, pump_sse, LlmEvent, LlmRequest, TEMPERATURE};

pub async fn stream(
    api_key: &str,
    model: &str,
    request: &LlmRequest,
    max_tokens: u32,
    channel: &Channel<LlmEvent>,
) -> Result<String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
    );

    let contents: Vec<_> = request
        .messages
        .iter()
        .map(|m| {
            // Gemini では assistant を "model" と呼ぶ
            let role = if m.role == "assistant" { "model" } else { "user" };
            json!({ "role": role, "parts": [{ "text": m.content }] })
        })
        .collect();

    let mut body = json!({
        "contents": contents,
        "generationConfig": {
            "temperature": TEMPERATURE,
            "maxOutputTokens": max_tokens,
        },
    });

    if let Some(system) = request.system.as_ref().filter(|s| !s.trim().is_empty()) {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }

    let res = http::client()?
        .post(&url)
        .header("x-goog-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let res = ensure_success(res, "Gemini").await?;

    pump_sse(res, request.request_id.as_deref().unwrap_or_default(), channel, |payload| {
        let value: serde_json::Value = match serde_json::from_str(payload) {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };

        // 1 チャンクに複数の parts が入ることがあるため連結する
        let text: String = value
            .pointer("/candidates/0/content/parts")
            .and_then(|v| v.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<String>()
            })
            .unwrap_or_default();

        Ok(if text.is_empty() { None } else { Some(text) })
    })
    .await
}
