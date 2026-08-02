//! AI クロスディベート（1 ターン）の設定と、役割ごとのシステムプロンプト。
//!
//! **メイン分析とは別のプロバイダ／モデルを充てられる。**
//! 同じモデルに自分の出力を批判させても、同じ癖・同じ思い込みがそのまま残る。
//! 別系統のモデルにぶつけて初めて、見落としが見落としとして出てくる。
//!
//! プロンプト本文は `prompts/debate_*.md` に置き、**フロントへは一切返さない**
//! （`prompts` モジュールと同じ方針）。

use serde::{Deserialize, Serialize};

use crate::settings::Settings;

const BEAR_PROMPT: &str = include_str!("prompts/debate_bear.md");
const BULL_PROMPT: &str = include_str!("prompts/debate_bull.md");

/// ディベートの担当。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    /// 批判・検証する側（右ペイン）
    Bear,
    /// 反論・修正する側（左ペイン＝メイン分析）
    Bull,
}

/// ディスクに保存する設定。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DebateConfig {
    /// 空ならメイン分析と同じプロバイダを使う
    pub provider: String,
    /// 空ならそのプロバイダの既定モデルを使う
    pub model: String,
}

/// フロントへ返す状態。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebateStatus {
    /// 設定されているプロバイダ ID（未設定なら空）
    pub provider: String,
    /// 設定されているモデル名（未設定なら空）
    pub model: String,
    /// 実際に使われるプロバイダ ID（未設定ならメインと同じ）
    pub effective_provider: String,
    /// 実際に使われるモデル名
    pub effective_model: String,
    /// そのプロバイダの APIキーが入っているか
    pub ready: bool,
    /// メイン分析と同じプロバイダを使うことになるか。
    /// **同じだと批判の意味が薄い**ので、画面側で注意を出すために返す
    pub same_as_main: bool,
}

/// 実際に使うプロバイダとモデルを決める。
///
/// 未設定のときにエラーにせず**メインへ落とす**。
/// 設定していない人でもボタンが押せないと、機能があること自体に気づけない。
pub fn resolve(settings: &Settings) -> (String, String) {
    let provider = if settings.debate.provider.trim().is_empty() {
        settings.provider.clone()
    } else {
        settings.debate.provider.trim().to_string()
    };

    let model = if settings.debate.model.trim().is_empty() {
        settings.model_for(&provider)
    } else {
        settings.debate.model.trim().to_string()
    };

    (provider, model)
}

pub fn status_of(settings: &Settings) -> DebateStatus {
    let (effective_provider, effective_model) = resolve(settings);
    DebateStatus {
        provider: settings.debate.provider.trim().to_string(),
        model: settings.debate.model.trim().to_string(),
        ready: settings.key_for(&effective_provider).is_ok(),
        same_as_main: effective_provider == settings.provider,
        effective_provider,
        effective_model,
    }
}

/// 役割ごとのシステムプロンプトを組み立てる。
///
/// 言語指示は `prompts::language_directive` と同じものを末尾へ足す
/// （**後ろにあるほど守られやすい**ため）。
pub fn system_prompt(side: Side, locale: Option<&str>) -> String {
    let base = match side {
        Side::Bear => BEAR_PROMPT,
        Side::Bull => BULL_PROMPT,
    };

    match crate::prompts::language_directive(locale) {
        Some(directive) => format!("{base}\n\n{directive}"),
        None => base.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with(provider: &str, debate_provider: &str, debate_model: &str) -> Settings {
        let mut s = Settings::default();
        s.provider = provider.to_string();
        s.debate = DebateConfig {
            provider: debate_provider.to_string(),
            model: debate_model.to_string(),
        };
        s
    }

    #[test]
    fn 未設定ならメインへ落ちる() {
        let s = settings_with("openai", "", "");
        let (provider, model) = resolve(&s);
        assert_eq!(provider, "openai");
        assert_eq!(model, s.model_for("openai"));
    }

    #[test]
    fn 設定があればそちらを使う() {
        let s = settings_with("openai", "anthropic", "claude-opus-5");
        assert_eq!(resolve(&s), ("anthropic".into(), "claude-opus-5".into()));
    }

    /// モデルだけ空なら、そのプロバイダの既定モデルで埋める。
    #[test]
    fn プロバイダだけ指定ならモデルは既定() {
        let s = settings_with("openai", "gemini", "");
        let (provider, model) = resolve(&s);
        assert_eq!(provider, "gemini");
        assert_eq!(model, s.model_for("gemini"));
    }

    #[test]
    fn 前後の空白は無視する() {
        let s = settings_with("openai", "  anthropic  ", "  claude-opus-5  ");
        assert_eq!(resolve(&s), ("anthropic".into(), "claude-opus-5".into()));
    }

    /// 同じモデルに自分の出力を批判させても見落としは出てこない。画面で注意する。
    #[test]
    fn メインと同じなら同一と分かる() {
        assert!(status_of(&settings_with("openai", "", "")).same_as_main);
        assert!(!status_of(&settings_with("openai", "anthropic", "")).same_as_main);
    }

    #[test]
    fn キー未設定なら準備できていない() {
        let s = settings_with("openai", "anthropic", "");
        assert!(!status_of(&s).ready);
    }

    #[test]
    fn 役割ごとに別のプロンプトを返す() {
        let bear = system_prompt(Side::Bear, None);
        let bull = system_prompt(Side::Bull, None);
        assert_ne!(bear, bull);
        assert!(!bear.is_empty() && !bull.is_empty());
    }

    /// 言語指示は**末尾**に付く（後ろにあるほど守られやすい）。
    #[test]
    fn 英語指定なら言語指示が末尾に付く() {
        let with_en = system_prompt(Side::Bear, Some("en"));
        assert!(with_en.starts_with(BEAR_PROMPT));
        assert!(with_en.len() > BEAR_PROMPT.len());
    }

    /// 日本語は `language_directive` が何も返さない。
    /// ディベートのプロンプトは「分析と同じ言語で書け」と本文で指示しているので、
    /// 重ねて言語指示を足す必要がない。
    #[test]
    fn 日本語指定では何も足さない() {
        assert_eq!(system_prompt(Side::Bull, Some("ja")), BULL_PROMPT);
    }
}
