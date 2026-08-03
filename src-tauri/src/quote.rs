//! 株価の軽量フィード。
//!
//! 主要指標（`yahoo::fetch_fundamentals`）とは**別に持つ**。
//! あちらは 40 項目以上を組み立てるので数秒かかり、crumb が切れれば失敗する。
//! 銘柄を切り替えるたびにそれを待たせると、株価が出るまで画面が空になる。
//!
//! ここでは crumb の要らない `chart` だけで**株価・前日比・52週**を取り、
//! 時価総額だけを追加で取りに行く。**時価総額が取れなくても株価は返す。**

use serde::Serialize;
use serde_json::Value;

use crate::error::{code, AppError, Result};
use crate::yahoo::{f64_at, fetch_chart_meta, fetch_modules, fmt_money, fmt_price, now_ms, str_at};

/// 時価総額だけを取るためのモジュール。**1 つに絞る**（取得が速く、失敗しにくい）
const CAP_MODULE: &str = "price";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketQuote {
    pub ticker: String,
    pub name: String,
    pub currency: String,
    pub exchange: String,

    pub price: Option<f64>,
    pub price_display: String,

    /// 前日比（金額）
    pub change: Option<f64>,
    pub change_display: String,
    /// 前日比（％）
    pub change_percent: Option<f64>,

    pub week52_high: Option<f64>,
    pub week52_high_display: String,
    pub week52_low: Option<f64>,
    pub week52_low_display: String,

    pub market_cap: Option<f64>,
    pub market_cap_display: String,

    /// 市場が開いているか（`REGULAR` など Yahoo の状態をそのまま渡す）
    pub market_state: Option<String>,
    pub fetched_at_ms: u64,
}

/// 表示できなかった値のしるし。**空文字にしない**（欄が詰まって桁がずれる）
const DASH: &str = "—";

/// 1 銘柄の最新値を取る。
pub async fn fetch_quote(ticker: &str) -> Result<MarketQuote> {
    let symbol = ticker.trim().to_uppercase();
    if symbol.is_empty() {
        return Err(AppError::code(code::INVALID_INPUT));
    }

    let meta = fetch_chart_meta(&symbol).await?;

    let currency = str_at(&meta, "currency").unwrap_or_default();
    let exchange = str_at(&meta, "fullExchangeName")
        .or_else(|| str_at(&meta, "exchangeName"))
        .unwrap_or_default();
    let name = str_at(&meta, "longName")
        .or_else(|| str_at(&meta, "shortName"))
        .unwrap_or_else(|| symbol.clone());

    let price = f64_at(&meta, "regularMarketPrice");
    let previous_close =
        f64_at(&meta, "chartPreviousClose").or_else(|| f64_at(&meta, "previousClose"));

    let (change, change_percent) = diff(price, previous_close);

    let high = f64_at(&meta, "fiftyTwoWeekHigh");
    let low = f64_at(&meta, "fiftyTwoWeekLow");

    // **取れなくても止めない。** 株価だけでも出す価値がある
    let market_cap = fetch_market_cap(&symbol).await;

    Ok(MarketQuote {
        ticker: symbol,
        name,
        exchange,
        price,
        price_display: show(price, |v| fmt_price(v, &currency)),
        change,
        change_display: show(change, |v| signed(v, &currency)),
        change_percent,
        week52_high: high,
        week52_high_display: show(high, |v| fmt_price(v, &currency)),
        week52_low: low,
        week52_low_display: show(low, |v| fmt_price(v, &currency)),
        market_cap,
        market_cap_display: show(market_cap, |v| fmt_money(v, &currency)),
        market_state: str_at(&meta, "marketState"),
        currency,
        fetched_at_ms: now_ms(),
    })
}

/// 前日比を金額と％で出す。
///
/// **前日終値が 0 のときは計算しない。** 上場初日などで 0 が入ることがあり、
/// 割ると無限大が表示に出てしまう。
pub fn diff(price: Option<f64>, previous_close: Option<f64>) -> (Option<f64>, Option<f64>) {
    match (price, previous_close) {
        (Some(p), Some(prev)) if prev != 0.0 => (Some(p - prev), Some((p - prev) / prev * 100.0)),
        _ => (None, None),
    }
}

/// 符号を必ず付ける。**上がったのか下がったのかを色だけに頼らせない。**
pub fn signed(v: f64, currency: &str) -> String {
    let body = fmt_price(v.abs(), currency);
    if v < 0.0 {
        format!("-{body}")
    } else {
        format!("+{body}")
    }
}

fn show(v: Option<f64>, format: impl Fn(f64) -> String) -> String {
    v.map(format).unwrap_or_else(|| DASH.to_string())
}

/// 時価総額だけを取りに行く。**失敗は握りつぶす**（無くても株価は出せる）。
async fn fetch_market_cap(symbol: &str) -> Option<f64> {
    let summary = fetch_modules(symbol, CAP_MODULE).await.ok()?;
    summary
        .pointer("/price/marketCap/raw")
        .and_then(Value::as_f64)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 前日比を金額と割合で出す() {
        let (change, pct) = diff(Some(110.0), Some(100.0));
        assert_eq!(change, Some(10.0));
        assert_eq!(pct, Some(10.0));
    }

    #[test]
    fn 下落も同じように扱う() {
        let (change, pct) = diff(Some(90.0), Some(100.0));
        assert_eq!(change, Some(-10.0));
        assert_eq!(pct, Some(-10.0));
    }

    /// **0 除算を作らない。** 表示に Infinity が出ると画面が壊れて見える。
    #[test]
    fn 前日終値が0なら計算しない() {
        assert_eq!(diff(Some(10.0), Some(0.0)), (None, None));
    }

    #[test]
    fn 値が無ければ計算しない() {
        assert_eq!(diff(None, Some(100.0)), (None, None));
        assert_eq!(diff(Some(100.0), None), (None, None));
    }

    #[test]
    fn 符号を必ず付ける() {
        assert!(signed(1.5, "USD").starts_with('+'));
        assert!(signed(-1.5, "USD").starts_with('-'));
        // 0 は下落ではない
        assert!(signed(0.0, "USD").starts_with('+'));
    }

    #[test]
    fn 取れなかった値はダッシュにする() {
        assert_eq!(show(None, |v| format!("{v}")), DASH);
        assert_eq!(show(Some(1.0), |v| format!("{v}")), "1");
    }
}
