//! 設定と APIキーの保存。
//!
//! キーは OS のアプリ設定ディレクトリに保存し、**フロントエンドには決して生の値を返さない**。
//! フロントへ返すのはマスク済み文字列と「設定済みか否か」のみ。

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};

pub const PROVIDERS: [&str; 4] = ["openai", "anthropic", "gemini", "custom"];

/// ディスクに保存される実体。`keys` は生のキーを含むため外に出さない。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// 現在選択中のプロバイダ
    pub provider: String,
    /// プロバイダごとのモデル名
    pub models: BTreeMap<String, String>,
    /// プロバイダごとの APIキー（生の値）
    pub keys: BTreeMap<String, String>,
    /// OpenAI 互換 API（DeepSeek 等）のベース URL
    pub custom_base_url: String,
    /// SEC EDGAR が要求する連絡先付き User-Agent
    pub sec_user_agent: String,
    /// プロンプトに載せる最大トークン数（概算）の上限
    pub max_prompt_tokens: usize,
}

impl Default for Settings {
    fn default() -> Self {
        let mut models = BTreeMap::new();
        models.insert("openai".into(), "gpt-4o".into());
        models.insert("anthropic".into(), "claude-opus-5".into());
        models.insert("gemini".into(), "gemini-2.5-pro".into());
        models.insert("custom".into(), "deepseek-chat".into());

        Self {
            provider: "anthropic".into(),
            models,
            keys: BTreeMap::new(),
            custom_base_url: "https://api.deepseek.com/v1".into(),
            sec_user_agent: String::new(),
            max_prompt_tokens: 180_000,
        }
    }
}

/// フロントエンドへ返す安全な表現。生のキーを含まない。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub provider: String,
    pub models: BTreeMap<String, String>,
    pub custom_base_url: String,
    pub sec_user_agent: String,
    pub max_prompt_tokens: usize,
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
    pub fn to_view(&self) -> SettingsView {
        SettingsView {
            provider: self.provider.clone(),
            models: self.models.clone(),
            custom_base_url: self.custom_base_url.clone(),
            sec_user_agent: self.sec_user_agent.clone(),
            max_prompt_tokens: self.max_prompt_tokens,
            keys: PROVIDERS
                .iter()
                .map(|p| {
                    let masked = self.keys.get(*p).and_then(|k| mask_secret(k));
                    KeyStatus {
                        provider: (*p).to_string(),
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
                    "{provider} の APIキーが未設定です。設定画面から登録してください。"
                ))
            })
    }

    pub fn model_for(&self, provider: &str) -> String {
        self.models
            .get(provider)
            .cloned()
            .unwrap_or_else(|| Settings::default().models[provider].clone())
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
    Ok(serde_json::from_str(&text).unwrap_or_default())
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<()> {
    let path = settings_path(app)?;
    std::fs::write(&path, serde_json::to_string_pretty(settings)?)?;
    Ok(())
}
