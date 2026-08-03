//! OpenAI および OpenAI互換 API（DeepSeek 等）のストリーミング実装。
//!
//! ## パラメータの方言吸収
//!
//! OpenAI互換を名乗る API はパラメータの受け付け方が揃っていない。
//!
//! - GPT-5 系（api.openai.com）は `max_tokens` を拒否し `max_completion_tokens` を要求する
//! - GPT-5 系は `temperature` に既定値以外を許さない
//! - DeepSeek など他社の互換 API は逆に `max_tokens` しか受け付けない
//!
//! そこで「まず本命の形で送り、400 が返ったらエラーメッセージを読んで
//! パラメータを調整して自動で再送する」方式をとる。

use serde_json::{json, Value};
use tauri::ipc::Channel;

use crate::error::{code, AppError, Result};
use crate::http;
use crate::llm::{extract_error_message, pump_sse, LlmEvent, LlmRequest, TokenUsage, TEMPERATURE};

/// 出力上限を指定するパラメータ名。
#[derive(Debug, Clone, Copy, PartialEq)]
enum TokenParam {
    MaxTokens,
    MaxCompletionTokens,
}

impl TokenParam {
    fn key(self) -> &'static str {
        match self {
            TokenParam::MaxTokens => "max_tokens",
            TokenParam::MaxCompletionTokens => "max_completion_tokens",
        }
    }
}

/// 送信時に調整しうるパラメータの状態。
#[derive(Debug, Clone, Copy)]
struct Dialect {
    token_param: TokenParam,
    send_temperature: bool,
    /// 出力上限パラメータの切り替えは 1 回だけ。往復して無限ループになるのを防ぐ。
    token_param_switched: bool,
}

pub async fn stream(
    base_url: &str,
    api_key: &str,
    model: &str,
    request: &LlmRequest,
    max_tokens: u32,
    channel: &Channel<LlmEvent>,
    usage: &mut TokenUsage,
) -> Result<String> {
    let mut messages = Vec::new();
    if let Some(system) = request.system.as_ref().filter(|s| !s.trim().is_empty()) {
        messages.push(json!({ "role": "system", "content": system }));
    }
    for m in &request.messages {
        messages.push(json!({ "role": m.role, "content": m.content }));
    }

    // 本家 OpenAI は新しいモデルほど max_completion_tokens を要求するため、そちらを本命にする。
    // 他社の互換 API は max_tokens しか知らないことが多いのでそちらを本命にする。
    let is_official_openai = base_url.contains("api.openai.com");
    let mut dialect = Dialect {
        token_param: if is_official_openai {
            TokenParam::MaxCompletionTokens
        } else {
            TokenParam::MaxTokens
        },
        send_temperature: true,
        token_param_switched: false,
    };

    let url = format!("{base_url}/chat/completions");

    // パラメータを調整しながら最大 3 回まで送り直す
    for _ in 0..3 {
        let body = build_body(model, &messages, max_tokens, dialect);

        let res = http::client()?
            .post(&url)
            .bearer_auth(api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if res.status().is_success() {
            let request_id = request.request_id.as_deref().unwrap_or_default();
            return pump_sse(res, request_id, channel, usage, |payload| {
                let value: Value = match serde_json::from_str(payload) {
                    Ok(v) => v,
                    // ハートビートなど JSON でない行は無視する
                    Err(_) => return Ok(None),
                };
                Ok(value
                    .pointer("/choices/0/delta/content")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()))
            })
            .await;
        }

        let status = res.status().as_u16();
        let raw = res.text().await.unwrap_or_default();
        let detail =
            extract_error_message(&raw).unwrap_or_else(|| raw.chars().take(500).collect());

        // 400 のときだけ、パラメータの方言違いとみなして調整を試みる
        match (status == 400)
            .then(|| adjust(&detail, dialect))
            .flatten()
        {
            Some(next) => dialect = next,
            None => return Err(api_error(status, &detail)),
        }
    }

    Err(AppError::code(code::LLM_RESPONSE_INVALID))
}

fn build_body(model: &str, messages: &[Value], max_tokens: u32, dialect: Dialect) -> Value {
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        // **これが無いとストリーミングでは usage が返らない。**
        // 消費トークンが取れないとコスト表示が常に 0 になる。
        // 対応していない互換サーバーは黙って無視するだけなので、常に付けてよい。
        "stream_options": { "include_usage": true },
    });
    body[dialect.token_param.key()] = json!(max_tokens);
    if dialect.send_temperature {
        body["temperature"] = json!(TEMPERATURE);
    }
    body
}

/// エラーメッセージを読み、次に試すべきパラメータの組を返す。調整できなければ None。
fn adjust(detail: &str, current: Dialect) -> Option<Dialect> {
    let lower = detail.to_lowercase();

    // 出力上限パラメータの名前違い。どちら向きの指摘も同じ語を含むので、
    // 現在使っている方の逆へ 1 回だけ切り替える。
    if !current.token_param_switched
        && (lower.contains("max_completion_tokens") || lower.contains("max_tokens"))
    {
        return Some(Dialect {
            token_param: match current.token_param {
                TokenParam::MaxTokens => TokenParam::MaxCompletionTokens,
                TokenParam::MaxCompletionTokens => TokenParam::MaxTokens,
            },
            token_param_switched: true,
            ..current
        });
    }

    // temperature に既定値以外を許さないモデル（GPT-5 系など）
    if current.send_temperature && lower.contains("temperature") {
        return Some(Dialect {
            send_temperature: false,
            ..current
        });
    }

    None
}

fn api_error(status: u16, detail: &str) -> AppError {
    let hint = match status {
        401 => "（APIキーが正しいか確認してください）",
        403 => "（APIキーの権限、またはモデルへのアクセス権を確認してください）",
        404 => "（モデル名または Base URL が正しいか確認してください）",
        429 => "（レート制限に達しました。しばらく待って再試行してください）",
        _ => "",
    };
    AppError::detail(code::LLM_RESPONSE_INVALID, status.to_string())
}
