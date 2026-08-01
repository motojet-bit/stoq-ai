//! StockAnalyzer のバックエンド（Rust 側）エントリポイント。
//!
//! Phase 1 は骨格のみ。疎通確認用の `app_info` コマンドだけを公開する。
//! Phase 2 以降でここに SEC / Yahoo Finance のクライアント、PDF パーサ、
//! LLM プロバイダの呼び出しを追加していく。

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!())
        .expect("Tauri アプリケーションの起動に失敗しました");
}
