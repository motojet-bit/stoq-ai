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

/// LLM の**無音**をどこまで許すか。
///
/// **推論モデルは考えている間、1 文字も返さない。**
/// GPT-5 系や o シリーズは最初のトークンまで数分かかることがあり、
/// 60 秒で切ると「考えている最中に打ち切る」ことになる。
const LLM_READ_TIMEOUT_SECS: u64 = 300;

/// 接続確立までの待ち時間。**ここは延ばさない。**
/// 繋がらない相手を 5 分待っても結果は変わらず、
/// 「URL を間違えた」ことに気づくのが遅れるだけになる。
const CONNECT_TIMEOUT_SECS: u64 = 30;

pub fn client() -> Result<&'static reqwest::Client> {
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = build(DEFAULT_TIMEOUT_SECS)?;
    Ok(CLIENT.get_or_init(|| built))
}

/// LLM 用のクライアント。
///
/// **全体の制限時間を持たせない。** `timeout` は本文の受信中も動き続けるため、
/// 5 分にすると「5 分以上かかる分析」が答えを返している最中に切られる。
/// 代わりに `read_timeout` で**無音が続いたときだけ**打ち切る。
/// 届き続けている限り何分でも待つ、というのが求めている挙動。
pub fn llm_client() -> Result<&'static reqwest::Client> {
    if let Some(c) = LLM_CLIENT.get() {
        return Ok(c);
    }
    let built = build_llm()?;
    Ok(LLM_CLIENT.get_or_init(|| built))
}

fn build_llm() -> Result<reqwest::Client> {
    base_builder()
        .read_timeout(Duration::from_secs(LLM_READ_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::detail(code::HTTP, e.to_string()))
}

fn build(timeout_secs: u64) -> Result<reqwest::Client> {
    base_builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::detail(code::HTTP, e.to_string()))
}

/// 2 つのクライアントで共通の設定。**待ち時間だけを呼び出し側で決める。**
fn base_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .cookie_store(true)
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .user_agent(BROWSER_UA)
}
