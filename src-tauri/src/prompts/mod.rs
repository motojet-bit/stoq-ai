//! 20項目分析の中核プロンプト。
//!
//! **プロンプト本文はここでバイナリに埋め込む（`include_str!`）。**
//! フロントエンド（WebView）に置くと、配布物の JS を開けば全文が読めてしまう。
//! ビルド成果物に埋め込むことで、通常の手段では取り出せないようにする。
//!
//! フロントから受け取るのは
//! **「役割 ID」と「ユーザーが設定した閾値」だけ**で、
//! 秘匿プロンプトとの結合はこのモジュール内で完結する。
//! 組み立てた文字列をフロントへ返すコマンドは用意しない。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// 分析の共通部分（厳守事項・モメンタム・20項目・スコア尺度）
const CORE: &str = include_str!("core.md");
/// 出力フォーマット。役割や閾値の後ろに置く
const OUTPUT: &str = include_str!("output.md");

const ROLE_GENERAL: &str = include_str!("role_general.md");
/// **id は `growth` のまま**（保存データの鍵）。中身はマイクロキャップ方針。
const ROLE_GROWTH: &str = include_str!("role_microcap.md");
const ROLE_MEGACAP: &str = include_str!("role_megacap.md");
const ROLE_DIVIDEND: &str = include_str!("role_dividend.md");
const ROLE_MIDCAP: &str = include_str!("role_midcap.md");

/// 既定の役割
pub const DEFAULT_ROLE: &str = "general";

/// 役割の概要。**プロンプト本文は含めない**（UI へ返すのはこれだけ）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalystRole {
    pub id: String,
    pub label: String,
    /// ドロップダウンに出す一行説明
    pub summary: String,
    /// 重点的に見る観点（箇条書き）
    pub focus: Vec<String>,
}

struct RoleDef {
    id: &'static str,
    label: &'static str,
    summary: &'static str,
    focus: &'static [&'static str],
    body: &'static str,
}

const ROLES: &[RoleDef] = &[
    RoleDef {
        id: "general",
        label: "汎用ファンダメンタルアナリスト",
        summary: "財務健全性・収益性・成長性をバランスよく評価します（既定）",
        focus: &["財務健全性", "収益性", "成長性", "標準バランススコア"],
        body: ROLE_GENERAL,
    },
    RoleDef {
        id: "growth",
        label: "マイクロキャップ・ロマン枠アナリスト",
        summary: "小型株の財務生存性（Cash Runway）を最優先で厳格に判定します",
        focus: &[
            "Cash Runway（残存月数）",
            "希薄化構造（ワラント・転換社債）",
            "単一プロダクト依存と特許モート",
            "黒字化への道筋",
            "成長率 vs バーンレート",
        ],
        body: ROLE_GROWTH,
    },
    RoleDef {
        id: "megacap",
        label: "メガスケーラー・サテライト適合性アナリスト",
        summary: "QQQ / S&P500 を超えるサテライト銘柄として持つ価値があるかを判定します",
        focus: &[
            "指数を上回れるか",
            "FCF マージン",
            "モートの持続性",
            "成長持続性",
            "単一指標に依らない判定",
        ],
        body: ROLE_MEGACAP,
    },
    RoleDef {
        id: "midcap",
        label: "中位株・ツルハシ企業アナリスト",
        summary: "トレンドに道具を売る側として、受注残と事業構造から安定運用と伸びしろを見ます",
        focus: &[
            "ツルハシ適合性（誰が勝っても売れるか）",
            "バックログ（受注残）",
            "リカーリング比率",
            "顧客集中度",
            "伸びしろ（取れる比率）",
        ],
        body: ROLE_MIDCAP,
    },
    RoleDef {
        id: "dividend",
        label: "成熟・高配当バリュー株アナリスト",
        summary: "配当の持続性と減配リスクを最優先で検証します",
        focus: &[
            "FCF 利回り",
            "配当性向の安全性",
            "連続増配",
            "有利子負債カバー率",
            "減配リスク",
        ],
        body: ROLE_DIVIDEND,
    },
];

fn role_def(id: &str) -> &'static RoleDef {
    ROLES
        .iter()
        .find(|r| r.id == id.trim())
        // 知らない ID が来ても分析は止めない。既定へ落とす
        .unwrap_or_else(|| ROLES.iter().find(|r| r.id == DEFAULT_ROLE).unwrap())
}

/// 保存値が壊れていても必ず有効な ID を返す。
pub fn normalize_role(id: &str) -> String {
    role_def(id).id.to_string()
}

/// UI に出す役割一覧。**本文は返さない。**
pub fn roles() -> Vec<AnalystRole> {
    ROLES
        .iter()
        .map(|r| AnalystRole {
            id: r.id.to_string(),
            label: r.label.to_string(),
            summary: r.summary.to_string(),
            focus: r.focus.iter().map(|f| (*f).to_string()).collect(),
        })
        .collect()
}

// ---------------------------------------------------------------- 閾値

/// 閾値の表示情報。プロンプト文を組み立てるために Rust 側にも持つ。
/// UI の入力欄（範囲・刻み）はフロントの `thresholds.ts` が持つ。
struct ThresholdMeta {
    id: &'static str,
    label: &'static str,
    unit: &'static str,
    /// true なら「以上で合格」、false なら「以下で合格」
    at_least: bool,
}

const THRESHOLD_META: &[ThresholdMeta] = &[
    ThresholdMeta { id: "revenueGrowth", label: "売上高成長率（YoY）", unit: "%", at_least: true },
    ThresholdMeta { id: "operatingMargin", label: "営業利益率", unit: "%", at_least: true },
    ThresholdMeta { id: "roe", label: "ROE（自己資本利益率）", unit: "%", at_least: true },
    ThresholdMeta { id: "cashRunwayMonths", label: "キャッシュランウェイ", unit: "か月", at_least: true },
    ThresholdMeta { id: "fcfMargin", label: "FCF マージン", unit: "%", at_least: true },
    ThresholdMeta { id: "per", label: "PER（株価収益率）", unit: "倍", at_least: false },
    ThresholdMeta { id: "pbr", label: "PBR（株価純資産倍率）", unit: "倍", at_least: false },
    ThresholdMeta { id: "debtToEquity", label: "D/E（負債資本倍率）", unit: "倍", at_least: false },
    ThresholdMeta { id: "dividendYield", label: "配当利回り", unit: "%", at_least: true },
    ThresholdMeta { id: "payoutRatio", label: "配当性向", unit: "%", at_least: false },
];

/// 全項目の既定値。フロントの `thresholds.ts` と同じ値を持つ。
const THRESHOLD_DEFAULTS: &[(&str, f64)] = &[
    ("revenueGrowth", 15.0),
    ("operatingMargin", 15.0),
    ("roe", 15.0),
    ("cashRunwayMonths", 24.0),
    ("fcfMargin", 10.0),
    ("per", 30.0),
    ("pbr", 5.0),
    ("debtToEquity", 1.5),
    ("dividendYield", 0.0),
    ("payoutRatio", 70.0),
];

/// 数値を「15」「1.5」のように、余計な 0 を付けずに表す。
fn format_number(value: f64) -> String {
    if (value - value.round()).abs() < f64::EPSILON {
        format!("{}", value.round() as i64)
    } else {
        format!("{value}")
    }
}

/// 1 項目ぶんの条件行。
fn rule_line(meta: &ThresholdMeta, value: f64) -> String {
    let comparator = if meta.at_least { ">=" } else { "<=" };
    format!("- {} {} {}{}", meta.label, comparator, format_number(value), meta.unit)
}

/// 既定値にユーザー設定を重ねる。知らない ID と非数は無視する。
fn merged_values(overrides: &BTreeMap<String, f64>) -> BTreeMap<&'static str, f64> {
    let mut values: BTreeMap<&'static str, f64> = THRESHOLD_DEFAULTS.iter().copied().collect();
    for meta in THRESHOLD_META {
        if let Some(value) = overrides.get(meta.id) {
            if value.is_finite() {
                values.insert(meta.id, *value);
            }
        }
    }
    values
}

/// 閾値セクションを組み立てる。設定画面のプレビューでも使う。
pub fn threshold_section(overrides: &BTreeMap<String, f64>) -> String {
    let values = merged_values(overrides);
    let lines: Vec<String> = THRESHOLD_META
        .iter()
        .map(|meta| rule_line(meta, values[meta.id]))
        .collect();

    format!(
        "# 閾値基準（ユーザー設定・厳密に適用すること）\n\n\
         以下の閾値基準を厳密に適用して合格/不合格を判定せよ。\n\n\
         {}\n\n\
         - 各項目の根拠欄には、**該当する閾値に対して合格か不合格かを必ず明記する**\n  \
         （例: 「売上成長率 +16.4%（基準 {}% 以上 → 合格）」）。\n\
         - 数値が取得できず判定できない場合は「基準未判定（データなし）」と書く。\n  \
         **取得できないことを不合格として扱わない。**\n\
         - 閾値はユーザーの投資方針であり、絶対的な優劣ではない。\n  \
         基準を外れていても、それを補う材料があれば根拠欄でその旨を述べる。",
        lines.join("\n"),
        format_number(values["revenueGrowth"]),
    )
}

// ---------------------------------------------------------------- 結合

/// フロントから受け取る分析プリセット。**プロンプト本文は含まれない。**
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisPreset {
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub thresholds: BTreeMap<String, f64>,
    /// 出力言語（`ja` / `en` …）。未指定なら日本語
    #[serde(default)]
    pub locale: Option<String>,
    /// ユーザーが自由記述で足す追加指示。**基本プロンプトの中身は返さない**まま、
    /// この文字列だけを末尾に結合する
    #[serde(default)]
    pub custom_instruction: Option<String>,
}

/// 自由記述で受け付ける最大文字数。
///
/// **無制限にしない。** ここに長文を貼られると、そのぶん一次資料に
/// 割ける予算が減り、分析の材料が痩せる。
pub const MAX_CUSTOM_INSTRUCTION: usize = 2000;

/// 自由記述の追加指示を、プロンプトに載せられる形に整える。
///
/// 空なら `None`。前後の空白を落とし、長すぎるぶんは切り捨てる。
pub fn custom_section(instruction: Option<&str>) -> Option<String> {
    let text = instruction?.trim();
    if text.is_empty() {
        return None;
    }

    let trimmed: String = text.chars().take(MAX_CUSTOM_INSTRUCTION).collect();
    Some(format!(
        "# 追加指示（利用者からの指定）\n\
         以下は利用者が指定した追加の観点です。\
         **上記の出力フォーマットと評価項目は変更せず**、その枠内で反映してください。\n\n\
         {trimmed}"
    ))
}

/// 出力言語の指示。
///
/// **日本語のときは何も足さない**（プロンプト本文がもともと日本語なので、
/// 「日本語で答えよ」と重ねて書く意味がない）。
pub fn language_directive(locale: Option<&str>) -> Option<&'static str> {
    match locale.unwrap_or("ja").trim() {
        "en" => Some(
            "# Output language\n\n\
             Respond all analysis, block scores evaluation, and dialogue outputs in English.\n\
             Keep the section headings exactly as specified above — \
             they are parsed by the application and must not be translated.",
        ),
        _ => None,
    }
}

/// 役割・共通部・閾値・出力フォーマットを結合してシステムプロンプトにする。
///
/// 順序に意味がある:
/// 1. 役割（どういう立場で見るか）
/// 2. 共通部（守るべきこと・評価項目）
/// 3. 閾値（ユーザー設定の合否ライン）
/// 4. 出力フォーマット（**最後に置くほど守られやすい**）
pub fn build_system_prompt(preset: &AnalysisPreset) -> String {
    let role = role_def(preset.role_id.as_deref().unwrap_or(DEFAULT_ROLE));
    let thresholds = threshold_section(&preset.thresholds);

    let custom = custom_section(preset.custom_instruction.as_deref());

    let mut parts: Vec<&str> = vec![
        role.body.trim(),
        CORE.trim(),
        thresholds.trim(),
        OUTPUT.trim(),
    ];

    /*
     * 自由記述は**出力フォーマットの後ろ**に置く。前に置くと、
     * 追加指示のほうが強く効いて表の形が崩れ、結果を読めなくなる。
     */
    if let Some(section) = custom.as_deref() {
        parts.push(section);
    }

    // 言語指示は最後に置く。**後ろにあるほど守られやすい**
    if let Some(directive) = language_directive(preset.locale.as_deref()) {
        parts.push(directive);
    }

    parts.join("\n\n")
}

/// 組み立てたプロンプトの概算トークン数。
///
/// フロントは本文を受け取れないが、資料をどれだけ載せられるかの
/// 予算計算には長さが要る。**数だけを返す。**
pub fn system_prompt_tokens(preset: &AnalysisPreset) -> usize {
    crate::documents::estimate_tokens(&build_system_prompt(preset))
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    fn preset(role: &str, thresholds: &[(&str, f64)]) -> AnalysisPreset {
        AnalysisPreset {
            role_id: Some(role.to_string()),
            thresholds: thresholds
                .iter()
                .map(|(k, v)| ((*k).to_string(), *v))
                .collect(),
            locale: None,
            custom_instruction: None,
        }
    }

    // ------------------------------------------------ 自由記述の追加指示

    #[test]
    fn 空の自由記述は何も足さない() {
        assert!(custom_section(None).is_none());
        assert!(custom_section(Some("")).is_none());
        assert!(custom_section(Some("　 \n ")).is_none());
    }

    #[test]
    fn 自由記述は見出し付きで載る() {
        let section = custom_section(Some("半導体サイクルの底打ちに注目して")).unwrap();
        assert!(section.starts_with("# 追加指示"));
        assert!(section.contains("半導体サイクルの底打ちに注目して"));
    }

    #[test]
    fn 自由記述に出力形式を壊さない釘を刺す() {
        let section = custom_section(Some("自由に書いて")).unwrap();
        assert!(section.contains("出力フォーマットと評価項目は変更せず"));
    }

    #[test]
    fn 長すぎる自由記述は切り詰める() {
        // 一次資料に割ける予算を食い潰させない
        let long = "あ".repeat(MAX_CUSTOM_INSTRUCTION + 500);
        let section = custom_section(Some(&long)).unwrap();
        let body = section.split("\n\n").nth(1).unwrap();
        assert_eq!(body.chars().count(), MAX_CUSTOM_INSTRUCTION);
    }

    #[test]
    fn 自由記述はプロンプトの末尾側に入る() {
        let mut p = preset("general", &[]);
        p.custom_instruction = Some("配当の継続性を厳しく見て".into());
        let prompt = build_system_prompt(&p);

        assert!(prompt.contains("配当の継続性を厳しく見て"));
        // 出力フォーマットより後ろ（追加指示が表の形を上書きしないように）
        assert!(prompt.find("# 追加指示").unwrap() > prompt.find(OUTPUT.trim()).unwrap());
    }

    #[test]
    fn 自由記述があっても基本プロンプトは残る() {
        let mut p = preset("growth", &[]);
        p.custom_instruction = Some("追加の観点".into());
        let with = build_system_prompt(&p);
        let without = build_system_prompt(&preset("growth", &[]));

        // 差分は追加指示のぶんだけ
        assert!(with.len() > without.len());
        for line in without.lines().filter(|l| l.trim().len() > 10) {
            assert!(with.contains(line), "基本プロンプトの行が消えている: {line}");
        }
    }

    #[test]
    fn 自由記述より言語指示が後ろに来る() {
        let mut p = preset("general", &[]);
        p.custom_instruction = Some("追加の観点".into());
        p.locale = Some("en".into());
        let prompt = build_system_prompt(&p);

        assert!(prompt.find("# 追加指示").unwrap() < prompt.find("Respond all analysis").unwrap());
    }

    // ------------------------------------------------ 役割の選択

    /// **id は保存データに入るので変えない。** ラベルは変えてよい。
    #[test]
    fn 五つの役割がそろっている() {
        let list = roles();
        assert_eq!(list.len(), 5);
        let ids: Vec<&str> = list.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["general", "growth", "megacap", "midcap", "dividend"]);
        assert!(list.iter().all(|r| !r.summary.is_empty()));
        assert!(list.iter().all(|r| !r.focus.is_empty()));
    }

    /// 投資思想の軸が、それぞれの本文へ実際に入っていること。
    #[test]
    fn 役割ごとの判定軸が本文に入っている() {
        let cases = [
            // メガスケーラーは指数と比べる。単一指標での判定を禁じる
            (
                "megacap",
                vec!["QQQ", "S&P500", "サテライト", "PBR", "Rule of 40", "二段階評価"],
            ),
            // 中位株はツルハシ。受注残とリカーリングを見る
            ("midcap", vec!["ツルハシ", "受注残", "リカーリング", "顧客"]),
            // マイクロキャップは生存性が先
            ("growth", vec!["Cash Runway", "ロマン枠", "全損", "希薄化", "Burn Rate"]),
        ];
        for (id, words) in cases {
            let body = role_def(id).body;
            for word in words {
                assert!(body.contains(word), "{id} に「{word}」が無い");
            }
        }
    }

    #[test]
    fn 役割一覧にプロンプト本文は含まれない() {
        for role in roles() {
            // 本文にしか出てこない語が概要へ漏れていないこと
            assert!(!role.summary.contains("厳守"), "{}", role.id);
            assert!(!role.summary.contains("スコア"), "{}", role.id);
            assert!(role.summary.chars().count() < 60, "{} は一行説明のはず", role.id);
        }
    }

    #[test]
    fn 役割ごとに違うプロンプトが選ばれる() {
        let growth = build_system_prompt(&preset("growth", &[]));
        let megacap = build_system_prompt(&preset("megacap", &[]));
        let dividend = build_system_prompt(&preset("dividend", &[]));
        let general = build_system_prompt(&preset("general", &[]));

        assert!(growth.contains("キャッシュランウェイ"));
        assert!(growth.contains("完全希薄化後株式数"));
        assert!(megacap.contains("FCF マージン"));
        assert!(megacap.contains("EV/Gross Profit"));
        assert!(dividend.contains("減配"));
        assert!(dividend.contains("連続増配"));
        assert!(general.contains("標準バランス"));

        // 取り違えていないこと
        assert!(!general.contains("完全希薄化後株式数"));
        assert!(!growth.contains("EV/Gross Profit"));
    }

    #[test]
    fn 知らない役割_id_は既定へ落ちる() {
        assert_eq!(normalize_role("unknown-role"), "general");
        assert_eq!(normalize_role(""), "general");
        assert_eq!(normalize_role("  growth  "), "growth");

        let fallback = build_system_prompt(&preset("unknown-role", &[]));
        assert_eq!(fallback, build_system_prompt(&preset("general", &[])));
    }

    #[test]
    fn 役割未指定でも組み立てられる() {
        let prompt = build_system_prompt(&AnalysisPreset::default());
        assert_eq!(prompt, build_system_prompt(&preset("general", &[])));
    }

    // ------------------------------------------------ 結合

    #[test]
    fn 役割_共通部_閾値_出力の順に結合される() {
        let prompt = build_system_prompt(&preset("growth", &[]));

        let role = prompt.find("マイクロキャップ").unwrap();
        let core = prompt.find("# 厳守事項").unwrap();
        let thresholds = prompt.find("# 閾値基準").unwrap();
        let output = prompt.find("# 出力フォーマット").unwrap();

        assert!(role < core, "役割は先頭");
        assert!(core < thresholds, "共通部は閾値より前");
        assert!(thresholds < output, "出力フォーマットは最後");
    }

    #[test]
    fn 共通部と出力フォーマットは役割によらず含まれる() {
        for role in ["general", "growth", "megacap", "dividend"] {
            let prompt = build_system_prompt(&preset(role, &[]));
            assert!(prompt.contains("# 厳守事項"), "{role}");
            assert!(prompt.contains("# 評価項目（全20項目"), "{role}");
            assert!(prompt.contains("# スコアの尺度"), "{role}");
            assert!(prompt.contains("## 評価テーブル"), "{role}");
            assert!(prompt.contains("## 総合投資判断"), "{role}");
        }
    }

    #[test]
    fn 二十項目すべてが並んでいる() {
        let prompt = build_system_prompt(&preset("general", &[]));
        for i in 1..=20 {
            assert!(prompt.contains(&format!("\n{i}. 【")), "項目 {i} が無い");
        }
    }

    #[test]
    fn パーサが探す見出しと一致している() {
        // フロントの `sections.ts` が使う見出し。ずれるとパースできなくなる
        let prompt = build_system_prompt(&preset("general", &[]));
        for heading in [
            "## 評価テーブル",
            "## 強み",
            "## リスク",
            "## バリュエーション所見",
            "## 総合投資判断",
        ] {
            assert!(prompt.contains(heading), "{heading} が無い");
        }
    }

    // ------------------------------------------------ 閾値の注入

    #[test]
    fn 既定値が埋め込まれる() {
        let section = threshold_section(&BTreeMap::new());
        assert!(section.contains("売上高成長率（YoY） >= 15%"));
        assert!(section.contains("PER（株価収益率） <= 30倍"));
        assert!(section.contains("キャッシュランウェイ >= 24か月"));
    }

    #[test]
    fn ユーザー設定の値が注入される() {
        let prompt = build_system_prompt(&preset(
            "growth",
            &[("revenueGrowth", 30.0), ("cashRunwayMonths", 18.0), ("per", 45.0)],
        ));

        assert!(prompt.contains("売上高成長率（YoY） >= 30%"));
        assert!(prompt.contains("キャッシュランウェイ >= 18か月"));
        assert!(prompt.contains("PER（株価収益率） <= 45倍"));
        // 変えていない項目は既定のまま
        assert!(prompt.contains("ROE（自己資本利益率） >= 15%"));
    }

    #[test]
    fn 例示の数値も設定値に追従する() {
        let section = threshold_section(&[("revenueGrowth".to_string(), 30.0)].into_iter().collect());
        assert!(section.contains("基準 30% 以上"));
        assert!(!section.contains("基準 15% 以上"));
    }

    #[test]
    fn 小数は余計な_0_を付けずに出る() {
        let section = threshold_section(
            &[("debtToEquity".to_string(), 1.5), ("roe".to_string(), 20.0)]
                .into_iter()
                .collect(),
        );
        assert!(section.contains("D/E（負債資本倍率） <= 1.5倍"), "{section}");
        assert!(section.contains("ROE（自己資本利益率） >= 20%"), "{section}");
    }

    #[test]
    fn 知らない閾値_id_は無視される() {
        let section = threshold_section(
            &[("legacyMetric".to_string(), 999.0)].into_iter().collect(),
        );
        assert!(!section.contains("999"));
        assert!(section.contains("売上高成長率（YoY） >= 15%"));
    }

    #[test]
    fn 非数の閾値は既定へ落ちる() {
        let section = threshold_section(
            &[("per".to_string(), f64::NAN), ("roe".to_string(), f64::INFINITY)]
                .into_iter()
                .collect(),
        );
        assert!(section.contains("PER（株価収益率） <= 30倍"));
        assert!(section.contains("ROE（自己資本利益率） >= 15%"));
        assert!(!section.contains("NaN"));
        assert!(!section.contains("inf"));
    }

    #[test]
    fn データなしを不合格にしない指示が入る() {
        let section = threshold_section(&BTreeMap::new());
        assert!(section.contains("基準未判定"));
        assert!(section.contains("不合格として扱わない"));
    }

    #[test]
    fn 閾値の表示情報と既定値の項目がそろっている() {
        let ids: Vec<&str> = THRESHOLD_META.iter().map(|m| m.id).collect();
        let default_ids: Vec<&str> = THRESHOLD_DEFAULTS.iter().map(|(id, _)| *id).collect();
        assert_eq!(ids, default_ids, "表示情報と既定値の項目がずれている");
    }

    // ------------------------------------------------ 出力言語

    #[test]
    fn 日本語のときは言語指示を足さない() {
        // 本文がもともと日本語なので重ねて書く意味がない
        assert_eq!(language_directive(None), None);
        assert_eq!(language_directive(Some("ja")), None);
        assert_eq!(language_directive(Some("")), None);
        assert_eq!(language_directive(Some("unknown")), None);
    }

    #[test]
    fn 英語のときは指定どおりの指示を足す() {
        let directive = language_directive(Some("en")).unwrap();
        assert!(directive.contains(
            "Respond all analysis, block scores evaluation, and dialogue outputs in English."
        ));
    }

    #[test]
    fn 前後の空白があっても英語と判定する() {
        assert!(language_directive(Some("  en  ")).is_some());
    }

    #[test]
    fn 見出しを訳さないよう釘を刺す() {
        // 見出しが訳されるとパーサが結果を読めなくなる
        let directive = language_directive(Some("en")).unwrap();
        assert!(directive.contains("must not be translated"));
    }

    #[test]
    fn 英語のプロンプトは言語指示が末尾に入る() {
        let preset = AnalysisPreset {
            role_id: Some("growth".into()),
            thresholds: BTreeMap::new(),
            locale: Some("en".into()),
            custom_instruction: None,
        };
        let prompt = build_system_prompt(&preset);

        assert!(prompt.contains("Respond all analysis"));
        let output = prompt.find("# 出力フォーマット").unwrap();
        let language = prompt.find("# Output language").unwrap();
        assert!(output < language, "言語指示は最後に置く（守られやすいため）");
    }

    #[test]
    fn 日本語のプロンプトには英語の指示が入らない() {
        let prompt = build_system_prompt(&preset("growth", &[]));
        assert!(!prompt.contains("Output language"));
    }

    #[test]
    fn 言語を変えても評価項目と出力フォーマットは変わらない() {
        let ja = build_system_prompt(&preset("general", &[]));
        let en = build_system_prompt(&AnalysisPreset {
            role_id: Some("general".into()),
            thresholds: BTreeMap::new(),
            locale: Some("en".into()),
            custom_instruction: None,
        });

        for heading in ["# 厳守事項", "## 評価テーブル", "## 総合投資判断"] {
            assert!(ja.contains(heading), "{heading}");
            assert!(en.contains(heading), "{heading}");
        }
    }

    // ------------------------------------------------ トークン数

    #[test]
    fn トークン概算が返る() {
        let tokens = system_prompt_tokens(&preset("general", &[]));
        assert!(tokens > 500, "実際: {tokens}");
        assert!(tokens < 20_000, "実際: {tokens}");
    }

    #[test]
    fn 役割によって長さが変わる() {
        let general = system_prompt_tokens(&preset("general", &[]));
        let growth = system_prompt_tokens(&preset("growth", &[]));
        assert_ne!(general, growth);
    }
}
