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
    /// 構造化した分析データ（JSON 文字列）。未保存なら `{}`
    #[serde(default)]
    pub record: String,
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
    migrate(&conn)?;
    Ok(conn)
}

/// スキーマを最新にする。既存 DB に対しても安全に呼べる。
pub fn migrate(conn: &Connection) -> Result<()> {
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
    /*
     * 構造化した分析データ（fiscal_quarter / summary / block_scores /
     * key_metrics / evaluations）を JSON で持つ。
     * **生テキストとは別に持つ。** 構造化に失敗しても原文は残したいうえ、
     * エクスポートのたびにパースし直すのは無駄なため。
     */
    let _ = conn.execute(
        "ALTER TABLE analyses ADD COLUMN record TEXT NOT NULL DEFAULT '{}'",
        [],
    );

    /*
     * 実行のたびに積む履歴。`analyses` は「銘柄ごとの最新 1 件」なので、
     * **決算期をまたいだ推移を追うには上書きされない置き場が要る。**
     * 既存の `analyses` はそのまま残すので、復元機能は影響を受けない。
     */
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS analysis_history (
            id            TEXT PRIMARY KEY,
            ticker        TEXT NOT NULL,
            raw           TEXT NOT NULL,
            provider      TEXT,
            model         TEXT,
            average_score REAL,
            period_label  TEXT,
            record        TEXT NOT NULL DEFAULT '{}',
            saved_at_ms   INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_history_ticker
            ON analysis_history(ticker, saved_at_ms DESC);",
    )
    .map_err(|e| AppError::msg(format!("分析履歴テーブルを作成できません: {e}")))?;

    // 既存の履歴テーブルへの追加カラム
    let _ = conn.execute(
        "ALTER TABLE analysis_history ADD COLUMN record TEXT NOT NULL DEFAULT '{}'",
        [],
    );

    Ok(())
}

/// 分析アーカイブ 1 件（本文は含まない。一覧を軽くするため）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub id: String,
    pub ticker: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    /// 20項目の平均スコア。取れなかった場合は None
    pub average_score: Option<f64>,
    /// 対象四半期などのラベル（例: `FY2026 Q3`）
    pub period_label: Option<String>,
    /// 構造化した分析データ（JSON 文字列）
    pub record: String,
    pub saved_at_ms: i64,
}

#[allow(clippy::too_many_arguments)]
fn append_history(
    conn: &Connection,
    ticker: &str,
    raw: &str,
    provider: Option<&str>,
    model: Option<&str>,
    average_score: Option<f64>,
    period_label: Option<&str>,
    record: &str,
    saved_at_ms: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO analysis_history
            (id, ticker, raw, provider, model, average_score, period_label, record, saved_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            format!("hist-{saved_at_ms}-{ticker}"),
            ticker,
            raw,
            provider,
            model,
            average_score,
            period_label,
            record,
            saved_at_ms
        ],
    )
    .map_err(|e| AppError::msg(format!("分析履歴を保存できません: {e}")))?;
    Ok(())
}

/// 銘柄の分析アーカイブを新しい順に返す。
pub fn history(app: &AppHandle, ticker: Option<String>) -> Result<Vec<ArchiveEntry>> {
    history_in(&open(app)?, ticker.as_deref())
}

pub fn history_in(conn: &Connection, ticker: Option<&str>) -> Result<Vec<ArchiveEntry>> {
    let upper = ticker.map(|t| t.trim().to_uppercase());
    let sql = "SELECT id, ticker, provider, model, average_score, period_label,
                      record, saved_at_ms
               FROM analysis_history
               WHERE (?1 IS NULL OR ticker = ?1)
               ORDER BY saved_at_ms DESC";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::msg(format!("分析履歴を取得できません: {e}")))?;

    let rows = stmt
        .query_map(params![upper], |row| {
            Ok(ArchiveEntry {
                id: row.get(0)?,
                ticker: row.get(1)?,
                provider: row.get(2)?,
                model: row.get(3)?,
                average_score: row.get(4)?,
                period_label: row.get(5)?,
                record: row.get(6)?,
                saved_at_ms: row.get(7)?,
            })
        })
        .map_err(|e| AppError::msg(format!("分析履歴を取得できません: {e}")))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// アーカイブ 1 件の本文を読む。
pub fn history_raw(app: &AppHandle, id: &str) -> Result<Option<String>> {
    open(app)?
        .query_row(
            "SELECT raw FROM analysis_history WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::msg(format!("分析履歴を取得できません: {e}")))
}

/// アーカイブ 1 件を削除する。
pub fn history_delete(app: &AppHandle, id: &str) -> Result<()> {
    open(app)?
        .execute("DELETE FROM analysis_history WHERE id = ?1", params![id])
        .map_err(|e| AppError::msg(format!("分析履歴を削除できません: {e}")))?;
    Ok(())
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
    average_score: Option<f64>,
    period_label: Option<&str>,
    record: Option<&str>,
) -> Result<SavedAnalysis> {
    let ticker = ticker.trim().to_uppercase();
    if raw.trim().is_empty() {
        return Err(AppError::msg("保存する分析結果が空です。"));
    }

    let saved_at_ms = now_ms();
    let notes_json = serde_json::to_string(notes)?;
    let basis_json = serde_json::to_string(basis)?;
    let record_json = record.unwrap_or("{}");

    let conn = open(app)?;
    conn
        .execute(
            "INSERT INTO analyses
                (ticker, raw, provider, model, prompt_tokens, notes, basis, record, saved_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(ticker) DO UPDATE SET
                raw = excluded.raw,
                provider = excluded.provider,
                model = excluded.model,
                prompt_tokens = excluded.prompt_tokens,
                notes = excluded.notes,
                basis = excluded.basis,
                record = excluded.record,
                saved_at_ms = excluded.saved_at_ms",
            params![
                ticker, raw, provider, model, prompt_tokens, notes_json, basis_json,
                record_json, saved_at_ms
            ],
        )
        .map_err(|e| AppError::msg(format!("分析結果を保存できません: {e}")))?;

    // 最新版とは別に、上書きされない履歴も積む
    append_history(
        &conn,
        &ticker,
        raw,
        provider,
        model,
        average_score,
        period_label,
        record_json,
        saved_at_ms,
    )?;

    Ok(SavedAnalysis {
        ticker,
        raw: raw.to_string(),
        provider: provider.map(str::to_string),
        model: model.map(str::to_string),
        prompt_tokens,
        notes: notes.to_vec(),
        basis: basis.to_vec(),
        record: record_json.to_string(),
        saved_at_ms,
    })
}

/// 指定銘柄の保存済み分析結果を読み出す。無ければ None。
pub fn load(app: &AppHandle, ticker: &str) -> Result<Option<SavedAnalysis>> {
    let ticker = ticker.trim().to_uppercase();

    let conn = open(app)?;
    let row = conn
        .query_row(
            "SELECT raw, provider, model, prompt_tokens, notes, basis, record, saved_at_ms
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
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .optional()
        .map_err(|e| AppError::msg(format!("分析結果を読み出せません: {e}")))?;

    Ok(row.map(
        |(raw, provider, model, prompt_tokens, notes, basis, record, saved_at_ms)| {
            SavedAnalysis {
                ticker,
                raw,
                provider,
                model,
                prompt_tokens,
                notes: serde_json::from_str(&notes).unwrap_or_default(),
                basis: serde_json::from_str(&basis).unwrap_or_default(),
                record,
                saved_at_ms,
            }
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
