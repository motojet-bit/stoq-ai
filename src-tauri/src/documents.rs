//! 一次資料の一時保存（ステージング）。
//!
//! 抽出済みテキストをアプリのデータディレクトリ配下 `temp_documents/` に保存し、
//! アプリを再起動しても資料が残るようにする。
//!
//! ```text
//! <app_data_dir>/temp_documents/
//!   ├── index.json        … メタデータ一覧
//!   ├── <id>.txt          … 抽出済みテキスト
//!   └── …
//! ```
//!
//! **保存するのは抽出済みテキストとメタデータのみで、元のバイナリは複製しない。**
//! LLM に渡すのはテキストであり、原本はユーザーのディスクに残っているため。
//! 詳細は `docs/設計.md` の Step 3 を参照。

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{code, AppError, Result};

const DIR_NAME: &str = "temp_documents";
const INDEX_NAME: &str = "index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedDocument {
    pub id: String,
    /// ユーザーが変更できる表示名
    pub display_name: String,
    /// ドロップ時のファイル名（変更不可）
    pub original_name: String,
    /// 元ファイルのバイト数
    pub size_bytes: u64,
    pub char_count: usize,
    /// 概算トークン数
    pub token_estimate: usize,
    pub saved_at_ms: u64,
}

// ---------------------------------------------------------------- パス

fn dir(app: &AppHandle) -> Result<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::detail(code::DATA_DIR, e.to_string()))?;
    let dir = base.join(DIR_NAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn text_path(app: &AppHandle, id: &str) -> Result<PathBuf> {
    Ok(dir(app)?.join(format!("{id}.txt")))
}

// ---------------------------------------------------------------- インデックス

pub fn list(app: &AppHandle) -> Result<Vec<StagedDocument>> {
    let path = dir(app)?.join(INDEX_NAME);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path)?;
    // 壊れたインデックスで機能停止しないよう、失敗時は空扱いにする
    Ok(serde_json::from_str(&text).unwrap_or_default())
}

fn write_index(app: &AppHandle, docs: &[StagedDocument]) -> Result<()> {
    let path = dir(app)?.join(INDEX_NAME);
    std::fs::write(&path, serde_json::to_string_pretty(docs)?)?;
    Ok(())
}

// ---------------------------------------------------------------- 操作

pub fn stage(
    app: &AppHandle,
    original_name: &str,
    size_bytes: u64,
    text: &str,
) -> Result<StagedDocument> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(AppError::detail(code::IO, original_name.to_string()));
    }

    let id = new_id();
    std::fs::write(text_path(app, &id)?, trimmed)?;

    let doc = StagedDocument {
        id,
        display_name: original_name.to_string(),
        original_name: original_name.to_string(),
        size_bytes,
        char_count: trimmed.chars().count(),
        token_estimate: estimate_tokens(trimmed),
        saved_at_ms: now_ms(),
    };

    let mut docs = list(app)?;
    docs.push(doc.clone());
    write_index(app, &docs)?;
    Ok(doc)
}

pub fn read_text(app: &AppHandle, id: &str) -> Result<String> {
    let path = text_path(app, id)?;
    if !path.exists() {
        return Err(AppError::code(code::NOT_FOUND));
    }
    Ok(std::fs::read_to_string(&path)?)
}

pub fn rename(app: &AppHandle, id: &str, display_name: &str) -> Result<Vec<StagedDocument>> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err(AppError::code(code::IO));
    }

    let mut docs = list(app)?;
    let entry = docs
        .iter_mut()
        .find(|d| d.id == id)
        .ok_or_else(|| AppError::code(code::NOT_FOUND))?;
    entry.display_name = name.to_string();

    write_index(app, &docs)?;
    Ok(docs)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<Vec<StagedDocument>> {
    let mut docs = list(app)?;
    let before = docs.len();
    docs.retain(|d| d.id != id);
    if docs.len() == before {
        return Err(AppError::code(code::NOT_FOUND));
    }

    // 本文ファイルが既に無くてもインデックスの整合は取る
    let _ = std::fs::remove_file(text_path(app, id)?);
    write_index(app, &docs)?;
    Ok(docs)
}

pub fn clear(app: &AppHandle) -> Result<Vec<StagedDocument>> {
    for doc in list(app)? {
        let _ = std::fs::remove_file(text_path(app, &doc.id)?);
    }
    write_index(app, &[])?;
    Ok(Vec::new())
}

// ---------------------------------------------------------------- 補助

/// 概算トークン数。
///
/// 日本語・中国語・韓国語はおおよそ 1 文字 1 トークン、
/// それ以外（英数字など）は 4 文字 1 トークンとして数える。
/// 正確な値はモデルのトークナイザ依存なので、あくまで目安。
pub fn estimate_tokens(text: &str) -> usize {
    let mut cjk = 0usize;
    let mut other = 0usize;

    for ch in text.chars() {
        if is_cjk(ch) {
            cjk += 1;
        } else {
            other += 1;
        }
    }

    cjk + other.div_ceil(4)
}

fn is_cjk(ch: char) -> bool {
    matches!(ch as u32,
        0x3000..=0x30FF   // CJK 記号・ひらがな・カタカナ
        | 0x3400..=0x4DBF // CJK 拡張A
        | 0x4E00..=0x9FFF // CJK 統合漢字
        | 0xAC00..=0xD7AF // ハングル
        | 0xF900..=0xFAFF // CJK 互換漢字
        | 0xFF00..=0xFFEF // 全角形
    )
}

fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("doc-{nanos}")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 空文字は0トークン() {
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn 日本語は一文字一トークン() {
        assert_eq!(estimate_tokens("日本語のテキスト"), 8);
    }

    #[test]
    fn 英数字は四文字一トークン() {
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("abcde"), 2);
    }

    #[test]
    fn 混在でも合算できる() {
        assert_eq!(estimate_tokens("日本abcd"), 3);
    }
}
