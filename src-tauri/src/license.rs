//! ライセンスキーの保存と有効化（骨組み）。
//!
//! キーは設定ファイルに置き、**フロントへはマスク済み文字列しか返さない**
//! （APIキーと同じ扱い）。
//!
//! いまはオフラインの形式チェックのみで、発行元サーバーへの照会は行わない。
//! 実際の検証をつなぐときは `activate` の中だけを差し替えればよい。

use serde::Serialize;

use crate::error::{code, AppError, Result};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    /// 有効化済みか
    pub activated: bool,
    /// 例: `A1B2…7890`。未設定なら None
    pub masked: Option<String>,
    /// 画面に出す説明
    pub message: String,
}

/// 開発・検証用のマスターキー。形式チェックを通さずに有効化できる。
///
/// **バイナリに直接埋まっているため、`strings` などで取り出せる。**
/// 配布物に載る以上、これは「秘密」ではなく「合鍵」。
/// 販売用の実キーと同じ強度を期待してはいけない。
pub const MASTER_KEY: &str = "STOQ-DEV-MASTER-2026";

/// 前後の空白を落とし、大文字に揃える。
pub fn normalize_key(key: &str) -> String {
    key.trim().to_uppercase()
}

/// マスターキーか。
pub fn is_master_key(key: &str) -> bool {
    normalize_key(key) == MASTER_KEY
}

/// キーの形式を確かめる。
///
/// Lemon Squeezy のキーは `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` の
/// 36 文字（UUID 形式）。**形式が違う時点で弾く**ことで、
/// 打ち間違いを通信の前に気づける。
pub fn is_valid_format(key: &str) -> bool {
    let key = normalize_key(key);
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 5 {
        return false;
    }

    let expected = [8usize, 4, 4, 4, 12];
    parts.iter().zip(expected).all(|(part, len)| {
        part.len() == len && part.chars().all(|c| c.is_ascii_alphanumeric())
    })
}

/// 表示用にマスクする。先頭 4 文字と末尾 4 文字だけ残す。
pub fn mask_key(key: &str) -> Option<String> {
    let key = normalize_key(key);
    if key.is_empty() {
        return None;
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return Some("…".to_string());
    }
    let head: String = chars.iter().take(4).collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    Some(format!("{head}…{tail}"))
}

/// 保存済みキーから状態を組み立てる（通信はしない）。
pub fn status_of(stored: &str) -> LicenseStatus {
    let key = normalize_key(stored);
    if key.is_empty() {
        return LicenseStatus {
            activated: false,
            masked: None,
            message: "ライセンスキーが未登録です。購入時に発行されたキーを入力してください。"
                .to_string(),
        };
    }

    if is_master_key(&key) {
        return LicenseStatus {
            activated: true,
            masked: mask_key(&key),
            message: "開発者用マスターキーで有効化されています。".to_string(),
        };
    }

    LicenseStatus {
        activated: true,
        masked: mask_key(&key),
        message: "ライセンスは有効です。".to_string(),
    }
}

/// 有効化する。形式が違えば理由を返す。
pub fn activate(key: &str) -> Result<LicenseStatus> {
    let key = normalize_key(key);
    if key.is_empty() {
        return Err(AppError::code(code::LICENSE_EMPTY));
    }
    // マスターキーは形式チェックを通さない（UUID 形ではないため）
    if is_master_key(&key) {
        return Ok(status_of(&key));
    }
    if !is_valid_format(&key) {
        return Err(AppError::code(code::LICENSE_FORMAT));
    }
    Ok(status_of(&key))
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890";

    #[test]
    fn 正しい形式を受け付ける() {
        assert!(is_valid_format(VALID));
        assert!(is_valid_format(&VALID.to_lowercase()));
        assert!(is_valid_format(&format!("  {VALID}  ")));
    }

    #[test]
    fn 形式が違えば弾く() {
        assert!(!is_valid_format(""));
        assert!(!is_valid_format("A1B2C3D4"));
        assert!(!is_valid_format("A1B2C3D4-E5F6-7890-ABCD"));
        assert!(!is_valid_format("A1B2C3D4-E5F6-7890-ABCD-EF123456789"));
        assert!(!is_valid_format("A1B2C3D!-E5F6-7890-ABCD-EF1234567890"));
    }

    #[test]
    fn マスクは先頭と末尾だけ残す() {
        assert_eq!(mask_key(VALID).as_deref(), Some("A1B2…7890"));
        assert_eq!(mask_key(""), None);
    }

    #[test]
    fn 未登録のときは未有効化として扱う() {
        let status = status_of("");
        assert!(!status.activated);
        assert_eq!(status.masked, None);
        assert!(status.message.contains("未登録"));
    }

    #[test]
    fn 登録済みなら有効として扱う() {
        let status = status_of(VALID);
        assert!(status.activated);
        assert_eq!(status.masked.as_deref(), Some("A1B2…7890"));
    }

    #[test]
    fn マスターキーで有効化できる() {
        let status = activate(MASTER_KEY).unwrap();
        assert!(status.activated);
        assert!(status.message.contains("マスターキー"));

        // 小文字・前後空白でも通る
        assert!(activate("  stoq-dev-master-2026  ").unwrap().activated);
    }

    #[test]
    fn マスターキーは保存後も有効なままになる() {
        let status = status_of(MASTER_KEY);
        assert!(status.activated);
        assert_eq!(status.masked.as_deref(), Some("STOQ…2026"));
    }

    #[test]
    fn 似ているだけの文字列は通さない() {
        assert!(!is_master_key("STOQ-DEV-MASTER-2025"));
        assert!(!is_master_key("STOQ-DEV-MASTER"));
        assert!(!is_master_key(""));
        assert!(activate("STOQ-DEV-MASTER-2025").is_err());
    }

    #[test]
    fn 有効化は形式を確かめてから通す() {
        assert!(activate(VALID).unwrap().activated);
        assert!(activate("").is_err());

        let err = activate("not-a-key").unwrap_err();
        assert_eq!(err.payload().code, code::LICENSE_FORMAT);
    }
}
