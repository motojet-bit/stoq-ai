//! Alpha Vantage から主要指標を取る。
//!
//! 公式 API。無料枠があり、キーが必要。2 本のエンドポイントを組み合わせる:
//!
//! - `function=OVERVIEW` — 銘柄名・通貨・時価総額・PER・ROE など
//! - `function=GLOBAL_QUOTE` — 現在値と前日比
//!
//! **数値はすべて文字列で返る**（`"MarketCapitalization": "3500000000000"`）ので、
//! 読み出しのたびにパースする。`"None"` や `"-"` が混ざるため素直な parse は使えない。

use serde_json::Value;

use crate::error::{AppError, Result};
use crate::http;
use crate::market::MarketDataProvider;
use crate::yahoo::{fmt_money, fmt_pct, fmt_price, fmt_ratio, Fundamentals, Metric, MetricGroup};

const BASE: &str = "https://www.alphavantage.co/query";

pub struct AlphaVantage {
    api_key: String,
}

impl AlphaVantage {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }

    async fn get(&self, function: &str, symbol: &str) -> Result<Value> {
        let res = http::client()?
            .get(BASE)
            .query(&[
                ("function", function),
                ("symbol", symbol),
                ("apikey", self.api_key.as_str()),
            ])
            .send()
            .await
            .map_err(|e| AppError::msg(format!("Alpha Vantage へ接続できません: {e}")))?;

        let status = res.status();
        let body = res
            .text()
            .await
            .map_err(|e| AppError::msg(format!("Alpha Vantage の応答を読めません: {e}")))?;

        if !status.is_success() {
            return Err(AppError::msg(format!(
                "Alpha Vantage がエラーを返しました（{status}）"
            )));
        }

        let json: Value = serde_json::from_str(&body)
            .map_err(|e| AppError::msg(format!("Alpha Vantage の応答を解釈できません: {e}")))?;

        check_api_error(&json)?;
        Ok(json)
    }
}

/// Alpha Vantage は失敗も HTTP 200 で返す。本文を見て判定する。
fn check_api_error(json: &Value) -> Result<()> {
    if let Some(message) = json.get("Error Message").and_then(|v| v.as_str()) {
        return Err(AppError::msg(format!("Alpha Vantage: {message}")));
    }
    if let Some(note) = json.get("Note").and_then(|v| v.as_str()) {
        return Err(AppError::msg(format!(
            "Alpha Vantage の利用上限に達しました。しばらく待ってからお試しください。（{note}）"
        )));
    }
    if let Some(info) = json.get("Information").and_then(|v| v.as_str()) {
        return Err(AppError::msg(format!("Alpha Vantage: {info}")));
    }
    Ok(())
}

impl MarketDataProvider for AlphaVantage {
    fn id(&self) -> &'static str {
        "alphavantage"
    }

    fn label(&self) -> &'static str {
        "Alpha Vantage"
    }

    async fn fundamentals(&self, ticker: &str) -> Result<Fundamentals> {
        let symbol = ticker.trim().to_uppercase();
        if symbol.is_empty() {
            return Err(AppError::msg("ティッカーが空です。"));
        }

        let overview = self.get("OVERVIEW", &symbol).await?;
        if overview.get("Symbol").is_none() {
            return Err(AppError::msg(format!(
                "Alpha Vantage に {symbol} のデータがありませんでした。ティッカーをご確認ください。"
            )));
        }

        // 株価が取れなくても指標は出す
        let quote = self
            .get("GLOBAL_QUOTE", &symbol)
            .await
            .ok()
            .and_then(|v| v.get("Global Quote").cloned())
            .unwrap_or(Value::Null);

        let currency = text(&overview, "Currency").unwrap_or_default();
        let price = num(&quote, "05. price");

        Ok(Fundamentals {
            ticker: symbol,
            name: text(&overview, "Name").unwrap_or_default(),
            exchange: text(&overview, "Exchange").unwrap_or_default(),
            price,
            price_display: price
                .map(|v| fmt_price(v, &currency))
                .unwrap_or_else(|| "—".into()),
            change_percent: percent_text(&quote, "10. change percent"),
            groups: build_groups(&overview, &currency),
            warning: if price.is_none() {
                Some("Alpha Vantage から現在値を取得できませんでした（指標のみ表示しています）。".into())
            } else {
                None
            },
            currency,
            fetched_at_ms: now_ms(),
        })
    }

    async fn health_check(&self, ticker: &str) -> Result<String> {
        let symbol = ticker.trim().to_uppercase();
        let overview = self.get("OVERVIEW", &symbol).await?;
        match text(&overview, "Name") {
            Some(name) => Ok(format!("Alpha Vantage に接続できました（{name}）")),
            None => Err(AppError::msg(format!(
                "キーは有効ですが、{symbol} のデータが見つかりませんでした。"
            ))),
        }
    }
}

fn build_groups(o: &Value, currency: &str) -> Vec<MetricGroup> {
    let money = |v: f64| fmt_money(v, currency);

    vec![
        MetricGroup {
            title: "規模".into(),
            metrics: vec![
                metric("時価総額", num(o, "MarketCapitalization"), money),
                metric("EBITDA", num(o, "EBITDA"), money),
                metric("売上高 (TTM)", num(o, "RevenueTTM"), money),
            ],
        },
        MetricGroup {
            title: "バリュエーション".into(),
            metrics: vec![
                metric("PER", num(o, "PERatio"), fmt_ratio),
                metric("PBR", num(o, "PriceToBookRatio"), fmt_ratio),
                metric("PSR", num(o, "PriceToSalesRatioTTM"), fmt_ratio),
                metric("EV/EBITDA", num(o, "EVToEBITDA"), fmt_ratio),
                metric("PEG", num(o, "PEGRatio"), fmt_ratio),
            ],
        },
        MetricGroup {
            title: "収益性".into(),
            metrics: vec![
                metric("粗利率", ratio_pct(o, "GrossProfitTTM", "RevenueTTM"), fmt_pct),
                metric("営業利益率", pct(o, "OperatingMarginTTM"), fmt_pct),
                metric("純利益率", pct(o, "ProfitMargin"), fmt_pct),
                metric("ROE", pct(o, "ReturnOnEquityTTM"), fmt_pct),
                metric("ROA", pct(o, "ReturnOnAssetsTTM"), fmt_pct),
            ],
        },
        MetricGroup {
            title: "成長".into(),
            metrics: vec![
                metric("売上成長率 (YoY)", pct(o, "QuarterlyRevenueGrowthYOY"), fmt_pct),
                metric("EPS成長率 (YoY)", pct(o, "QuarterlyEarningsGrowthYOY"), fmt_pct),
                metric("EPS (TTM)", num(o, "EPS"), |v| fmt_price(v, currency)),
            ],
        },
        MetricGroup {
            title: "株主還元".into(),
            metrics: vec![
                metric("配当利回り", pct(o, "DividendYield"), fmt_pct),
                metric("1株配当", num(o, "DividendPerShare"), |v| {
                    fmt_price(v, currency)
                }),
                metric("ベータ", num(o, "Beta"), fmt_ratio),
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

/// 文字列で返る数値を読む。`"None"` `"-"` `""` は未取得として扱う。
fn num(v: &Value, key: &str) -> Option<f64> {
    let raw = v.get(key)?;
    if let Some(f) = raw.as_f64() {
        return Some(f);
    }
    let text = raw.as_str()?.trim();
    if text.is_empty() || text == "None" || text == "-" {
        return None;
    }
    text.parse::<f64>().ok()
}

/// 小数で返る比率を百分率に直す。
fn pct(v: &Value, key: &str) -> Option<f64> {
    num(v, key).map(|x| x * 100.0)
}

/// `"+1.2345%"` のような文字列を数値にする。
fn percent_text(v: &Value, key: &str) -> Option<f64> {
    let text = v.get(key)?.as_str()?.trim().trim_end_matches('%');
    text.parse::<f64>().ok()
}

/// 割り算で比率を出す（粗利率は直接返ってこないため）。
fn ratio_pct(v: &Value, numerator: &str, denominator: &str) -> Option<f64> {
    let top = num(v, numerator)?;
    let bottom = num(v, denominator)?;
    if bottom == 0.0 {
        return None;
    }
    Some(top / bottom * 100.0)
}

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "None")
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 文字列の数値を読める() {
        let v = json!({ "MarketCapitalization": "3500000000000", "PERatio": "31.2" });
        assert_eq!(num(&v, "MarketCapitalization"), Some(3.5e12));
        assert_eq!(num(&v, "PERatio"), Some(31.2));
    }

    #[test]
    fn 未取得を表す値は_None_になる() {
        let v = json!({ "a": "None", "b": "-", "c": "", "d": "  " });
        for key in ["a", "b", "c", "d"] {
            assert_eq!(num(&v, key), None, "{key} は未取得として扱う");
        }
        assert_eq!(num(&v, "missing"), None);
    }

    #[test]
    fn パーセント文字列を数値にできる() {
        let v = json!({ "10. change percent": "+1.2345%" });
        assert_eq!(percent_text(&v, "10. change percent"), Some(1.2345));

        let minus = json!({ "10. change percent": "-0.87%" });
        assert_eq!(percent_text(&minus, "10. change percent"), Some(-0.87));
    }

    #[test]
    fn 粗利率は売上との割り算で出す() {
        let v = json!({ "GrossProfitTTM": "180000", "RevenueTTM": "400000" });
        assert_eq!(ratio_pct(&v, "GrossProfitTTM", "RevenueTTM"), Some(45.0));
    }

    #[test]
    fn ゼロ除算にならない() {
        let v = json!({ "GrossProfitTTM": "100", "RevenueTTM": "0" });
        assert_eq!(ratio_pct(&v, "GrossProfitTTM", "RevenueTTM"), None);
    }

    #[test]
    fn 上限や課金エラーは失敗として扱う() {
        assert!(check_api_error(&json!({ "Note": "call frequency" })).is_err());
        assert!(check_api_error(&json!({ "Error Message": "Invalid API call" })).is_err());
        assert!(check_api_error(&json!({ "Information": "premium endpoint" })).is_err());
        assert!(check_api_error(&json!({ "Symbol": "AAPL" })).is_ok());
    }

    #[test]
    fn 欠けている指標はダッシュで埋まる() {
        let groups = build_groups(&json!({}), "USD");
        for group in &groups {
            for m in &group.metrics {
                assert_eq!(m.value, "—");
            }
        }
    }

    #[test]
    fn 取れた指標だけ整形される() {
        let o = json!({ "PERatio": "31.2", "ProfitMargin": "0.2531" });
        let groups = build_groups(&o, "USD");
        let all: Vec<&Metric> = groups.iter().flat_map(|g| &g.metrics).collect();

        assert_eq!(all.iter().find(|m| m.label == "PER").unwrap().value, "31.20");
        assert_eq!(
            all.iter().find(|m| m.label == "純利益率").unwrap().value,
            "25.31%"
        );
    }
}
