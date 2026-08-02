//! `library.db`（検討中銘柄・プロンプトライブラリ）の共通土台。
//!
//! 分析結果（`analyses.db`）やチャット履歴（`chats.db`）とは
//! **別ファイル**に置く。新機能のテーブルを増やしても、
//! 既存の投資データが入った DB を触らずに済むようにするため。

use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{code, AppError, Result};

pub fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::detail(code::DATA_DIR, e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("library.db"))
}

pub fn open_library(app: &AppHandle) -> Result<Connection> {
    Connection::open(db_path(app)?)
        .map_err(|e| AppError::detail(code::DB_OPEN, e.to_string()))
}

/// 衝突しない ID を作る。時刻だけだと同一ナノ秒で重なるので連番も足す。
pub fn new_id(prefix: &str) -> String {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos}-{seq}")
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
