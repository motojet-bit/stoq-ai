//! 共有 HTTP クライアント。
//!
//! Yahoo Finance は crumb 取得の都合で Cookie ストアを共有する必要があるため、
//! プロセス全体で 1 つのクライアントを使い回す。

use std::sync::OnceLock;
use std::time::Duration;

use crate::error::{AppError, Result};

/// 一般的なブラウザを装った UA。Yahoo Finance は既定の reqwest UA を弾くことがある。
pub const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/131.0.0.0 Safari/537.36";

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn client() -> Result<&'static reqwest::Client> {
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(15))
        .user_agent(BROWSER_UA)
        .build()
        .map_err(|e| AppError::msg(format!("HTTP クライアントの初期化に失敗しました: {e}")))?;
    Ok(CLIENT.get_or_init(|| built))
}
