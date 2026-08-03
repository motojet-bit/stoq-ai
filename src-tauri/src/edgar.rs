//! SEC EDGAR クライアント。
//!
//! - ティッカー → CIK の変換（`company_tickers.json` をメモリにキャッシュ）
//! - 最新の 10-K / 10-Q を特定して本文テキストを取得
//!
//! SEC は **User-Agent に連絡先の明示を要求**しており、指定がないとブロックされる。
//! また 10 リクエスト/秒 の制限があるため、リクエスト間に最小間隔を設ける。

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::sync::OnceCell;

use crate::error::{code, AppError, Result};
use crate::html;
use crate::http;

const TICKER_MAP_URL: &str = "https://www.sec.gov/files/company_tickers.json";

/// 1 件の提出書類。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecFiling {
    pub ticker: String,
    pub company: String,
    pub cik: String,
    pub form: String,
    pub filed: String,
    pub period: String,
    pub url: String,
    pub text: String,
    pub char_count: usize,
    /// 元の本文が長すぎて切り詰めた場合 true
    pub truncated: bool,
}

/// 提出書類 1 件の要約（本文は含まない）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilingRef {
    pub form: String,
    /// 提出日 (YYYY-MM-DD)
    pub filed: String,
    /// 対象期間の末日 (YYYY-MM-DD)
    pub period: String,
    pub url: String,
}

/// 資料の準備状況。UI のインジケーター（🟢/🟡/🔴）に対応する。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilingStatus {
    pub ticker: String,
    pub company: String,
    pub cik: String,
    /// `ok` | `userAgentMissing` | `notInEdgar` | `noFilings`
    pub status: String,
    pub latest10k: Option<FilingRef>,
    pub latest10q: Option<FilingRef>,
    /// 取得できない場合の理由（日本語）
    pub message: Option<String>,
    pub fetched_at_ms: u64,
}

impl FilingStatus {
    fn unavailable(ticker: &str, status: &str, message: &str) -> Self {
        Self {
            ticker: ticker.to_uppercase(),
            company: String::new(),
            cik: String::new(),
            status: status.to_string(),
            latest10k: None,
            latest10q: None,
            message: Some(message.to_string()),
            fetched_at_ms: now_ms(),
        }
    }
}

static TICKER_MAP: OnceCell<HashMap<String, (String, String)>> = OnceCell::const_new();

/// SEC のレート制限（10 req/s）を守るための最小間隔。
static LAST_CALL: Mutex<Option<Instant>> = Mutex::new(None);

async fn throttle() {
    let wait = {
        let mut guard = LAST_CALL.lock().unwrap();
        let now = Instant::now();
        let wait = match *guard {
            Some(prev) => Duration::from_millis(150).checked_sub(now.duration_since(prev)),
            None => None,
        };
        *guard = Some(now);
        wait
    };
    if let Some(d) = wait {
        tokio::time::sleep(d).await;
    }
}

/// メールだけ書かれていたときに前置きする名前。
///
/// SEC は「連絡の取れる名前 ＋ メール」を求めている。
const UA_PREFIX: &str = "StoQ-App";

/// SEC へ送る User-Agent を組み立てる。
///
/// **メールアドレスだけ入力された場合は名前を補う。**
/// SEC の要求（識別できる名前と連絡先）を満たさないと 403 で弾かれるが、
/// 設定画面でそこまで読み取れる人は多くない。落とすより補ったほうがよい。
///
/// 既に空白を含む（＝名前が書かれている）ものはそのまま通す。
/// 勝手に前置きすると `StoQ-App StoQ v1 a@b.c` のように二重になる。
fn normalize_user_agent(user_agent: &str) -> Result<String> {
    let ua = user_agent.trim();
    if ua.is_empty() || !ua.contains('@') {
        return Err(AppError::code(code::SEC_USER_AGENT_MISSING));
    }
    if ua.split_whitespace().count() > 1 {
        return Ok(ua.to_string());
    }
    Ok(format!("{UA_PREFIX} {ua}"))
}

async fn get_text(url: &str, user_agent: &str) -> Result<String> {
    throttle().await;
    let res = http::client()?
        .get(url)
        .header("User-Agent", user_agent)
        .header("Accept-Encoding", "gzip, deflate")
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(AppError::detail(code::SEC_FETCH_FAILED, url.to_string()));
    }
    Ok(res.text().await?)
}

/// ティッカー → (CIK 10桁ゼロ埋め, 会社名)
async fn resolve_cik(ticker: &str, user_agent: &str) -> Result<(String, String)> {
    let map = TICKER_MAP
        .get_or_try_init(|| async {
            let body = get_text(TICKER_MAP_URL, user_agent).await?;
            let raw: serde_json::Value = serde_json::from_str(&body)?;
            let mut map = HashMap::new();
            if let Some(obj) = raw.as_object() {
                for entry in obj.values() {
                    let sym = entry
                        .get("ticker")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_uppercase();
                    let cik = entry.get("cik_str").and_then(|v| v.as_u64()).unwrap_or(0);
                    let title = entry
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    if !sym.is_empty() && cik > 0 {
                        map.insert(sym, (format!("{cik:010}"), title));
                    }
                }
            }
            Ok::<_, AppError>(map)
        })
        .await?;

    map.get(&ticker.to_uppercase()).cloned().ok_or_else(|| {
        AppError::detail(code::SEC_FETCH_FAILED, ticker.to_string())
    })
}

/// 提出状況だけを軽量に確認する（本文はダウンロードしない）。
///
/// 「EDGAR に無い」「User-Agent 未設定」は**エラーではなく状態として**返す。
/// 非米国上場銘柄（例: 7203.T）でも Yahoo の指標表示を止めないため。
pub async fn fetch_status(ticker: &str, user_agent: &str) -> Result<FilingStatus> {
    let ua = match normalize_user_agent(user_agent) {
        Ok(ua) => ua,
        Err(e) => {
            return Ok(FilingStatus::unavailable(
                ticker,
                "userAgentMissing",
                &e.to_string(),
            ))
        }
    };
    let ua = ua.as_str();

    let (cik, company) = match resolve_cik(ticker, ua).await {
        Ok(v) => v,
        Err(_) => {
            return Ok(FilingStatus::unavailable(
                ticker,
                "notInEdgar",
                "SEC EDGAR に登録がありません。米国上場銘柄以外（例: 日本株）は提出書類を取得できません。",
            ))
        }
    };

    let body = get_text(&format!("https://data.sec.gov/submissions/CIK{cik}.json"), ua).await?;
    let json: serde_json::Value = serde_json::from_str(&body)?;

    let Some(recent) = json.pointer("/filings/recent") else {
        return Ok(FilingStatus::unavailable(
            ticker,
            "noFilings",
            "提出書類の一覧を取得できませんでした。",
        ));
    };

    let latest10k = latest_of(recent, &cik, "10-K");
    let latest10q = latest_of(recent, &cik, "10-Q");

    let status = if latest10k.is_none() && latest10q.is_none() {
        "noFilings"
    } else {
        "ok"
    };

    Ok(FilingStatus {
        ticker: ticker.to_uppercase(),
        company,
        cik,
        status: status.to_string(),
        message: (status == "noFilings")
            .then(|| "直近の提出書類に 10-K / 10-Q が見つかりませんでした。".to_string()),
        latest10k,
        latest10q,
        fetched_at_ms: now_ms(),
    })
}

/// `recent` 配列から指定フォームの最新 1 件を取り出す。
fn latest_of(recent: &serde_json::Value, cik: &str, form: &str) -> Option<FilingRef> {
    let forms = str_array(recent, "form");
    let index = forms.iter().position(|f| f.eq_ignore_ascii_case(form))?;

    let accessions = str_array(recent, "accessionNumber");
    let primary_docs = str_array(recent, "primaryDocument");
    let filing_dates = str_array(recent, "filingDate");
    let report_dates = str_array(recent, "reportDate");

    let accession_plain = accessions.get(index)?.replace('-', "");
    let primary = primary_docs.get(index)?;
    let cik_trimmed = cik.trim_start_matches('0');

    Some(FilingRef {
        form: forms[index].clone(),
        filed: filing_dates.get(index).cloned().unwrap_or_default(),
        period: report_dates.get(index).cloned().unwrap_or_default(),
        url: format!(
            "https://www.sec.gov/Archives/edgar/data/{cik_trimmed}/{accession_plain}/{primary}"
        ),
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// XBRL で売上を表すタグ。企業によって使うタグが異なるため、この順で試す。
const REVENUE_CONCEPTS: [&str; 4] = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
];

/// SEC XBRL から四半期売上の系列を取得する。
///
/// Yahoo の四半期履歴は 4 期分しか無く前年同期比を計算できないため、
/// 米国上場銘柄についてはここから過去分を補う。
/// EDGAR に無い銘柄や User-Agent 未設定なら空の Vec を返す（エラーにしない）。
pub async fn fetch_quarterly_revenue(
    ticker: &str,
    user_agent: &str,
) -> Vec<crate::quarterly::XbrlQuarter> {
    let Ok(ua) = normalize_user_agent(user_agent) else {
        return Vec::new();
    };
    let ua = ua.as_str();
    let Ok((cik, _)) = resolve_cik(ticker, ua).await else {
        return Vec::new();
    };

    for concept in REVENUE_CONCEPTS {
        let url =
            format!("https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/{concept}.json");
        let Ok(body) = get_text(&url, ua).await else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) else {
            continue;
        };

        let quarters = extract_quarters(&json);
        if quarters.len() >= 5 {
            return quarters;
        }
    }

    Vec::new()
}

/// `units.USD` から 3 か月分（80〜100 日）のエントリだけを取り出す。
///
/// 同じ期末が複数回現れる（訂正報告など）ので、後に出てきたものを採用する。
fn extract_quarters(json: &serde_json::Value) -> Vec<crate::quarterly::XbrlQuarter> {
    let Some(rows) = json.pointer("/units/USD").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut by_end: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();

    for row in rows {
        let (Some(start), Some(end), Some(val)) = (
            row.get("start").and_then(|v| v.as_str()),
            row.get("end").and_then(|v| v.as_str()),
            row.get("val").and_then(|v| v.as_f64()),
        ) else {
            continue;
        };

        let Some(days) = span_days(start, end) else {
            continue;
        };
        if !(80..=100).contains(&days) {
            continue;
        }

        by_end.insert(end.to_string(), val);
    }

    by_end
        .into_iter()
        .map(|(end_date, revenue)| crate::quarterly::XbrlQuarter { end_date, revenue })
        .collect()
}

fn span_days(start: &str, end: &str) -> Option<i64> {
    Some(crate::quarterly::days_between(start, end)?)
}

/// 最新の指定フォーム（例: ["10-K", "10-Q"]）を 1 件取得する。
/// 対象期の絞り込み条件。
///
/// **`None` なら最新を採る。** 指定があるときだけ、
/// `report_date`（対象期の末日）で絞り込む。
#[derive(Debug, Clone, Copy, Default)]
pub struct PeriodFilter {
    /// 対象期の年（西暦 4 桁）
    pub year: Option<i32>,
    /// 第何四半期か。`None` なら年だけで絞る
    pub quarter: Option<u8>,
}

impl PeriodFilter {
    fn is_empty(&self) -> bool {
        self.year.is_none()
    }

    /// `report_date`（YYYY-MM-DD）が条件に合うか。
    ///
    /// **暦月から四半期を割り出す。** 会社ごとの決算月ではなく
    /// 提出書類の対象期末で見る（SEC の submissions が持っているのはこれだけ）。
    fn matches(&self, report_date: &str) -> bool {
        let Some(want_year) = self.year else {
            return true;
        };
        let Ok(year) = report_date.get(0..4).unwrap_or("").parse::<i32>() else {
            return false;
        };
        if year != want_year {
            return false;
        }
        let Some(want_q) = self.quarter else {
            return true;
        };
        let Ok(month) = report_date.get(5..7).unwrap_or("").parse::<u8>() else {
            return false;
        };
        month.saturating_sub(1) / 3 + 1 == want_q
    }
}

pub async fn fetch_latest_filing(
    ticker: &str,
    forms: &[String],
    user_agent: &str,
    max_chars: usize,
) -> Result<SecFiling> {
    fetch_filing(ticker, forms, user_agent, max_chars, PeriodFilter::default()).await
}

/// 提出書類を 1 件取得する。`period` を指定すると、その期のものを探す。
pub async fn fetch_filing(
    ticker: &str,
    forms: &[String],
    user_agent: &str,
    max_chars: usize,
    period: PeriodFilter,
) -> Result<SecFiling> {
    let ua = normalize_user_agent(user_agent)?;
    let ua = ua.as_str();
    let (cik, company) = resolve_cik(ticker, ua).await?;

    let submissions_url = format!("https://data.sec.gov/submissions/CIK{cik}.json");
    let body = get_text(&submissions_url, ua).await?;
    let json: serde_json::Value = serde_json::from_str(&body)?;

    let recent = json
        .pointer("/filings/recent")
        .ok_or_else(|| AppError::code(code::SEC_FETCH_FAILED))?;

    let form_list = str_array(recent, "form");
    let accessions = str_array(recent, "accessionNumber");
    let primary_docs = str_array(recent, "primaryDocument");
    let filing_dates = str_array(recent, "filingDate");
    let report_dates = str_array(recent, "reportDate");

    let wanted: Vec<String> = forms.iter().map(|f| f.to_uppercase()).collect();
    /*
     * **期の指定があるときは、合致しないものを飛ばす。**
     * 合致が 1 件も無ければエラーにする（黙って最新を返すと、
     * 頼んだ期と違う書類が「その期のもの」として分析に入る）。
     */
    let index = (0..form_list.len())
        .find(|i| {
            wanted.iter().any(|w| form_list[*i].to_uppercase() == *w)
                && (period.is_empty()
                    || period.matches(report_dates.get(*i).map(String::as_str).unwrap_or("")))
        })
        .ok_or_else(|| AppError::detail(code::NOT_FOUND, ticker.to_string()))?;

    let accession = accessions.get(index).cloned().unwrap_or_default();
    let accession_plain = accession.replace('-', "");
    let primary = primary_docs.get(index).cloned().unwrap_or_default();
    if primary.is_empty() {
        return Err(AppError::code(code::SEC_FETCH_FAILED));
    }

    let cik_trimmed = cik.trim_start_matches('0');
    let doc_url =
        format!("https://www.sec.gov/Archives/edgar/data/{cik_trimmed}/{accession_plain}/{primary}");

    let raw = get_text(&doc_url, ua).await?;
    let text = if primary.to_lowercase().ends_with(".txt") {
        raw
    } else {
        html::to_text(&raw)
    };

    let full_len = text.chars().count();
    let truncated = full_len > max_chars;
    let text = if truncated {
        let mut t: String = text.chars().take(max_chars).collect();
        t.push_str("\n\n…（本文が長いため以降を省略しました）");
        t
    } else {
        text
    };

    Ok(SecFiling {
        ticker: ticker.to_uppercase(),
        company,
        cik,
        form: form_list.get(index).cloned().unwrap_or_default(),
        filed: filing_dates.get(index).cloned().unwrap_or_default(),
        period: report_dates.get(index).cloned().unwrap_or_default(),
        url: doc_url,
        char_count: text.chars().count(),
        text,
        truncated,
    })
}

fn str_array(value: &serde_json::Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|v| v.as_str().unwrap_or_default().to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 期の絞り込み() {
        let q3 = PeriodFilter { year: Some(2023), quarter: Some(3) };
        assert!(q3.matches("2023-09-30"));
        assert!(q3.matches("2023-07-01"));
        assert!(!q3.matches("2023-06-30"));
        assert!(!q3.matches("2022-09-30"));
    }

    #[test]
    fn 年だけの指定は四半期を問わない() {
        let y = PeriodFilter { year: Some(2023), quarter: None };
        assert!(y.matches("2023-01-31"));
        assert!(y.matches("2023-12-31"));
        assert!(!y.matches("2024-01-31"));
    }

    /// 指定が無ければ何でも通す（最新を採る従来の動き）。
    #[test]
    fn 指定なしは素通し() {
        let none = PeriodFilter::default();
        assert!(none.is_empty());
        assert!(none.matches("2019-03-31"));
        assert!(none.matches(""));
    }

    /// 日付が壊れていたら**合致しない扱い**にする。
    /// 通してしまうと、頼んだ期と違う書類がその期のものとして分析に入る。
    #[test]
    fn 壊れた日付は弾く() {
        let q1 = PeriodFilter { year: Some(2023), quarter: Some(1) };
        assert!(!q1.matches(""));
        assert!(!q1.matches("20230331"));
        assert!(!q1.matches("2023-XX-31"));
    }

    #[test]
    fn メールだけなら名前を補う() {
        assert_eq!(
            normalize_user_agent("test@example.com").unwrap(),
            "StoQ-App test@example.com"
        );
    }

    #[test]
    fn 前後の空白は落としてから補う() {
        assert_eq!(
            normalize_user_agent("  test@example.com \n").unwrap(),
            "StoQ-App test@example.com"
        );
    }

    /// 名前が書かれているものへ重ねて前置きすると `StoQ-App StoQ v1 a@b.c` になる。
    #[test]
    fn 名前入りはそのまま通す() {
        assert_eq!(
            normalize_user_agent("StoQ Analyzer contact@example.com").unwrap(),
            "StoQ Analyzer contact@example.com"
        );
    }

    #[test]
    fn 空とメール無しは従来どおり弾く() {
        assert!(normalize_user_agent("").is_err());
        assert!(normalize_user_agent("   ").is_err());
        assert!(normalize_user_agent("StoQ Analyzer").is_err());
    }

    /// 補完後も「名前 ＋ @ を含む連絡先」という SEC の要求を満たしている。
    #[test]
    fn 補完後も名前とメールの両方を含む() {
        let ua = normalize_user_agent("a@b.co").unwrap();
        assert!(ua.contains('@'));
        assert!(ua.split_whitespace().count() >= 2);
    }
}
