//! フロントエンドから `invoke` で呼び出せるコマンド群。

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

use crate::analyses::{self, ArchiveEntry, SavedAnalysis};
use crate::candidates::{self, CandidateInput, CandidateStock};
use crate::chats::{self, ChatMessage, ChatSession};
use crate::cloud;
use crate::documents::{self, StagedDocument};
use crate::edgar::{self, FilingStatus, SecFiling};
use crate::error::{code, AppError, Result};
use crate::eula::{self, EulaStatus};
use crate::exports;
use crate::library;
use crate::license::{self, LicenseStatus};
use crate::llm::{self, LlmEvent, LlmRequest};
use crate::market;
use crate::personas::{self, StoredPrompt};
use crate::portfolios::{self, Portfolio};
use crate::prompts::{self, AnalystRole};
use crate::quarterly::{self, QuarterlySeries};
use crate::settings::{self, SettingsView};
use crate::shortcuts::{self, ShortcutOverride};
use crate::quote::{self, MarketQuote};
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
    /// 市場データの取得元（`yahoo` / `fmp` / `alphavantage`）
    pub market_provider: Option<String>,
    /// AI の合否判定に使う閾値。**渡した内容で丸ごと置き換える**
    /// （項目を消したいときに残ってしまわないように）
    pub thresholds: Option<std::collections::BTreeMap<String, f64>>,
    /// 分析への追加指示（自由記述）
    pub custom_instruction: Option<String>,
    /// ディベート（批判側）のプロバイダ ID。空文字ならメインと同じに戻す
    pub debate_provider: Option<String>,
    /// ディベート（批判側）のモデル名。空文字なら既定モデルに戻す
    pub debate_model: Option<String>,
}

#[tauri::command]
pub fn settings_save(app: AppHandle, patch: SettingsPatch) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;

    if let Some(provider) = patch.provider {
        if !current.has_provider(&provider) {
            return Err(AppError::detail(code::UNKNOWN_PROVIDER, provider.to_string()));
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
    if let Some(provider) = patch.debate_provider {
        let provider = provider.trim().to_string();
        // 知らない ID を保存すると、実行時にキーが引けず毎回エラーになる
        if !provider.is_empty() && !current.has_provider(&provider) {
            return Err(AppError::detail(code::UNKNOWN_PROVIDER, provider));
        }
        current.debate.provider = provider;
    }
    if let Some(model) = patch.debate_model {
        current.debate.model = model.trim().to_string();
    }
    if let Some(ua) = patch.sec_user_agent {
        current.sec_user_agent = ua.trim().to_string();
    }
    if let Some(limit) = patch.max_prompt_tokens {
        current.max_prompt_tokens = limit.clamp(1_000, 2_000_000);
    }
    if let Some(provider) = patch.market_provider {
        if !market::PROVIDER_IDS.contains(&provider.as_str()) {
            return Err(AppError::detail(code::UNKNOWN_MARKET_PROVIDER, provider.to_string()));
        }
        current.market_provider = provider;
    }
    if let Some(thresholds) = patch.thresholds {
        // 有限の数値だけ通す。範囲の丸めはフロント側の定義に任せる
        current.thresholds = thresholds
            .into_iter()
            .filter(|(_, v)| v.is_finite())
            .collect();
    }
    if let Some(instruction) = patch.custom_instruction {
        // 長さの上限は結合側（prompts::custom_section）が持つ
        current.custom_instruction = instruction.trim().to_string();
    }

    settings::save(&app, &current)?;
    Ok(current.to_view())
}

/// 市場データ取得元の APIキーを保存する。空文字を渡すと削除。
#[tauri::command]
pub fn market_set_key(app: AppHandle, provider: String, api_key: String) -> Result<SettingsView> {
    if !market::PROVIDER_IDS.contains(&provider.as_str()) {
        return Err(AppError::detail(code::UNKNOWN_MARKET_PROVIDER, provider.to_string()));
    }
    let mut current = settings::load(&app)?;
    let slot = market::key_id(&provider);
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        current.keys.remove(&slot);
    } else {
        current.keys.insert(slot, trimmed.to_string());
    }
    settings::save(&app, &current)?;
    Ok(current.to_view())
}

/// 取得元の疎通確認。キーが正しいか、実際に 1 銘柄引いて確かめる。
#[tauri::command]
pub async fn market_health_check(
    app: AppHandle,
    provider: String,
    ticker: Option<String>,
) -> Result<String> {
    let current = settings::load(&app)?;
    let symbol = ticker.unwrap_or_else(|| "AAPL".to_string());
    market::health_check(&current, &provider, &symbol).await
}

/// APIキーを保存する。空文字を渡すと削除。組み込み・カスタムどちらの ID も受け付ける。
#[tauri::command]
pub fn settings_set_key(app: AppHandle, provider: String, api_key: String) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;
    if !current.has_provider(&provider) {
        return Err(AppError::detail(code::UNKNOWN_PROVIDER, provider.to_string()));
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
        .ok_or_else(|| AppError::detail(code::NOT_FOUND, id.to_string()))?;

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
    basis: Vec<String>,
    // average_score: 20項目の平均。アーカイブ一覧に出すためフロントで算出して渡す
    // period_label: 対象四半期などのラベル（例: FY2026 Q3）
    average_score: Option<f64>,
    period_label: Option<String>,
    // record: 構造化した分析データ（JSON 文字列）
    record: Option<String>,
    // parent_id: 親（四半期本体）の履歴 ID。期中のアドホック分析ならここに指定する
    parent_id: Option<String>,
    // 実測の消費トークン（API の usage から取る。取れなければ 0）
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
) -> Result<SavedAnalysis> {
    analyses::save(
        &app,
        &ticker,
        &raw,
        provider.as_deref(),
        model.as_deref(),
        prompt_tokens,
        &notes,
        &basis,
        average_score,
        period_label.as_deref(),
        record.as_deref(),
        parent_id.as_deref(),
        input_tokens.unwrap_or(0),
        output_tokens.unwrap_or(0),
    )
}

/// 分析アーカイブ（実行履歴）を新しい順に返す。本文は含まない。
#[tauri::command]
pub fn analysis_history(app: AppHandle, ticker: Option<String>) -> Result<Vec<ArchiveEntry>> {
    analyses::history(&app, ticker)
}

/// アーカイブ 1 件の本文を読む。
#[tauri::command]
pub fn analysis_history_raw(app: AppHandle, id: String) -> Result<Option<String>> {
    analyses::history_raw(&app, &id)
}

/// 実行ログを 1 件積む。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn usage_log_append(
    app: AppHandle,
    ticker: String,
    provider: Option<String>,
    model: Option<String>,
    role_id: Option<String>,
    input_tokens: i64,
    output_tokens: i64,
    status: String,
    started_at_ms: i64,
) -> Result<()> {
    analyses::append_usage_log(
        &app,
        &ticker,
        provider.as_deref(),
        model.as_deref(),
        role_id.as_deref(),
        input_tokens,
        output_tokens,
        &status,
        started_at_ms,
    )
}

/// 実行ログを新しい順に返す。
#[tauri::command]
pub fn usage_log_list(app: AppHandle) -> Result<Vec<analyses::UsageLogEntry>> {
    analyses::usage_log(&app)
}

/// 実行ログを全消しする。分析結果には触れない。
#[tauri::command]
pub fn usage_log_clear(app: AppHandle) -> Result<()> {
    analyses::clear_usage_log(&app)
}

/// 分割実行の途中経過を保存する。
#[tauri::command]
pub fn analysis_step_save(
    app: AppHandle,
    ticker: String,
    step: i64,
    raw: String,
    input_tokens: i64,
    output_tokens: i64,
) -> Result<()> {
    analyses::save_step(&app, &ticker, step, &raw, input_tokens, output_tokens)
}

/// 保存済みの途中経過を読む（再開の起点を決める）。
#[tauri::command]
pub fn analysis_steps_load(app: AppHandle, ticker: String) -> Result<Vec<analyses::AnalysisStep>> {
    analyses::load_steps(&app, &ticker)
}

/// 途中経過を捨てる。
#[tauri::command]
pub fn analysis_steps_clear(app: AppHandle, ticker: String) -> Result<()> {
    analyses::clear_steps(&app, &ticker)
}

#[tauri::command]
pub fn analysis_history_delete(app: AppHandle, id: String) -> Result<()> {
    analyses::history_delete(&app, &id)
}

// ------------------------------------------------------------ エクスポート

/// 分析結果をファイルへ書き出す。保存したフルパスを返す。
#[tauri::command]
pub fn export_write_file(
    app: AppHandle,
    file_name: String,
    contents: String,
) -> Result<String> {
    exports::write_file(&app, &file_name, &contents)
}

// ------------------------------------------------------------ ライセンス

#[tauri::command]
pub fn license_status(app: AppHandle) -> Result<LicenseStatus> {
    Ok(license::status_of(&settings::load(&app)?.license_key))
}

/// ライセンスキーを検証して保存する。
#[tauri::command]
pub fn license_activate(app: AppHandle, key: String) -> Result<LicenseStatus> {
    let status = license::activate(&key)?;
    let mut current = settings::load(&app)?;
    current.license_key = license::normalize_key(&key);
    settings::save(&app, &current)?;
    Ok(status)
}

/// 無料版の使用済み銘柄に登録する。上限を超えては積まない。
///
/// **判定と上限はフロント側（`freeTier.ts`）が持つ**ので、
/// ここは受け取った一覧をそのまま保存するだけにする。
#[tauri::command]
pub fn free_tier_set(app: AppHandle, tickers: Vec<String>) -> Result<SettingsView> {
    let mut current = settings::load(&app)?;
    current.free_tickers = tickers
        .into_iter()
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();
    settings::save(&app, &current)?;
    Ok(current.to_view())
}

#[tauri::command]
pub fn license_clear(app: AppHandle) -> Result<LicenseStatus> {
    let mut current = settings::load(&app)?;
    current.license_key = String::new();
    settings::save(&app, &current)?;
    Ok(license::status_of(""))
}

// ------------------------------------------------------ 免責事項の同意

#[tauri::command]
pub fn eula_status(app: AppHandle) -> Result<EulaStatus> {
    let current = settings::load(&app)?;
    Ok(eula::status_of(current.eula_agreed, current.eula_agreed_at_ms))
}

/// 同意を記録する。
#[tauri::command]
pub fn eula_agree(app: AppHandle) -> Result<EulaStatus> {
    let mut current = settings::load(&app)?;
    let (agreed, at) = eula::agreed_now(library::now_ms());
    current.eula_agreed = agreed;
    current.eula_agreed_at_ms = at;
    settings::save(&app, &current)?;
    Ok(eula::status_of(agreed, at))
}

/// 同意を撤回する。
///
/// **ライセンスキーには触れない。** 同意はアプリを使う条件であって、
/// 買ったライセンスを取り上げる理由にはならない。
#[tauri::command]
pub fn eula_revoke(app: AppHandle) -> Result<EulaStatus> {
    let mut current = settings::load(&app)?;
    let (agreed, at) = eula::revoked();
    current.eula_agreed = agreed;
    current.eula_agreed_at_ms = at;
    settings::save(&app, &current)?;
    Ok(eula::status_of(agreed, at))
}

// ------------------------------------------------------ ウィンドウ

/// タイトルバーの文字列を差し替える（表示言語に合わせるため）。
#[tauri::command]
pub fn window_set_title(app: AppHandle, title: String) -> Result<()> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::code(code::INVALID_INPUT));
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::code(code::NOT_FOUND))?;
    window
        .set_title(title)
        .map_err(|e| AppError::detail(code::INVALID_INPUT, e.to_string()))
}

// ------------------------------------------------------ クラウド同期

/// クラウド同期の状態を返す（生のトークンは含まない）。
#[tauri::command]
pub fn cloud_status(app: AppHandle) -> Result<cloud::CloudStatus> {
    Ok(cloud::status_of(&settings::load(&app)?.cloud))
}

/// Google の OAuth クライアント ID を保存する。
#[tauri::command]
pub fn cloud_set_client_id(app: AppHandle, client_id: String) -> Result<cloud::CloudStatus> {
    let mut current = settings::load(&app)?;
    current.cloud.client_id = client_id.trim().to_string();
    // 別のアプリの ID に差し替えたら、前のトークンは使えない
    current.cloud.refresh_token = String::new();
    settings::save(&app, &current)?;
    Ok(cloud::status_of(&current.cloud))
}

/// 起動時の自動バックアップを切り替える。
#[tauri::command]
pub fn cloud_set_auto_backup(app: AppHandle, enabled: bool) -> Result<cloud::CloudStatus> {
    let mut current = settings::load(&app)?;
    current.cloud.auto_backup = enabled;
    settings::save(&app, &current)?;
    Ok(cloud::status_of(&current.cloud))
}

/// ブラウザを開いて Google と連携する。
#[tauri::command]
pub async fn cloud_connect(app: AppHandle) -> Result<cloud::CloudStatus> {
    cloud::connect(&app).await
}

/// 連携を解除する（クラウド上のデータは消さない）。
#[tauri::command]
pub fn cloud_disconnect(app: AppHandle) -> Result<cloud::CloudStatus> {
    cloud::disconnect(&app)
}

#[tauri::command]
pub async fn cloud_backup(app: AppHandle) -> Result<cloud::BackupResult> {
    cloud::backup(&app).await
}

#[tauri::command]
pub async fn cloud_restore(app: AppHandle, file_id: Option<String>) -> Result<cloud::RestoreResult> {
    cloud::restore(&app, file_id).await
}

#[tauri::command]
pub async fn cloud_list_backups(app: AppHandle) -> Result<Vec<cloud::drive::BackupFile>> {
    cloud::list(&app).await
}

// ------------------------------------------------------ ポートフォリオ

#[tauri::command]
pub fn portfolios_list(app: AppHandle) -> Result<Vec<Portfolio>> {
    portfolios::list(&app)
}

#[tauri::command]
pub fn portfolios_create(app: AppHandle, name: Option<String>) -> Result<Vec<Portfolio>> {
    portfolios::create(&app, name)
}

#[tauri::command]
pub fn portfolios_rename(app: AppHandle, id: String, name: String) -> Result<Vec<Portfolio>> {
    portfolios::rename(&app, &id, &name)
}

#[tauri::command]
pub fn portfolios_remove(app: AppHandle, id: String) -> Result<Vec<Portfolio>> {
    portfolios::remove(&app, &id)
}

#[tauri::command]
pub fn portfolios_add_ticker(
    app: AppHandle,
    id: String,
    ticker: String,
) -> Result<Vec<Portfolio>> {
    portfolios::add_ticker(&app, &id, &ticker)
}

#[tauri::command]
pub fn portfolios_remove_ticker(
    app: AppHandle,
    id: String,
    ticker: String,
) -> Result<Vec<Portfolio>> {
    portfolios::remove_ticker(&app, &id, &ticker)
}

// ---------------------------------------------------------------- チャット履歴

#[tauri::command]
pub fn chat_list_sessions(app: AppHandle) -> Result<Vec<ChatSession>> {
    chats::list_sessions(&app)
}

#[tauri::command]
pub fn chat_create_session(
    app: AppHandle,
    title: Option<String>,
    ticker: Option<String>,
) -> Result<ChatSession> {
    chats::create_session(&app, title, ticker)
}

#[tauri::command]
pub fn chat_rename_session(
    app: AppHandle,
    id: String,
    title: String,
) -> Result<Vec<ChatSession>> {
    chats::rename_session(&app, &id, &title)
}

/// アーカイブへ移動 / アーカイブから復元する。会話は削除しない。
#[tauri::command]
pub fn chat_set_archived(
    app: AppHandle,
    id: String,
    archived: bool,
) -> Result<Vec<ChatSession>> {
    chats::set_archived(&app, &id, archived)
}

#[tauri::command]
pub fn chat_delete_session(app: AppHandle, id: String) -> Result<Vec<ChatSession>> {
    chats::delete_session(&app, &id)
}

// ------------------------------------------------------------ 検討中銘柄

#[tauri::command]
pub fn candidates_list(app: AppHandle) -> Result<Vec<CandidateStock>> {
    candidates::list(&app)
}

/// パース済みの行をまとめて登録する。既存のティッカーは上書きされる。
#[tauri::command]
pub fn candidates_add(
    app: AppHandle,
    items: Vec<CandidateInput>,
) -> Result<Vec<CandidateStock>> {
    candidates::add_many(&app, items)
}

#[tauri::command]
pub fn candidates_remove(app: AppHandle, id: String) -> Result<Vec<CandidateStock>> {
    candidates::remove(&app, &id)
}

#[tauri::command]
pub fn candidates_clear(app: AppHandle) -> Result<Vec<CandidateStock>> {
    candidates::clear(&app)
}

// ------------------------------------------------------ プロンプトライブラリ

#[tauri::command]
pub fn prompts_list(app: AppHandle) -> Result<Vec<StoredPrompt>> {
    personas::list(&app)
}

/// `id` を渡すと更新、渡さなければ新規作成。
#[tauri::command]
pub fn prompts_save(
    app: AppHandle,
    id: Option<String>,
    title: String,
    body: String,
) -> Result<Vec<StoredPrompt>> {
    personas::save(&app, id, &title, &body)
}

#[tauri::command]
pub fn prompts_remove(app: AppHandle, id: String) -> Result<Vec<StoredPrompt>> {
    personas::remove(&app, &id)
}

// ------------------------------------------------------ ショートカットキー

/// ユーザーが変更した割り当てだけを返す（既定はフロント側が持つ）。
// ------------------------------------------------------ 分析プロンプト

/// 分析の役割一覧。**プロンプト本文は含まれない**（概要だけ返す）。
#[tauri::command]
pub fn analysis_roles() -> Vec<AnalystRole> {
    prompts::roles()
}

/// 組み立てたシステムプロンプトの概算トークン数だけを返す。
/// フロントは本文を受け取れないが、資料の予算計算には長さが要るため。
#[tauri::command]
pub fn analysis_prompt_tokens(preset: prompts::AnalysisPreset) -> usize {
    prompts::system_prompt_tokens(&preset)
}

/// 設定画面のプレビュー用。**ユーザー自身が設定した閾値の部分だけ**を返す。
#[tauri::command]
pub fn analysis_threshold_preview(
    thresholds: std::collections::BTreeMap<String, f64>,
) -> String {
    prompts::threshold_section(&thresholds)
}

#[tauri::command]
pub fn shortcuts_list(app: AppHandle) -> Result<Vec<ShortcutOverride>> {
    shortcuts::list(&app)
}

/// `binding` を省略すると既定へ戻す。
#[tauri::command]
pub fn shortcuts_set(
    app: AppHandle,
    action: String,
    binding: Option<String>,
) -> Result<Vec<ShortcutOverride>> {
    shortcuts::set(&app, &action, binding)
}

#[tauri::command]
pub fn shortcuts_reset(app: AppHandle) -> Result<Vec<ShortcutOverride>> {
    shortcuts::reset(&app)
}

#[tauri::command]
pub fn chat_load_messages(app: AppHandle, session_id: String) -> Result<Vec<ChatMessage>> {
    chats::load_messages(&app, &session_id)
}

#[tauri::command]
pub fn chat_append_message(
    app: AppHandle,
    session_id: String,
    role: String,
    content: String,
) -> Result<ChatMessage> {
    chats::append_message(&app, &session_id, &role, &content)
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
pub async fn yahoo_fetch_fundamentals(app: AppHandle, ticker: String) -> Result<Fundamentals> {
    // 名前は互換のため据え置き。実体は選択中の取得元へ振り分ける
    let current = settings::load(&app)?;
    market::fetch_fundamentals(&current, &ticker).await
}

/// 株価の軽量フィードを取得する。
///
/// **主要指標とは分けている。** 銘柄を切り替えた直後に出したいのは株価であって、
/// 40 項目の指標を待つ間ずっと空欄を見せる理由はない。
#[tauri::command]
pub async fn market_quote(ticker: String) -> Result<MarketQuote> {
    quote::fetch_quote(&ticker).await
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
    // 対象期の指定。**省略すると最新**（従来どおり）
    year: Option<i32>,
    quarter: Option<u8>,
) -> Result<SecFiling> {
    let settings = settings::load(&app)?;
    let forms = forms.unwrap_or_else(|| vec!["10-K".to_string(), "10-Q".to_string()]);
    // 1 トークン ≒ 4 文字として、プロンプト上限の 6 割を SEC 本文に割り当てる
    let max_chars = settings.max_prompt_tokens * 4 * 6 / 10;
    edgar::fetch_filing(
        &ticker,
        &forms,
        &settings.sec_user_agent,
        max_chars,
        edgar::PeriodFilter { year, quarter },
    )
    .await
}
