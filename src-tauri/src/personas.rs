//! AI の役割設定（システムプロンプト）ライブラリ。
//!
//! 「プロの株式ジャーナリスト」「高成長・グロース株アナリスト」のような役割を
//! ストックしておき、対話パネルからワンタップで切り替える。
//! `<app_data_dir>/library.db` の `prompts` テーブルに保存する。
//!
//! ```text
//! prompts(id, title, body, builtin, created_at_ms, updated_at_ms)
//! ```
//!
//! `builtin` が 1 の行は初回起動時に投入する既定の役割。編集も削除もできる
//! （初期値に戻したい場合は削除してから再起動すればまた入る、という運用はしない。
//!  一度投入した印を `prompt_seed` に残し、勝手に復活させない）。

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;

use crate::error::{code, AppError, Result};
use crate::library::{new_id, now_ms, open_library};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredPrompt {
    pub id: String,
    pub title: String,
    pub body: String,
    /// 既定で用意した役割か
    pub builtin: bool,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

/// 初回だけ投入する既定の役割。
const DEFAULTS: &[(&str, &str)] = &[
    (
        "プロの株式ジャーナリスト",
        "あなたは経済メディアで企業取材を重ねてきた株式ジャーナリストです。\
         事実と意見を明確に分け、数値には必ず出典（資料名・期）を添えてください。\
         推測を述べるときは「推測」と明示し、断定を避けてください。回答は日本語で行ってください。",
    ),
    (
        // 将来の株価騰貴を断定・保証すると受け取られる表現は避ける（金商法・景表法）
        "高成長・グロース株アナリスト",
        "あなたは中小型グロース株の売上・利益成長率や競争優位性を分析するアナリストです。\
         市場規模（TAM）、成長率の持続性、参入障壁、経営陣の実行力を客観的に評価してください。\
         赤字継続・希薄化・資金繰りのリスクは必ず併記し、\
         将来の株価や騰落を断定・保証する表現は用いないでください。回答は日本語で行ってください。",
    ),
    (
        "慎重な高配当アナリスト",
        "あなたはインカム投資を専門とする慎重派のアナリストです。\
         配当性向、フリーキャッシュフローによる配当カバー率、負債水準、\
         過去の減配履歴を重視して評価してください。\
         増配余地よりも「減配しないか」を先に検証してください。回答は日本語で行ってください。",
    ),
];

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS prompts (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL,
            body          TEXT NOT NULL,
            builtin       INTEGER NOT NULL DEFAULT 0,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS prompt_seed (
            key      TEXT PRIMARY KEY,
            done_at_ms INTEGER NOT NULL
         );",
    )
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    seed_defaults(conn)?;
    rename_legacy_defaults(conn)
}

/// 旧バージョンで投入した既定役割の表現を差し替える。
///
/// 「テンバガー発掘」は将来の株価騰貴を断定・保証すると受け取られうるため、
/// **すでに配布済みの DB に入っている行も**客観的な表現へ寄せる。
/// ユーザーが編集した行（`builtin = 0`、または本文を書き換えたもの）は触らない。
fn rename_legacy_defaults(conn: &Connection) -> Result<()> {
    let (title, body) = DEFAULTS[1];
    conn.execute(
        "UPDATE prompts SET title = ?1, body = ?2
         WHERE builtin = 1 AND title = 'テンバガー発掘アナリスト'",
        params![title, body],
    )
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    Ok(())
}

/// 既定の役割を一度だけ投入する。
fn seed_defaults(conn: &Connection) -> Result<()> {
    let seeded: Option<i64> = conn
        .query_row(
            "SELECT done_at_ms FROM prompt_seed WHERE key = 'defaults'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    if seeded.is_some() {
        return Ok(());
    }

    let now = now_ms();
    for (title, body) in DEFAULTS {
        conn.execute(
            "INSERT INTO prompts (id, title, body, builtin, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, 1, ?4, ?4)",
            params![new_id("prompt"), title, body, now],
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    }

    conn.execute(
        "INSERT INTO prompt_seed (key, done_at_ms) VALUES ('defaults', ?1)",
        params![now],
    )
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    Ok(())
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = open_library(app)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn list(app: &AppHandle) -> Result<Vec<StoredPrompt>> {
    list_in(&open(app)?)
}

pub fn list_in(conn: &Connection) -> Result<Vec<StoredPrompt>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, body, builtin, created_at_ms, updated_at_ms
             FROM prompts ORDER BY builtin DESC, created_at_ms ASC",
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(StoredPrompt {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                builtin: row.get::<_, i64>(3)? != 0,
                created_at_ms: row.get(4)?,
                updated_at_ms: row.get(5)?,
            })
        })
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

pub fn save(
    app: &AppHandle,
    id: Option<String>,
    title: &str,
    body: &str,
) -> Result<Vec<StoredPrompt>> {
    save_in(&open(app)?, id, title, body)
}

/// 新規作成（`id` が None）または更新。
pub fn save_in(
    conn: &Connection,
    id: Option<String>,
    title: &str,
    body: &str,
) -> Result<Vec<StoredPrompt>> {
    let title = title.trim();
    let body = body.trim();
    if title.is_empty() {
        return Err(AppError::code(code::DB_QUERY));
    }
    if body.is_empty() {
        return Err(AppError::code(code::DB_QUERY));
    }

    let now = now_ms();
    match id {
        Some(id) => {
            let changed = conn
                .execute(
                    "UPDATE prompts SET title = ?2, body = ?3, updated_at_ms = ?4 WHERE id = ?1",
                    params![id, title, body, now],
                )
                .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
            if changed == 0 {
                return Err(AppError::code(code::NOT_FOUND));
            }
        }
        None => {
            conn.execute(
                "INSERT INTO prompts (id, title, body, builtin, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, ?3, 0, ?4, ?4)",
                params![new_id("prompt"), title, body, now],
            )
            .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
        }
    }

    list_in(conn)
}

pub fn remove(app: &AppHandle, id: &str) -> Result<Vec<StoredPrompt>> {
    remove_in(&open(app)?, id)
}

pub fn remove_in(conn: &Connection, id: &str) -> Result<Vec<StoredPrompt>> {
    let changed = conn
        .execute("DELETE FROM prompts WHERE id = ?1", params![id])
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    if changed == 0 {
        return Err(AppError::code(code::NOT_FOUND));
    }
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
    fn 既定の役割が投入される() {
        let list = list_in(&db()).unwrap();
        assert_eq!(list.len(), DEFAULTS.len());
        assert!(list.iter().all(|p| p.builtin));
        assert!(list.iter().any(|p| p.title == "高成長・グロース株アナリスト"));
        assert!(
            list.iter().all(|p| !p.title.contains("テンバガー")),
            "断定的な表現は既定役割に含めない"
        );
        assert!(list.iter().all(|p| !p.body.trim().is_empty()));
    }

    #[test]
    fn 既定の役割は二度投入されない() {
        let conn = db();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        assert_eq!(list_in(&conn).unwrap().len(), DEFAULTS.len());
    }

    #[test]
    fn 削除した既定の役割が再起動で復活しない() {
        let conn = db();
        let first = list_in(&conn).unwrap()[0].clone();
        remove_in(&conn, &first.id).unwrap();

        // 再起動相当
        migrate(&conn).unwrap();

        let list = list_in(&conn).unwrap();
        assert_eq!(list.len(), DEFAULTS.len() - 1);
        assert!(list.iter().all(|p| p.id != first.id));
    }

    #[test]
    fn 追加と更新ができる() {
        let conn = db();
        let list = save_in(&conn, None, " 自作アナリスト ", " 慎重に評価する ").unwrap();
        let added = list.iter().find(|p| p.title == "自作アナリスト").unwrap();
        assert_eq!(added.body, "慎重に評価する");
        assert!(!added.builtin);

        let id = added.id.clone();
        let list = save_in(&conn, Some(id.clone()), "改名後", "新しい内容").unwrap();
        let updated = list.iter().find(|p| p.id == id).unwrap();
        assert_eq!(updated.title, "改名後");
        assert_eq!(updated.body, "新しい内容");
    }

    #[test]
    fn 名前や内容が空なら保存できない() {
        let conn = db();
        assert!(save_in(&conn, None, "   ", "本文").is_err());
        assert!(save_in(&conn, None, "名前", "  ").is_err());
    }

    #[test]
    fn 存在しない役割の更新と削除はエラーになる() {
        let conn = db();
        assert!(save_in(&conn, Some("prompt-none".into()), "a", "b").is_err());
        assert!(remove_in(&conn, "prompt-none").is_err());
    }

    #[test]
    fn 旧版の断定的な役割名は客観的な表現へ差し替えられる() {
        let conn = Connection::open_in_memory().unwrap();
        // 旧バージョンが投入した状態を再現する
        conn.execute_batch(
            "CREATE TABLE prompts (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
                builtin INTEGER NOT NULL DEFAULT 0,
                created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL);
             CREATE TABLE prompt_seed (key TEXT PRIMARY KEY, done_at_ms INTEGER NOT NULL);
             INSERT INTO prompts VALUES
                ('p1', 'テンバガー発掘アナリスト', '将来の 10 倍株を探す', 1, 1, 1),
                ('p2', '自作の役割', 'テンバガー発掘アナリストのように考える', 0, 1, 1);
             INSERT INTO prompt_seed VALUES ('defaults', 1);",
        )
        .unwrap();

        migrate(&conn).unwrap();

        let list = list_in(&conn).unwrap();
        let builtin = list.iter().find(|p| p.id == "p1").unwrap();
        assert_eq!(builtin.title, "高成長・グロース株アナリスト");
        assert!(builtin.body.contains("売上・利益成長率"));

        // ユーザーが自分で作った役割には触れない
        let mine = list.iter().find(|p| p.id == "p2").unwrap();
        assert_eq!(mine.title, "自作の役割");
    }

    #[test]
    fn 検討中銘柄と同じ_db_に同居しても互いを壊さない() {
        use crate::candidates;

        let conn = Connection::open_in_memory().unwrap();
        candidates::migrate(&conn).unwrap();
        candidates::add_many_in(
            &conn,
            vec![candidates::CandidateInput {
                ticker: "AAPL".into(),
                name: "Apple".into(),
                genre: "Phone".into(),
            }],
        )
        .unwrap();

        // 後からプロンプトテーブルを作っても銘柄は残る
        migrate(&conn).unwrap();
        assert_eq!(candidates::list_in(&conn).unwrap().len(), 1);
        assert_eq!(list_in(&conn).unwrap().len(), DEFAULTS.len());

        // 逆順でもう一度
        candidates::migrate(&conn).unwrap();
        assert_eq!(candidates::list_in(&conn).unwrap()[0].name, "Apple");
        assert_eq!(list_in(&conn).unwrap().len(), DEFAULTS.len());
    }
}
