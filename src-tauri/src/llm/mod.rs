//! LLM Unified Engine。
//!
//! OpenAI / Anthropic / Gemini / OpenAI互換(Custom) を共通の
//! `LlmRequest` で呼び分け、トークンを Channel でストリーミングする。

pub mod anthropic;
pub mod gemini;
pub mod openai;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use crate::error::{AppError, Result};
use crate::settings::Settings;

/// 会話 1 メッセージ。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    /// "user" | "assistant"
    pub role: String,
    pub content: String,
}

/// フロントエンドからのリクエスト。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRequest {
    /// 未指定なら設定の既定プロバイダを使う
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub system: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

/// ストリーミングでフロントへ返すイベント。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum LlmEvent {
    Start { provider: String, model: String },
    Delta { text: String },
    Done { text: String },
    Error { message: String },
}

/// 決定論的出力のための温度。Anthropic には送らない（400 になるため）。
pub const TEMPERATURE: f32 = 0.0;
pub const DEFAULT_MAX_TOKENS: u32 = 8192;

pub async fn send(settings: &Settings, request: LlmRequest, channel: Channel<LlmEvent>) -> Result<()> {
    let provider = request
        .provider
        .clone()
        .unwrap_or_else(|| settings.provider.clone());

    if request.messages.is_empty() {
        return Err(AppError::msg("送信するメッセージがありません。"));
    }

    let model = settings.model_for(&provider);
    let api_key = settings.key_for(&provider)?;
    let max_tokens = request.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS);

    let _ = channel.send(LlmEvent::Start {
        provider: provider.clone(),
        model: model.clone(),
    });

    let result = match provider.as_str() {
        "openai" => {
            openai::stream(
                "https://api.openai.com/v1",
                &api_key,
                &model,
                &request,
                max_tokens,
                &channel,
            )
            .await
        }
        "anthropic" => anthropic::stream(&api_key, &model, &request, max_tokens, &channel).await,
        "gemini" => gemini::stream(&api_key, &model, &request, max_tokens, &channel).await,
        // それ以外はユーザーが追加した OpenAI互換プロバイダ
        id => match settings.custom(id) {
            None => Err(AppError::msg(format!("未知のプロバイダです: {id}"))),
            Some(custom) => {
                let base = custom.base_url.trim().trim_end_matches('/');
                if base.is_empty() {
                    Err(AppError::msg(format!(
                        "「{}」の Base URL が未設定です。設定画面から登録してください。",
                        custom.label
                    )))
                } else if model.trim().is_empty() {
                    Err(AppError::msg(format!(
                        "「{}」のモデル名が未設定です。設定画面から登録してください。",
                        custom.label
                    )))
                } else {
                    openai::stream(base, &api_key, &model, &request, max_tokens, &channel).await
                }
            }
        },
    };

    match result {
        Ok(text) => {
            let _ = channel.send(LlmEvent::Done { text });
            Ok(())
        }
        Err(err) => {
            let _ = channel.send(LlmEvent::Error {
                message: err.to_string(),
            });
            Err(err)
        }
    }
}

/// レスポンスが 2xx でなければ、本文を含む日本語エラーに変換する。
pub async fn ensure_success(res: reqwest::Response, provider: &str) -> Result<reqwest::Response> {
    if res.status().is_success() {
        return Ok(res);
    }
    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    let detail = extract_error_message(&body).unwrap_or_else(|| body.chars().take(500).collect());

    let hint = match status {
        401 => "（APIキーが正しいか確認してください）",
        403 => "（APIキーの権限、またはモデルへのアクセス権を確認してください）",
        404 => "（モデル名または Base URL が正しいか確認してください）",
        429 => "（レート制限に達しました。しばらく待って再試行してください）",
        _ => "",
    };

    Err(AppError::msg(format!(
        "{provider} API エラー (HTTP {status}){hint}: {detail}"
    )))
}

pub fn extract_error_message(body: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(body).ok()?;
    for pointer in ["/error/message", "/message", "/error"] {
        if let Some(s) = json.pointer(pointer).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

/// SSE ストリームを読み、`extract` が返したテキストを Delta として送出する。
///
/// `extract` は 1 件の `data:` ペイロードを受け取り、
/// 追記すべきテキスト（なければ None）を返す。Err を返すとストリームを中断する。
pub async fn pump_sse<F>(
    res: reqwest::Response,
    channel: &Channel<LlmEvent>,
    mut extract: F,
) -> Result<String>
where
    F: FnMut(&str) -> Result<Option<String>>,
{
    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut accumulated = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(newline) = buffer.find('\n') {
            let line = buffer[..newline].trim_end_matches('\r').to_string();
            buffer.drain(..=newline);

            let Some(payload) = line.strip_prefix("data:") else {
                continue;
            };
            let payload = payload.trim();
            if payload.is_empty() || payload == "[DONE]" {
                continue;
            }

            if let Some(text) = extract(payload)? {
                if !text.is_empty() {
                    accumulated.push_str(&text);
                    let _ = channel.send(LlmEvent::Delta { text });
                }
            }
        }
    }

    Ok(accumulated)
}
