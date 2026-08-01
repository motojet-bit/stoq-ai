//! フロントエンドから `invoke` で呼び出せるコマンド群。

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::AppHandle;

use crate::analyses::{self, SavedAnalysis};
use crate::documents::{self, StagedDocument};
use crate::edgar::{self, FilingStatus, SecFiling};
use crate::error::{AppError, Result};
use crate::llm::{self, LlmEvent, LlmRequest};
use crate::quarterly::{self, QuarterlySeries};
use crate::settings::{self, SettingsView};
use crate::yahoo::{self, Fundamentals};

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

/// 生成中の LLM 呼び出しを中断する。それまでのテキストは破棄されない。
#[tauri::command]
pub fn llm_cancel(request_id: String) {
    llm::request_cancel(&request_id);
}

// ---------------------------------------------------------------- 一次資料のステージング

/// 一時保存中の資料一覧。
#[tauri::command]
pub fn documents_list(app: AppHandle) -> Result<Vec<StagedDocument>> {
    documents::list(&app)
}

/// 抽出済みテキストを一時保存フォルダに書き出す。
#[tauri::command]
pub fn documents_stage(
    app: AppHandle,
    original_name: String,
    size_bytes: u64,
    text: String,
) -> Result<StagedDocument> {
    documents::stage(&app, &original_name, size_bytes, &text)
}

/// プレビュー用に本文を読み出す。
#[tauri::command]
pub fn documents_read_text(app: AppHandle, id: String) -> Result<String> {
    documents::read_text(&app, &id)
}

#[tauri::command]
pub fn documents_rename(
    app: AppHandle,
    id: String,
    display_name: String,
) -> Result<Vec<StagedDocument>> {
    documents::rename(&app, &id, &display_name)
}

#[tauri::command]
pub fn documents_delete(app: AppHandle, id: String) -> Result<Vec<StagedDocument>> {
    documents::delete(&app, &id)
}

/// 一時保存中の資料をすべて破棄する。
#[tauri::command]
pub fn documents_clear(app: AppHandle) -> Result<Vec<StagedDocument>> {
    documents::clear(&app)
}

// ---------------------------------------------------------------- 分析結果の永続化

/// 分析結果を保存する（生成完了時に自動で呼ばれる）。
#[tauri::command]
pub fn analysis_save(
    app: AppHandle,
    ticker: String,
    raw: String,
    provider: Option<String>,
    model: Option<String>,
    prompt_tokens: i64,
    notes: Vec<String>,
) -> Result<SavedAnalysis> {
    analyses::save(
        &app,
        &ticker,
        &raw,
        provider.as_deref(),
        model.as_deref(),
        prompt_tokens,
        &notes,
    )
}

/// 保存済みの分析結果を読み出す。無ければ null。
#[tauri::command]
pub fn analysis_load(app: AppHandle, ticker: String) -> Result<Option<SavedAnalysis>> {
    analyses::load(&app, &ticker)
}

/// 保存済みの銘柄一覧（新しい順）。
#[tauri::command]
pub fn analysis_list(app: AppHandle) -> Result<Vec<(String, i64)>> {
    analyses::list(&app)
}

/// 分析結果を削除する。ユーザーが明示的にクリアしたときだけ呼ばれる。
#[tauri::command]
pub fn analysis_delete(app: AppHandle, ticker: String) -> Result<()> {
    analyses::delete(&app, &ticker)
}

// ---------------------------------------------------------------- 財務データ

/// Yahoo Finance から主要指標を取得する。
#[tauri::command]
pub async fn yahoo_fetch_fundamentals(ticker: String) -> Result<Fundamentals> {
    yahoo::fetch_fundamentals(&ticker).await
}

/// 直近 4 四半期の推移とモメンタム判定を取得する。
///
/// Yahoo から売上・純利益・EPS を、SEC XBRL から前年同期比の比較対象を取る。
#[tauri::command]
pub async fn quarterly_series(app: AppHandle, ticker: String) -> Result<QuarterlySeries> {
    let settings = settings::load(&app)?;
    let (summary, currency) = yahoo::fetch_quarterly_summary(&ticker).await?;
    // 米国上場でなければ空が返り、YoY なしの系列になる
    let xbrl = edgar::fetch_quarterly_revenue(&ticker, &settings.sec_user_agent).await;
    quarterly::build(&ticker, &currency, &summary, &xbrl)
}

/// SEC EDGAR の提出状況（10-K / 10-Q の有無と最終提出日）を確認する。
///
/// 本文はダウンロードしない。EDGAR に無い銘柄や User-Agent 未設定は
/// エラーではなく `status` フィールドで返す。
#[tauri::command]
pub async fn sec_filing_status(app: AppHandle, ticker: String) -> Result<FilingStatus> {
    let settings = settings::load(&app)?;
    edgar::fetch_status(&ticker, &settings.sec_user_agent).await
}

/// 最新の 10-K / 10-Q 本文を取得する。
///
/// Step 4（プロンプトへの同梱）で使う予定。現時点では UI から呼び出していない。
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
