//! OAuth 2.0 PKCE（RFC 7636）と認可 URL の組み立て。
//!
//! **クライアントシークレットを持たない。** デスクトップアプリのバイナリに
//! 秘密を埋めても、配布した時点で誰でも取り出せるため意味がない。
//! PKCE は、そのシークレット無しで認可コードの横取りを防ぐ仕組み。

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};

use crate::error::{code, AppError, Result};

/// アプリ専用の隠し領域だけにアクセスするスコープ。
///
/// **`drive.file` や `drive` は要求しない。** ユーザーの写真や書類には
/// 一切触れない、というのがこの機能の前提。
pub const DRIVE_APPDATA_SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";

pub const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";

/// `code_verifier` に使える文字（RFC 7636 の unreserved）
const VERIFIER_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/// 43〜128 文字。短いと総当たりの余地が出るので上限側に寄せる。
pub const VERIFIER_LEN: usize = 96;

/// `code_verifier` を作る。OS の乱数を使う。
pub fn generate_verifier() -> Result<String> {
    let mut bytes = [0u8; VERIFIER_LEN];
    getrandom::fill(&mut bytes)
        .map_err(|e| AppError::detail(code::UNEXPECTED, e.to_string()))?;

    Ok(bytes
        .iter()
        .map(|b| VERIFIER_CHARS[*b as usize % VERIFIER_CHARS.len()] as char)
        .collect())
}

/// `code_challenge`（S256）を作る。
pub fn challenge_of(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

/// CSRF 対策の `state`。
pub fn generate_state() -> Result<String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes)
        .map_err(|e| AppError::detail(code::UNEXPECTED, e.to_string()))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// URL に載せる値をエスケープする。
pub fn encode_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// 認可 URL を組み立てる。
///
/// `access_type=offline` と `prompt=consent` を付けるのは、
/// **リフレッシュトークンを確実に受け取る**ため。
/// これが無いと 2 回目以降の連携でトークンが取れず、毎回ログインになる。
pub fn build_auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    format!(
        "{AUTH_ENDPOINT}?response_type=code\
         &client_id={}\
         &redirect_uri={}\
         &scope={}\
         &code_challenge={}\
         &code_challenge_method=S256\
         &state={}\
         &access_type=offline\
         &prompt=consent",
        encode_component(client_id),
        encode_component(redirect_uri),
        encode_component(DRIVE_APPDATA_SCOPE),
        encode_component(challenge),
        encode_component(state),
    )
}

/// リダイレクトのクエリから受け取る値。
#[derive(Debug, Clone, PartialEq)]
pub struct AuthCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// `GET /?code=…&state=…` のリクエスト行からクエリを読む。
pub fn parse_callback(request_line: &str) -> AuthCallback {
    let path = request_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");

    let mut callback = AuthCallback {
        code: None,
        state: None,
        error: None,
    };

    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let decoded = decode_component(value);
        match key {
            "code" => callback.code = Some(decoded),
            "state" => callback.state = Some(decoded),
            "error" => callback.error = Some(decoded),
            _ => {}
        }
    }

    callback
}

/// パーセントエンコードを戻す。
pub fn decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).to_string()
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 検証コードは規定の長さと文字種になる() {
        let verifier = generate_verifier().unwrap();
        assert_eq!(verifier.len(), VERIFIER_LEN);
        assert!(verifier.len() >= 43 && verifier.len() <= 128, "RFC 7636 の範囲");
        assert!(verifier
            .bytes()
            .all(|b| VERIFIER_CHARS.contains(&b)));
    }

    #[test]
    fn 検証コードは毎回変わる() {
        let a = generate_verifier().unwrap();
        let b = generate_verifier().unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn チャレンジは_S256_の_base64url_になる() {
        // RFC 7636 付録 B の例
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            challenge_of(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn チャレンジにパディングが入らない() {
        let challenge = challenge_of("test");
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn 認可_url_はアプリ専用スコープだけを要求する() {
        let url = build_auth_url("id.apps.googleusercontent.com", "http://127.0.0.1:1421", "ch", "st");

        assert!(url.contains("drive.appdata"));
        // ユーザーの個人ファイルに触るスコープは含めない
        assert!(!url.contains("auth%2Fdrive&"));
        assert!(!url.contains("drive.file"));
        assert!(!url.contains("drive.readonly"));
    }

    #[test]
    fn 認可_url_に_pkce_と_state_が入る() {
        let url = build_auth_url("cid", "http://127.0.0.1:1421", "challenge-value", "state-value");

        assert!(url.contains("code_challenge=challenge-value"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("state=state-value"));
        assert!(url.contains("response_type=code"));
    }

    #[test]
    fn リフレッシュトークンを受け取る指定が入る() {
        // これが無いと 2 回目以降の連携で毎回ログインになる
        let url = build_auth_url("cid", "http://127.0.0.1:1421", "c", "s");
        assert!(url.contains("access_type=offline"));
        assert!(url.contains("prompt=consent"));
    }

    #[test]
    fn リダイレクト先はエスケープされる() {
        let url = build_auth_url("cid", "http://127.0.0.1:1421/callback", "c", "s");
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A1421%2Fcallback"));
    }

    #[test]
    fn コールバックからコードと_state_を読む() {
        let parsed = parse_callback("GET /?code=abc123&state=xyz HTTP/1.1");
        assert_eq!(parsed.code.as_deref(), Some("abc123"));
        assert_eq!(parsed.state.as_deref(), Some("xyz"));
        assert_eq!(parsed.error, None);
    }

    #[test]
    fn 拒否されたときは_error_が入る() {
        let parsed = parse_callback("GET /?error=access_denied&state=xyz HTTP/1.1");
        assert_eq!(parsed.error.as_deref(), Some("access_denied"));
        assert_eq!(parsed.code, None);
    }

    #[test]
    fn エスケープされたコードを戻せる() {
        let parsed = parse_callback("GET /?code=4%2F0Ab%5Fcd HTTP/1.1");
        assert_eq!(parsed.code.as_deref(), Some("4/0Ab_cd"));
    }

    #[test]
    fn クエリが無くても落ちない() {
        let parsed = parse_callback("GET / HTTP/1.1");
        assert_eq!(parsed.code, None);
        assert_eq!(parsed.state, None);

        let empty = parse_callback("");
        assert_eq!(empty.code, None);
    }

    #[test]
    fn state_は毎回変わる() {
        assert_ne!(generate_state().unwrap(), generate_state().unwrap());
    }
}
