//! Google Drive のアプリ専用領域を使ったバックアップ / 復元。
//!
//! # 触れる範囲
//!
//! 要求するスコープは [`pkce::DRIVE_APPDATA_SCOPE`] **ひとつだけ**。
//! これは Drive の「アプリ専用の隠し領域（`appDataFolder`）」に限った権限で、
//! ユーザーのマイドライブ（写真・書類など）は一覧すらできない。
//!
//! # 送らないもの
//!
//! `settings.json` はバックアップに含めない。APIキーとライセンスキーが
//! 入っているため（[`bundle::BACKUP_FILES`] を参照）。

pub mod bundle;
pub mod drive;
pub mod oauth;
pub mod pkce;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};
use crate::library::now_ms;
use crate::settings;

use oauth::Tokens;

/// 設定ファイルに保存するクラウド同期の設定。
///
/// `refresh_token` は秘密情報。**フロントエンドへは決して返さない。**
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CloudConfig {
    /// Google Cloud で発行した OAuth クライアント ID（デスクトップアプリ）
    pub client_id: String,
    /// 更新用トークン（生の値）
    pub refresh_token: String,
    /// 起動時に自動でバックアップするか
    pub auto_backup: bool,
    /// 最後にバックアップした時刻（ミリ秒）
    pub last_backup_ms: i64,
}

/// フロントエンドへ返す安全な表現。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    /// Google と連携済みか
    pub connected: bool,
    pub client_id_configured: bool,
    /// 例: `1234…apps.googleusercontent.com` の一部
    pub client_id_masked: Option<String>,
    pub auto_backup: bool,
    pub last_backup_ms: i64,
    /// 画面に出す「触れる範囲」の説明用
    pub scope: String,
}

/// 保存された設定から状態を組み立てる（通信はしない）。
pub fn status_of(config: &CloudConfig) -> CloudStatus {
    CloudStatus {
        connected: !config.refresh_token.trim().is_empty(),
        client_id_configured: !config.client_id.trim().is_empty(),
        client_id_masked: settings::mask_secret(&config.client_id),
        auto_backup: config.auto_backup,
        last_backup_ms: config.last_backup_ms,
        scope: pkce::DRIVE_APPDATA_SCOPE.to_string(),
    }
}

/// バックアップの結果。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub file_name: String,
    pub size_bytes: u64,
    pub uploaded_at_ms: i64,
    /// 束に入れたファイル名
    pub included: Vec<String>,
}

/// 復元の結果。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub file_name: String,
    pub created_at_ms: i64,
    /// 実際に書き戻したファイル名
    pub restored: Vec<String>,
}

// ---------------------------------------------------------------- トークン

/// アクセストークンの一時保管。設定ファイルには書かない（短命なので）。
static ACCESS_CACHE: OnceLock<Mutex<Tokens>> = OnceLock::new();

fn cache() -> &'static Mutex<Tokens> {
    ACCESS_CACHE.get_or_init(|| Mutex::new(Tokens::default()))
}

fn cached_token(now: i64) -> Option<String> {
    let guard = cache().lock().ok()?;
    if oauth::is_expired(&guard, now) {
        return None;
    }
    Some(guard.access_token.clone())
}

fn store_token(tokens: &Tokens) {
    if let Ok(mut guard) = cache().lock() {
        *guard = tokens.clone();
    }
}

fn clear_token() {
    if let Ok(mut guard) = cache().lock() {
        *guard = Tokens::default();
    }
}

/// 有効なアクセストークンを用意する。期限が近ければ取り直す。
async fn access_token(app: &AppHandle) -> Result<String> {
    let now = now_ms();
    if let Some(token) = cached_token(now) {
        return Ok(token);
    }

    let config = settings::load(app)?.cloud;
    let client_id = config.client_id.trim().to_string();
    let refresh_token = config.refresh_token.trim().to_string();

    if client_id.is_empty() {
        return Err(AppError::msg(
            "Google の OAuth クライアント ID が未設定です。設定の「クラウド同期」で登録してください。",
        ));
    }
    if refresh_token.is_empty() {
        return Err(AppError::msg(
            "Google と連携していません。「🌐 Google アカウントで連携」から接続してください。",
        ));
    }

    let tokens = oauth::refresh(&client_id, &refresh_token, now).await?;
    store_token(&tokens);
    Ok(tokens.access_token)
}

// ---------------------------------------------------------------- 連携

/// ブラウザを開いて Google と連携する。
pub async fn connect(app: &AppHandle) -> Result<CloudStatus> {
    let mut current = settings::load(app)?;
    let client_id = current.cloud.client_id.trim().to_string();
    if client_id.is_empty() {
        return Err(AppError::msg(
            "先に Google の OAuth クライアント ID を登録してください。\
             Google Cloud Console で「デスクトップアプリ」として発行できます。",
        ));
    }

    let verifier = pkce::generate_verifier()?;
    let challenge = pkce::challenge_of(&verifier);
    let state = pkce::generate_state()?;

    let (listener, redirect_uri) = oauth::bind_loopback()?;
    let url = pkce::build_auth_url(&client_id, &redirect_uri, &challenge, &state);
    oauth::open_in_browser(&url)?;

    // 待受はブロックするので、ワーカースレッドへ逃がす
    let callback = tokio::task::spawn_blocking(move || {
        oauth::wait_for_callback(listener, oauth::AUTH_TIMEOUT)
    })
    .await
    .map_err(|e| AppError::msg(format!("認証の待受に失敗しました: {e}")))??;

    if let Some(error) = callback.error {
        return Err(AppError::msg(format!(
            "Google の連携が完了しませんでした（{error}）。"
        )));
    }
    // state が一致しない応答は、別の誰かが投げ込んだもの
    if callback.state.as_deref() != Some(state.as_str()) {
        return Err(AppError::msg(
            "認証の応答が一致しませんでした。安全のため中止しました。もう一度お試しください。",
        ));
    }
    let code = callback
        .code
        .ok_or_else(|| AppError::msg("認可コードを受け取れませんでした。"))?;

    let tokens = oauth::exchange_code(&client_id, &code, &verifier, &redirect_uri, now_ms()).await?;
    let refresh_token = tokens.refresh_token.clone().ok_or_else(|| {
        AppError::msg(
            "更新用トークンを受け取れませんでした。Google アカウントの権限を一度解除してから、もう一度お試しください。",
        )
    })?;

    store_token(&tokens);
    current.cloud.refresh_token = refresh_token;
    settings::save(app, &current)?;

    Ok(status_of(&current.cloud))
}

/// 連携を解除する。手元のトークンを捨てるだけで、クラウドのデータは消さない。
pub fn disconnect(app: &AppHandle) -> Result<CloudStatus> {
    let mut current = settings::load(app)?;
    current.cloud.refresh_token = String::new();
    settings::save(app, &current)?;
    clear_token();
    Ok(status_of(&current.cloud))
}

// ---------------------------------------------------------------- ファイル

fn data_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(format!("データディレクトリを取得できません: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// バックアップ対象のうち、実在するものだけを読む。
fn collect_files(dir: &Path) -> Result<Vec<(String, Vec<u8>)>> {
    let mut files = Vec::new();
    for name in bundle::BACKUP_FILES {
        let path = dir.join(name);
        if path.exists() {
            files.push((name.to_string(), std::fs::read(&path)?));
        }
    }
    Ok(files)
}

/// SQLite の付随ファイル。DB 本体を差し替えたら、古いものを残さない。
fn remove_sidecars(dir: &Path, name: &str) {
    for suffix in ["-wal", "-shm", "-journal"] {
        let _ = std::fs::remove_file(dir.join(format!("{name}{suffix}")));
    }
}

// ---------------------------------------------------------------- バックアップ

/// 現在のデータをクラウドへ上げる。
pub async fn backup(app: &AppHandle) -> Result<BackupResult> {
    let token = access_token(app).await?;
    let dir = data_dir(app)?;

    let files = collect_files(&dir)?;
    if files.is_empty() {
        return Err(AppError::msg(
            "バックアップできるデータがまだありません。分析を保存してからお試しください。",
        ));
    }
    let included: Vec<String> = files.iter().map(|(name, _)| name.clone()).collect();

    let stamp = now_ms();
    let payload = bundle::encode(&bundle::build(stamp, env!("CARGO_PKG_VERSION"), files))?;
    let size_bytes = payload.len() as u64;
    let file_name = drive::backup_name(stamp);

    drive::upload(&token, &file_name, payload).await?;

    // 世代が増えすぎないよう、古いものから片付ける
    if let Ok(existing) = drive::list_backups(&token).await {
        for old in drive::expired_backups(&existing) {
            drive::delete(&token, &old.id).await;
        }
    }

    let mut current = settings::load(app)?;
    current.cloud.last_backup_ms = stamp;
    settings::save(app, &current)?;

    Ok(BackupResult {
        file_name,
        size_bytes,
        uploaded_at_ms: stamp,
        included,
    })
}

/// クラウドのバックアップ一覧。
pub async fn list(app: &AppHandle) -> Result<Vec<drive::BackupFile>> {
    let token = access_token(app).await?;
    drive::list_backups(&token).await
}

/// クラウドから復元する。`file_id` を省略すると最新を使う。
pub async fn restore(app: &AppHandle, file_id: Option<String>) -> Result<RestoreResult> {
    let token = access_token(app).await?;

    let (id, file_name) = match file_id {
        Some(id) => (id.clone(), id),
        None => {
            let files = drive::list_backups(&token).await?;
            let latest = drive::latest_backup(&files).ok_or_else(|| {
                AppError::msg("クラウドにバックアップがありません。先にバックアップしてください。")
            })?;
            (latest.id.clone(), latest.name.clone())
        }
    };

    let payload = drive::download(&token, &id).await?;
    let parsed = bundle::decode(&payload)?;

    let targets = bundle::restorable(&parsed);
    if targets.is_empty() {
        return Err(AppError::msg("バックアップに復元できるデータがありません。"));
    }

    // 中身を全部読めてから書き始める。途中で失敗して半端に上書きしないため
    let mut staged: Vec<(&str, Vec<u8>)> = Vec::new();
    for entry in targets {
        staged.push((entry.name.as_str(), bundle::decode_entry(entry)?));
    }

    let dir = data_dir(app)?;
    let stamp = now_ms();
    let mut restored = Vec::new();

    for (name, bytes) in staged {
        let path = dir.join(name);
        // 上書きする前に現物を退避する
        if path.exists() {
            let backup_path = dir.join(bundle::rollback_name(name, stamp));
            std::fs::copy(&path, &backup_path)?;
        }
        std::fs::write(&path, &bytes)?;
        remove_sidecars(&dir, name);
        restored.push(name.to_string());
    }

    Ok(RestoreResult {
        file_name,
        created_at_ms: parsed.created_at_ms,
        restored,
    })
}

/// 起動時の自動バックアップ。**失敗しても起動は止めない。**
pub async fn auto_backup_if_enabled(app: &AppHandle) -> Option<BackupResult> {
    let config = settings::load(app).ok()?.cloud;
    if !config.auto_backup || config.refresh_token.trim().is_empty() {
        return None;
    }
    backup(app).await.ok()
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> CloudConfig {
        CloudConfig {
            client_id: "123456789-abcdefg.apps.googleusercontent.com".into(),
            refresh_token: "1//0gRefreshTokenValue".into(),
            auto_backup: true,
            last_backup_ms: 1_700_000_000_000,
        }
    }

    #[test]
    fn 未設定なら未連携として扱う() {
        let status = status_of(&CloudConfig::default());
        assert!(!status.connected);
        assert!(!status.client_id_configured);
        assert_eq!(status.client_id_masked, None);
        assert!(!status.auto_backup);
        assert_eq!(status.last_backup_ms, 0);
    }

    #[test]
    fn 連携済みなら接続中として扱う() {
        let status = status_of(&config());
        assert!(status.connected);
        assert!(status.client_id_configured);
        assert_eq!(status.last_backup_ms, 1_700_000_000_000);
    }

    #[test]
    fn クライアント_id_が空なら未設定() {
        let mut c = config();
        c.client_id = "   ".into();
        assert!(!status_of(&c).client_id_configured);
    }

    #[test]
    fn 状態に生のトークンが出ない() {
        // フロントエンドへ秘密情報を渡さないための最後の砦
        let status = status_of(&config());
        let json = serde_json::to_string(&status).unwrap();

        assert!(!json.contains("1//0gRefreshTokenValue"), "{json}");
        assert!(!json.contains("refreshToken"), "{json}");
        assert!(!json.contains("123456789-abcdefg.apps.googleusercontent.com"), "{json}");
    }

    #[test]
    fn 状態はアプリ専用スコープを伝える() {
        let status = status_of(&config());
        assert_eq!(status.scope, pkce::DRIVE_APPDATA_SCOPE);
        assert!(status.scope.ends_with("drive.appdata"));
    }

    #[test]
    fn 設定は保存と読み込みで往復する() {
        let json = serde_json::to_string(&config()).unwrap();
        let restored: CloudConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.client_id, config().client_id);
        assert_eq!(restored.refresh_token, config().refresh_token);
        assert!(restored.auto_backup);
    }

    #[test]
    fn クラウド設定を持たない旧ファイルも読める() {
        let legacy = r#"{"client_id":"abc"}"#;
        let restored: CloudConfig = serde_json::from_str(legacy).unwrap();

        assert_eq!(restored.client_id, "abc");
        assert!(restored.refresh_token.is_empty());
        assert!(!restored.auto_backup);
    }

    #[test]
    fn 期限内のトークンは使い回す() {
        clear_token();
        store_token(&Tokens {
            access_token: "ya29.cached".into(),
            refresh_token: None,
            expires_at_ms: now_ms() + 3_600_000,
        });

        assert_eq!(cached_token(now_ms()).as_deref(), Some("ya29.cached"));
        clear_token();
        assert_eq!(cached_token(now_ms()), None);
    }

    #[test]
    fn 期限切れのトークンは使い回さない() {
        clear_token();
        store_token(&Tokens {
            access_token: "ya29.old".into(),
            refresh_token: None,
            expires_at_ms: 1_000,
        });

        assert_eq!(cached_token(now_ms()), None);
        clear_token();
    }

    #[test]
    fn 付随ファイルの掃除は存在しなくても落ちない() {
        let dir = std::env::temp_dir().join(format!("stoq-cloud-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();

        remove_sidecars(&dir, "analyses.db");

        std::fs::write(dir.join("analyses.db-wal"), b"wal").unwrap();
        remove_sidecars(&dir, "analyses.db");
        assert!(!dir.join("analyses.db-wal").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 実在するファイルだけ束にする() {
        let dir = std::env::temp_dir().join(format!("stoq-collect-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("analyses.db"), b"analyses").unwrap();
        std::fs::write(dir.join("settings.json"), b"{\"keys\":{}}").unwrap();

        let files = collect_files(&dir).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "analyses.db");
        // 設定ファイル（APIキーを含む）は決して束に入らない
        assert!(!files.iter().any(|(name, _)| name == "settings.json"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
