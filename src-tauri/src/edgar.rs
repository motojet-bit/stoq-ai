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

use crate::error::{AppError, Result};
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

fn validate_user_agent(user_agent: &str) -> Result<&str> {
    let ua = user_agent.trim();
    if ua.is_empty() || !ua.contains('@') {
        return Err(AppError::msg(
            "SEC の User-Agent が未設定です。設定画面で「アプリ名 連絡先メールアドレス」の形式で登録してください（例: StockAnalyzer you@example.com）。SEC は連絡先の明示を必須としており、未設定だとアクセスが拒否されます。",
        ));
    }
    Ok(ua)
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
        return Err(AppError::msg(format!(
            "SEC EDGAR から取得できませんでした（HTTP {} / {url}）",
            res.status().as_u16()
        )));
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
        AppError::msg(format!(
            "{ticker} は SEC EDGAR に登録されていません。米国上場銘柄以外（例: 日本株）は SEC 提出書類を取得できません。"
        ))
    })
}

/// 提出状況だけを軽量に確認する（本文はダウンロードしない）。
///
/// 「EDGAR に無い」「User-Agent 未設定」は**エラーではなく状態として**返す。
/// 非米国上場銘柄（例: 7203.T）でも Yahoo の指標表示を止めないため。
pub async fn fetch_status(ticker: &str, user_agent: &str) -> Result<FilingStatus> {
    let ua = match validate_user_agent(user_agent) {
        Ok(ua) => ua,
        Err(e) => {
            return Ok(FilingStatus::unavailable(
                ticker,
                "userAgentMissing",
                &e.to_string(),
            ))
        }
    };

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

/// 最新の指定フォーム（例: ["10-K", "10-Q"]）を 1 件取得する。
pub async fn fetch_latest_filing(
    ticker: &str,
    forms: &[String],
    user_agent: &str,
    max_chars: usize,
) -> Result<SecFiling> {
    let ua = validate_user_agent(user_agent)?;
    let (cik, company) = resolve_cik(ticker, ua).await?;

    let submissions_url = format!("https://data.sec.gov/submissions/CIK{cik}.json");
    let body = get_text(&submissions_url, ua).await?;
    let json: serde_json::Value = serde_json::from_str(&body)?;

    let recent = json
        .pointer("/filings/recent")
        .ok_or_else(|| AppError::msg("SEC のレスポンス形式が想定と異なります。"))?;

    let form_list = str_array(recent, "form");
    let accessions = str_array(recent, "accessionNumber");
    let primary_docs = str_array(recent, "primaryDocument");
    let filing_dates = str_array(recent, "filingDate");
    let report_dates = str_array(recent, "reportDate");

    let wanted: Vec<String> = forms.iter().map(|f| f.to_uppercase()).collect();
    let index = (0..form_list.len())
        .find(|i| wanted.iter().any(|w| form_list[*i].to_uppercase() == *w))
        .ok_or_else(|| {
            AppError::msg(format!(
                "{ticker} の直近の提出書類に {} が見つかりませんでした。",
                forms.join(" / ")
            ))
        })?;

    let accession = accessions.get(index).cloned().unwrap_or_default();
    let accession_plain = accession.replace('-', "");
    let primary = primary_docs.get(index).cloned().unwrap_or_default();
    if primary.is_empty() {
        return Err(AppError::msg("提出書類の本文ファイル名を特定できませんでした。"));
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
