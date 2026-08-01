//! フロントエンドから `invoke` で呼び出せるコマンド群。
//! 1 機能 1 ファイルの方針に合わせ、機能が増えたらこのモジュールを分割する。

use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub phase: String,
}

/// フロント↔バックの疎通確認用。
#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "StockAnalyzer".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        phase: "Phase 1 — スケルトンUI".to_string(),
    }
}
