//! バックアップの中身（束）の組み立てと読み出し。
//!
//! このアプリのデータは 1 ファイルではなく、**3 つの SQLite に分かれている**
//! （`analyses.db` / `chats.db` / `library.db`）。1 つだけ戻すと、
//! 「ポートフォリオには居るのに分析結果が無い」といった食い違いが起きるので、
//! **まとめて 1 つの束にして、まとめて戻す**。
//!
//! **APIキーとライセンスキーは束に入れない。** これらは `settings.json` にあるが、
//! 外部（Google のサーバー）へ送ってよい情報ではない。

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

/// 束の形式バージョン。読めない形式で壊さないための番号。
pub const BUNDLE_VERSION: u32 = 1;

/// バックアップに入れるファイル。**設定ファイルは含めない**（秘密情報のため）。
pub const BACKUP_FILES: [&str; 3] = ["analyses.db", "chats.db", "library.db"];

/// 束に入る 1 ファイル。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleEntry {
    pub name: String,
    /// 中身（Base64）
    pub data: String,
    /// 復元時の取り違えを検出するための元のバイト数
    pub size_bytes: u64,
}

/// バックアップ 1 件ぶんの中身。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupBundle {
    pub version: u32,
    pub created_at_ms: i64,
    pub app_version: String,
    pub entries: Vec<BundleEntry>,
}

/// 復元先として許すファイル名か。
///
/// **束は外から来たデータ**なので、名前をそのままパスに使うと
/// `../` でアプリの外へ書き込まれうる。既知の名前だけを通す。
pub fn is_allowed_name(name: &str) -> bool {
    BACKUP_FILES.contains(&name)
}

/// 束を組み立てる。
pub fn build(created_at_ms: i64, app_version: &str, files: Vec<(String, Vec<u8>)>) -> BackupBundle {
    BackupBundle {
        version: BUNDLE_VERSION,
        created_at_ms,
        app_version: app_version.to_string(),
        entries: files
            .into_iter()
            .map(|(name, bytes)| BundleEntry {
                name,
                size_bytes: bytes.len() as u64,
                data: STANDARD.encode(bytes),
            })
            .collect(),
    }
}

/// 送信できるバイト列にする。
pub fn encode(bundle: &BackupBundle) -> Result<Vec<u8>> {
    serde_json::to_vec(bundle)
        .map_err(|e| AppError::msg(format!("バックアップを組み立てられません: {e}")))
}

/// 受け取ったバイト列を束として読む。
pub fn decode(bytes: &[u8]) -> Result<BackupBundle> {
    let bundle: BackupBundle = serde_json::from_slice(bytes).map_err(|_| {
        AppError::msg(
            "バックアップの形式が違います。StoQ が作成したバックアップか確認してください。",
        )
    })?;

    if bundle.version > BUNDLE_VERSION {
        return Err(AppError::msg(format!(
            "このバックアップは新しい形式（v{}）です。アプリを更新してから復元してください。",
            bundle.version
        )));
    }
    if bundle.entries.is_empty() {
        return Err(AppError::msg("バックアップに復元できるデータがありません。"));
    }
    Ok(bundle)
}

/// 1 ファイルぶんの中身を取り出す。
pub fn decode_entry(entry: &BundleEntry) -> Result<Vec<u8>> {
    let bytes = STANDARD
        .decode(entry.data.as_bytes())
        .map_err(|_| AppError::msg(format!("{} の中身が壊れています。", entry.name)))?;

    if bytes.len() as u64 != entry.size_bytes {
        return Err(AppError::msg(format!(
            "{} のサイズが合いません（記録 {} / 実際 {}）。転送中に壊れた可能性があります。",
            entry.name,
            entry.size_bytes,
            bytes.len()
        )));
    }
    Ok(bytes)
}

/// 復元してよいファイルだけを取り出す。
pub fn restorable(bundle: &BackupBundle) -> Vec<&BundleEntry> {
    bundle
        .entries
        .iter()
        .filter(|e| is_allowed_name(&e.name))
        .collect()
}

/// 復元前に退避する現行ファイルの名前。
///
/// **上書きする前に必ず現物を残す。** クラウド側が古かった場合に
/// 手元のデータが消えたままになるのを防ぐ。
pub fn rollback_name(name: &str, stamp_ms: i64) -> String {
    format!("{name}.before-restore-{stamp_ms}")
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> BackupBundle {
        build(
            1_700_000_000_000,
            "0.1.0",
            vec![
                ("analyses.db".to_string(), b"SQLite format 3\0analyses".to_vec()),
                ("chats.db".to_string(), b"SQLite format 3\0chats".to_vec()),
            ],
        )
    }

    #[test]
    fn 束は往復する() {
        let bundle = sample();
        let bytes = encode(&bundle).unwrap();
        let restored = decode(&bytes).unwrap();

        assert_eq!(restored, bundle);
        assert_eq!(restored.version, BUNDLE_VERSION);
        assert_eq!(restored.created_at_ms, 1_700_000_000_000);
    }

    #[test]
    fn 中身がバイト単位で戻る() {
        let bundle = sample();
        let bytes = encode(&bundle).unwrap();
        let restored = decode(&bytes).unwrap();

        let entry = &restored.entries[0];
        assert_eq!(decode_entry(entry).unwrap(), b"SQLite format 3\0analyses");
    }

    #[test]
    fn サイズを記録する() {
        let bundle = sample();
        assert_eq!(bundle.entries[0].size_bytes, 24);
        assert_eq!(bundle.entries[1].size_bytes, 21);
    }

    #[test]
    fn 空のファイルも扱える() {
        let bundle = build(1, "0.1.0", vec![("chats.db".to_string(), Vec::new())]);
        let restored = decode(&encode(&bundle).unwrap()).unwrap();
        assert_eq!(decode_entry(&restored.entries[0]).unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn 壊れた中身は弾く() {
        let mut bundle = sample();
        bundle.entries[0].data = "これは_base64_ではない!!".to_string();
        assert!(decode_entry(&bundle.entries[0]).is_err());
    }

    #[test]
    fn サイズが合わなければ弾く() {
        // 転送中に切れたバックアップを、そのまま上書きしてしまわないように
        let mut bundle = sample();
        bundle.entries[0].size_bytes = 9999;

        let err = decode_entry(&bundle.entries[0]).unwrap_err();
        assert!(format!("{err}").contains("サイズ"));
    }

    #[test]
    fn 束でないデータは弾く() {
        assert!(decode(b"not json at all").is_err());
        assert!(decode(b"{}").is_err());
    }

    #[test]
    fn 中身が空の束は弾く() {
        let bundle = build(1, "0.1.0", vec![]);
        let err = decode(&encode(&bundle).unwrap()).unwrap_err();
        assert!(format!("{err}").contains("復元できるデータがありません"));
    }

    #[test]
    fn 新しい形式は復元せずに知らせる() {
        let mut bundle = sample();
        bundle.version = BUNDLE_VERSION + 1;

        let err = decode(&encode(&bundle).unwrap()).unwrap_err();
        assert!(format!("{err}").contains("アプリを更新"));
    }

    #[test]
    fn 既知のファイル名だけ復元する() {
        assert!(is_allowed_name("analyses.db"));
        assert!(is_allowed_name("chats.db"));
        assert!(is_allowed_name("library.db"));

        // 設定ファイルは束に入れないので復元もしない
        assert!(!is_allowed_name("settings.json"));
    }

    #[test]
    fn パスをまたぐ名前は復元しない() {
        // 束は外から来たデータなので、アプリの外へ書き込ませない
        for name in [
            "../settings.json",
            "..\\settings.json",
            "/etc/passwd",
            "C:\\Windows\\system32\\evil.dll",
            "sub/analyses.db",
            "",
        ] {
            assert!(!is_allowed_name(name), "{name} を通してはいけない");
        }
    }

    #[test]
    fn 復元対象は許可された名前だけになる() {
        let mut bundle = sample();
        bundle.entries.push(BundleEntry {
            name: "../settings.json".to_string(),
            data: STANDARD.encode(b"stolen"),
            size_bytes: 6,
        });

        let targets = restorable(&bundle);
        assert_eq!(targets.len(), 2);
        assert!(targets.iter().all(|e| is_allowed_name(&e.name)));
    }

    #[test]
    fn 退避名は元の名前を残す() {
        let name = rollback_name("analyses.db", 1_700_000_000_000);
        assert_eq!(name, "analyses.db.before-restore-1700000000000");
        // 復元対象として拾われない名前であること
        assert!(!is_allowed_name(&name));
    }

    #[test]
    fn バックアップ対象に設定ファイルを含めない() {
        // APIキーやライセンスキーを外部へ送らないための取り決め
        assert!(!BACKUP_FILES.contains(&"settings.json"));
        assert_eq!(BACKUP_FILES.len(), 3);
    }
}
