//! 市場データの取得元を切り替えられるようにする層。
//!
//! 取得元ごとに事情が違う:
//!
//! | ID | 取得元 | 位置づけ |
//! | --- | --- | --- |
//! | `yahoo` | Yahoo Finance | 非公式取得。キー不要だが将来の動作保証は無い |
//! | `fmp` | Financial Modeling Prep | 公式 API。安定・商用向け。キーが要る |
//! | `alphavantage` | Alpha Vantage | 公式 API。無料枠あり。キーが要る |
//!
//! **どれを選んでも同じ `Fundamentals` を返す**ので、UI 側は取得元を意識しない。
//! 四半期推移（`quarterly.rs`）は SEC XBRL との突き合わせが必要なため、
//! いまのところ Yahoo + SEC 固定で動く（`docs/設計.md` を参照）。

pub mod alphavantage;
pub mod fmp;

use serde::Serialize;

use crate::error::{AppError, Result};
use crate::settings::Settings;
use crate::yahoo::{self, Fundamentals};

/// 選べる取得元の ID。
pub const PROVIDER_IDS: [&str; 3] = ["yahoo", "fmp", "alphavantage"];

/// 既定の取得元。キー無しですぐ試せるものを既定にしている。
pub const DEFAULT_PROVIDER: &str = "yahoo";

/// APIキーの保存キー。LLM のキーと同じ辞書に入れるので接頭辞で分ける。
pub fn key_id(provider: &str) -> String {
    format!("market:{provider}")
}

/// 取得元の状態。UI にそのまま出せるかたち。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub label: String,
    /// APIキーが要るか
    pub requires_key: bool,
    /// いま取得できる状態か
    pub ready: bool,
    /// 使えない理由。使えるなら None
    pub reason: Option<String>,
}

pub fn label_of(id: &str) -> &'static str {
    match id {
        "fmp" => "Financial Modeling Prep",
        "alphavantage" => "Alpha Vantage",
        _ => "Yahoo Finance",
    }
}

pub fn requires_key(id: &str) -> bool {
    matches!(id, "fmp" | "alphavantage")
}

/// 保存値が壊れていても必ず有効な ID を返す。
pub fn normalize_id(id: &str) -> String {
    let trimmed = id.trim();
    if PROVIDER_IDS.contains(&trimmed) {
        trimmed.to_string()
    } else {
        DEFAULT_PROVIDER.to_string()
    }
}

/// 指定した取得元が使える状態かを調べる（純粋な判定。通信はしない）。
pub fn status_of(settings: &Settings, id: &str) -> ProviderStatus {
    let id = normalize_id(id);
    let needs_key = requires_key(&id);
    let has_key = settings
        .keys
        .get(&key_id(&id))
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false);

    let reason = if needs_key && !has_key {
        Some(format!(
            "{} の APIキーが未設定です。設定画面の「データ取得元」で登録してください。",
            label_of(&id)
        ))
    } else {
        None
    };

    ProviderStatus {
        label: label_of(&id).to_string(),
        requires_key: needs_key,
        ready: reason.is_none(),
        reason,
        id,
    }
}

/// 全取得元の状態を並べる（設定画面の一覧用）。
pub fn all_statuses(settings: &Settings) -> Vec<ProviderStatus> {
    PROVIDER_IDS.iter().map(|id| status_of(settings, id)).collect()
}

/// 市場データの取得元。取得元ごとに実装する。
#[allow(async_fn_in_trait)]
pub trait MarketDataProvider {
    fn id(&self) -> &'static str;
    fn label(&self) -> &'static str;
    /// 主要指標を取得する。
    async fn fundamentals(&self, ticker: &str) -> Result<Fundamentals>;
    /// キーと疎通を確認する。成功したら人間向けの一言を返す。
    async fn health_check(&self, ticker: &str) -> Result<String>;
}

struct Yahoo;

impl MarketDataProvider for Yahoo {
    fn id(&self) -> &'static str {
        "yahoo"
    }
    fn label(&self) -> &'static str {
        "Yahoo Finance"
    }
    async fn fundamentals(&self, ticker: &str) -> Result<Fundamentals> {
        yahoo::fetch_fundamentals(ticker).await
    }
    async fn health_check(&self, ticker: &str) -> Result<String> {
        let f = yahoo::fetch_fundamentals(ticker).await?;
        Ok(format!("{} の株価を取得できました（{}）", f.ticker, f.price_display))
    }
}

/// 選択中の取得元で主要指標を取る。
pub async fn fetch_fundamentals(settings: &Settings, ticker: &str) -> Result<Fundamentals> {
    let id = normalize_id(&settings.market_provider);
    let status = status_of(settings, &id);
    if !status.ready {
        return Err(AppError::msg(
            status.reason.unwrap_or_else(|| "取得元を利用できません。".into()),
        ));
    }

    match id.as_str() {
        "fmp" => {
            fmp::Fmp::new(settings.key_for(&key_id("fmp"))?)
                .fundamentals(ticker)
                .await
        }
        "alphavantage" => {
            alphavantage::AlphaVantage::new(settings.key_for(&key_id("alphavantage"))?)
                .fundamentals(ticker)
                .await
        }
        _ => Yahoo.fundamentals(ticker).await,
    }
}

/// 取得元の疎通確認。設定画面の「接続テスト」から呼ぶ。
pub async fn health_check(settings: &Settings, id: &str, ticker: &str) -> Result<String> {
    let id = normalize_id(id);
    let status = status_of(settings, &id);
    if !status.ready {
        return Err(AppError::msg(
            status.reason.unwrap_or_else(|| "取得元を利用できません。".into()),
        ));
    }

    match id.as_str() {
        "fmp" => {
            fmp::Fmp::new(settings.key_for(&key_id("fmp"))?)
                .health_check(ticker)
                .await
        }
        "alphavantage" => {
            alphavantage::AlphaVantage::new(settings.key_for(&key_id("alphavantage"))?)
                .health_check(ticker)
                .await
        }
        _ => Yahoo.health_check(ticker).await,
    }
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with(provider: &str, key: Option<(&str, &str)>) -> Settings {
        let mut s = Settings::default();
        s.market_provider = provider.to_string();
        if let Some((id, value)) = key {
            s.keys.insert(key_id(id), value.to_string());
        }
        s
    }

    #[test]
    fn 既定は_yahoo_でキー不要() {
        let s = Settings::default();
        assert_eq!(normalize_id(&s.market_provider), "yahoo");

        let status = status_of(&s, "yahoo");
        assert!(status.ready);
        assert!(!status.requires_key);
        assert_eq!(status.reason, None);
    }

    #[test]
    fn 壊れた保存値は_yahoo_に丸められる() {
        assert_eq!(normalize_id("bloomberg"), "yahoo");
        assert_eq!(normalize_id(""), "yahoo");
        assert_eq!(normalize_id("  fmp  "), "fmp");
    }

    #[test]
    fn キーが要る取得元はキー未設定だと使えない() {
        for id in ["fmp", "alphavantage"] {
            let s = settings_with(id, None);
            let status = status_of(&s, id);
            assert!(status.requires_key, "{id} はキーが要る");
            assert!(!status.ready, "{id} はキー未設定なら使えない");
            assert!(
                status.reason.as_deref().unwrap().contains("APIキーが未設定"),
                "理由が分かる文言になっている"
            );
        }
    }

    #[test]
    fn キーを入れると使えるようになる() {
        let s = settings_with("fmp", Some(("fmp", "demo-key")));
        let status = status_of(&s, "fmp");
        assert!(status.ready);
        assert_eq!(status.reason, None);
        assert_eq!(status.label, "Financial Modeling Prep");
    }

    #[test]
    fn 空白だけのキーは未設定として扱う() {
        let s = settings_with("fmp", Some(("fmp", "   ")));
        assert!(!status_of(&s, "fmp").ready);
    }

    #[test]
    fn 取得元ごとにキーは独立している() {
        let s = settings_with("alphavantage", Some(("fmp", "demo-key")));
        assert!(status_of(&s, "fmp").ready);
        assert!(!status_of(&s, "alphavantage").ready, "別の取得元のキーは流用しない");
    }

    #[test]
    fn キーの保存先は_llm_のキーと衝突しない() {
        assert_eq!(key_id("fmp"), "market:fmp");
        assert!(!crate::settings::BUILTIN_PROVIDERS.contains(&key_id("fmp").as_str()));
    }

    #[test]
    fn 一覧は三種類ぶん返る() {
        let list = all_statuses(&Settings::default());
        assert_eq!(list.len(), 3);
        assert_eq!(
            list.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            vec!["yahoo", "fmp", "alphavantage"]
        );
        assert_eq!(list[1].label, "Financial Modeling Prep");
        assert_eq!(list[2].label, "Alpha Vantage");
    }

    #[tokio::test]
    async fn キー未設定のまま取得すると理由つきで失敗する() {
        let s = settings_with("fmp", None);
        let err = fetch_fundamentals(&s, "AAPL").await.unwrap_err();
        assert!(format!("{err:?}").contains("APIキーが未設定"));
    }

    #[tokio::test]
    async fn キー未設定のままヘルスチェックしても通信しない() {
        let s = settings_with("alphavantage", None);
        let err = health_check(&s, "alphavantage", "AAPL").await.unwrap_err();
        assert!(format!("{err:?}").contains("APIキーが未設定"));
    }
}
