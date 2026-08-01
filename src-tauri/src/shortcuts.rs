//! ショートカットキーの割り当て（SQLite）。
//!
//! `<app_data_dir>/library.db` の `shortcuts` テーブルに保存する。
//!
//! ```text
//! shortcuts(action, binding)
//! ```
//!
//! **既定値は保存しない。ユーザーが変更した割り当てだけを持つ。**
//! アクションの一覧と既定キーはフロント側（`src/lib/ui/shortcuts.ts`）が持っており、
//! ここに既定値を二重で書くと、既定を変えたときに古い値が残ってしまうため。

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::AppHandle;

use crate::error::{AppError, Result};
use crate::library::open_library;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutOverride {
    /// アクション ID（例: `chat.new`）
    pub action: String,
    /// 例: `Ctrl+N`。空文字なら「割り当てなし」
    pub binding: String,
}

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS shortcuts (
            action  TEXT PRIMARY KEY,
            binding TEXT NOT NULL
         );",
    )
    .map_err(|e| AppError::msg(format!("ショートカットテーブルを作成できません: {e}")))?;
    Ok(())
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = open_library(app)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn list(app: &AppHandle) -> Result<Vec<ShortcutOverride>> {
    list_in(&open(app)?)
}

pub fn list_in(conn: &Connection) -> Result<Vec<ShortcutOverride>> {
    let mut stmt = conn
        .prepare("SELECT action, binding FROM shortcuts ORDER BY action ASC")
        .map_err(|e| AppError::msg(format!("ショートカットを取得できません: {e}")))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ShortcutOverride {
                action: row.get(0)?,
                binding: row.get(1)?,
            })
        })
        .map_err(|e| AppError::msg(format!("ショートカットを取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// 1 件を設定する。`binding` が None なら既定へ戻す（行を消す）。
pub fn set(
    app: &AppHandle,
    action: &str,
    binding: Option<String>,
) -> Result<Vec<ShortcutOverride>> {
    set_in(&open(app)?, action, binding)
}

pub fn set_in(
    conn: &Connection,
    action: &str,
    binding: Option<String>,
) -> Result<Vec<ShortcutOverride>> {
    let action = action.trim();
    if action.is_empty() {
        return Err(AppError::msg("アクションを指定してください。"));
    }

    match binding {
        Some(binding) => {
            conn.execute(
                "INSERT INTO shortcuts (action, binding) VALUES (?1, ?2)
                 ON CONFLICT(action) DO UPDATE SET binding = ?2",
                params![action, binding.trim()],
            )
            .map_err(|e| AppError::msg(format!("ショートカットを保存できません: {e}")))?;
        }
        None => {
            conn.execute("DELETE FROM shortcuts WHERE action = ?1", params![action])
                .map_err(|e| AppError::msg(format!("ショートカットを戻せません: {e}")))?;
        }
    }

    list_in(conn)
}

/// すべて既定へ戻す。
pub fn reset(app: &AppHandle) -> Result<Vec<ShortcutOverride>> {
    reset_in(&open(app)?)
}

pub fn reset_in(conn: &Connection) -> Result<Vec<ShortcutOverride>> {
    conn.execute("DELETE FROM shortcuts", [])
        .map_err(|e| AppError::msg(format!("ショートカットを戻せません: {e}")))?;
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

    #[test]
    fn 既定のままなら何も保存されない() {
        assert!(list_in(&db()).unwrap().is_empty());
    }

    #[test]
    fn 割り当てを保存して読み出せる() {
        let conn = db();
        let list = set_in(&conn, "chat.new", Some("Ctrl+Alt+N".into())).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].action, "chat.new");
        assert_eq!(list[0].binding, "Ctrl+Alt+N");
    }

    #[test]
    fn 同じアクションは上書きされる() {
        let conn = db();
        set_in(&conn, "chat.new", Some("Ctrl+N".into())).unwrap();
        let list = set_in(&conn, "chat.new", Some("F2".into())).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].binding, "F2");
    }

    #[test]
    fn 割り当てなしも保存できる() {
        let conn = db();
        let list = set_in(&conn, "chat.new", Some("".into())).unwrap();
        assert_eq!(list[0].binding, "");
    }

    #[test]
    fn None_を渡すと既定へ戻る() {
        let conn = db();
        set_in(&conn, "chat.new", Some("F2".into())).unwrap();
        assert!(set_in(&conn, "chat.new", None).unwrap().is_empty());
    }

    #[test]
    fn 空のアクションは拒否される() {
        assert!(set_in(&db(), "  ", Some("F2".into())).is_err());
    }

    #[test]
    fn 一括リセットできる() {
        let conn = db();
        set_in(&conn, "chat.new", Some("F2".into())).unwrap();
        set_in(&conn, "candidates.add", Some("F3".into())).unwrap();
        assert!(reset_in(&conn).unwrap().is_empty());
    }

    #[test]
    fn 他のテーブルと同居しても互いを壊さない() {
        use crate::{candidates, personas};

        let conn = Connection::open_in_memory().unwrap();
        candidates::migrate(&conn).unwrap();
        personas::migrate(&conn).unwrap();
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
        set_in(&conn, "chat.new", Some("F2".into())).unwrap();

        assert_eq!(candidates::list_in(&conn).unwrap().len(), 1);
        assert_eq!(personas::list_in(&conn).unwrap().len(), 3);
        assert_eq!(list_in(&conn).unwrap().len(), 1);
    }
}
