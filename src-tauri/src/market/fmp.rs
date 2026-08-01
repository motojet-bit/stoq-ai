//! Financial Modeling Prep（FMP）から主要指標を取る。
//!
//! 公式 API なので利用規約が明確で、商用利用にも向く。APIキーが必要。
//! 3 本のエンドポイントを組み合わせて `Fundamentals` を組み立てる:
//!
//! - `/api/v3/profile/{symbol}` — 銘柄名・通貨・取引所・株価・前日比・時価総額
//! - `/api/v3/key-metrics-ttm/{symbol}` — PER / PBR / PSR / ROE / D/E など
//! - `/api/v3/ratios-ttm/{symbol}` — 利益率・成長率まわり
//!
//! 指標が欠けていてもエラーにはせず「—」で埋める。
//! **全部そろわないと何も出ない、という作りにすると使い勝手が悪いため。**

use serde_json::Value;

use crate::error::{AppError, Result};
use crate::http;
use crate::market::MarketDataProvider;
use crate::yahoo::{fmt_money, fmt_pct, fmt_price, fmt_ratio, Fundamentals, Metric, MetricGroup};

const BASE: &str = "https://financialmodelingprep.com/api/v3";

pub struct Fmp {
    api_key: String,
}

impl Fmp {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{BASE}/{path}?apikey={}", self.api_key);
        let res = http::client()?
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::msg(format!("FMP へ接続できません: {e}")))?;

        let status = res.status();
        let body = res
            .text()
            .await
            .map_err(|e| AppError::msg(format!("FMP の応答を読めません: {e}")))?;

        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(AppError::msg(
                "FMP の APIキーが受け付けられませんでした。設定画面でキーを確認してください。",
            ));
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AppError::msg(
                "FMP の利用上限に達しました。しばらく待つか、プランを確認してください。",
            ));
        }
        if !status.is_success() {
            return Err(AppError::msg(format!("FMP がエラーを返しました（{status}）")));
        }

        let json: Value = serde_json::from_str(&body)
            .map_err(|e| AppError::msg(format!("FMP の応答を解釈できません: {e}")))?;

        // エラーは 200 で本文に入ってくることがある
        if let Some(message) = json.get("Error Message").and_then(|v| v.as_str()) {
            return Err(AppError::msg(format!("FMP: {message}")));
        }
        Ok(json)
    }

    /// 配列で返るエンドポイントの先頭要素を取る。
    async fn get_first(&self, path: &str) -> Result<Value> {
        let json = self.get(path).await?;
        Ok(json
            .as_array()
            .and_then(|a| a.first())
            .cloned()
            .unwrap_or(Value::Null))
    }
}

impl MarketDataProvider for Fmp {
    fn id(&self) -> &'static str {
        "fmp"
    }

    fn label(&self) -> &'static str {
        "Financial Modeling Prep"
    }

    async fn fundamentals(&self, ticker: &str) -> Result<Fundamentals> {
        let symbol = ticker.trim().to_uppercase();
        if symbol.is_empty() {
            return Err(AppError::msg("ティッカーが空です。"));
        }

        let profile = self.get_first(&format!("profile/{symbol}")).await?;
        if profile.is_null() {
            return Err(AppError::msg(format!(
                "FMP に {symbol} のデータがありませんでした。ティッカーをご確認ください。"
            )));
        }

        // 指標は取れなくても致命的ではないので、失敗したら空で続ける
        let metrics = self
            .get_first(&format!("key-metrics-ttm/{symbol}"))
            .await
            .unwrap_or(Value::Null);
        let ratios = self
            .get_first(&format!("ratios-ttm/{symbol}"))
            .await
            .unwrap_or(Value::Null);

        let currency = s(&profile, "currency").unwrap_or_default();
        let price = n(&profile, "price");
        let warning = if metrics.is_null() && ratios.is_null() {
            Some("FMP から指標を取得できませんでした（株価と銘柄情報のみ表示しています）。".into())
        } else {
            None
        };

        Ok(Fundamentals {
            ticker: symbol,
            name: s(&profile, "companyName").unwrap_or_default(),
            exchange: s(&profile, "exchangeShortName")
                .or_else(|| s(&profile, "exchange"))
                .unwrap_or_default(),
            price,
            price_display: price
                .map(|v| fmt_price(v, &currency))
                .unwrap_or_else(|| "—".into()),
            change_percent: n(&profile, "changesPercentage"),
            groups: build_groups(&profile, &metrics, &ratios, &currency),
            warning,
            currency,
            fetched_at_ms: now_ms(),
        })
    }

    async fn health_check(&self, ticker: &str) -> Result<String> {
        let symbol = ticker.trim().to_uppercase();
        let profile = self.get_first(&format!("profile/{symbol}")).await?;
        if profile.is_null() {
            return Err(AppError::msg(format!(
                "キーは有効ですが、{symbol} のデータが見つかりませんでした。"
            )));
        }
        Ok(format!(
            "FMP に接続できました（{} / {}）",
            s(&profile, "companyName").unwrap_or_else(|| symbol.clone()),
            n(&profile, "price")
                .map(|v| fmt_price(v, &s(&profile, "currency").unwrap_or_default()))
                .unwrap_or_else(|| "株価不明".into())
        ))
    }
}

fn build_groups(
    profile: &Value,
    metrics: &Value,
    ratios: &Value,
    currency: &str,
) -> Vec<MetricGroup> {
    let money = |v: f64| fmt_money(v, currency);

    vec![
        MetricGroup {
            title: "規模".into(),
            metrics: vec![
                metric("時価総額", n(profile, "mktCap"), money),
                metric(
                    "企業価値 (EV)",
                    n(metrics, "enterpriseValueTTM"),
                    money,
                ),
                metric("従業員数", n_str(profile, "fullTimeEmployees"), |v| {
                    format!("{v:.0} 名")
                }),
            ],
        },
        MetricGroup {
            title: "バリュエーション".into(),
            metrics: vec![
                metric("PER (TTM)", n(metrics, "peRatioTTM"), fmt_ratio),
                metric("PBR", n(metrics, "pbRatioTTM"), fmt_ratio),
                metric("PSR", n(metrics, "priceToSalesRatioTTM"), fmt_ratio),
                metric("EV/EBITDA", n(metrics, "enterpriseValueOverEBITDATTM"), fmt_ratio),
            ],
        },
        MetricGroup {
            title: "収益性".into(),
            metrics: vec![
                metric("粗利率", pct(ratios, "grossProfitMarginTTM"), fmt_pct),
                metric("営業利益率", pct(ratios, "operatingProfitMarginTTM"), fmt_pct),
                metric("純利益率", pct(ratios, "netProfitMarginTTM"), fmt_pct),
                metric("ROE", pct(ratios, "returnOnEquityTTM"), fmt_pct),
                metric("ROA", pct(ratios, "returnOnAssetsTTM"), fmt_pct),
            ],
        },
        MetricGroup {
            title: "財務健全性".into(),
            metrics: vec![
                metric("流動比率", n(ratios, "currentRatioTTM"), fmt_ratio),
                metric("D/E", n(metrics, "debtToEquityTTM"), fmt_ratio),
                metric("インタレストカバレッジ", n(ratios, "interestCoverageTTM"), fmt_ratio),
                metric(
                    "フリーCF (1株)",
                    n(metrics, "freeCashFlowPerShareTTM"),
                    |v| fmt_price(v, currency),
                ),
            ],
        },
        MetricGroup {
            title: "株主還元".into(),
            metrics: vec![
                metric("配当利回り", pct(metrics, "dividendYieldTTM"), fmt_pct),
                metric("配当性向", pct(ratios, "payoutRatioTTM"), fmt_pct),
                metric("1株利益 (EPS)", n(profile, "lastDiv"), |v| {
                    fmt_price(v, currency)
                }),
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

fn n(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| x.as_f64())
}

/// FMP は従業員数などを文字列で返すことがある。
fn n_str(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| {
        x.as_f64()
            .or_else(|| x.as_str().and_then(|s| s.trim().parse::<f64>().ok()))
    })
}

/// 比率は小数（0.4523）で返るので百分率に直す。
fn pct(v: &Value, key: &str) -> Option<f64> {
    n(v, key).map(|x| x * 100.0)
}

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
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
    fn 文字列の従業員数も数値として読める() {
        let v = json!({ "fullTimeEmployees": "164000", "mktCap": 3.5e12 });
        assert_eq!(n_str(&v, "fullTimeEmployees"), Some(164_000.0));
        assert_eq!(n(&v, "mktCap"), Some(3.5e12));
    }

    #[test]
    fn 比率は百分率に直る() {
        let v = json!({ "returnOnEquityTTM": 0.4523 });
        assert_eq!(pct(&v, "returnOnEquityTTM"), Some(45.23));
    }

    #[test]
    fn 欠けている指標はダッシュで埋まる() {
        let groups = build_groups(&json!({}), &Value::Null, &Value::Null, "USD");
        assert!(!groups.is_empty());
        for group in &groups {
            for m in &group.metrics {
                assert_eq!(m.value, "—");
                assert_eq!(m.raw, None);
            }
        }
    }

    #[test]
    fn 取れた指標だけ整形される() {
        let profile = json!({ "mktCap": 3.5e12 });
        let metrics = json!({ "peRatioTTM": 31.2 });
        let ratios = json!({ "netProfitMarginTTM": 0.2531 });

        let groups = build_groups(&profile, &metrics, &ratios, "USD");
        let all: Vec<&Metric> = groups.iter().flat_map(|g| &g.metrics).collect();

        let per = all.iter().find(|m| m.label == "PER (TTM)").unwrap();
        assert_eq!(per.value, "31.20");

        let margin = all.iter().find(|m| m.label == "純利益率").unwrap();
        assert_eq!(margin.value, "25.31%");

        let cap = all.iter().find(|m| m.label == "時価総額").unwrap();
        assert!(cap.value.contains("兆"), "実際: {}", cap.value);
    }
}
