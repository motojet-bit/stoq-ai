//! 検討中銘柄（ウォッチリスト）の永続化（SQLite）。
//!
//! `<app_data_dir>/library.db` に保存する。分析結果（`analyses.db`）や
//! チャット履歴（`chats.db`）とはファイルを分けているので、
//! このテーブルを作り直しても既存データには一切影響しない。
//!
//! ```text
//! candidate_stocks(id, ticker, name, genre, created_at_ms)
//! ```
//!
//! ティッカーは大文字小文字を区別せず一意。同じ銘柄を再投入したときは
//! 社名・ジャンルを上書きする（貼り直しで最新に揃えられるようにするため）。

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{AppError, Result};
use crate::library::{new_id, now_ms, open_library};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateStock {
    pub id: String,
    pub ticker: String,
    pub name: String,
    pub genre: String,
    pub created_at_ms: i64,
}

/// フロントから受け取る 1 行分。パース済みの状態で渡ってくる。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateInput {
    pub ticker: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub genre: String,
}

/// テーブルを用意する。すでにあれば何もしない。
pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS candidate_stocks (
            id            TEXT PRIMARY KEY,
            ticker        TEXT NOT NULL COLLATE NOCASE,
            name          TEXT NOT NULL DEFAULT '',
            genre         TEXT NOT NULL DEFAULT '',
            created_at_ms INTEGER NOT NULL
         );
         CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_ticker
            ON candidate_stocks(ticker COLLATE NOCASE);",
    )
    .map_err(|e| AppError::msg(format!("検討中銘柄テーブルを作成できません: {e}")))?;
    Ok(())
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = open_library(app)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn list(app: &AppHandle) -> Result<Vec<CandidateStock>> {
    list_in(&open(app)?)
}

pub fn list_in(conn: &Connection) -> Result<Vec<CandidateStock>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, ticker, name, genre, created_at_ms
             FROM candidate_stocks ORDER BY created_at_ms DESC, ticker ASC",
        )
        .map_err(|e| AppError::msg(format!("検討中銘柄を取得できません: {e}")))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CandidateStock {
                id: row.get(0)?,
                ticker: row.get(1)?,
                name: row.get(2)?,
                genre: row.get(3)?,
                created_at_ms: row.get(4)?,
            })
        })
        .map_err(|e| AppError::msg(format!("検討中銘柄を取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// まとめて追加する。既存のティッカーは社名・ジャンルを更新する。
pub fn add_many(app: &AppHandle, items: Vec<CandidateInput>) -> Result<Vec<CandidateStock>> {
    add_many_in(&open(app)?, items)
}

pub fn add_many_in(
    conn: &Connection,
    items: Vec<CandidateInput>,
) -> Result<Vec<CandidateStock>> {
    for item in items {
        let ticker = item.ticker.trim().to_uppercase();
        if ticker.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT INTO candidate_stocks (id, ticker, name, genre, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(ticker) DO UPDATE SET name = ?3, genre = ?4",
            params![
                new_id("cand"),
                ticker,
                item.name.trim(),
                item.genre.trim(),
                now_ms()
            ],
        )
        .map_err(|e| AppError::msg(format!("検討中銘柄を保存できません: {e}")))?;
    }
    list_in(conn)
}

/// 1 件削除する（✕ ボタン / 右クリックメニューの「削除」）。
pub fn remove(app: &AppHandle, id: &str) -> Result<Vec<CandidateStock>> {
    remove_in(&open(app)?, id)
}

pub fn remove_in(conn: &Connection, id: &str) -> Result<Vec<CandidateStock>> {
    let changed = conn
        .execute("DELETE FROM candidate_stocks WHERE id = ?1", params![id])
        .map_err(|e| AppError::msg(format!("検討中銘柄を削除できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象の銘柄が見つかりませんでした。"));
    }
    list_in(conn)
}

/// 全件削除する。
pub fn clear(app: &AppHandle) -> Result<Vec<CandidateStock>> {
    clear_in(&open(app)?)
}

pub fn clear_in(conn: &Connection) -> Result<Vec<CandidateStock>> {
    conn.execute("DELETE FROM candidate_stocks", [])
        .map_err(|e| AppError::msg(format!("検討中銘柄を削除できません: {e}")))?;
    list_in(conn)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn input(ticker: &str, name: &str, genre: &str) -> CandidateInput {
        CandidateInput {
            ticker: ticker.to_string(),
            name: name.to_string(),
            genre: genre.to_string(),
        }
    }

    #[test]
    fn 一括追加して一覧できる() {
        let conn = db();
        let list = add_many_in(
            &conn,
            vec![input("AAPL", "Apple", "Phone"), input("NVDA", "NVIDIA", "AI Chip")],
        )
        .unwrap();

        assert_eq!(list.len(), 2);
        assert!(list.iter().any(|c| c.ticker == "AAPL" && c.genre == "Phone"));
        assert!(list.iter().any(|c| c.ticker == "NVDA" && c.name == "NVIDIA"));
    }

    #[test]
    fn ティッカーは大文字に揃えられ前後の空白も落ちる() {
        let conn = db();
        let list = add_many_in(&conn, vec![input("  nvda ", " NVIDIA ", " AI Chip ")]).unwrap();
        assert_eq!(list[0].ticker, "NVDA");
        assert_eq!(list[0].name, "NVIDIA");
        assert_eq!(list[0].genre, "AI Chip");
    }

    #[test]
    fn 同じ銘柄を再投入すると重複せず上書きされる() {
        let conn = db();
        add_many_in(&conn, vec![input("AAPL", "Apple", "Phone")]).unwrap();
        let list = add_many_in(&conn, vec![input("aapl", "Apple Inc.", "Consumer")]).unwrap();

        assert_eq!(list.len(), 1, "大文字小文字違いでも 1 件のまま");
        assert_eq!(list[0].name, "Apple Inc.");
        assert_eq!(list[0].genre, "Consumer");
    }

    #[test]
    fn 空のティッカーは無視される() {
        let conn = db();
        let list = add_many_in(&conn, vec![input("   ", "", ""), input("MSFT", "", "")]).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].ticker, "MSFT");
    }

    #[test]
    fn 一件削除できる() {
        let conn = db();
        let list = add_many_in(
            &conn,
            vec![input("AAPL", "Apple", ""), input("NVDA", "NVIDIA", "")],
        )
        .unwrap();
        let target = list.iter().find(|c| c.ticker == "AAPL").unwrap().clone();

        let after = remove_in(&conn, &target.id).unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].ticker, "NVDA");
    }

    #[test]
    fn 存在しない銘柄の削除はエラーになる() {
        let conn = db();
        assert!(remove_in(&conn, "cand-none").is_err());
    }

    #[test]
    fn 全件削除できる() {
        let conn = db();
        add_many_in(&conn, vec![input("AAPL", "", ""), input("NVDA", "", "")]).unwrap();
        assert!(clear_in(&conn).unwrap().is_empty());
    }

    #[test]
    fn マイグレーションは何度実行しても既存データを壊さない() {
        let conn = db();
        add_many_in(&conn, vec![input("AAPL", "Apple", "Phone")]).unwrap();

        migrate(&conn).unwrap();
        migrate(&conn).unwrap();

        let list = list_in(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Apple");
    }
}
