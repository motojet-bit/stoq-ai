//! 共有 HTTP クライアント。
//!
//! Yahoo Finance は crumb 取得の都合で Cookie ストアを共有する必要があるため、
//! プロセス全体で 1 つのクライアントを使い回す。

use std::sync::OnceLock;
use std::time::Duration;

use crate::error::{code, AppError, Result};

/// 一般的なブラウザを装った UA。Yahoo Finance は既定の reqwest UA を弾くことがある。
pub const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/131.0.0.0 Safari/537.36";

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static LLM_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// 市場データ取得の待ち時間。応答が無ければ早めに諦めてよい。
const DEFAULT_TIMEOUT_SECS: u64 = 60;

/// LLM 呼び出しの待ち時間。
///
/// **推論モデルは考えている間、1 文字も返さない。**
/// GPT-5 系や o シリーズは最初のトークンまで数分かかることがあり、
/// 60 秒で切ると「考えている最中に打ち切る」ことになる。
const LLM_TIMEOUT_SECS: u64 = 300;

pub fn client() -> Result<&'static reqwest::Client> {
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = build(DEFAULT_TIMEOUT_SECS)?;
    Ok(CLIENT.get_or_init(|| built))
}

/// LLM 用のクライアント。**待ち時間だけが違う。**
///
/// 市場データまで 5 分待つと、繋がらない取得元で画面が止まって見える。
pub fn llm_client() -> Result<&'static reqwest::Client> {
    if let Some(c) = LLM_CLIENT.get() {
        return Ok(c);
    }
    let built = build(LLM_TIMEOUT_SECS)?;
    Ok(LLM_CLIENT.get_or_init(|| built))
}

fn build(timeout_secs: u64) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(timeout_secs))
        .connect_timeout(Duration::from_secs(15))
        .user_agent(BROWSER_UA)
        .build()
        .map_err(|e| AppError::detail(code::HTTP, e.to_string()))
}
