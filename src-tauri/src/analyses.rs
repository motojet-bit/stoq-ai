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

use crate::error::{code, AppError, Result};

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
        .map_err(|e| AppError::detail(code::DATA_DIR, e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("analyses.db"))
}

fn open(app: &AppHandle) -> Result<Connection> {
    let conn = Connection::open(db_path(app)?)
        .map_err(|e| AppError::detail(code::DB_OPEN, e.to_string()))?;
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
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

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
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    // 既存の履歴テーブルへの追加カラム
    let _ = conn.execute(
        "ALTER TABLE analysis_history ADD COLUMN record TEXT NOT NULL DEFAULT '{}'",
        [],
    );

    /*
     * アドホック分析（決算の合間に出る適時開示・プレスリリース）を、
     * 四半期の分析へぶら下げるための親子関係。
     *
     * **親を消しても子は残す（`ON DELETE` を張らない）。**
     * 四半期の分析をやり直したくて消しただけなのに、
     * 期中に積み上げた開示の分析まで巻き添えで消えると取り返しがつかない。
     * 親を失った子は期の直下（親なし）として一覧に出る。
     */
    let _ = conn.execute("ALTER TABLE analysis_history ADD COLUMN parent_id TEXT", []);
    /*
     * 表示用の枝番（`Q2-01` の `01` の部分）。
     * **保存時に採番して持たせる。** 表示のたびに数え直すと、
     * 途中の 1 件を消した瞬間に既存の番号がずれて、
     * 「Q2-02 の件」と控えていたものが別物を指す。
     */
    let _ = conn.execute("ALTER TABLE analysis_history ADD COLUMN branch_no INTEGER", []);

    // 消費トークン。コスト概算の実測値として残す（推定で埋めない）
    let _ = conn.execute(
        "ALTER TABLE analysis_history ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE analysis_history ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0",
        [],
    );

    /*
     * 分割実行の途中経過。
     *
     * **完了した段だけを積む。** 20 項目を一度に生成させると
     * 出力上限で切れることがあり、そこまでの生成がまるごと無駄になる。
     * 段ごとに確定させておけば、切れても次はその続きから始められる。
     *
     * 銘柄 × 段 で 1 行。同じ段をやり直したら置き換える。
     */
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS analysis_steps (
            ticker        TEXT NOT NULL,
            step          INTEGER NOT NULL,
            raw           TEXT NOT NULL,
            input_tokens  INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            saved_at_ms   INTEGER NOT NULL,
            PRIMARY KEY (ticker, step)
         );",
    )
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    /*
     * 実行ログ。**分析結果とは別に持つ。**
     * 結果を消してもコストの記録は残したいし、
     * 中断・エラーで終わった実行も残す（消費は発生している）。
     */
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS usage_log (
            id            TEXT PRIMARY KEY,
            ticker        TEXT NOT NULL,
            provider      TEXT,
            model         TEXT,
            role_id       TEXT,
            input_tokens  INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            status        TEXT NOT NULL,
            started_at_ms INTEGER NOT NULL,
            saved_at_ms   INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_usage_log_time
            ON usage_log(saved_at_ms DESC);",
    )
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    Ok(())
}

/// 実行ログ 1 件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLogEntry {
    pub id: String,
    pub ticker: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    /// 使った役割プロファイルの ID
    pub role_id: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    /// `done` | `cancelled` | `error`
    pub status: String,
    pub started_at_ms: i64,
    pub saved_at_ms: i64,
}

/// 実行ログを 1 件積む。
#[allow(clippy::too_many_arguments)]
pub fn append_usage_log(
    app: &AppHandle,
    ticker: &str,
    provider: Option<&str>,
    model: Option<&str>,
    role_id: Option<&str>,
    input_tokens: i64,
    output_tokens: i64,
    status: &str,
    started_at_ms: i64,
) -> Result<()> {
    let saved_at_ms = now_ms();
    open(app)?
        .execute(
            "INSERT INTO usage_log
                (id, ticker, provider, model, role_id, input_tokens, output_tokens,
                 status, started_at_ms, saved_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                format!("use-{saved_at_ms}-{ticker}"),
                ticker.trim().to_uppercase(),
                provider,
                model,
                role_id,
                input_tokens,
                output_tokens,
                status,
                started_at_ms,
                saved_at_ms
            ],
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    Ok(())
}

/// 実行ログを新しい順に返す。
pub fn usage_log(app: &AppHandle) -> Result<Vec<UsageLogEntry>> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, ticker, provider, model, role_id, input_tokens, output_tokens,
                    status, started_at_ms, saved_at_ms
             FROM usage_log ORDER BY saved_at_ms DESC",
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(UsageLogEntry {
                id: row.get(0)?,
                ticker: row.get(1)?,
                provider: row.get(2)?,
                model: row.get(3)?,
                role_id: row.get(4)?,
                input_tokens: row.get(5)?,
                output_tokens: row.get(6)?,
                status: row.get(7)?,
                started_at_ms: row.get(8)?,
                saved_at_ms: row.get(9)?,
            })
        })
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// 実行ログを全消しする。**分析結果には触れない。**
pub fn clear_usage_log(app: &AppHandle) -> Result<()> {
    open(app)?
        .execute("DELETE FROM usage_log", [])
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    Ok(())
}

/// 分割実行の 1 段ぶん。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisStep {
    pub step: i64,
    pub raw: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub saved_at_ms: i64,
}

/// 完了した段を保存する（同じ段は置き換える）。
pub fn save_step(
    app: &AppHandle,
    ticker: &str,
    step: i64,
    raw: &str,
    input_tokens: i64,
    output_tokens: i64,
) -> Result<()> {
    let ticker = ticker.trim().to_uppercase();
    open(app)?
        .execute(
            "INSERT INTO analysis_steps
                (ticker, step, raw, input_tokens, output_tokens, saved_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(ticker, step) DO UPDATE SET
                raw = excluded.raw,
                input_tokens = excluded.input_tokens,
                output_tokens = excluded.output_tokens,
                saved_at_ms = excluded.saved_at_ms",
            params![ticker, step, raw, input_tokens, output_tokens, now_ms()],
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    Ok(())
}

/// 保存済みの段を古い順に返す。再開の起点を決めるのに使う。
pub fn load_steps(app: &AppHandle, ticker: &str) -> Result<Vec<AnalysisStep>> {
    let ticker = ticker.trim().to_uppercase();
    let conn = open(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT step, raw, input_tokens, output_tokens, saved_at_ms
             FROM analysis_steps WHERE ticker = ?1 ORDER BY step",
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    let rows = stmt
        .query_map(params![ticker], |row| {
            Ok(AnalysisStep {
                step: row.get(0)?,
                raw: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                saved_at_ms: row.get(4)?,
            })
        })
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// 途中経過を捨てる。**最後まで終わったときと、明示的にやり直すときだけ呼ぶ。**
pub fn clear_steps(app: &AppHandle, ticker: &str) -> Result<()> {
    let ticker = ticker.trim().to_uppercase();
    open(app)?
        .execute("DELETE FROM analysis_steps WHERE ticker = ?1", params![ticker])
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
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
    /// 消費した入力トークン（実測。取れなければ 0）
    pub input_tokens: i64,
    /// 消費した出力トークン（実測。取れなければ 0）
    pub output_tokens: i64,
    /// 親（四半期本体の分析）の ID。単独の分析なら None
    pub parent_id: Option<String>,
    /// 親の下での枝番（1 始まり）。親が無ければ None
    pub branch_no: Option<i64>,
    pub saved_at_ms: i64,
}

/// 親の下で次に使う枝番を求める。
///
/// **いま存在する最大値の次**にする。件数 + 1 にすると、
/// 途中を削除したときに既存の番号と衝突する。
pub fn next_branch_no(conn: &Connection, parent_id: &str) -> Result<i64> {
    let max: Option<i64> = conn
        .query_row(
            "SELECT MAX(branch_no) FROM analysis_history WHERE parent_id = ?1",
            params![parent_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?
        .flatten();
    Ok(max.unwrap_or(0) + 1)
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
    parent_id: Option<&str>,
    input_tokens: i64,
    output_tokens: i64,
    saved_at_ms: i64,
) -> Result<()> {
    let branch_no = match parent_id {
        Some(parent) => Some(next_branch_no(conn, parent)?),
        None => None,
    };

    conn.execute(
        "INSERT INTO analysis_history
            (id, ticker, raw, provider, model, average_score, period_label, record,
             parent_id, branch_no, input_tokens, output_tokens, saved_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            format!("hist-{saved_at_ms}-{ticker}"),
            ticker,
            raw,
            provider,
            model,
            average_score,
            period_label,
            record,
            parent_id,
            branch_no,
            input_tokens,
            output_tokens,
            saved_at_ms
        ],
    )
    .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    Ok(())
}

/// 銘柄の分析アーカイブを新しい順に返す。
pub fn history(app: &AppHandle, ticker: Option<String>) -> Result<Vec<ArchiveEntry>> {
    history_in(&open(app)?, ticker.as_deref())
}

pub fn history_in(conn: &Connection, ticker: Option<&str>) -> Result<Vec<ArchiveEntry>> {
    let upper = ticker.map(|t| t.trim().to_uppercase());
    let sql = "SELECT id, ticker, provider, model, average_score, period_label,
                      record, input_tokens, output_tokens, parent_id, branch_no, saved_at_ms
               FROM analysis_history
               WHERE (?1 IS NULL OR ticker = ?1)
               ORDER BY saved_at_ms DESC";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

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
                input_tokens: row.get(7)?,
                output_tokens: row.get(8)?,
                parent_id: row.get(9)?,
                branch_no: row.get(10)?,
                saved_at_ms: row.get(11)?,
            })
        })
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

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
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))
}

/// アーカイブ 1 件を削除する。
pub fn history_delete(app: &AppHandle, id: &str) -> Result<()> {
    open(app)?
        .execute("DELETE FROM analysis_history WHERE id = ?1", params![id])
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
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
    // 親（四半期本体の分析）の ID。アドホック分析ならここに親を指定する
    parent_id: Option<&str>,
    // 実測の消費トークン
    input_tokens: i64,
    output_tokens: i64,
) -> Result<SavedAnalysis> {
    let ticker = ticker.trim().to_uppercase();
    if raw.trim().is_empty() {
        return Err(AppError::code(code::INVALID_INPUT));
    }

    let saved_at_ms = now_ms();
    let notes_json = serde_json::to_string(notes)?;
    let basis_json = serde_json::to_string(basis)?;
    let record_json = record.unwrap_or("{}");

    let conn = open(app)?;

    /*
     * **アドホック分析は `analyses`（銘柄ごとの最新 1 件）を上書きしない。**
     * 期中のプレスリリース 1 本で、四半期決算の分析が画面から消えてしまう。
     * 履歴にだけ積む。
     */
    if parent_id.is_none() {
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
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    }

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
        parent_id,
        input_tokens,
        output_tokens,
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
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

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
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;

    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// 指定銘柄の分析結果を削除する。ユーザーが明示的にクリアしたときだけ呼ぶ。
pub fn delete(app: &AppHandle, ticker: &str) -> Result<()> {
    open(app)?
        .execute(
            "DELETE FROM analyses WHERE ticker = ?1",
            params![ticker.trim().to_uppercase()],
        )
        .map_err(|e| AppError::detail(code::DB_QUERY, e.to_string()))?;
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
