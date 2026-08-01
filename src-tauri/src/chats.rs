//! チャット履歴の永続化（SQLite）。
//!
//! 左サイドバーのセッション一覧の実体。`<app_data_dir>/chats.db` に保存する。
//!
//! ```text
//! chat_sessions(id, title, ticker, created_at_ms, updated_at_ms)
//! chat_messages(id, session_id, role, content, created_at_ms)
//! ```
//!
//! セッションを削除するとメッセージも一緒に消える（ON DELETE CASCADE）。

use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    /// 紐づく銘柄（あれば）
    pub ticker: Option<String>,
    pub message_count: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    /// "user" | "assistant"
    pub role: String,
    pub content: String,
    pub created_at_ms: i64,
}

fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(format!("データディレクトリを取得できません: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("chats.db"))
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = Connection::open(db_path(app)?)
        .map_err(|e| AppError::msg(format!("チャット履歴データベースを開けません: {e}")))?;

    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS chat_sessions (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL,
            ticker        TEXT,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS chat_messages (
            id            TEXT PRIMARY KEY,
            session_id    TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role          TEXT NOT NULL,
            content       TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_messages_session
            ON chat_messages(session_id, created_at_ms);",
    )
    .map_err(|e| AppError::msg(format!("チャット履歴テーブルを作成できません: {e}")))?;

    Ok(conn)
}

// ---------------------------------------------------------------- セッション

pub fn list_sessions(app: &AppHandle) -> Result<Vec<ChatSession>> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.ticker, s.created_at_ms, s.updated_at_ms,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id)
             FROM chat_sessions s
             ORDER BY s.updated_at_ms DESC",
        )
        .map_err(|e| AppError::msg(format!("履歴を取得できません: {e}")))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                ticker: row.get(2)?,
                created_at_ms: row.get(3)?,
                updated_at_ms: row.get(4)?,
                message_count: row.get(5)?,
            })
        })
        .map_err(|e| AppError::msg(format!("履歴を取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

pub fn create_session(
    app: &AppHandle,
    title: Option<String>,
    ticker: Option<String>,
) -> Result<ChatSession> {
    let now = now_ms();
    let session = ChatSession {
        id: new_id("chat"),
        title: title
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "新しいチャット".to_string()),
        ticker: ticker.filter(|t| !t.trim().is_empty()),
        message_count: 0,
        created_at_ms: now,
        updated_at_ms: now,
    };

    open(app)?
        .execute(
            "INSERT INTO chat_sessions (id, title, ticker, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                session.id,
                session.title,
                session.ticker,
                session.created_at_ms,
                session.updated_at_ms
            ],
        )
        .map_err(|e| AppError::msg(format!("チャットを作成できません: {e}")))?;

    Ok(session)
}

pub fn rename_session(app: &AppHandle, id: &str, title: &str) -> Result<Vec<ChatSession>> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::msg("タイトルを空にはできません。"));
    }

    let changed = open(app)?
        .execute(
            "UPDATE chat_sessions SET title = ?2 WHERE id = ?1",
            params![id, title],
        )
        .map_err(|e| AppError::msg(format!("タイトルを変更できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のチャットが見つかりませんでした。"));
    }
    list_sessions(app)
}

pub fn delete_session(app: &AppHandle, id: &str) -> Result<Vec<ChatSession>> {
    let conn = open(app)?;
    // 外部キーの CASCADE でメッセージも消える
    let changed = conn
        .execute("DELETE FROM chat_sessions WHERE id = ?1", params![id])
        .map_err(|e| AppError::msg(format!("チャットを削除できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のチャットが見つかりませんでした。"));
    }
    list_sessions(app)
}

// ---------------------------------------------------------------- メッセージ

pub fn load_messages(app: &AppHandle, session_id: &str) -> Result<Vec<ChatMessage>> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content, created_at_ms
             FROM chat_messages WHERE session_id = ?1 ORDER BY created_at_ms ASC",
        )
        .map_err(|e| AppError::msg(format!("メッセージを取得できません: {e}")))?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at_ms: row.get(3)?,
            })
        })
        .map_err(|e| AppError::msg(format!("メッセージを取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// メッセージを 1 件追記し、セッションの更新時刻を進める。
///
/// 最初のユーザー発言はタイトルの自動命名にも使う（未命名のときだけ）。
pub fn append_message(
    app: &AppHandle,
    session_id: &str,
    role: &str,
    content: &str,
) -> Result<ChatMessage> {
    let conn = open(app)?;
    let now = now_ms();

    let exists: Option<String> = conn
        .query_row(
            "SELECT title FROM chat_sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::msg(format!("チャットを参照できません: {e}")))?;

    let Some(title) = exists else {
        return Err(AppError::msg("対象のチャットが見つかりませんでした。"));
    };

    let message = ChatMessage {
        id: new_id("msg"),
        role: role.to_string(),
        content: content.to_string(),
        created_at_ms: now,
    };

    conn.execute(
        "INSERT INTO chat_messages (id, session_id, role, content, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![message.id, session_id, message.role, message.content, now],
    )
    .map_err(|e| AppError::msg(format!("メッセージを保存できません: {e}")))?;

    // 未命名のセッションは、最初のユーザー発言から自動で名前をつける
    let auto_title = (title == "新しいチャット" && role == "user").then(|| summarize(content));

    match auto_title {
        Some(t) => conn.execute(
            "UPDATE chat_sessions SET updated_at_ms = ?2, title = ?3 WHERE id = ?1",
            params![session_id, now, t],
        ),
        None => conn.execute(
            "UPDATE chat_sessions SET updated_at_ms = ?2 WHERE id = ?1",
            params![session_id, now],
        ),
    }
    .map_err(|e| AppError::msg(format!("チャットを更新できません: {e}")))?;

    Ok(message)
}

/// 本文の先頭からタイトルを作る。
fn summarize(content: &str) -> String {
    let line = content.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
    let trimmed: String = line.trim().chars().take(40).collect();
    if trimmed.is_empty() {
        "新しいチャット".to_string()
    } else if line.trim().chars().count() > 40 {
        format!("{trimmed}…")
    } else {
        trimmed
    }
}

fn new_id(prefix: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos}")
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
