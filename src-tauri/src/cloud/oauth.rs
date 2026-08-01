//! Google OAuth 2.0（PKCE）の実行部分。
//!
//! 認可コードの受け口は **`127.0.0.1` のループバックだけ**に立てる。
//! 外から届くポートを開けたくないので、`0.0.0.0` では待ち受けない。

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::cloud::pkce::{self, AuthCallback};
use crate::error::{AppError, Result};
use crate::http;

/// ブラウザでの操作を待つ上限。
pub const AUTH_TIMEOUT: Duration = Duration::from_secs(180);

/// 期限切れとみなす前倒し分。通信の途中で切れないよう早めに更新する。
pub const EXPIRY_SKEW_MS: i64 = 60_000;

/// 取得したトークン。**フロントエンドへは決して渡さない。**
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub access_token: String,
    /// 更新用。初回の連携時にしか返らないので、取れたら保存する
    pub refresh_token: Option<String>,
    pub expires_at_ms: i64,
}

/// 期限が来たか（前倒し分を含む）。
pub fn is_expired(tokens: &Tokens, now_ms: i64) -> bool {
    tokens.access_token.trim().is_empty() || now_ms + EXPIRY_SKEW_MS >= tokens.expires_at_ms
}

/// トークン応答を読む。
pub fn parse_tokens(json: &Value, now_ms: i64) -> Result<Tokens> {
    // 失敗時は error / error_description が返る
    if let Some(error) = json.get("error").and_then(|v| v.as_str()) {
        let detail = json
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or(error);
        return Err(AppError::msg(format!("Google の認証に失敗しました: {detail}")));
    }

    let access_token = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::msg("Google の応答にアクセストークンがありません。"))?;

    // expires_in は秒。無ければ短めに見積もって次回更新させる
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(600);

    Ok(Tokens {
        access_token: access_token.to_string(),
        refresh_token: json
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        expires_at_ms: now_ms + expires_in * 1_000,
    })
}

/// ループバックの受け口を立て、`(listener, redirect_uri)` を返す。
///
/// ポートは OS に選ばせる（`0`）。固定にすると他のアプリと衝突する。
pub fn bind_loopback() -> Result<(TcpListener, String)> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .map_err(|e| AppError::msg(format!("認証の受け口を用意できません: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::msg(format!("受け口のポートを取得できません: {e}")))?
        .port();

    Ok((listener, format!("http://127.0.0.1:{port}")))
}

/// ブラウザへ返す完了ページ。
pub fn result_page(message: &str) -> String {
    let body = format!(
        "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">\
         <title>StoQ AI Analyzer</title></head>\
         <body style=\"font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;\
         display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
         <div style=\"text-align:center\"><h1 style=\"font-size:1.25rem\">{message}</h1>\
         <p style=\"color:#94a3b8;font-size:.875rem\">このタブは閉じてかまいません。</p></div>\
         </body></html>"
    );

    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn respond(stream: &mut TcpStream, response: &str) {
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// リダイレクトを 1 件受け取る。**ブロックする**ので呼び出し側で逃がすこと。
pub fn wait_for_callback(listener: TcpListener, timeout: Duration) -> Result<AuthCallback> {
    listener
        .set_nonblocking(true)
        .map_err(|e| AppError::msg(format!("受け口を設定できません: {e}")))?;

    let deadline = Instant::now() + timeout;

    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = [0u8; 4096];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]);
                let line = request.lines().next().unwrap_or("");
                let callback = pkce::parse_callback(line);

                // ブラウザは /favicon.ico なども取りに来る。認可の応答だけ受け取る
                if callback.code.is_none() && callback.error.is_none() {
                    respond(&mut stream, "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                    continue;
                }

                let message = if callback.error.is_some() {
                    "連携をキャンセルしました"
                } else {
                    "✅ Google Drive との連携が完了しました"
                };
                respond(&mut stream, &result_page(message));
                return Ok(callback);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(AppError::msg(format!("認証の応答を受け取れません: {e}"))),
        }
    }

    Err(AppError::msg(
        "認証がタイムアウトしました。ブラウザで許可の操作を行ってから、もう一度お試しください。",
    ))
}

/// 既定のブラウザで URL を開く。
pub fn open_in_browser(url: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn();

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();

    result
        .map(|_| ())
        .map_err(|e| AppError::msg(format!("ブラウザを開けません: {e}")))
}

async fn post_token_form(form: &[(&str, &str)], now_ms: i64) -> Result<Tokens> {
    let res = http::client()?
        .post(pkce::TOKEN_ENDPOINT)
        .form(form)
        .send()
        .await
        .map_err(|e| AppError::msg(format!("Google へ接続できません: {e}")))?;

    let text = res
        .text()
        .await
        .map_err(|e| AppError::msg(format!("Google の応答を読めません: {e}")))?;

    let json: Value = serde_json::from_str(&text)
        .map_err(|_| AppError::msg("Google の応答を解釈できません。"))?;

    parse_tokens(&json, now_ms)
}

/// 認可コードをトークンに交換する。
pub async fn exchange_code(
    client_id: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
    now_ms: i64,
) -> Result<Tokens> {
    post_token_form(
        &[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ],
        now_ms,
    )
    .await
}

/// リフレッシュトークンでアクセストークンを取り直す。
pub async fn refresh(client_id: &str, refresh_token: &str, now_ms: i64) -> Result<Tokens> {
    let mut tokens = post_token_form(
        &[
            ("client_id", client_id),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ],
        now_ms,
    )
    .await
    .map_err(|e| {
        AppError::msg(format!(
            "{e}\n連携が取り消された可能性があります。設定の「クラウド同期」で連携し直してください。"
        ))
    })?;

    // 更新時は refresh_token が返らない。手元のものを引き継ぐ
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = Some(refresh_token.to_string());
    }
    Ok(tokens)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn トークン応答を読める() {
        let json = json!({
            "access_token": "ya29.token",
            "refresh_token": "1//refresh",
            "expires_in": 3599,
            "scope": pkce::DRIVE_APPDATA_SCOPE,
        });

        let tokens = parse_tokens(&json, 1_000_000).unwrap();
        assert_eq!(tokens.access_token, "ya29.token");
        assert_eq!(tokens.refresh_token.as_deref(), Some("1//refresh"));
        assert_eq!(tokens.expires_at_ms, 1_000_000 + 3_599_000);
    }

    #[test]
    fn 更新時は_refresh_token_が無くても読める() {
        let json = json!({ "access_token": "ya29.new", "expires_in": 3599 });
        let tokens = parse_tokens(&json, 0).unwrap();
        assert_eq!(tokens.refresh_token, None);
    }

    #[test]
    fn 期限が無ければ短めに見積もる() {
        let tokens = parse_tokens(&json!({ "access_token": "t" }), 0).unwrap();
        assert_eq!(tokens.expires_at_ms, 600_000);
    }

    #[test]
    fn エラー応答は理由を伝える() {
        let json = json!({
            "error": "invalid_grant",
            "error_description": "Token has been expired or revoked.",
        });
        let err = parse_tokens(&json, 0).unwrap_err();
        assert!(format!("{err}").contains("Token has been expired"));
    }

    #[test]
    fn アクセストークンが無ければエラー() {
        assert!(parse_tokens(&json!({}), 0).is_err());
        assert!(parse_tokens(&json!({ "access_token": "" }), 0).is_err());
    }

    #[test]
    fn 期限切れを前倒しで判定する() {
        let tokens = Tokens {
            access_token: "t".into(),
            refresh_token: None,
            expires_at_ms: 1_000_000,
        };

        assert!(!is_expired(&tokens, 900_000), "まだ余裕がある");
        // 残り 60 秒を切ったら先に更新する
        assert!(is_expired(&tokens, 950_000));
        assert!(is_expired(&tokens, 1_000_001));
    }

    #[test]
    fn 空のトークンは常に期限切れ扱い() {
        let tokens = Tokens {
            access_token: String::new(),
            refresh_token: None,
            expires_at_ms: i64::MAX,
        };
        assert!(is_expired(&tokens, 0));
    }

    #[test]
    fn 受け口はループバックにだけ立つ() {
        let (listener, redirect) = bind_loopback().unwrap();

        assert!(redirect.starts_with("http://127.0.0.1:"));
        let addr = listener.local_addr().unwrap();
        assert_eq!(addr.ip().to_string(), "127.0.0.1", "外から届く口を開けない");
        assert_ne!(addr.port(), 0, "OS が実ポートを割り当てる");

        // リダイレクト先とポートが一致すること
        assert!(redirect.ends_with(&addr.port().to_string()));
    }

    #[test]
    fn 受け口は毎回別のポートを取る() {
        let (_a, first) = bind_loopback().unwrap();
        let (_b, second) = bind_loopback().unwrap();
        assert_ne!(first, second, "同時に 2 つ立てても衝突しない");
    }

    #[test]
    fn 完了ページは正しい_http_応答になる() {
        let page = result_page("完了しました");

        assert!(page.starts_with("HTTP/1.1 200 OK"));
        assert!(page.contains("Content-Type: text/html; charset=utf-8"));
        assert!(page.contains("完了しました"));

        // Content-Length が本体のバイト数と一致すること
        let body = page.split("\r\n\r\n").nth(1).unwrap();
        assert!(page.contains(&format!("Content-Length: {}", body.len())));
    }

    #[test]
    fn 待受はタイムアウトで諦める() {
        let (listener, _) = bind_loopback().unwrap();
        let err = wait_for_callback(listener, Duration::from_millis(200)).unwrap_err();
        assert!(format!("{err}").contains("タイムアウト"));
    }

    #[test]
    fn 待受は認可の応答を受け取る() {
        let (listener, redirect) = bind_loopback().unwrap();
        let port = redirect.rsplit(':').next().unwrap().to_string();

        let handle = std::thread::spawn(move || {
            wait_for_callback(listener, Duration::from_secs(5))
        });

        // ブラウザの代わりにリダイレクトを 1 件投げる
        std::thread::sleep(Duration::from_millis(50));
        let mut stream =
            TcpStream::connect(format!("127.0.0.1:{port}")).expect("接続できるはず");
        stream
            .write_all(b"GET /?code=auth-code-1&state=st-1 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .unwrap();

        let callback = handle.join().unwrap().unwrap();
        assert_eq!(callback.code.as_deref(), Some("auth-code-1"));
        assert_eq!(callback.state.as_deref(), Some("st-1"));
    }
}
