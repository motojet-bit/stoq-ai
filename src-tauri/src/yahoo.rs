//! Yahoo Finance クライアント。
//!
//! `quoteSummary` は 2024 年以降、Cookie と crumb（CSRF トークン）を要求するようになった。
//! そのため次の手順を踏む。
//!
//! 1. `fc.yahoo.com` にアクセスして Cookie を受け取る（ステータスは 404 でよい）
//! 2. `/v1/test/getcrumb` で crumb を取得し、プロセス内にキャッシュする
//! 3. `quoteSummary` に crumb を付けて問い合わせる（401 なら crumb を捨てて 1 回だけ再取得）
//!
//! 株価だけは crumb 不要の `chart` エンドポイントからも取れるため、
//! `quoteSummary` が失敗しても最低限の情報は返せるようにしている。

use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;

use crate::error::{AppError, Result};
use crate::http;

const MODULES: &str = "price,summaryDetail,defaultKeyStatistics,financialData";

/// 四半期推移用のモジュール。`quoteSummary` は 1 回で取れる数に上限があるため、
/// 指標用とは分けて取得する。
const QUARTERLY_MODULES: &str = "price,incomeStatementHistoryQuarterly,earnings";

static CRUMB: Mutex<Option<String>> = Mutex::new(None);

// ---------------------------------------------------------------- 返却する型

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub label: String,
    /// 整形済みの表示文字列。取得できなかった場合は "—"
    pub value: String,
    /// 生の数値（グラフ化や閾値判定に使う）
    pub raw: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricGroup {
    pub title: String,
    pub metrics: Vec<Metric>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fundamentals {
    pub ticker: String,
    pub name: String,
    pub currency: String,
    pub exchange: String,
    pub price: Option<f64>,
    pub price_display: String,
    pub change_percent: Option<f64>,
    pub groups: Vec<MetricGroup>,
    /// 一部だけ取得できた場合の注意書き
    pub warning: Option<String>,
    pub fetched_at_ms: u64,
}

// ---------------------------------------------------------------- 公開 API

pub async fn fetch_fundamentals(ticker: &str) -> Result<Fundamentals> {
    let symbol = ticker.trim().to_uppercase();
    if symbol.is_empty() {
        return Err(AppError::msg("ティッカーが空です。"));
    }

    // crumb 不要の chart から、銘柄名・通貨・株価を取る
    let meta = fetch_chart_meta(&symbol).await?;

    let currency = str_at(&meta, "currency").unwrap_or_default();
    let exchange = str_at(&meta, "fullExchangeName")
        .or_else(|| str_at(&meta, "exchangeName"))
        .unwrap_or_default();
    let name = str_at(&meta, "longName")
        .or_else(|| str_at(&meta, "shortName"))
        .unwrap_or_else(|| symbol.clone());

    let price = f64_at(&meta, "regularMarketPrice");
    let previous_close = f64_at(&meta, "chartPreviousClose").or_else(|| f64_at(&meta, "previousClose"));
    let change_percent = match (price, previous_close) {
        (Some(p), Some(prev)) if prev != 0.0 => Some((p - prev) / prev * 100.0),
        _ => None,
    };

    // 詳細指標。失敗しても株価だけは返す。
    let (summary, warning) = match fetch_quote_summary(&symbol).await {
        Ok(v) => (Some(v), None),
        Err(e) => (
            None,
            Some(format!(
                "株価は取得できましたが、詳細指標の取得に失敗しました: {e}"
            )),
        ),
    };

    let groups = match &summary {
        Some(s) => build_groups(s, &currency),
        None => Vec::new(),
    };

    Ok(Fundamentals {
        ticker: symbol,
        name,
        currency: currency.clone(),
        exchange,
        price,
        price_display: price
            .map(|p| fmt_price(p, &currency))
            .unwrap_or_else(|| "—".to_string()),
        change_percent,
        groups,
        warning,
        fetched_at_ms: now_ms(),
    })
}

// ---------------------------------------------------------------- HTTP

async fn fetch_chart_meta(symbol: &str) -> Result<Value> {
    let url = format!("https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d");
    let res = http::client()?.get(&url).send().await?;

    let status = res.status();
    let body: Value = res.json().await.map_err(|_| {
        AppError::msg("Yahoo Finance のレスポンスを解析できませんでした。")
    })?;

    if let Some(desc) = body
        .pointer("/chart/error/description")
        .and_then(|v| v.as_str())
    {
        return Err(AppError::msg(format!(
            "「{symbol}」は Yahoo Finance で見つかりませんでした（{desc}）。ティッカーを確認してください（例: AAPL / 7203.T / ASML.AS）。"
        )));
    }
    if !status.is_success() {
        return Err(AppError::msg(format!(
            "Yahoo Finance から取得できませんでした（HTTP {}）。",
            status.as_u16()
        )));
    }

    body.pointer("/chart/result/0/meta")
        .cloned()
        .ok_or_else(|| {
            AppError::msg(format!(
                "「{symbol}」の銘柄情報が見つかりませんでした。ティッカーを確認してください。"
            ))
        })
}

/// 四半期モジュールを取得する。通貨も一緒に返す。
pub async fn fetch_quarterly_summary(ticker: &str) -> Result<(Value, String)> {
    let symbol = ticker.trim().to_uppercase();
    let summary = fetch_modules(&symbol, QUARTERLY_MODULES).await?;
    let currency = summary
        .pointer("/price/currency")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    Ok((summary, currency))
}

async fn fetch_quote_summary(symbol: &str) -> Result<Value> {
    fetch_modules(symbol, MODULES).await
}

async fn fetch_modules(symbol: &str, modules: &str) -> Result<Value> {
    let mut refreshed = false;

    loop {
        let crumb = crumb(refreshed).await?;
        let url = format!(
            "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules={modules}&crumb={crumb}"
        );
        let res = http::client()?.get(&url).send().await?;
        let status = res.status();

        if status.is_success() {
            let body: Value = res.json().await?;
            return body
                .pointer("/quoteSummary/result/0")
                .cloned()
                .ok_or_else(|| AppError::msg("指標データが空でした。"));
        }

        // crumb 期限切れは 401。1 回だけ取り直す。
        if status.as_u16() == 401 && !refreshed {
            *CRUMB.lock().unwrap() = None;
            refreshed = true;
            continue;
        }

        return Err(AppError::msg(format!("HTTP {}", status.as_u16())));
    }
}

/// crumb を取得する。`force` が true ならキャッシュを無視して取り直す。
async fn crumb(force: bool) -> Result<String> {
    if !force {
        if let Some(c) = CRUMB.lock().unwrap().clone() {
            return Ok(c);
        }
    }

    let client = http::client()?;

    // Cookie を受け取るためのアクセス。404 が返るのが正常。
    let _ = client.get("https://fc.yahoo.com/").send().await;

    let res = client
        .get("https://query1.finance.yahoo.com/v1/test/getcrumb")
        .header("Accept", "text/plain")
        .send()
        .await?;

    let text = res.text().await?.trim().to_string();
    if text.is_empty() || text.contains('<') {
        return Err(AppError::msg(
            "Yahoo Finance の認証トークン（crumb）を取得できませんでした。",
        ));
    }

    *CRUMB.lock().unwrap() = Some(text.clone());
    Ok(text)
}

// ---------------------------------------------------------------- 指標の組み立て

fn build_groups(s: &Value, currency: &str) -> Vec<MetricGroup> {
    let money = |label: &str, module: &str, field: &str| {
        metric(label, num(s, module, field), |v| fmt_money(v, currency))
    };
    let ratio = |label: &str, module: &str, field: &str| {
        metric(label, num(s, module, field), fmt_num)
    };
    // Yahoo が小数（0.4523）で返す割合
    let frac = |label: &str, module: &str, field: &str| {
        metric(label, num(s, module, field), |v| fmt_pct(v * 100.0))
    };
    // Yahoo が既に百分率（154.4）で返す割合
    let pct = |label: &str, module: &str, field: &str| {
        metric(label, num(s, module, field), fmt_pct)
    };

    vec![
        MetricGroup {
            title: "株価・規模".into(),
            metrics: vec![
                money("時価総額", "price", "marketCap"),
                money("企業価値 (EV)", "defaultKeyStatistics", "enterpriseValue"),
                metric(
                    "52週安値",
                    num(s, "summaryDetail", "fiftyTwoWeekLow"),
                    |v| fmt_price(v, currency),
                ),
                metric(
                    "52週高値",
                    num(s, "summaryDetail", "fiftyTwoWeekHigh"),
                    |v| fmt_price(v, currency),
                ),
                ratio("ベータ", "summaryDetail", "beta"),
                money("発行済株式数", "defaultKeyStatistics", "sharesOutstanding"),
            ],
        },
        MetricGroup {
            title: "バリュエーション".into(),
            metrics: vec![
                ratio("PER（実績）", "summaryDetail", "trailingPE"),
                ratio("PER（予想）", "summaryDetail", "forwardPE"),
                ratio("PBR", "defaultKeyStatistics", "priceToBook"),
                ratio("PSR", "summaryDetail", "priceToSalesTrailing12Months"),
                ratio("EV / EBITDA", "defaultKeyStatistics", "enterpriseToEbitda"),
                ratio("EV / 売上高", "defaultKeyStatistics", "enterpriseToRevenue"),
            ],
        },
        MetricGroup {
            title: "成長性".into(),
            metrics: vec![
                frac("売上成長率（YoY）", "financialData", "revenueGrowth"),
                frac("EPS成長率（YoY）", "financialData", "earningsGrowth"),
                frac(
                    "四半期利益成長率",
                    "defaultKeyStatistics",
                    "earningsQuarterlyGrowth",
                ),
                ratio("EPS（実績）", "defaultKeyStatistics", "trailingEps"),
                ratio("EPS（予想）", "defaultKeyStatistics", "forwardEps"),
                money("売上高（TTM）", "financialData", "totalRevenue"),
            ],
        },
        MetricGroup {
            title: "収益性".into(),
            metrics: vec![
                frac("粗利率", "financialData", "grossMargins"),
                frac("営業利益率", "financialData", "operatingMargins"),
                frac("純利益率", "financialData", "profitMargins"),
                frac("EBITDA マージン", "financialData", "ebitdaMargins"),
                frac("ROE", "financialData", "returnOnEquity"),
                frac("ROA", "financialData", "returnOnAssets"),
            ],
        },
        MetricGroup {
            title: "キャッシュ・財務健全性".into(),
            metrics: vec![
                money("フリーCF", "financialData", "freeCashflow"),
                money("営業CF", "financialData", "operatingCashflow"),
                money("現金・同等物", "financialData", "totalCash"),
                money("有利子負債", "financialData", "totalDebt"),
                pct("負債比率 (D/E)", "financialData", "debtToEquity"),
                ratio("流動比率", "financialData", "currentRatio"),
            ],
        },
        MetricGroup {
            title: "アナリスト予想".into(),
            metrics: vec![
                metric(
                    "目標株価（平均）",
                    num(s, "financialData", "targetMeanPrice"),
                    |v| fmt_price(v, currency),
                ),
                metric(
                    "目標株価（高）",
                    num(s, "financialData", "targetHighPrice"),
                    |v| fmt_price(v, currency),
                ),
                metric(
                    "目標株価（低）",
                    num(s, "financialData", "targetLowPrice"),
                    |v| fmt_price(v, currency),
                ),
                Metric {
                    label: "レーティング".into(),
                    value: s
                        .pointer("/financialData/recommendationKey")
                        .and_then(|v| v.as_str())
                        .map(recommendation_label)
                        .unwrap_or_else(|| "—".to_string()),
                    raw: None,
                },
                ratio("推奨スコア", "financialData", "recommendationMean"),
                metric(
                    "アナリスト数",
                    num(s, "financialData", "numberOfAnalystOpinions"),
                    |v| format!("{v:.0} 名"),
                ),
            ],
        },
    ]
}

fn metric(label: &str, raw: Option<f64>, format: impl Fn(f64) -> String) -> Metric {
    Metric {
        label: label.to_string(),
        value: raw.map(format).unwrap_or_else(|| "—".to_string()),
        raw,
    }
}

/// Yahoo は `{ raw, fmt, longFmt }` の形で返すことが多い。素の数値の場合もある。
fn num(root: &Value, module: &str, field: &str) -> Option<f64> {
    let node = root.pointer(&format!("/{module}/{field}"))?;
    node.get("raw")
        .and_then(|v| v.as_f64())
        .or_else(|| node.as_f64())
}

fn f64_at(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| x.as_f64())
}

fn str_at(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------- 整形

fn fmt_price(v: f64, currency: &str) -> String {
    if currency.is_empty() {
        format!("{v:.2}")
    } else {
        format!("{v:.2} {currency}")
    }
}

fn fmt_money(v: f64, currency: &str) -> String {
    let abs = v.abs();
    let (scaled, unit) = if abs >= 1e12 {
        (v / 1e12, "兆")
    } else if abs >= 1e8 {
        (v / 1e8, "億")
    } else if abs >= 1e6 {
        (v / 1e6, "百万")
    } else {
        (v, "")
    };

    let head = if unit.is_empty() {
        format!("{scaled:.0}")
    } else {
        format!("{scaled:.2}{unit}")
    };

    if currency.is_empty() {
        head
    } else {
        format!("{head} {currency}")
    }
}

fn fmt_pct(v: f64) -> String {
    format!("{v:.2}%")
}

fn fmt_num(v: f64) -> String {
    format!("{v:.2}")
}

fn recommendation_label(key: &str) -> String {
    match key {
        "strong_buy" => "強い買い",
        "buy" => "買い",
        "hold" => "中立",
        "underperform" | "sell" => "売り",
        "strong_sell" => "強い売り",
        other => other,
    }
    .to_string()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
