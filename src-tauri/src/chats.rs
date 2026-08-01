//! チャット履歴の永続化（SQLite）。
//!
//! 左サイドバーのセッション一覧の実体。`<app_data_dir>/chats.db` に保存する。
//!
//! ```text
//! chat_sessions(id, title, ticker, is_archived, created_at_ms, updated_at_ms)
//! chat_messages(id, session_id, role, content, created_at_ms)
//! ```
//!
//! `is_archived` は後から足した列。既存 DB には `ALTER TABLE` で追加するため、
//! アプリを更新しても過去の会話は失われない（`migrate` のテストを参照）。
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
    /// アーカイブ済みか。削除せずに一覧から退避させるための印。
    pub is_archived: bool,
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
    open_at(&db_path(app)?)
}

/// パスを指定して開く。Tauri なしで単体テストできるよう分けてある。
fn open_at(path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(path)
        .map_err(|e| AppError::msg(format!("チャット履歴データベースを開けません: {e}")))?;
    migrate(&conn)?;
    Ok(conn)
}

/// スキーマを最新にする。既存 DB に対しても安全に呼べる。
pub fn migrate(conn: &Connection) -> Result<()> {
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

    // 後から足した列。すでにあればエラーになるので黙って無視する。
    // 既存行は DEFAULT 0（＝アーカイブしていない）になり、会話は消えない。
    let _ = conn.execute(
        "ALTER TABLE chat_sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0",
        [],
    );

    Ok(())
}

// ---------------------------------------------------------------- セッション

pub fn list_sessions(app: &AppHandle) -> Result<Vec<ChatSession>> {
    list_sessions_in(&open(app)?)
}

fn list_sessions_in(conn: &Connection) -> Result<Vec<ChatSession>> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.ticker, s.is_archived, s.created_at_ms, s.updated_at_ms,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id)
             FROM chat_sessions s
             ORDER BY s.is_archived ASC, s.updated_at_ms DESC",
        )
        .map_err(|e| AppError::msg(format!("履歴を取得できません: {e}")))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                ticker: row.get(2)?,
                is_archived: row.get::<_, i64>(3)? != 0,
                created_at_ms: row.get(4)?,
                updated_at_ms: row.get(5)?,
                message_count: row.get(6)?,
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
    create_session_in(&open(app)?, title, ticker)
}

fn create_session_in(
    conn: &Connection,
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
        is_archived: false,
        message_count: 0,
        created_at_ms: now,
        updated_at_ms: now,
    };

    conn
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
    rename_session_in(&open(app)?, id, title)
}

fn rename_session_in(conn: &Connection, id: &str, title: &str) -> Result<Vec<ChatSession>> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::msg("タイトルを空にはできません。"));
    }

    let changed = conn
        .execute(
            "UPDATE chat_sessions SET title = ?2 WHERE id = ?1",
            params![id, title],
        )
        .map_err(|e| AppError::msg(format!("タイトルを変更できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のチャットが見つかりませんでした。"));
    }
    list_sessions_in(conn)
}

/// アーカイブ状態を切り替える。会話とメッセージは残したまま一覧から退避させる。
pub fn set_archived(app: &AppHandle, id: &str, archived: bool) -> Result<Vec<ChatSession>> {
    set_archived_in(&open(app)?, id, archived)
}

fn set_archived_in(conn: &Connection, id: &str, archived: bool) -> Result<Vec<ChatSession>> {
    let changed = conn
        .execute(
            "UPDATE chat_sessions SET is_archived = ?2 WHERE id = ?1",
            params![id, i64::from(archived)],
        )
        .map_err(|e| AppError::msg(format!("アーカイブ状態を変更できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のチャットが見つかりませんでした。"));
    }
    list_sessions_in(conn)
}

pub fn delete_session(app: &AppHandle, id: &str) -> Result<Vec<ChatSession>> {
    delete_session_in(&open(app)?, id)
}

fn delete_session_in(conn: &Connection, id: &str) -> Result<Vec<ChatSession>> {
    // 外部キーの CASCADE でメッセージも消える
    let changed = conn
        .execute("DELETE FROM chat_sessions WHERE id = ?1", params![id])
        .map_err(|e| AppError::msg(format!("チャットを削除できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のチャットが見つかりませんでした。"));
    }
    list_sessions_in(conn)
}

// ---------------------------------------------------------------- メッセージ

pub fn load_messages(app: &AppHandle, session_id: &str) -> Result<Vec<ChatMessage>> {
    load_messages_in(&open(app)?, session_id)
}

fn load_messages_in(conn: &Connection, session_id: &str) -> Result<Vec<ChatMessage>> {
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
    append_message_in(&open(app)?, session_id, role, content)
}

fn append_message_in(
    conn: &Connection,
    session_id: &str,
    role: &str,
    content: &str,
) -> Result<ChatMessage> {
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
    // 時刻だけだと同一ナノ秒で衝突しうるので連番も足す
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos}-{seq}")
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    /// メモリ上の DB にスキーマを作る。
    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;")
        .unwrap();
        conn
    }

    #[test]
    fn 作成すると一覧に出る() {
        let conn = db();
        let s = create_session_in(&conn, None, Some("AAPL".into())).unwrap();
        assert_eq!(s.title, "新しいチャット");
        assert_eq!(s.ticker.as_deref(), Some("AAPL"));

        let list = list_sessions_in(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].message_count, 0);
    }

    #[test]
    fn 空文字のティッカーは無しとして扱う() {
        let conn = db();
        let s = create_session_in(&conn, None, Some("   ".into())).unwrap();
        assert!(s.ticker.is_none());
    }

    #[test]
    fn 最初のユーザー発言でタイトルが自動命名される() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        append_message_in(&conn, &s.id, "user", "NVDAの決算を要約して").unwrap();

        let list = list_sessions_in(&conn).unwrap();
        assert_eq!(list[0].title, "NVDAの決算を要約して");
        assert_eq!(list[0].message_count, 1);
    }

    #[test]
    fn 長い発言は四十文字で省略される() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        let long = "あ".repeat(100);
        append_message_in(&conn, &s.id, "user", &long).unwrap();

        let title = list_sessions_in(&conn).unwrap()[0].title.clone();
        assert!(title.ends_with('…'), "省略記号が付くはず: {title}");
        assert_eq!(title.chars().count(), 41);
    }

    #[test]
    fn 命名済みのタイトルは上書きされない() {
        let conn = db();
        let s = create_session_in(&conn, Some("既存の名前".into()), None).unwrap();
        append_message_in(&conn, &s.id, "user", "何か質問").unwrap();
        assert_eq!(list_sessions_in(&conn).unwrap()[0].title, "既存の名前");
    }

    #[test]
    fn アシスタント発言では自動命名しない() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        append_message_in(&conn, &s.id, "assistant", "こんにちは").unwrap();
        assert_eq!(list_sessions_in(&conn).unwrap()[0].title, "新しいチャット");
    }

    #[test]
    fn メッセージは投入順に復元される() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        for (role, text) in [("user", "質問1"), ("assistant", "回答1"), ("user", "質問2")] {
            append_message_in(&conn, &s.id, role, text).unwrap();
        }
        let msgs = load_messages_in(&conn, &s.id).unwrap();
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[2].content, "質問2");
    }

    #[test]
    fn 削除するとメッセージも消える() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        append_message_in(&conn, &s.id, "user", "質問").unwrap();

        let left = delete_session_in(&conn, &s.id).unwrap();
        assert!(left.is_empty());

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_messages", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0, "CASCADE でメッセージも消えるはず");
    }

    #[test]
    fn リネームできる() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        let list = rename_session_in(&conn, &s.id, "  新しい名前  ").unwrap();
        assert_eq!(list[0].title, "新しい名前", "前後の空白は落とす");
    }

    // --- エッジケース ---

    #[test]
    fn 空のタイトルへのリネームは拒否される() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        assert!(rename_session_in(&conn, &s.id, "   ").is_err());
    }

    #[test]
    fn 存在しないセッションの操作はエラーになる() {
        let conn = db();
        assert!(rename_session_in(&conn, "missing", "x").is_err());
        assert!(delete_session_in(&conn, "missing").is_err());
        assert!(append_message_in(&conn, "missing", "user", "x").is_err());
    }

    #[test]
    fn 存在しないセッションのメッセージ読み出しは空になる() {
        let conn = db();
        assert!(load_messages_in(&conn, "missing").unwrap().is_empty());
    }

    #[test]
    fn 一覧は更新の新しい順に並ぶ() {
        let conn = db();
        let a = create_session_in(&conn, Some("A".into()), None).unwrap();
        let b = create_session_in(&conn, Some("B".into()), None).unwrap();
        // A を更新して先頭に来ることを確かめる
        conn.execute(
            "UPDATE chat_sessions SET updated_at_ms = ?2 WHERE id = ?1",
            params![a.id, i64::MAX],
        )
        .unwrap();

        let list = list_sessions_in(&conn).unwrap();
        assert_eq!(list[0].id, a.id);
        assert_eq!(list[1].id, b.id);
    }

    #[test]
    fn 改行や空行だけの発言でも命名で落ちない() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        append_message_in(&conn, &s.id, "user", "\n\n  \n").unwrap();
        let title = list_sessions_in(&conn).unwrap()[0].title.clone();
        assert_eq!(title, "新しいチャット");
    }

    // ------------------------------------------------ アーカイブ

    #[test]
    fn アーカイブしても会話とメッセージは残る() {
        let conn = db();
        let s = create_session_in(&conn, Some("決算メモ".into()), None).unwrap();
        append_message_in(&conn, &s.id, "user", "AAPL の粗利率は？").unwrap();

        let list = set_archived_in(&conn, &s.id, true).unwrap();
        let target = list.iter().find(|x| x.id == s.id).unwrap();
        assert!(target.is_archived);
        assert_eq!(target.message_count, 1, "メッセージは消えない");
        assert_eq!(target.title, "決算メモ");
        assert_eq!(load_messages_in(&conn, &s.id).unwrap().len(), 1);
    }

    #[test]
    fn アーカイブから復元できる() {
        let conn = db();
        let s = create_session_in(&conn, None, None).unwrap();
        set_archived_in(&conn, &s.id, true).unwrap();

        let list = set_archived_in(&conn, &s.id, false).unwrap();
        assert!(!list.iter().find(|x| x.id == s.id).unwrap().is_archived);
    }

    #[test]
    fn アーカイブ済みは一覧の後ろに回る() {
        let conn = db();
        let older = create_session_in(&conn, Some("古い".into()), None).unwrap();
        let newer = create_session_in(&conn, Some("新しい".into()), None).unwrap();
        // 「古い」を最新に更新したうえでアーカイブする
        conn.execute(
            "UPDATE chat_sessions SET updated_at_ms = ?2 WHERE id = ?1",
            params![older.id, i64::MAX],
        )
        .unwrap();

        let list = set_archived_in(&conn, &older.id, true).unwrap();
        assert_eq!(list[0].id, newer.id, "更新が新しくてもアーカイブは後ろ");
        assert_eq!(list[1].id, older.id);
    }

    #[test]
    fn 存在しないセッションのアーカイブはエラーになる() {
        assert!(set_archived_in(&db(), "chat-none", true).is_err());
    }

    // ------------------------------------------------ マイグレーション

    /// `is_archived` を持たない旧スキーマ。アプリ更新前の DB を再現する。
    fn legacy_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE chat_sessions (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, ticker TEXT,
                created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL);
             CREATE TABLE chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                role TEXT NOT NULL, content TEXT NOT NULL, created_at_ms INTEGER NOT NULL);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chat_sessions (id, title, ticker, created_at_ms, updated_at_ms)
             VALUES ('old-1', '過去の会話', 'AAPL', 100, 200)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chat_messages (id, session_id, role, content, created_at_ms)
             VALUES ('old-msg-1', 'old-1', 'user', '過去の質問', 150)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn 旧_db_に列を足しても既存の会話が壊れない() {
        let conn = legacy_db();
        migrate(&conn).unwrap();

        let list = list_sessions_in(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "old-1");
        assert_eq!(list[0].title, "過去の会話");
        assert_eq!(list[0].ticker.as_deref(), Some("AAPL"));
        assert_eq!(list[0].message_count, 1);
        assert!(!list[0].is_archived, "既存行は未アーカイブ扱いになる");

        let messages = load_messages_in(&conn, "old-1").unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "過去の質問");
    }

    #[test]
    fn マイグレーションを何度実行しても既存データは変わらない() {
        let conn = legacy_db();
        migrate(&conn).unwrap();
        set_archived_in(&conn, "old-1", true).unwrap();

        // 再起動を 2 回ぶん
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();

        let list = list_sessions_in(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].is_archived, "アーカイブ状態が初期化されない");
        assert_eq!(load_messages_in(&conn, "old-1").unwrap().len(), 1);
    }
}
