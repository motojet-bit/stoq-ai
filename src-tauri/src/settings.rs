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

use crate::error::{AppError, Result};

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
    /// 組み込み + カスタムの全プロバイダのキー状態
    pub keys: Vec<KeyStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub provider: String,
    pub configured: bool,
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
            keys: self
                .provider_ids()
                .into_iter()
                .map(|id| {
                    let masked = self.keys.get(&id).and_then(|k| mask_secret(k));
                    KeyStatus {
                        provider: id,
                        configured: masked.is_some(),
                        masked,
                    }
                })
                .collect(),
        }
    }

    pub fn key_for(&self, provider: &str) -> Result<String> {
        self.keys
            .get(provider)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::msg(format!(
                    "「{}」の APIキーが未設定です。設定画面から登録してください。",
                    self.label_for(provider)
                ))
            })
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
            return Err(AppError::msg(format!(
                "プロバイダ {id} が見つかりませんでした。"
            )));
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
        .map_err(|e| AppError::msg(format!("設定ディレクトリを取得できません: {e}")))?;
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

    if settings.migrate_legacy_custom() {
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
