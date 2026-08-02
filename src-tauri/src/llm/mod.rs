//! LLM Unified Engine。
//!
//! OpenAI / Anthropic / Gemini / OpenAI互換(Custom) を共通の
//! `LlmRequest` で呼び分け、トークンを Channel でストリーミングする。

pub mod anthropic;
pub mod gemini;
pub mod openai;

use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use crate::error::{code, AppError, Result};
use crate::settings::Settings;

/// 中断が要求されたリクエスト ID。
///
/// 生成中に `llm_cancel` が呼ばれるとここに積まれ、SSE の読み取りループが
/// 次のチャンクで抜ける。それまでに受け取ったテキストは破棄せず返す。
static CANCELLED: Mutex<Vec<String>> = Mutex::new(Vec::new());

pub fn request_cancel(request_id: &str) {
    let mut guard = CANCELLED.lock().unwrap();
    if !guard.iter().any(|id| id == request_id) {
        guard.push(request_id.to_string());
    }
}

fn is_cancelled(request_id: &str) -> bool {
    CANCELLED.lock().unwrap().iter().any(|id| id == request_id)
}

fn forget_cancel(request_id: &str) {
    CANCELLED.lock().unwrap().retain(|id| id != request_id);
}

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
    /// 中断（`llm_cancel`）で指定するための ID。フロント側で採番する。
    #[serde(default)]
    pub request_id: Option<String>,
    /// 未指定なら設定の既定プロバイダを使う
    #[serde(default)]
    pub provider: Option<String>,
    /// 自由入力のシステムプロンプト（対話・ヘルプ用）。
    /// `analysis_preset` が指定されている場合は無視される。
    #[serde(default)]
    pub system: Option<String>,
    /// 20項目分析のプリセット。**役割 ID と閾値だけ**を受け取り、
    /// 秘匿プロンプトとの結合は Rust 側で行う（`crate::prompts` を参照）。
    #[serde(default)]
    pub analysis_preset: Option<crate::prompts::AnalysisPreset>,
    /// 出力言語（`ja` / `en` …）。対話・ヘルプでも使う
    #[serde(default)]
    pub locale: Option<String>,
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
    /// 完了。`cancelled` が true なら中断による途中終了。
    Done { text: String, cancelled: bool },
    Error { message: String },
}

/// 決定論的出力のための温度。Anthropic には送らない（400 になるため）。
pub const TEMPERATURE: f32 = 0.0;
pub const DEFAULT_MAX_TOKENS: u32 = 8192;

pub async fn send(
    settings: &Settings,
    mut request: LlmRequest,
    channel: Channel<LlmEvent>,
) -> Result<()> {
    /*
     * 分析プリセットが来たら、ここで秘匿プロンプトと結合する。
     * **組み立てた文字列はフロントへ返さない**（返した時点で秘匿の意味が無くなる）。
     */
    if let Some(mut preset) = request.analysis_preset.take() {
        // プリセットに言語が無ければリクエストの言語を使う
        if preset.locale.is_none() {
            preset.locale = request.locale.clone();
        }
        /*
         * 自由記述の追加指示は**設定ファイルが一次情報**。
         * フロントから毎回送らせると、画面ごとに渡し忘れが起きる。
         */
        if preset.custom_instruction.is_none() {
            preset.custom_instruction = Some(settings.custom_instruction.clone());
        }
        request.system = Some(crate::prompts::build_system_prompt(&preset));
    } else if let Some(directive) = crate::prompts::language_directive(request.locale.as_deref())
    {
        /*
         * 対話・ヘルプ側。フロントが組み立てたシステムプロンプトの後ろへ足す。
         * **言語の指定は Rust 側で一元的に付ける**ので、
         * 画面ごとに書き分けて食い違うことがない。
         */
        request.system = Some(match request.system.take() {
            Some(system) if !system.trim().is_empty() => format!("{system}\n\n{directive}"),
            _ => directive.to_string(),
        });
    }

    let provider = request
        .provider
        .clone()
        .unwrap_or_else(|| settings.provider.clone());

    if request.messages.is_empty() {
        return Err(AppError::code(code::LLM_NO_MESSAGES));
    }

    let model = settings.model_for(&provider);
    let api_key = settings.key_for(&provider)?;
    let max_tokens = request.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS);
    let request_id = request.request_id.clone().unwrap_or_default();

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
            None => Err(AppError::detail(code::UNKNOWN_PROVIDER, id.to_string())),
            Some(custom) => {
                let base = custom.base_url.trim().trim_end_matches('/');
                if base.is_empty() {
                    Err(AppError::code(code::UNEXPECTED))
                } else if model.trim().is_empty() {
                    Err(AppError::code(code::UNEXPECTED))
                } else {
                    openai::stream(base, &api_key, &model, &request, max_tokens, &channel).await
                }
            }
        },
    };

    let cancelled = !request_id.is_empty() && is_cancelled(&request_id);
    forget_cancel(&request_id);

    match result {
        Ok(text) => {
            let _ = channel.send(LlmEvent::Done { text, cancelled });
            Ok(())
        }
        // 中断で通信が切れた場合はエラー扱いにしない
        Err(_) if cancelled => {
            let _ = channel.send(LlmEvent::Done {
                text: String::new(),
                cancelled: true,
            });
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

    Err(AppError::detail(code::UNEXPECTED, provider.to_string()))
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
    request_id: &str,
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
        // 中断が要求されていたら、ここまでのテキストを返して抜ける
        if !request_id.is_empty() && is_cancelled(request_id) {
            break;
        }

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
