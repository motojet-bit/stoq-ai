//! 設定と APIキーの保存。
//!
//! キーは OS のアプリ設定ディレクトリに保存し、**フロントエンドには決して生の値を返さない**。
//! フロントへ返すのはマスク済み文字列と「設定済みか否か」のみ。
//!
//! プロバイダは 2 種類ある。
//! - 組み込み: `openai` / `anthropic` / `gemini`（ID 固定）
//! - OpenAI互換: ユーザーが任意個追加できる。ID は追加時に採番する。

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{code, AppError, Result};

/// 組み込みプロバイダの ID。
pub const BUILTIN_PROVIDERS: [&str; 3] = ["openai", "anthropic", "gemini"];

/// ユーザーが追加した OpenAI互換プロバイダ 1 件。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProvider {
    /// 追加時に採番される安定 ID。APIキーの保存キーにもなる。
    pub id: String,
    /// 画面に出す識別ラベル（例: DeepSeek, Moonshot）
    pub label: String,
    pub base_url: String,
    pub model: String,
}

/// ディスクに保存される実体。`keys` は生のキーを含むため外に出さない。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// 現在選択中のプロバイダ ID（組み込み ID または カスタム ID）
    pub provider: String,
    /// 組み込みプロバイダのモデル名
    pub models: BTreeMap<String, String>,
    /// プロバイダ ID → APIキー（生の値）。カスタムも同じ辞書に入る。
    pub keys: BTreeMap<String, String>,
    /// ユーザーが追加した OpenAI互換プロバイダ
    pub custom_providers: Vec<CustomProvider>,
    /// SEC EDGAR が要求する連絡先付き User-Agent
    pub sec_user_agent: String,
    /// プロンプトに載せる最大トークン数（概算）の上限
    pub max_prompt_tokens: usize,
    /// 市場データの取得元（`yahoo` / `fmp` / `alphavantage`）。
    /// 取得元の APIキーは `keys` に `market:<id>` として入る。
    pub market_provider: String,
    /// AI の合否判定に使う閾値。**ユーザーが変えた項目だけ**入る。
    /// 項目の定義と既定値はフロント側（`src/lib/prompts/thresholds.ts`）が持つ。
    pub thresholds: BTreeMap<String, f64>,
    /// ライセンスキー（生の値）。フロントへはマスク済みしか返さない
    #[serde(default)]
    pub license_key: String,
    /// 無料版で分析した銘柄（大文字）。上限に達したら増えない
    #[serde(default)]
    pub free_tickers: Vec<String>,
    /// 初回起動の時刻（ミリ秒）。無料体験期間の起点
    #[serde(default)]
    pub first_installed_at_ms: i64,
    /// 分析への追加指示（自由記述）。秘匿プロンプトの末尾へ Rust 側で結合する
    #[serde(default)]
    pub custom_instruction: String,
    /// 免責事項（EULA）に同意済みか。**ライセンスとは別**
    #[serde(default)]
    pub eula_agreed: bool,
    /// 同意した時刻（ミリ秒）
    #[serde(default)]
    pub eula_agreed_at_ms: i64,
    /// AI クロスディベート（批判側）のプロバイダとモデル。
    /// **メイン分析とは独立して選べる**（同じモデルでは見落としが見落としのまま残る）
    #[serde(default)]
    pub debate: crate::debate::DebateConfig,
    /// クラウド同期（Google Drive アプリ専用領域）の設定。
    /// 更新用トークンを含むため、フロントへはマスク済みの状態しか返さない
    #[serde(default)]
    pub cloud: crate::cloud::CloudConfig,

    /// 旧形式（カスタム枠が 1 つ固定だった頃）の Base URL。
    /// 読み込み時に `custom_providers` へ移行し、以降は空になる。
    #[serde(skip_serializing_if = "String::is_empty")]
    pub custom_base_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        let mut models = BTreeMap::new();
        models.insert("openai".into(), "gpt-4o".into());
        models.insert("anthropic".into(), "claude-opus-5".into());
        models.insert("gemini".into(), "gemini-2.5-pro".into());

        Self {
            provider: "anthropic".into(),
            models,
            keys: BTreeMap::new(),
            custom_providers: Vec::new(),
            sec_user_agent: String::new(),
            max_prompt_tokens: 180_000,
            market_provider: crate::market::DEFAULT_PROVIDER.to_string(),
            thresholds: BTreeMap::new(),
            license_key: String::new(),
            free_tickers: Vec::new(),
            first_installed_at_ms: 0,
            custom_instruction: String::new(),
            eula_agreed: false,
            eula_agreed_at_ms: 0,
            debate: crate::debate::DebateConfig::default(),
            cloud: crate::cloud::CloudConfig::default(),
            custom_base_url: String::new(),
        }
    }
}

// ---------------------------------------------------------------- フロント向けの表現

/// フロントエンドへ返す安全な表現。生のキーを含まない。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub provider: String,
    /// 組み込みプロバイダのモデル名
    pub models: BTreeMap<String, String>,
    pub custom_providers: Vec<CustomProvider>,
    pub sec_user_agent: String,
    pub max_prompt_tokens: usize,
    /// 市場データの取得元
    pub market_provider: String,
    /// 取得元ごとの状態（キーが要るか / いま使えるか）
    pub market_providers: Vec<crate::market::ProviderStatus>,
    /// ユーザーが変更した閾値だけ
    pub thresholds: BTreeMap<String, f64>,
    /// ライセンスの状態（生のキーは含まない）
    pub license: crate::license::LicenseStatus,
    /// 無料版で分析した銘柄
    pub free_tickers: Vec<String>,
    /// 無料体験期間の状態
    pub trial: crate::trial::TrialStatus,
    /// 分析への追加指示（利用者自身が書いた文なのでそのまま返す）
    pub custom_instruction: String,
    /// 免責事項への同意状態
    pub eula: crate::eula::EulaStatus,
    /// ディベート（批判側）の設定状態
    pub debate: crate::debate::DebateStatus,
    /// クラウド同期の状態（生のトークンは含まない）
    pub cloud: crate::cloud::CloudStatus,
    /// 組み込み + カスタムの全プロバイダのキー状態
    pub keys: Vec<KeyStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub provider: String,
    pub configured: bool,
    /// 自分の PC 上の接続先か。**true ならキー未設定でも使える**
    #[serde(default)]
    pub local: bool,
    /// 例: `sk-…3f9a`。未設定なら None
    pub masked: Option<String>,
}

/// 秘密情報を表示用にマスクする。先頭のプレフィックスと末尾 4 文字だけ残す。
pub fn mask_secret(secret: &str) -> Option<String> {
    let value = secret.trim();
    if value.is_empty() {
        return None;
    }
    let chars: Vec<char> = value.chars().collect();
    let tail: String = chars[chars.len().saturating_sub(4)..].iter().collect();

    // "sk-" や "sk-ant-" のようなプレフィックスがあれば残す
    let prefix: String = match value.find('-') {
        Some(i) if i < 8 => {
            let head = &value[..=i];
            match value[i + 1..].find('-') {
                Some(j) if j < 6 => value[..=i + 1 + j].to_string(),
                _ => head.to_string(),
            }
        }
        _ => chars.iter().take(2).collect(),
    };

    if chars.len() <= prefix.chars().count() + 4 {
        Some(format!("…{tail}"))
    } else {
        Some(format!("{prefix}…{tail}"))
    }
}

impl Settings {
    /// 全プロバイダ ID を、組み込み → カスタムの順で返す。
    pub fn provider_ids(&self) -> Vec<String> {
        BUILTIN_PROVIDERS
            .iter()
            .map(|s| (*s).to_string())
            .chain(self.custom_providers.iter().map(|c| c.id.clone()))
            .collect()
    }

    pub fn custom(&self, id: &str) -> Option<&CustomProvider> {
        self.custom_providers.iter().find(|c| c.id == id)
    }

    pub fn has_provider(&self, id: &str) -> bool {
        BUILTIN_PROVIDERS.contains(&id) || self.custom(id).is_some()
    }

    pub fn to_view(&self) -> SettingsView {
        SettingsView {
            provider: self.provider.clone(),
            models: self.models.clone(),
            custom_providers: self.custom_providers.clone(),
            sec_user_agent: self.sec_user_agent.clone(),
            max_prompt_tokens: self.max_prompt_tokens,
            market_provider: crate::market::normalize_id(&self.market_provider),
            market_providers: crate::market::all_statuses(self),
            thresholds: self.thresholds.clone(),
            license: crate::license::status_of(&self.license_key),
            free_tickers: self.free_tickers.clone(),
            trial: crate::trial::status_of(self.first_installed_at_ms, crate::library::now_ms()),
            custom_instruction: self.custom_instruction.clone(),
            eula: crate::eula::status_of(self.eula_agreed, self.eula_agreed_at_ms),
            debate: crate::debate::status_of(self),
            cloud: crate::cloud::status_of(&self.cloud),
            keys: self
                .provider_ids()
                .into_iter()
                .map(|id| {
                    let masked = self.keys.get(&id).and_then(|k| mask_secret(k));
                    let local = self.is_local_provider(&id);
                    KeyStatus {
                        // ローカルは鍵が要らないので、未設定でも「使える」扱いにする
                        configured: masked.is_some() || local,
                        provider: id,
                        local,
                        masked,
                    }
                })
                .collect(),
        }
    }

    pub fn key_for(&self, provider: &str) -> Result<String> {
        let found = self
            .keys
            .get(provider)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        match found {
            Some(key) => Ok(key),
            /*
             * **自分の PC で動かすものには鍵が要らない。**
             * Ollama や LM Studio は認証を持たないので、
             * 未設定を理由に弾くと、そもそも使えなくなる。
             * OpenAI 互換の口は空のキーを受け取っても構わない。
             */
            None if self.is_local_provider(provider) => Ok(String::new()),
            None => Err(AppError::code(code::API_KEY_MISSING)),
        }
    }

    /// その接続先が自分の PC 上にあるか（`localhost` / `127.0.0.1`）。
    pub fn is_local_provider(&self, provider: &str) -> bool {
        self.custom(provider)
            .map(|c| is_local_url(&c.base_url))
            .unwrap_or(false)
    }

    /// 表示用のラベル。カスタムはユーザーが付けた名前を返す。
    pub fn label_for(&self, provider: &str) -> String {
        match provider {
            "openai" => "OpenAI".to_string(),
            "anthropic" => "Anthropic (Claude)".to_string(),
            "gemini" => "Google (Gemini)".to_string(),
            id => self
                .custom(id)
                .map(|c| c.label.clone())
                .unwrap_or_else(|| id.to_string()),
        }
    }

    pub fn model_for(&self, provider: &str) -> String {
        if let Some(custom) = self.custom(provider) {
            return custom.model.clone();
        }
        self.models
            .get(provider)
            .cloned()
            .unwrap_or_else(|| Settings::default().models.get(provider).cloned().unwrap_or_default())
    }

    /// 一意な ID を採番する。
    fn next_custom_id(&self) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let mut candidate = format!("custom-{nanos}");
        let mut suffix = 0u32;
        while self.has_provider(&candidate) {
            suffix += 1;
            candidate = format!("custom-{nanos}-{suffix}");
        }
        candidate
    }

    pub fn add_custom_provider(&mut self, label: Option<String>) -> String {
        let id = self.next_custom_id();
        let label = label
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .unwrap_or_else(|| format!("カスタム {}", self.custom_providers.len() + 1));

        self.custom_providers.push(CustomProvider {
            id: id.clone(),
            label,
            base_url: String::new(),
            model: String::new(),
        });
        id
    }

    pub fn remove_custom_provider(&mut self, id: &str) -> Result<()> {
        let before = self.custom_providers.len();
        self.custom_providers.retain(|c| c.id != id);
        if self.custom_providers.len() == before {
            return Err(AppError::detail(code::NOT_FOUND, id.to_string()));
        }
        // 対応する APIキーも一緒に破棄する
        self.keys.remove(id);

        // 選択中のプロバイダを消した場合は組み込みへ戻す
        if self.provider == id {
            self.provider = "anthropic".to_string();
        }
        Ok(())
    }

    /// 旧形式（カスタム枠 1 つ固定）から可変長リストへ移行する。
    /// 移行が発生したら true を返す。
    fn migrate_legacy_custom(&mut self) -> bool {
        let has_legacy = !self.custom_base_url.trim().is_empty()
            || self.keys.contains_key("custom")
            || self.models.contains_key("custom");
        if !has_legacy || self.custom("custom").is_some() {
            // 既に移行済みなら legacy フィールドだけ捨てる
            let dirty = !self.custom_base_url.is_empty();
            self.custom_base_url.clear();
            return dirty;
        }

        self.custom_providers.push(CustomProvider {
            id: "custom".to_string(),
            label: "OpenAI互換".to_string(),
            base_url: std::mem::take(&mut self.custom_base_url),
            model: self.models.remove("custom").unwrap_or_default(),
        });
        // keys["custom"] はそのまま新しい ID "custom" のキーとして引き継がれる
        true
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::detail(code::SETTINGS_DIR, e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Result<Settings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let text = std::fs::read_to_string(&path)?;
    // 壊れた設定ファイルで起動不能にならないよう、失敗時は既定値へフォールバックする
    let mut settings: Settings = serde_json::from_str(&text).unwrap_or_default();

    /*
     * **初回起動の時刻はここで焼き付ける。** 体験期間の起点なので、
     * 分析を一度も実行しなくても、アプリを開いた時点から数え始める。
     */
    let started = crate::trial::ensure_started(settings.first_installed_at_ms, crate::library::now_ms());
    let stamped = started != settings.first_installed_at_ms;
    settings.first_installed_at_ms = started;

    if settings.migrate_legacy_custom() || stamped {
        save(app, &settings)?;
    }
    // 存在しないプロバイダが選択されたまま残らないようにする
    if !settings.has_provider(&settings.provider.clone()) {
        settings.provider = "anthropic".to_string();
    }
    Ok(settings)
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<()> {
    let path = settings_path(app)?;
    std::fs::write(&path, serde_json::to_string_pretty(settings)?)?;
    Ok(())
}

/// URL が自分の PC を指しているか。
///
/// **ここだけで判定する。** 呼び出し側で書き分けると、
/// 片方だけ直したときに挙動が食い違う。
pub fn is_local_url(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("[::1]")
}

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------ 閾値の保存

    #[test]
    fn 閾値は既定では空_変更した項目だけ保存する() {
        let mut settings = Settings::default();
        assert!(settings.thresholds.is_empty(), "既定値はフロント側が持つので保存しない");

        settings.thresholds.insert("per".into(), 18.0);
        let view = settings.to_view();
        assert_eq!(view.thresholds.get("per"), Some(&18.0));
        assert_eq!(view.thresholds.len(), 1);
    }

    #[test]
    fn 閾値は保存と読み込みで往復する() {
        let mut settings = Settings::default();
        settings.thresholds.insert("revenueGrowth".into(), 25.0);
        settings.thresholds.insert("debtToEquity".into(), 1.3);

        let json = serde_json::to_string(&settings).unwrap();
        let restored: Settings = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.thresholds.get("revenueGrowth"), Some(&25.0));
        assert_eq!(restored.thresholds.get("debtToEquity"), Some(&1.3));
    }

    #[test]
    fn 閾値を持たない旧設定ファイルも読める() {
        // thresholds フィールドが無い、以前のバージョンの設定
        let legacy = r#"{"provider":"openai","secUserAgent":"StoQ a@b.c"}"#;
        let settings: Settings = serde_json::from_str(legacy).unwrap();

        assert_eq!(settings.provider, "openai");
        assert!(settings.thresholds.is_empty(), "既定値で埋まる");
        assert_eq!(settings.market_provider, crate::market::DEFAULT_PROVIDER);
    }

    #[test]
    fn 秘密情報をマスクする() {
        assert_eq!(mask_secret("sk-proj-abcdefghijklmnop3f9a").as_deref(), Some("sk-proj-…3f9a"));
        assert_eq!(mask_secret("sk-ant-api03-xxxxxxxxxxxx1234").as_deref(), Some("sk-ant-…1234"));
    }

    #[test]
    fn 空や空白はNone() {
        assert!(mask_secret("").is_none());
        assert!(mask_secret("   ").is_none());
    }

    #[test]
    fn 短いキーでも末尾だけ見せる() {
        let masked = mask_secret("abc123").unwrap();
        assert!(masked.ends_with("c123") || masked.ends_with("123"), "{masked}");
        assert!(!masked.contains("abc123"), "全体が見えてはいけない");
    }

    #[test]
    fn カスタムプロバイダを追加削除できる() {
        let mut s = Settings::default();
        let id = s.add_custom_provider(Some("DeepSeek".into()));
        assert!(s.has_provider(&id));
        assert_eq!(s.label_for(&id), "DeepSeek");

        s.keys.insert(id.clone(), "sk-x".into());
        s.provider = id.clone();
        s.remove_custom_provider(&id).unwrap();

        assert!(!s.has_provider(&id));
        assert!(!s.keys.contains_key(&id), "キーも一緒に消える");
        assert_eq!(s.provider, "anthropic", "選択中を消したら組み込みへ戻る");
    }

    #[test]
    fn フロント向けの表現にクラウドの秘密が出ない() {
        let mut s = Settings::default();
        s.cloud.client_id = "123-secret.apps.googleusercontent.com".into();
        s.cloud.refresh_token = "1//0gVerySecretRefreshToken".into();
        s.cloud.auto_backup = true;

        let json = serde_json::to_string(&s.to_view()).unwrap();
        assert!(!json.contains("1//0gVerySecretRefreshToken"), "{json}");
        assert!(!json.contains("123-secret.apps.googleusercontent.com"), "{json}");
        assert!(s.to_view().cloud.connected, "連携済みであることは伝わる");
    }

    #[test]
    fn クラウド設定を持たない旧設定ファイルも読める() {
        let legacy = r#"{"provider":"openai","secUserAgent":"StoQ a@b.c"}"#;
        let settings: Settings = serde_json::from_str(legacy).unwrap();

        assert!(settings.cloud.client_id.is_empty());
        assert!(!settings.cloud.auto_backup);
        assert!(!settings.to_view().cloud.connected);
    }

    #[test]
    fn ライセンスを入れてもデータは消えない() {
        /*
         * **有効化で触ってよいのは `license_key` だけ。**
         * 体験期間の起点や使用済み銘柄まで書き換えると、
         * 「買ったら過去のデータが消えた」という最悪の体験になる。
         */
        let mut s = Settings::default();
        s.free_tickers = vec!["AAPL".into(), "NVDA".into()];
        s.first_installed_at_ms = 1_700_000_000_000;
        s.custom_instruction = "在庫水準を重点的に".into();
        s.thresholds.insert("per".into(), 18.0);
        s.cloud.client_id = "cid.apps.googleusercontent.com".into();
        s.eula_agreed = true;
        s.eula_agreed_at_ms = 1_700_000_000_000;

        let before = s.clone();
        // コマンド層と同じ操作（`license_activate` がするのはこれだけ）
        s.license_key = crate::license::normalize_key(crate::license::MASTER_KEY);

        assert!(s.to_view().license.activated);
        assert_eq!(s.free_tickers, before.free_tickers);
        assert_eq!(s.first_installed_at_ms, before.first_installed_at_ms);
        assert_eq!(s.custom_instruction, before.custom_instruction);
        assert_eq!(s.thresholds, before.thresholds);
        assert_eq!(s.cloud.client_id, before.cloud.client_id);
        assert!(s.eula_agreed);
    }

    #[test]
    fn 初回起動の時刻は保存と読み込みで往復する() {
        let mut s = Settings::default();
        let now = crate::library::now_ms();
        s.first_installed_at_ms = now;

        let restored: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(restored.first_installed_at_ms, now);
        assert!(!restored.to_view().trial.expired, "起点が最近なら満了していない");

        // 起点が 21 日より前なら満了している
        s.first_installed_at_ms = now - crate::trial::TRIAL_MS - 1;
        assert!(s.to_view().trial.expired);
    }

    #[test]
    fn 体験期間を持たない旧設定ファイルも読める() {
        let legacy = r#"{"provider":"openai"}"#;
        let settings: Settings = serde_json::from_str(legacy).unwrap();

        assert_eq!(settings.first_installed_at_ms, 0);
        assert!(settings.custom_instruction.is_empty());
        // 未記録なら「いま」を起点にするので満了扱いにしない
        assert!(!settings.to_view().trial.expired);
    }

    #[test]
    fn 自由記述は保存と読み込みで往復する() {
        let mut s = Settings::default();
        s.custom_instruction = "半導体サイクルの底打ちに注目".into();

        let restored: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(restored.custom_instruction, "半導体サイクルの底打ちに注目");
        assert_eq!(restored.to_view().custom_instruction, "半導体サイクルの底打ちに注目");
    }

    #[test]
    fn 存在しないプロバイダの削除はエラー() {
        let mut s = Settings::default();
        assert!(s.remove_custom_provider("missing").is_err());
    }
}
