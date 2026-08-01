//! 直近 4 四半期の推移とモメンタム判定。
//!
//! ## データ源の使い分け
//!
//! | 項目 | 源 | 備考 |
//! | --- | --- | --- |
//! | 売上高・純利益（4Q） | Yahoo `incomeStatementHistoryQuarterly` | 全銘柄で取れる |
//! | EPS 実績 / 予想 | Yahoo `earnings.earningsChart` | 直近 4 四半期 |
//! | **四半期 YoY** | SEC XBRL `companyconcept` | 米国上場のみ。30 四半期分ある |
//!
//! Yahoo の四半期履歴は 4 期分しか返らないため、**そのままでは YoY を計算できない**。
//! 季節性の強い企業（例: AAPL の 10-12 月期）は QoQ だけでは成長の加速を判定できないので、
//! 米国上場銘柄については SEC XBRL から過去分を取り、**期末日を約 1 年前と突き合わせて**
//! YoY を算出する（インデックスで 4 つ前を見る方法は、10-Q に第 4 四半期が
//! 含まれないため誤った比較になる）。
//!
//! なお Yahoo は四半期粒度で粗利・営業利益・キャッシュフローを返さない（0 または null）。
//! そのため四半期の利益率は純利益率のみを扱う。

use serde::Serialize;
use serde_json::Value;

use crate::error::Result;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quarter {
    /// 例: "2Q2026"
    pub label: String,
    /// 期末日 (YYYY-MM-DD)
    pub end_date: String,
    pub revenue: Option<f64>,
    pub revenue_display: String,
    pub net_income: Option<f64>,
    pub net_income_display: String,
    /// 純利益率 (%)
    pub net_margin: Option<f64>,
    /// 前四半期比 (%)
    pub revenue_qoq: Option<f64>,
    /// 前年同期比 (%)
    pub revenue_yoy: Option<f64>,
    pub eps_actual: Option<f64>,
    pub eps_estimate: Option<f64>,
    /// EPS のサプライズ率 (%)
    pub eps_surprise_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Momentum {
    /// 直近四半期の YoY (%)
    pub latest_yoy: Option<f64>,
    /// その 1 つ前の四半期の YoY (%)
    pub previous_yoy: Option<f64>,
    /// YoY が拡大していれば true、縮小していれば false、判定不能なら None
    pub accelerating: Option<bool>,
    /// 純利益率が改善しているか
    pub margin_improving: Option<bool>,
    /// UI とプロンプトにそのまま出せる日本語の要約
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuarterlySeries {
    pub ticker: String,
    pub currency: String,
    pub quarters: Vec<Quarter>,
    pub momentum: Momentum,
    /// データ源の説明
    pub source: String,
    /// 制約や注意点
    pub note: Option<String>,
    pub fetched_at_ms: u64,
}

/// SEC XBRL から取った 1 四半期分（YoY 計算用）
#[derive(Debug, Clone)]
pub struct XbrlQuarter {
    pub end_date: String,
    pub revenue: f64,
}

// ---------------------------------------------------------------- 組み立て

/// Yahoo の quoteSummary（四半期モジュール込み）と、任意の SEC XBRL 系列から
/// 四半期推移を組み立てる。
pub fn build(
    ticker: &str,
    currency: &str,
    summary: &Value,
    xbrl: &[XbrlQuarter],
) -> Result<QuarterlySeries> {
    let mut quarters = collect_from_yahoo(summary, currency);

    // 古い順に並べ替えてから QoQ を計算する
    quarters.sort_by(|a, b| a.end_date.cmp(&b.end_date));
    for i in 1..quarters.len() {
        if let (Some(cur), Some(prev)) = (quarters[i].revenue, quarters[i - 1].revenue) {
            if prev != 0.0 {
                quarters[i].revenue_qoq = Some((cur - prev) / prev * 100.0);
            }
        }
    }

    // SEC XBRL があれば、期末日を約 1 年前と突き合わせて YoY を入れる
    let has_yoy = !xbrl.is_empty();
    if has_yoy {
        for q in quarters.iter_mut() {
            let (Some(current), Some(year_ago)) = (q.revenue, find_year_ago(xbrl, &q.end_date))
            else {
                continue;
            };
            if year_ago != 0.0 {
                q.revenue_yoy = Some((current - year_ago) / year_ago * 100.0);
            }
        }
    }

    let momentum = summarize(&quarters, has_yoy);

    let source = if has_yoy {
        "Yahoo Finance（売上・純利益・EPS）＋ SEC EDGAR XBRL（前年同期比）"
    } else {
        "Yahoo Finance（売上・純利益・EPS）"
    };

    let note = if has_yoy {
        Some(
            "Yahoo は四半期粒度で粗利・営業利益・キャッシュフローを提供していないため、四半期の利益率は純利益率のみです。"
                .to_string(),
        )
    } else {
        Some(
            "この銘柄は SEC EDGAR に登録がないため前年同期比を算出できません。季節性のある事業では前四半期比だけで成長の加速を判断しないでください。"
                .to_string(),
        )
    };

    Ok(QuarterlySeries {
        ticker: ticker.to_uppercase(),
        currency: currency.to_string(),
        quarters,
        momentum,
        source: source.to_string(),
        note,
        fetched_at_ms: now_ms(),
    })
}

fn collect_from_yahoo(summary: &Value, currency: &str) -> Vec<Quarter> {
    let statements = summary
        .pointer("/incomeStatementHistoryQuarterly/incomeStatementHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // 期末日 → ラベル（"2Q2026"）の対応を earnings 側から作る
    let labels = quarter_labels(summary);
    let eps = eps_by_label(summary);

    statements
        .iter()
        .map(|s| {
            let end_date = s
                .pointer("/endDate/fmt")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let revenue = raw(s, "totalRevenue");
            let net_income = raw(s, "netIncome");
            let label = labels
                .iter()
                .find(|(rev, _)| revenue.map(|r| (r - *rev).abs() < 1.0).unwrap_or(false))
                .map(|(_, l)| l.clone())
                .unwrap_or_else(|| end_date.clone());

            let (eps_actual, eps_estimate) = eps
                .iter()
                .find(|(l, _, _)| *l == label)
                .map(|(_, a, e)| (*a, *e))
                .unwrap_or((None, None));

            Quarter {
                net_margin: match (revenue, net_income) {
                    (Some(r), Some(n)) if r != 0.0 => Some(n / r * 100.0),
                    _ => None,
                },
                revenue_display: money(revenue, currency),
                net_income_display: money(net_income, currency),
                eps_surprise_pct: match (eps_actual, eps_estimate) {
                    (Some(a), Some(e)) if e != 0.0 => Some((a - e) / e.abs() * 100.0),
                    _ => None,
                },
                label,
                end_date,
                revenue,
                net_income,
                revenue_qoq: None,
                revenue_yoy: None,
                eps_actual,
                eps_estimate,
            }
        })
        .collect()
}

/// `earnings.financialsChart.quarterly` から (売上, ラベル) を集める。
fn quarter_labels(summary: &Value) -> Vec<(f64, String)> {
    summary
        .pointer("/earnings/financialsChart/quarterly")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|q| {
                    let revenue = q.pointer("/revenue/raw").and_then(|v| v.as_f64())?;
                    let date = q.get("date").and_then(|v| v.as_str())?;
                    Some((revenue, date.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// `earnings.earningsChart.quarterly` から (ラベル, 実績, 予想) を集める。
fn eps_by_label(summary: &Value) -> Vec<(String, Option<f64>, Option<f64>)> {
    summary
        .pointer("/earnings/earningsChart/quarterly")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|q| {
                    let date = q.get("date").and_then(|v| v.as_str())?;
                    Some((
                        date.to_string(),
                        q.pointer("/actual/raw").and_then(|v| v.as_f64()),
                        q.pointer("/estimate/raw").and_then(|v| v.as_f64()),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// 指定した期末日のおよそ 1 年前（±25 日）にあたる四半期の売上を探す。
fn find_year_ago(xbrl: &[XbrlQuarter], end_date: &str) -> Option<f64> {
    let target = days_from_epoch(end_date)? - 365;

    xbrl.iter()
        .filter_map(|q| {
            let d = days_from_epoch(&q.end_date)?;
            let diff = (d - target).abs();
            (diff <= 25).then_some((diff, q.revenue))
        })
        .min_by_key(|(diff, _)| *diff)
        .map(|(_, revenue)| revenue)
}

/// 2 つの日付の日数差。
pub fn days_between(start: &str, end: &str) -> Option<i64> {
    Some(days_from_epoch(end)? - days_from_epoch(start)?)
}

/// "YYYY-MM-DD" を 1970-01-01 からの日数に変換する（外部クレートを足さないための簡易実装）。
fn days_from_epoch(date: &str) -> Option<i64> {
    let mut parts = date.split('-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: i64 = parts.next()?.parse().ok()?;
    let d: i64 = parts.next()?.parse().ok()?;

    // 民間暦（proleptic Gregorian）の通日計算
    let a = (14 - m) / 12;
    let y2 = y + 4800 - a;
    let m2 = m + 12 * a - 3;
    let jdn = d + (153 * m2 + 2) / 5 + 365 * y2 + y2 / 4 - y2 / 100 + y2 / 400 - 32045;
    Some(jdn - 2440588)
}

fn summarize(quarters: &[Quarter], has_yoy: bool) -> Momentum {
    let with_yoy: Vec<f64> = quarters.iter().filter_map(|q| q.revenue_yoy).collect();
    let latest_yoy = with_yoy.last().copied();
    let previous_yoy = if with_yoy.len() >= 2 {
        Some(with_yoy[with_yoy.len() - 2])
    } else {
        None
    };

    let accelerating = match (latest_yoy, previous_yoy) {
        (Some(a), Some(b)) => Some(a > b),
        _ => None,
    };

    let margins: Vec<f64> = quarters.iter().filter_map(|q| q.net_margin).collect();
    let margin_improving = if margins.len() >= 2 {
        Some(margins[margins.len() - 1] > margins[0])
    } else {
        None
    };

    let summary = if !has_yoy {
        "前年同期比を算出できないため、成長の加速・減速は判定していません。前四半期比は季節性の影響を受けます。"
            .to_string()
    } else {
        match (latest_yoy, previous_yoy, accelerating) {
            (Some(a), Some(b), Some(true)) => format!(
                "売上の前年同期比が {b:+.1}% → {a:+.1}% と拡大しており、成長は加速しています。"
            ),
            (Some(a), Some(b), Some(false)) => format!(
                "売上の前年同期比が {b:+.1}% → {a:+.1}% と縮小しており、成長は減速しています。"
            ),
            (Some(a), _, _) => format!(
                "直近四半期の売上前年同期比は {a:+.1}% です。比較対象が 1 期分しかないため加速・減速は判定していません。"
            ),
            _ => "前年同期比のデータが不足しており、加速・減速は判定していません。".to_string(),
        }
    };

    Momentum {
        latest_yoy,
        previous_yoy,
        accelerating,
        margin_improving,
        summary,
    }
}

// ---------------------------------------------------------------- 補助

fn raw(v: &Value, key: &str) -> Option<f64> {
    let node = v.get(key)?;
    let value = node
        .get("raw")
        .and_then(|x| x.as_f64())
        .or_else(|| node.as_f64())?;
    // Yahoo は未提供の項目を 0 で返すことがあるため、0 は「無し」として扱う
    (value != 0.0).then_some(value)
}

fn money(v: Option<f64>, currency: &str) -> String {
    let Some(v) = v else { return "—".to_string() };
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
    if unit.is_empty() {
        format!("{scaled:.0} {currency}")
    } else {
        format!("{scaled:.2}{unit} {currency}")
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
