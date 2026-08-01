//! 分析結果のファイル書き出し。
//!
//! **書き出し先はユーザーのダウンロードフォルダ**にする。
//! アプリ設定ディレクトリに置くと「どこに保存されたか分からない」ため。
//! ダウンロードフォルダが取れない環境では、デスクトップ → アプリデータの順に落とす。

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};

/// 保存先ディレクトリ。ダウンロード → デスクトップ → アプリデータの順に試す。
fn output_dir(app: &AppHandle) -> Result<PathBuf> {
    let path = app.path();
    let dir = path
        .download_dir()
        .or_else(|_| path.desktop_dir())
        .or_else(|_| path.app_data_dir())
        .map_err(|e| AppError::msg(format!("保存先を決められません: {e}")))?;

    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// ファイル名に使えない文字を落とす。フロント側と同じ規則。
fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_whitespace() => '_',
            c => c,
        })
        .collect();

    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "stoq-analysis".to_string()
    } else {
        trimmed.chars().take(120).collect()
    }
}

/// 同名ファイルがあれば `(2)` `(3)` と番号を足す。**既存を黙って上書きしない。**
fn unique_path(dir: &std::path::Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (file_name.to_string(), String::new()),
    };

    for n in 2..1000 {
        let next = dir.join(format!("{stem}({n}){ext}"));
        if !next.exists() {
            return next;
        }
    }
    candidate
}

/// 書き出して、保存したフルパスを返す。
pub fn write_file(app: &AppHandle, file_name: &str, contents: &str) -> Result<String> {
    if contents.is_empty() {
        return Err(AppError::msg("書き出す内容がありません。"));
    }

    let dir = output_dir(app)?;
    let path = unique_path(&dir, &sanitize(file_name));

    std::fs::write(&path, contents)
        .map_err(|e| AppError::msg(format!("ファイルを書き出せません: {e}")))?;

    Ok(path.to_string_lossy().to_string())
}

// ---------------------------------------------------------------- テスト

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 使えない文字を落とす() {
        assert_eq!(sanitize("AAPL_FY26-Q3.csv"), "AAPL_FY26-Q3.csv");
        assert_eq!(sanitize("a/b:c*d?e\"f<g>h|i"), "a_b_c_d_e_f_g_h_i");
        assert_eq!(sanitize("空白 入り"), "空白_入り");
    }

    #[test]
    fn 空の名前でも既定名になる() {
        assert_eq!(sanitize(""), "stoq-analysis");
        assert_eq!(sanitize("///"), "stoq-analysis");
    }

    #[test]
    fn 長すぎる名前は切り詰める() {
        let long = "a".repeat(500);
        assert_eq!(sanitize(&long).chars().count(), 120);
    }

    #[test]
    fn 同名があれば番号を足す() {
        let dir = std::env::temp_dir().join(format!("stoq-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let first = unique_path(&dir, "report.md");
        assert!(first.ends_with("report.md"));
        std::fs::write(&first, "x").unwrap();

        let second = unique_path(&dir, "report.md");
        assert!(second.to_string_lossy().contains("report(2).md"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn 拡張子が無くても番号を足せる() {
        let dir = std::env::temp_dir().join(format!("stoq-export-noext-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("data"), "x").unwrap();

        let next = unique_path(&dir, "data");
        assert!(next.to_string_lossy().contains("data(2)"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
