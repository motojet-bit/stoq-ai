//! フロントエンドから `invoke` で呼び出せるコマンド群。

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::AppHandle;

use crate::edgar::{self, SecFiling};
use crate::error::{AppError, Result};
use crate::llm::{self, LlmEvent, LlmRequest};
use crate::settings::{self, SettingsView};

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub phase: String,
}

/// フロント↔バックの疎通確認用。
#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "StockAnalyzer".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        phase: "Phase 2 Step 1 — 設定 & LLM 接続基盤".to_string(),
    }
}

// ---------------------------------------------------------------- 設定

/// 設定を読み込む。APIキーはマスク済みの形でのみ返る。
#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<SettingsView> {
    Ok(settings::load(&app)?.to_view())
}

/// キーとカスタムプロバイダ以外の設定項目を更新する。指定した項目のみ差し替える。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub provider: Option<String>,
    /// 組み込みプロバイダ名 → モデル名
    pub models: Option<std::collections::BTreeMap<String, String>>,
    pub sec_user_agent: Option<String>,
    pub max_prompt_tokens: Option<usize>,
}

#[tauri::command]
pub fn settings_save(app: AppHandle, patch: SettingsPatch) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;

    if let Some(provider) = patch.provider {
        if !current.has_provider(&provider) {
            return Err(AppError::msg(format!("未知のプロバイダです: {provider}")));
        }
        current.provider = provider;
    }
    if let Some(models) = patch.models {
        for (provider, model) in models {
            let model = model.trim().to_string();
            if !model.is_empty() && settings::BUILTIN_PROVIDERS.contains(&provider.as_str()) {
                current.models.insert(provider, model);
            }
        }
    }
    if let Some(ua) = patch.sec_user_agent {
        current.sec_user_agent = ua.trim().to_string();
    }
    if let Some(limit) = patch.max_prompt_tokens {
        current.max_prompt_tokens = limit.clamp(1_000, 2_000_000);
    }

    settings::save(&app, &current)?;
    Ok(current.to_view())
}

/// APIキーを保存する。空文字を渡すと削除。組み込み・カスタムどちらの ID も受け付ける。
#[tauri::command]
pub fn settings_set_key(app: AppHandle, provider: String, api_key: String) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;
    if !current.has_provider(&provider) {
        return Err(AppError::msg(format!("未知のプロバイダです: {provider}")));
    }
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        current.keys.remove(&provider);
    } else {
        current.keys.insert(provider, trimmed.to_string());
    }
    settings::save(&app, &current)?;
    Ok(current.to_view())
}

// ------------------------------------------------ OpenAI互換プロバイダの追加・更新・削除

/// 新しい OpenAI互換プロバイダ枠を追加し、採番された ID を含む設定を返す。
#[tauri::command]
pub fn settings_add_custom_provider(app: AppHandle, label: Option<String>) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;
    current.add_custom_provider(label);
    settings::save(&app, &current)?;
    Ok(current.to_view())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderPatch {
    pub label: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

/// OpenAI互換プロバイダの表示名 / Base URL / モデル名を更新する。
#[tauri::command]
pub fn settings_update_custom_provider(
    app: AppHandle,
    id: String,
    patch: CustomProviderPatch,
) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;
    let entry = current
        .custom_providers
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| AppError::msg(format!("プロバイダ {id} が見つかりませんでした。")))?;

    if let Some(label) = patch.label {
        let label = label.trim().to_string();
        if !label.is_empty() {
            entry.label = label;
        }
    }
    if let Some(url) = patch.base_url {
        entry.base_url = url.trim().trim_end_matches('/').to_string();
    }
    if let Some(model) = patch.model {
        entry.model = model.trim().to_string();
    }

    settings::save(&app, &current)?;
    Ok(current.to_view())
}

/// OpenAI互換プロバイダを削除する。対応する APIキーも破棄する。
#[tauri::command]
pub fn settings_remove_custom_provider(app: AppHandle, id: String) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;
    current.remove_custom_provider(&id)?;
    settings::save(&app, &current)?;
    Ok(current.to_view())
}

// ---------------------------------------------------------------- LLM

/// LLM へ送信し、応答を Channel でストリーミングする。
#[tauri::command]
pub async fn llm_send(
    app: AppHandle,
    request: LlmRequest,
    on_event: Channel<LlmEvent>,
) -> Result<()> {
    let settings = settings::load(&app)?;
    llm::send(&settings, request, on_event).await
}

// ---------------------------------------------------------------- SEC（Step 2 先行実装）

/// 最新の 10-K / 10-Q 本文を取得する。
///
/// Step 2 で UI に接続する予定の先行実装。現時点では UI から呼び出していない。
#[tauri::command]
pub async fn sec_fetch_latest_filing(
    app: AppHandle,
    ticker: String,
    forms: Option<Vec<String>>,
) -> Result<SecFiling> {
    let settings = settings::load(&app)?;
    let forms = forms.unwrap_or_else(|| vec!["10-K".to_string(), "10-Q".to_string()]);
    // 1 トークン ≒ 4 文字として、プロンプト上限の 6 割を SEC 本文に割り当てる
    let max_chars = settings.max_prompt_tokens * 4 * 6 / 10;
    edgar::fetch_latest_filing(&ticker, &forms, &settings.sec_user_agent, max_chars).await
}
