//! Anthropic Claude のストリーミング実装。
//!
//! 注意点:
//! - Claude Opus 5 では `temperature` が廃止されており、送ると HTTP 400 になる。
//!   決定性の制御は `output_config.effort` で行う。
//! - 安全性分類器がリクエストを拒否すると HTTP 200 のまま
//!   `stop_reason: "refusal"` が返るため、明示的に検知する。
//! - `fallbacks: "default"` を有効化し、拒否時は自動で代替モデルへ回す。

use serde_json::json;
use tauri::ipc::Channel;

use crate::error::{code, AppError, Result};
use crate::http;
use crate::llm::{ensure_success, pump_sse, LlmEvent, LlmRequest, TokenUsage};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const BETA_FALLBACK: &str = "server-side-fallback-2026-07-01";

pub async fn stream(
    api_key: &str,
    model: &str,
    request: &LlmRequest,
    max_tokens: u32,
    channel: &Channel<LlmEvent>,
    usage: &mut TokenUsage,
    truncated: &mut bool,
) -> Result<String> {
    let messages: Vec<_> = request
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "stream": true,
        // temperature は送らない（Opus 5 では 400 になる）。深さは effort で制御する。
        "output_config": { "effort": "medium" },
        "fallbacks": "default",
    });

    if let Some(system) = request.system.as_ref().filter(|s| !s.trim().is_empty()) {
        body["system"] = json!(system);
    }

    let res = http::llm_client()?
        .post(API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .header("anthropic-beta", BETA_FALLBACK)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let res = ensure_success(res, "Anthropic").await?;

    pump_sse(
        res,
        request.request_id.as_deref().unwrap_or_default(),
        channel,
        usage,
        truncated,
        |payload| {
        let value: serde_json::Value = match serde_json::from_str(payload) {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };

        match value.get("type").and_then(|v| v.as_str()) {
            Some("content_block_delta") => {
                // text_delta 以外（thinking_delta 等）は本文に含めない
                if value.pointer("/delta/type").and_then(|v| v.as_str()) == Some("text_delta") {
                    return Ok(value
                        .pointer("/delta/text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()));
                }
                Ok(None)
            }
            Some("message_delta") => {
                if value.pointer("/delta/stop_reason").and_then(|v| v.as_str()) == Some("refusal") {
                    let category = value
                        .pointer("/delta/stop_details/category")
                        .and_then(|v| v.as_str())
                        .unwrap_or("不明");
                    return Err(AppError::detail(code::LLM_RESPONSE_INVALID, category.to_string()));
                }
                Ok(None)
            }
            Some("error") => {
                let message = value
                    .pointer("/error/message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("詳細不明のエラー");
                Err(AppError::detail(code::LLM_RESPONSE_INVALID, message.to_string()))
            }
            _ => Ok(None),
        }
    })
    .await
}
