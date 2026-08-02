//! StockAnalyzer のバックエンド（Rust 側）エントリポイント。
//!
//! HTTP 通信と秘密情報の保持はすべてこちら側で行う。理由は `docs/設計.md` の
//! 「4.1 なぜ HTTP を Rust 側に置くのか」を参照。

mod analyses;
mod candidates;
mod chats;
mod cloud;
mod debate;
mod commands;
mod documents;
mod edgar;
mod error;
mod eula;
mod exports;
mod html;
mod http;
mod library;
mod license;
mod llm;
mod market;
mod personas;
mod portfolios;
mod prompts;
mod quarterly;
mod settings;
mod shortcuts;
mod trial;
mod yahoo;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        /*
         * 更新の確認・適用は公式プラグインに任せる。
         * 署名の検証（`tauri.conf.json` の `pubkey`）もプラグイン側で行われるので、
         * **署名の無い配布物は適用されない**。
         */
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // 起動時の自動バックアップ。**失敗しても起動は止めない**
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                cloud::auto_backup_if_enabled(&handle).await;
            });
            Ok(())
        })
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
            commands::analysis_history,
            commands::analysis_history_raw,
            commands::analysis_history_delete,
            commands::export_write_file,
            commands::license_status,
            commands::license_activate,
            commands::license_clear,
            commands::free_tier_set,
            commands::eula_status,
            commands::eula_agree,
            commands::eula_revoke,
            commands::window_set_title,
            commands::cloud_status,
            commands::cloud_set_client_id,
            commands::cloud_set_auto_backup,
            commands::cloud_connect,
            commands::cloud_disconnect,
            commands::cloud_backup,
            commands::cloud_restore,
            commands::cloud_list_backups,
            commands::portfolios_list,
            commands::portfolios_create,
            commands::portfolios_rename,
            commands::portfolios_remove,
            commands::portfolios_add_ticker,
            commands::portfolios_remove_ticker,
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
