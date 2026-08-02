//! Google Drive のアプリ専用領域（`appDataFolder`）へのバックアップと復元。
//!
//! **触れるのは `appDataFolder` だけ。** ここはアプリごとに隔離された隠し領域で、
//! ユーザーのマイドライブからは見えず、他のアプリからも読めない。
//! 写真や書類には一切アクセスしない。

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{code, AppError, Result};
use crate::http;

const FILES_ENDPOINT: &str = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_ENDPOINT: &str = "https://www.googleapis.com/upload/drive/v3/files";

/// バックアップ 1 件。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub id: String,
    pub name: String,
    /// RFC 3339 の更新日時
    pub modified_time: String,
    pub size_bytes: u64,
}

/// バックアップのファイル名。**同じ名前を使い回さず、日時で分ける。**
/// 1 つを上書きし続けると、壊れたデータを同期した瞬間に戻せなくなる。
pub fn backup_name(stamp_ms: i64) -> String {
    format!("stoq-backup-{stamp_ms}.json")
}

/// バックアップとして扱う名前か。
pub fn is_backup_name(name: &str) -> bool {
    name.starts_with("stoq-backup-")
}

/// 一覧から復元対象（いちばん新しいもの）を選ぶ。
pub fn latest_backup(files: &[BackupFile]) -> Option<&BackupFile> {
    files
        .iter()
        .filter(|f| is_backup_name(&f.name))
        .max_by(|a, b| a.modified_time.cmp(&b.modified_time))
}

/// 古い世代を残す上限。これを超えたぶんは消す。
pub const KEEP_BACKUPS: usize = 10;

/// 消してよい古い世代を返す（新しい順に `KEEP_BACKUPS` 件を残す）。
pub fn expired_backups(files: &[BackupFile]) -> Vec<&BackupFile> {
    let mut sorted: Vec<&BackupFile> = files
        .iter()
        .filter(|f| is_backup_name(&f.name))
        .collect();
    sorted.sort_by(|a, b| b.modified_time.cmp(&a.modified_time));

    sorted.into_iter().skip(KEEP_BACKUPS).collect()
}

/// `files.list` の応答からバックアップ一覧を読む。
pub fn parse_file_list(json: &Value) -> Vec<BackupFile> {
    json.get("files")
        .and_then(|f| f.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(BackupFile {
                        id: item.get("id")?.as_str()?.to_string(),
                        name: item.get("name")?.as_str()?.to_string(),
                        modified_time: item
                            .get("modifiedTime")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        // size は文字列で返る
                        size_bytes: item
                            .get("size")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// マルチパートの本文を組み立てる。
///
/// メタデータ（親フォルダ = `appDataFolder`）と中身を 1 リクエストで送る。
pub fn multipart_body(boundary: &str, name: &str, contents: &[u8]) -> Vec<u8> {
    let metadata = format!(
        r#"{{"name":"{name}","parents":["appDataFolder"]}}"#
    );

    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(contents);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

fn auth_error(status: reqwest::StatusCode) -> Option<AppError> {
    match status {
        reqwest::StatusCode::UNAUTHORIZED => Some(AppError::code(code::CLOUD_AUTH_EXPIRED)),
        reqwest::StatusCode::FORBIDDEN => Some(AppError::code(code::CLOUD_AUTH_DENIED)),
        _ => None,
    }
}

/// バックアップ一覧を取る。
pub async fn list_backups(access_token: &str) -> Result<Vec<BackupFile>> {
    let res = http::client()?
        .get(FILES_ENDPOINT)
        .bearer_auth(access_token)
        .query(&[
            ("spaces", "appDataFolder"),
            ("fields", "files(id,name,modifiedTime,size)"),
            ("orderBy", "modifiedTime desc"),
            ("pageSize", "50"),
        ])
        .send()
        .await
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;

    let status = res.status();
    if let Some(err) = auth_error(status) {
        return Err(err);
    }

    let body = res
        .text()
        .await
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;

    if !status.is_success() {
        return Err(AppError::detail(code::CLOUD_REQUEST_FAILED, status.to_string()));
    }

    let json: Value = serde_json::from_str(&body)
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;
    Ok(parse_file_list(&json))
}

/// ファイルをアップロードする。作成したファイル ID を返す。
pub async fn upload(access_token: &str, name: &str, contents: Vec<u8>) -> Result<String> {
    let boundary = format!("stoq{}", contents.len());
    let body = multipart_body(&boundary, name, &contents);

    let res = http::client()?
        .post(UPLOAD_ENDPOINT)
        .bearer_auth(access_token)
        .query(&[("uploadType", "multipart"), ("fields", "id")])
        .header(
            "Content-Type",
            format!("multipart/related; boundary={boundary}"),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;

    let status = res.status();
    if let Some(err) = auth_error(status) {
        return Err(err);
    }

    let text = res
        .text()
        .await
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;

    if !status.is_success() {
        return Err(AppError::detail(code::CLOUD_REQUEST_FAILED, status.to_string()));
    }

    let json: Value = serde_json::from_str(&text)
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;
    json.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::code(code::CLOUD_REQUEST_FAILED))
}

/// ファイルの中身を取る。
pub async fn download(access_token: &str, file_id: &str) -> Result<Vec<u8>> {
    let res = http::client()?
        .get(format!("{FILES_ENDPOINT}/{file_id}"))
        .bearer_auth(access_token)
        .query(&[("alt", "media")])
        .send()
        .await
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?;

    let status = res.status();
    if let Some(err) = auth_error(status) {
        return Err(err);
    }
    if !status.is_success() {
        return Err(AppError::detail(code::CLOUD_REQUEST_FAILED, status.to_string()));
    }

    Ok(res
        .bytes()
        .await
        .map_err(|e| AppError::detail(code::CLOUD_REQUEST_FAILED, e.to_string()))?
        .to_vec())
}

/// 古い世代を消す。失敗しても致命的ではないので握りつぶす。
pub async fn delete(access_token: &str, file_id: &str) {
    if let Ok(client) = http::client() {
        let _ = client
            .delete(format!("{FILES_ENDPOINT}/{file_id}"))
            .bearer_auth(access_token)
            .send()
            .await;
    }
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn file(name: &str, modified: &str) -> BackupFile {
        BackupFile {
            id: format!("id-{name}"),
            name: name.to_string(),
            modified_time: modified.to_string(),
            size_bytes: 1024,
        }
    }

    #[test]
    fn バックアップ名は日時で分かれる() {
        assert_eq!(backup_name(1_700_000_000_000), "stoq-backup-1700000000000.json");
        assert_ne!(backup_name(1), backup_name(2));
        assert!(is_backup_name(&backup_name(1)));
        assert!(!is_backup_name("other-app.dat"));
    }

    #[test]
    fn 最新のバックアップを選ぶ() {
        let files = vec![
            file("stoq-backup-1.sqlite", "2026-08-01T00:00:00Z"),
            file("stoq-backup-3.sqlite", "2026-08-03T00:00:00Z"),
            file("stoq-backup-2.sqlite", "2026-08-02T00:00:00Z"),
        ];
        assert_eq!(latest_backup(&files).unwrap().name, "stoq-backup-3.sqlite");
    }

    #[test]
    fn 無関係なファイルは復元対象にしない() {
        let files = vec![
            file("other-app.dat", "2026-12-31T00:00:00Z"),
            file("stoq-backup-1.sqlite", "2026-08-01T00:00:00Z"),
        ];
        assert_eq!(latest_backup(&files).unwrap().name, "stoq-backup-1.sqlite");
    }

    #[test]
    fn バックアップが無ければ_None() {
        assert!(latest_backup(&[]).is_none());
        assert!(latest_backup(&[file("other.dat", "2026-01-01T00:00:00Z")]).is_none());
    }

    #[test]
    fn 世代は上限まで残す() {
        let files: Vec<BackupFile> = (1..=13)
            .map(|i| file(&format!("stoq-backup-{i}.sqlite"), &format!("2026-08-{i:02}T00:00:00Z")))
            .collect();

        let expired = expired_backups(&files);
        assert_eq!(expired.len(), 3, "13 件中 10 件を残す");
        // 消えるのは古いほう
        assert_eq!(expired[0].name, "stoq-backup-3.sqlite");
    }

    #[test]
    fn 上限以下なら何も消さない() {
        let files: Vec<BackupFile> = (1..=5)
            .map(|i| file(&format!("stoq-backup-{i}.sqlite"), &format!("2026-08-0{i}T00:00:00Z")))
            .collect();
        assert!(expired_backups(&files).is_empty());
    }

    #[test]
    fn 一覧の応答を読める() {
        let json = json!({
            "files": [
                { "id": "a", "name": "stoq-backup-1.sqlite", "modifiedTime": "2026-08-01T00:00:00Z", "size": "2048" }
            ]
        });
        let files = parse_file_list(&json);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].id, "a");
        assert_eq!(files[0].size_bytes, 2048);
    }

    #[test]
    fn 壊れた応答でも落ちない() {
        assert!(parse_file_list(&json!({})).is_empty());
        assert!(parse_file_list(&json!({ "files": "not-an-array" })).is_empty());
        // 必須項目が欠けた行は飛ばす
        assert!(parse_file_list(&json!({ "files": [{ "name": "x" }] })).is_empty());
    }

    #[test]
    fn サイズが欠けていても_0_で読む() {
        let json = json!({ "files": [{ "id": "a", "name": "stoq-backup-1.sqlite" }] });
        let files = parse_file_list(&json);
        assert_eq!(files[0].size_bytes, 0);
        assert_eq!(files[0].modified_time, "");
    }

    #[test]
    fn マルチパートはアプリ専用フォルダを親にする() {
        let body = multipart_body("BOUND", "stoq-backup-1.sqlite", b"SQLite format 3\0");
        let text = String::from_utf8_lossy(&body);

        assert!(text.contains(r#""parents":["appDataFolder"]"#));
        assert!(text.contains(r#""name":"stoq-backup-1.sqlite""#));
        assert!(text.contains("--BOUND\r\n"));
        assert!(text.ends_with("--BOUND--\r\n"));
    }

    #[test]
    fn マルチパートに中身がそのまま入る() {
        let contents = b"SQLite format 3\0test";
        let body = multipart_body("B", "x.sqlite", contents);

        // バイト列が壊れずに含まれる
        assert!(body
            .windows(contents.len())
            .any(|window| window == contents));
    }
}
