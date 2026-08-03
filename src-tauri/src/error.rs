//! アプリ共通のエラー型。
//!
//! **フロントへは「エラーコード」を返す。**
//! 日本語の文面をここで組み立てて返すと、画面を英語に切り替えても
//! エラーだけ日本語のまま残る。訳はフロントの辞書（`errors.*`）に集約し、
//! Rust は「何が起きたか」を表す記号と、補足の詳細だけを渡す。
//!
//! 送る形は `{"code":"ERR_XXX","detail":"..."}`。
//! フロントは `errorMessage.ts` で `t("errors.ERR_XXX")` に変換し、
//! 詳細があれば括弧で添える。

use serde::Serialize;

/// フロントへ渡すエラーコード。**英数字と `_` のみ**。
pub mod code {
    // --- 共通 ---
    pub const HTTP: &str = "ERR_HTTP";
    pub const IO: &str = "ERR_IO";
    pub const JSON: &str = "ERR_JSON";
    pub const UNEXPECTED: &str = "ERR_UNEXPECTED";

    // --- 設定・キー ---
    pub const SETTINGS_DIR: &str = "ERR_SETTINGS_DIR";
    pub const UNKNOWN_PROVIDER: &str = "ERR_UNKNOWN_PROVIDER";
    pub const UNKNOWN_MARKET_PROVIDER: &str = "ERR_UNKNOWN_MARKET_PROVIDER";
    pub const PROVIDER_NOT_FOUND: &str = "ERR_PROVIDER_NOT_FOUND";
    pub const API_KEY_MISSING: &str = "ERR_API_KEY_MISSING";

    // --- LLM ---
    pub const LLM_NO_MESSAGES: &str = "ERR_LLM_NO_MESSAGES";
    pub const LLM_REQUEST_FAILED: &str = "ERR_LLM_REQUEST_FAILED";
    pub const LLM_RESPONSE_INVALID: &str = "ERR_LLM_RESPONSE_INVALID";

    // --- 市場データ ---
    pub const MARKET_FETCH_FAILED: &str = "ERR_MARKET_FETCH_FAILED";
    pub const SEC_FETCH_FAILED: &str = "ERR_SEC_FETCH_FAILED";
    pub const SEC_USER_AGENT_MISSING: &str = "ERR_SEC_USER_AGENT_MISSING";

    // --- 保存・データベース ---
    pub const DB_OPEN: &str = "ERR_DB_OPEN";
    pub const DB_QUERY: &str = "ERR_DB_QUERY";
    pub const DATA_DIR: &str = "ERR_DATA_DIR";
    pub const FILE_WRITE: &str = "ERR_FILE_WRITE";
    pub const NOT_FOUND: &str = "ERR_NOT_FOUND";
    /// 選択中の銘柄と、添付資料・提出書類の企業が食い違っている。
    /// **分析は最後まで成立してしまう**ので、気づいた時点で止める。
    pub const TICKER_MISMATCH: &str = "ERR_TICKER_MISMATCH";
    pub const INVALID_INPUT: &str = "ERR_INVALID_INPUT";

    // --- ライセンス ---
    pub const LICENSE_EMPTY: &str = "ERR_LICENSE_EMPTY";
    pub const LICENSE_FORMAT: &str = "ERR_LICENSE_FORMAT";

    // --- クラウド同期 ---
    pub const CLOUD_CLIENT_ID_MISSING: &str = "ERR_CLOUD_CLIENT_ID_MISSING";
    pub const CLOUD_NOT_CONNECTED: &str = "ERR_CLOUD_NOT_CONNECTED";
    pub const CLOUD_AUTH_EXPIRED: &str = "ERR_CLOUD_AUTH_EXPIRED";
    pub const CLOUD_AUTH_DENIED: &str = "ERR_CLOUD_AUTH_DENIED";
    pub const CLOUD_AUTH_TIMEOUT: &str = "ERR_CLOUD_AUTH_TIMEOUT";
    pub const CLOUD_AUTH_CANCELLED: &str = "ERR_CLOUD_AUTH_CANCELLED";
    pub const CLOUD_AUTH_MISMATCH: &str = "ERR_CLOUD_AUTH_MISMATCH";
    pub const CLOUD_NO_REFRESH_TOKEN: &str = "ERR_CLOUD_NO_REFRESH_TOKEN";
    pub const CLOUD_REQUEST_FAILED: &str = "ERR_CLOUD_REQUEST_FAILED";
    pub const CLOUD_NO_BACKUP: &str = "ERR_CLOUD_NO_BACKUP";
    pub const CLOUD_NOTHING_TO_BACKUP: &str = "ERR_CLOUD_NOTHING_TO_BACKUP";
    pub const BACKUP_FORMAT: &str = "ERR_BACKUP_FORMAT";
    pub const BACKUP_TOO_NEW: &str = "ERR_BACKUP_TOO_NEW";
    pub const BACKUP_CORRUPT: &str = "ERR_BACKUP_CORRUPT";
    pub const BACKUP_SIZE_MISMATCH: &str = "ERR_BACKUP_SIZE_MISMATCH";
    pub const BACKUP_EMPTY: &str = "ERR_BACKUP_EMPTY";

    // --- ウィンドウ ---
    pub const WINDOW_NOT_FOUND: &str = "ERR_WINDOW_NOT_FOUND";
}

/// フロントへ渡す形。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    /// 訳を引くためのコード
    pub code: String,
    /// 例外メッセージやファイル名など、訳せない補足。無ければ空
    pub detail: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{code}")]
    Coded { code: &'static str, detail: String },

    #[error("ERR_HTTP")]
    Http(#[from] reqwest::Error),

    #[error("ERR_IO")]
    Io(#[from] std::io::Error),

    #[error("ERR_JSON")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    /// コードだけ。補足なし。
    pub fn code(code: &'static str) -> Self {
        AppError::Coded {
            code,
            detail: String::new(),
        }
    }

    /// コードと補足（例外の文言、ファイル名など）。
    pub fn detail(code: &'static str, detail: impl Into<String>) -> Self {
        AppError::Coded {
            code,
            detail: detail.into(),
        }
    }

    /// チャネルで文字列としてしか渡せない場面のための表現。
    ///
    /// **`to_string()` はコードしか返さない。** ストリーミングの失敗は
    /// `LlmEvent::Error` の 1 本の文字列で運ばれるため、そのまま使うと
    /// API が返した原因（パラメータ名・残高不足など）が捨てられ、
    /// 画面には「原因不明」しか残らない。`ERR_X: 本文` の形にして持たせる。
    pub fn wire(&self) -> String {
        let p = self.payload();
        if p.detail.is_empty() {
            p.code
        } else {
            format!("{}: {}", p.code, p.detail)
        }
    }

    /// フロントへ渡す形にする。
    pub fn payload(&self) -> ErrorPayload {
        match self {
            AppError::Coded { code, detail } => ErrorPayload {
                code: (*code).to_string(),
                detail: detail.clone(),
            },
            AppError::Http(e) => ErrorPayload {
                code: code::HTTP.to_string(),
                detail: e.to_string(),
            },
            AppError::Io(e) => ErrorPayload {
                code: code::IO.to_string(),
                detail: e.to_string(),
            },
            AppError::Json(e) => ErrorPayload {
                code: code::JSON.to_string(),
                detail: e.to_string(),
            },
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        self.payload().serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_はコードと本文をつなげる() {
        let err = AppError::detail(code::LLM_RESPONSE_INVALID, "HTTP 400: Unsupported parameter");
        let wire = err.wire();
        assert!(wire.starts_with("ERR_LLM_RESPONSE_INVALID: "), "{wire}");
        assert!(wire.contains("Unsupported parameter"), "{wire}");
    }

    #[test]
    fn wire_は本文が無ければコードだけ() {
        assert_eq!(AppError::code(code::LICENSE_EMPTY).wire(), "ERR_LICENSE_EMPTY");
    }

    #[test]
    fn コードだけのエラーを作れる() {
        let payload = AppError::code(code::LICENSE_EMPTY).payload();
        assert_eq!(payload.code, "ERR_LICENSE_EMPTY");
        assert_eq!(payload.detail, "");
    }

    #[test]
    fn 補足付きのエラーを作れる() {
        let payload = AppError::detail(code::DB_OPEN, "database is locked").payload();
        assert_eq!(payload.code, "ERR_DB_OPEN");
        assert_eq!(payload.detail, "database is locked");
    }

    #[test]
    fn 入出力エラーはコードへ畳まれる() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "no such file");
        let payload = AppError::from(io).payload();
        assert_eq!(payload.code, "ERR_IO");
        assert!(payload.detail.contains("no such file"), "原因は残す");
    }

    #[test]
    fn フロントへはコードと詳細だけを送る() {
        let json = serde_json::to_string(&AppError::detail(code::NOT_FOUND, "x")).unwrap();
        assert_eq!(json, r#"{"code":"ERR_NOT_FOUND","detail":"x"}"#);
    }

    #[test]
    fn コードは英数字と_アンダースコアだけ() {
        // 画面の辞書キーになるので、日本語や空白を混ぜない
        for code in [
            code::HTTP,
            code::SEC_FETCH_FAILED,
            code::CLOUD_AUTH_EXPIRED,
            code::BACKUP_SIZE_MISMATCH,
            code::WINDOW_NOT_FOUND,
        ] {
            assert!(code.starts_with("ERR_"), "{code}");
            assert!(
                code.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_'),
                "{code}"
            );
        }
    }

    #[test]
    fn 日本語の文面を持たない() {
        // 訳はフロントの辞書に集約する
        let payload = AppError::code(code::API_KEY_MISSING).payload();
        assert!(!payload.code.chars().any(|c| c as u32 > 0x7f));
    }
}
