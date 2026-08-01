//! OpenAI および OpenAI互換 API（DeepSeek 等）のストリーミング実装。

use serde_json::json;
use tauri::ipc::Channel;

use crate::error::Result;
use crate::http;
use crate::llm::{ensure_success, pump_sse, LlmEvent, LlmRequest, TEMPERATURE};

pub async fn stream(
    base_url: &str,
    api_key: &str,
    model: &str,
    request: &LlmRequest,
    max_tokens: u32,
    channel: &Channel<LlmEvent>,
) -> Result<String> {
    let mut messages = Vec::new();
    if let Some(system) = request.system.as_ref().filter(|s| !s.trim().is_empty()) {
        messages.push(json!({ "role": "system", "content": system }));
    }
    for m in &request.messages {
        messages.push(json!({ "role": m.role, "content": m.content }));
    }

    let body = json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": TEMPERATURE,
        "stream": true,
    });

    let res = http::client()?
        .post(format!("{base_url}/chat/completions"))
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let res = ensure_success(res, "OpenAI互換").await?;

    pump_sse(res, channel, |payload| {
        let value: serde_json::Value = match serde_json::from_str(payload) {
            Ok(v) => v,
            // ハートビートなど JSON でない行は無視する
            Err(_) => return Ok(None),
        };
        Ok(value
            .pointer("/choices/0/delta/content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()))
    })
    .await
}
