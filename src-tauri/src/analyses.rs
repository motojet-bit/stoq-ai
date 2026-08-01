//! 分析結果の永続化（SQLite）。
//!
//! LLM が生成した 20 項目評価を `<app_data_dir>/analyses.db` に保存し、
//! アプリを再起動しても銘柄を開けば即座に復元できるようにする。
//!
//! 1 銘柄につき最新 1 件を保持する（同じ銘柄を再分析すると上書き）。
//! 削除はユーザーが明示的に「クリア」を押したときだけ行う。

use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedAnalysis {
    pub ticker: String,
    /// LLM の生の Markdown 出力
    pub raw: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub prompt_tokens: i64,
    /// プロンプトの圧縮などの注記（JSON 配列）
    pub notes: Vec<String>,
    /// 分析に使ったデータ元（例: "財務指標(YF)", "SEC開示書類 10-Q", "添付資料 2件"）
    pub basis: Vec<String>,
    pub saved_at_ms: i64,
}

fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(format!("データディレクトリを取得できません: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("analyses.db"))
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = Connection::open(db_path(app)?)
        .map_err(|e| AppError::msg(format!("分析結果データベースを開けません: {e}")))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS analyses (
            ticker        TEXT PRIMARY KEY,
            raw           TEXT NOT NULL,
            provider      TEXT,
            model         TEXT,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            notes         TEXT NOT NULL DEFAULT '[]',
            saved_at_ms   INTEGER NOT NULL
         );",
    )
    .map_err(|e| AppError::msg(format!("分析結果テーブルを作成できません: {e}")))?;

    // 既存 DB への追加カラム。すでにあればエラーになるので黙って無視する。
    let _ = conn.execute(
        "ALTER TABLE analyses ADD COLUMN basis TEXT NOT NULL DEFAULT '[]'",
        [],
    );

    Ok(conn)
}

/// 分析結果を保存する。同じ銘柄の既存レコードは置き換える。
pub fn save(
    app: &AppHandle,
    ticker: &str,
    raw: &str,
    provider: Option<&str>,
    model: Option<&str>,
    prompt_tokens: i64,
    notes: &[String],
    basis: &[String],
) -> Result<SavedAnalysis> {
    let ticker = ticker.trim().to_uppercase();
    if raw.trim().is_empty() {
        return Err(AppError::msg("保存する分析結果が空です。"));
    }

    let saved_at_ms = now_ms();
    let notes_json = serde_json::to_string(notes)?;
    let basis_json = serde_json::to_string(basis)?;

    open(app)?
        .execute(
            "INSERT INTO analyses (ticker, raw, provider, model, prompt_tokens, notes, basis, saved_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(ticker) DO UPDATE SET
                raw = excluded.raw,
                provider = excluded.provider,
                model = excluded.model,
                prompt_tokens = excluded.prompt_tokens,
                notes = excluded.notes,
                basis = excluded.basis,
                saved_at_ms = excluded.saved_at_ms",
            params![ticker, raw, provider, model, prompt_tokens, notes_json, basis_json, saved_at_ms],
        )
        .map_err(|e| AppError::msg(format!("分析結果を保存できません: {e}")))?;

    Ok(SavedAnalysis {
        ticker,
        raw: raw.to_string(),
        provider: provider.map(str::to_string),
        model: model.map(str::to_string),
        prompt_tokens,
        notes: notes.to_vec(),
        basis: basis.to_vec(),
        saved_at_ms,
    })
}

/// 指定銘柄の保存済み分析結果を読み出す。無ければ None。
pub fn load(app: &AppHandle, ticker: &str) -> Result<Option<SavedAnalysis>> {
    let ticker = ticker.trim().to_uppercase();

    let conn = open(app)?;
    let row = conn
        .query_row(
            "SELECT raw, provider, model, prompt_tokens, notes, basis, saved_at_ms
             FROM analyses WHERE ticker = ?1",
            params![ticker],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|e| AppError::msg(format!("分析結果を読み出せません: {e}")))?;

    Ok(row.map(
        |(raw, provider, model, prompt_tokens, notes, basis, saved_at_ms)| SavedAnalysis {
            ticker,
            raw,
            provider,
            model,
            prompt_tokens,
            notes: serde_json::from_str(&notes).unwrap_or_default(),
            basis: serde_json::from_str(&basis).unwrap_or_default(),
            saved_at_ms,
        },
    ))
}

/// 保存済みの銘柄一覧（新しい順）。
pub fn list(app: &AppHandle) -> Result<Vec<(String, i64)>> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare("SELECT ticker, saved_at_ms FROM analyses ORDER BY saved_at_ms DESC")
        .map_err(|e| AppError::msg(format!("一覧を取得できません: {e}")))?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| AppError::msg(format!("一覧を取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// 指定銘柄の分析結果を削除する。ユーザーが明示的にクリアしたときだけ呼ぶ。
pub fn delete(app: &AppHandle, ticker: &str) -> Result<()> {
    open(app)?
        .execute(
            "DELETE FROM analyses WHERE ticker = ?1",
            params![ticker.trim().to_uppercase()],
        )
        .map_err(|e| AppError::msg(format!("分析結果を削除できません: {e}")))?;
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
