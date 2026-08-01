//! ポートフォリオ（銘柄リスト／フォルダ）の永続化。
//!
//! `<app_data_dir>/library.db` に置く。
//!
//! ```text
//! portfolios(id, name, sort_order, created_at_ms, updated_at_ms)
//! portfolio_tickers(portfolio_id, ticker, added_at_ms)
//! ```
//!
//! リストを削除すると所属銘柄も一緒に消える（ON DELETE CASCADE）。
//! **銘柄そのもの（`candidate_stocks`）や分析結果には触れない。**
//! リストは「見方の整理」であって、データの持ち主ではないため。

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;

use crate::error::{AppError, Result};
use crate::library::{new_id, now_ms, open_library};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Portfolio {
    pub id: String,
    pub name: String,
    /// 所属銘柄（追加順）
    pub tickers: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

/// 初回だけ作る既定のリスト。空の画面から始めさせない。
const DEFAULT_NAME: &str = "メインポートフォリオ";

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS portfolios (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS portfolio_tickers (
            portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
            ticker       TEXT NOT NULL COLLATE NOCASE,
            added_at_ms  INTEGER NOT NULL,
            PRIMARY KEY (portfolio_id, ticker)
         );
         CREATE TABLE IF NOT EXISTS portfolio_seed (
            key        TEXT PRIMARY KEY,
            done_at_ms INTEGER NOT NULL
         );",
    )
    .map_err(|e| AppError::msg(format!("ポートフォリオテーブルを作成できません: {e}")))?;

    seed_default(conn)
}

/// 既定のリストを一度だけ作る。**消したら復活させない**（印を残す）。
fn seed_default(conn: &Connection) -> Result<()> {
    let seeded: Option<i64> = conn
        .query_row(
            "SELECT done_at_ms FROM portfolio_seed WHERE key = 'default'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::msg(format!("初期化状態を確認できません: {e}")))?;

    if seeded.is_some() {
        return Ok(());
    }

    let now = now_ms();
    conn.execute(
        "INSERT INTO portfolios (id, name, sort_order, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, 0, ?3, ?3)",
        params![new_id("pf"), DEFAULT_NAME, now],
    )
    .map_err(|e| AppError::msg(format!("既定のリストを作成できません: {e}")))?;

    conn.execute(
        "INSERT INTO portfolio_seed (key, done_at_ms) VALUES ('default', ?1)",
        params![now],
    )
    .map_err(|e| AppError::msg(format!("初期化を記録できません: {e}")))?;

    Ok(())
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = open_library(app)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;").ok();
    migrate(&conn)?;
    Ok(conn)
}

pub fn list(app: &AppHandle) -> Result<Vec<Portfolio>> {
    list_in(&open(app)?)
}

pub fn list_in(conn: &Connection) -> Result<Vec<Portfolio>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, created_at_ms, updated_at_ms
             FROM portfolios ORDER BY sort_order ASC, created_at_ms ASC",
        )
        .map_err(|e| AppError::msg(format!("リストを取得できません: {e}")))?;

    let rows: Vec<(String, String, i64, i64)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| AppError::msg(format!("リストを取得できません: {e}")))?
        .filter_map(std::result::Result::ok)
        .collect();

    let mut result = Vec::with_capacity(rows.len());
    for (id, name, created_at_ms, updated_at_ms) in rows {
        result.push(Portfolio {
            tickers: tickers_of(conn, &id)?,
            id,
            name,
            created_at_ms,
            updated_at_ms,
        });
    }
    Ok(result)
}

fn tickers_of(conn: &Connection, portfolio_id: &str) -> Result<Vec<String>> {
    // 同じミリ秒に続けて追加されても挿入順が崩れないよう rowid を第 2 キーにする
    let mut stmt = conn
        .prepare(
            "SELECT ticker FROM portfolio_tickers
             WHERE portfolio_id = ?1 ORDER BY added_at_ms ASC, rowid ASC",
        )
        .map_err(|e| AppError::msg(format!("銘柄を取得できません: {e}")))?;

    let rows = stmt
        .query_map(params![portfolio_id], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::msg(format!("銘柄を取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

pub fn create(app: &AppHandle, name: Option<String>) -> Result<Vec<Portfolio>> {
    create_in(&open(app)?, name.as_deref())
}

pub fn create_in(conn: &Connection, name: Option<&str>) -> Result<Vec<Portfolio>> {
    let name = name.map(str::trim).filter(|n| !n.is_empty()).unwrap_or("新しいリスト");
    let now = now_ms();

    // 末尾に置く
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM portfolios",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO portfolios (id, name, sort_order, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![new_id("pf"), name, next_order, now],
    )
    .map_err(|e| AppError::msg(format!("リストを作成できません: {e}")))?;

    list_in(conn)
}

pub fn rename(app: &AppHandle, id: &str, name: &str) -> Result<Vec<Portfolio>> {
    rename_in(&open(app)?, id, name)
}

pub fn rename_in(conn: &Connection, id: &str, name: &str) -> Result<Vec<Portfolio>> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("リスト名を空にはできません。"));
    }

    let changed = conn
        .execute(
            "UPDATE portfolios SET name = ?2, updated_at_ms = ?3 WHERE id = ?1",
            params![id, name, now_ms()],
        )
        .map_err(|e| AppError::msg(format!("リスト名を変更できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のリストが見つかりませんでした。"));
    }
    list_in(conn)
}

pub fn remove(app: &AppHandle, id: &str) -> Result<Vec<Portfolio>> {
    remove_in(&open(app)?, id)
}

pub fn remove_in(conn: &Connection, id: &str) -> Result<Vec<Portfolio>> {
    // 外部キーの CASCADE で所属銘柄も消える
    let changed = conn
        .execute("DELETE FROM portfolios WHERE id = ?1", params![id])
        .map_err(|e| AppError::msg(format!("リストを削除できません: {e}")))?;

    if changed == 0 {
        return Err(AppError::msg("対象のリストが見つかりませんでした。"));
    }
    list_in(conn)
}

pub fn add_ticker(app: &AppHandle, id: &str, ticker: &str) -> Result<Vec<Portfolio>> {
    add_ticker_in(&open(app)?, id, ticker)
}

pub fn add_ticker_in(conn: &Connection, id: &str, ticker: &str) -> Result<Vec<Portfolio>> {
    let ticker = ticker.trim().to_uppercase();
    if ticker.is_empty() {
        return Err(AppError::msg("ティッカーが空です。"));
    }

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM portfolios WHERE id = ?1",
            params![id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| AppError::msg(format!("リストを確認できません: {e}")))?
        .unwrap_or(false);
    if !exists {
        return Err(AppError::msg("対象のリストが見つかりませんでした。"));
    }

    // すでに入っていれば何もしない（重複追加でエラーにしない）
    conn.execute(
        "INSERT INTO portfolio_tickers (portfolio_id, ticker, added_at_ms)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(portfolio_id, ticker) DO NOTHING",
        params![id, ticker, now_ms()],
    )
    .map_err(|e| AppError::msg(format!("銘柄を追加できません: {e}")))?;

    list_in(conn)
}

pub fn remove_ticker(app: &AppHandle, id: &str, ticker: &str) -> Result<Vec<Portfolio>> {
    remove_ticker_in(&open(app)?, id, ticker)
}

pub fn remove_ticker_in(
    conn: &Connection,
    id: &str,
    ticker: &str,
) -> Result<Vec<Portfolio>> {
    conn.execute(
        "DELETE FROM portfolio_tickers WHERE portfolio_id = ?1 AND ticker = ?2",
        params![id, ticker.trim().to_uppercase()],
    )
    .map_err(|e| AppError::msg(format!("銘柄を外せません: {e}")))?;

    list_in(conn)
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn 初回は既定のリストが一つできる() {
        let list = list_in(&db()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, DEFAULT_NAME);
        assert!(list[0].tickers.is_empty());
    }

    #[test]
    fn 既定のリストは二度作られない() {
        let conn = db();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        assert_eq!(list_in(&conn).unwrap().len(), 1);
    }

    #[test]
    fn 消した既定リストは再起動で復活しない() {
        let conn = db();
        let first = list_in(&conn).unwrap()[0].clone();
        remove_in(&conn, &first.id).unwrap();

        migrate(&conn).unwrap(); // 再起動相当
        assert!(list_in(&conn).unwrap().is_empty());
    }

    #[test]
    fn リストを作成できる() {
        let conn = db();
        let list = create_in(&conn, Some(" AI関連 ")).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[1].name, "AI関連", "前後の空白は落とす");
    }

    #[test]
    fn 名前を省略すると既定名になる() {
        let conn = db();
        let list = create_in(&conn, None).unwrap();
        assert_eq!(list[1].name, "新しいリスト");
        assert_eq!(create_in(&conn, Some("   ")).unwrap()[2].name, "新しいリスト");
    }

    #[test]
    fn 作成順に並ぶ() {
        let conn = db();
        create_in(&conn, Some("監視中")).unwrap();
        let list = create_in(&conn, Some("AI関連")).unwrap();
        assert_eq!(
            list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(),
            vec![DEFAULT_NAME, "監視中", "AI関連"]
        );
    }

    #[test]
    fn リネームできる() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        let list = rename_in(&conn, &id, " 長期保有 ").unwrap();
        assert_eq!(list[0].name, "長期保有");
    }

    #[test]
    fn 空の名前へのリネームは拒否される() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        assert!(rename_in(&conn, &id, "   ").is_err());
    }

    #[test]
    fn 存在しないリストのリネームと削除はエラーになる() {
        let conn = db();
        assert!(rename_in(&conn, "pf-none", "x").is_err());
        assert!(remove_in(&conn, "pf-none").is_err());
    }

    #[test]
    fn 銘柄を追加して一覧に出る() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        add_ticker_in(&conn, &id, " nvda ").unwrap();
        let list = add_ticker_in(&conn, &id, "AAPL").unwrap();

        assert_eq!(list[0].tickers, vec!["NVDA", "AAPL"], "大文字化・追加順");
    }

    #[test]
    fn 同じ銘柄を二度追加しても重複しない() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        add_ticker_in(&conn, &id, "AAPL").unwrap();
        let list = add_ticker_in(&conn, &id, "aapl").unwrap();
        assert_eq!(list[0].tickers, vec!["AAPL"]);
    }

    #[test]
    fn 空のティッカーと存在しないリストは拒否される() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        assert!(add_ticker_in(&conn, &id, "  ").is_err());
        assert!(add_ticker_in(&conn, "pf-none", "AAPL").is_err());
    }

    #[test]
    fn 銘柄を外せる() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        add_ticker_in(&conn, &id, "AAPL").unwrap();
        add_ticker_in(&conn, &id, "NVDA").unwrap();

        let list = remove_ticker_in(&conn, &id, "aapl").unwrap();
        assert_eq!(list[0].tickers, vec!["NVDA"]);
    }

    #[test]
    fn リストを消すと所属銘柄も消える() {
        let conn = db();
        let id = list_in(&conn).unwrap()[0].id.clone();
        add_ticker_in(&conn, &id, "AAPL").unwrap();
        remove_in(&conn, &id).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM portfolio_tickers", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn 同じ銘柄を複数のリストに入れられる() {
        let conn = db();
        let a = list_in(&conn).unwrap()[0].id.clone();
        let list = create_in(&conn, Some("監視中")).unwrap();
        let b = list[1].id.clone();

        add_ticker_in(&conn, &a, "AAPL").unwrap();
        let after = add_ticker_in(&conn, &b, "AAPL").unwrap();

        assert_eq!(after[0].tickers, vec!["AAPL"]);
        assert_eq!(after[1].tickers, vec!["AAPL"]);
    }

    #[test]
    fn 他のテーブルと同居しても互いを壊さない() {
        use crate::{candidates, personas, shortcuts};

        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        candidates::migrate(&conn).unwrap();
        personas::migrate(&conn).unwrap();
        shortcuts::migrate(&conn).unwrap();
        candidates::add_many_in(
            &conn,
            vec![candidates::CandidateInput {
                ticker: "AAPL".into(),
                name: "Apple".into(),
                genre: "Phone".into(),
            }],
        )
        .unwrap();

        migrate(&conn).unwrap();
        let id = list_in(&conn).unwrap()[0].id.clone();
        add_ticker_in(&conn, &id, "AAPL").unwrap();

        assert_eq!(candidates::list_in(&conn).unwrap().len(), 1);
        assert_eq!(personas::list_in(&conn).unwrap().len(), 3);
        assert_eq!(list_in(&conn).unwrap()[0].tickers, vec!["AAPL"]);
    }
}
