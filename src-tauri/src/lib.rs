mod apptray;
mod bridge;
mod claude;
mod conversations;
mod export;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            claude::send_message,
            claude::get_workspace_path,
            claude::read_html_file,
            claude::list_workspace_html,
            claude::check_claude_status,
            claude::generate_tins_readme,
            conversations::save_conversation,
            conversations::load_conversation,
            conversations::list_conversations,
            conversations::delete_conversation,
            conversations::update_conversation_meta,
            export::export_to_file,
            export::save_thumbnail,
            bridge::bridge_execute,
            bridge::get_bridge_config,
            bridge::update_bridge_config,
            settings::get_settings,
            settings::save_settings,
            apptray::list_promoted_apps,
            apptray::promote_app,
            apptray::demote_app,
            apptray::is_app_promoted,
            apptray::read_thumbnail_base64,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
