//! StockAnalyzer のバックエンド（Rust 側）エントリポイント。
//!
//! HTTP 通信と秘密情報の保持はすべてこちら側で行う。理由は `docs/設計.md` の
//! 「4.1 なぜ HTTP を Rust 側に置くのか」を参照。

mod commands;
mod edgar;
mod error;
mod html;
mod http;
mod llm;
mod settings;
mod yahoo;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::settings_load,
            commands::settings_save,
            commands::settings_set_key,
            commands::settings_add_custom_provider,
            commands::settings_update_custom_provider,
            commands::settings_remove_custom_provider,
            commands::llm_send,
            commands::yahoo_fetch_fundamentals,
            commands::sec_filing_status,
            commands::sec_fetch_latest_filing,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri アプリケーションの起動に失敗しました");
}
