//! StockAnalyzer のバックエンド（Rust 側）エントリポイント。
//!
//! HTTP 通信と秘密情報の保持はすべてこちら側で行う。理由は `docs/設計.md` の
//! 「4.1 なぜ HTTP を Rust 側に置くのか」を参照。

mod analyses;
mod candidates;
mod chats;
mod commands;
mod documents;
mod edgar;
mod error;
mod html;
mod http;
mod library;
mod llm;
mod market;
mod personas;
mod prompts;
mod quarterly;
mod settings;
mod shortcuts;
mod yahoo;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::settings_load,
            commands::settings_save,
            commands::settings_set_key,
            commands::market_set_key,
            commands::market_health_check,
            commands::settings_add_custom_provider,
            commands::settings_update_custom_provider,
            commands::settings_remove_custom_provider,
            commands::llm_send,
            commands::llm_cancel,
            commands::analysis_save,
            commands::analysis_load,
            commands::analysis_list,
            commands::analysis_delete,
            commands::chat_list_sessions,
            commands::chat_create_session,
            commands::chat_rename_session,
            commands::chat_set_archived,
            commands::chat_delete_session,
            commands::candidates_list,
            commands::candidates_add,
            commands::candidates_remove,
            commands::candidates_clear,
            commands::prompts_list,
            commands::prompts_save,
            commands::prompts_remove,
            commands::analysis_roles,
            commands::analysis_prompt_tokens,
            commands::analysis_threshold_preview,
            commands::shortcuts_list,
            commands::shortcuts_set,
            commands::shortcuts_reset,
            commands::chat_load_messages,
            commands::chat_append_message,
            commands::documents_list,
            commands::documents_stage,
            commands::documents_read_text,
            commands::documents_rename,
            commands::documents_delete,
            commands::documents_clear,
            commands::yahoo_fetch_fundamentals,
            commands::quarterly_series,
            commands::sec_filing_status,
            commands::sec_fetch_latest_filing,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri アプリケーションの起動に失敗しました");
}
