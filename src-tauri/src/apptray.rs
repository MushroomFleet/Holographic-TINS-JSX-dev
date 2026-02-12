use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Serialize, Deserialize)]
pub struct PromotedApp {
    pub conversation_id: String,
    pub name: String,
    pub thumbnail_path: Option<String>,
    pub html_path: String,
    pub promoted_at: String,
}

fn get_apptray_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".holographic").join("apptray.json"))
}

fn load_apps_internal() -> Result<Vec<PromotedApp>, String> {
    let path = get_apptray_path()?;
    if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read apptray: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse apptray: {}", e))
    } else {
        Ok(Vec::new())
    }
}

async fn save_apps_internal(apps: &[PromotedApp]) -> Result<(), String> {
    let path = get_apptray_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create apptray dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(apps)
        .map_err(|e| format!("Failed to serialize apptray: {}", e))?;
    tokio::fs::write(&path, json)
        .await
        .map_err(|e| format!("Failed to write apptray: {}", e))?;
    Ok(())
}

/// List all promoted apps
#[tauri::command]
pub async fn list_promoted_apps() -> Result<Vec<PromotedApp>, String> {
    load_apps_internal()
}

/// Promote an app (add to tray). If already promoted, returns Ok without duplicating.
#[tauri::command]
pub async fn promote_app(app: PromotedApp) -> Result<(), String> {
    let mut apps = load_apps_internal()?;
    if apps.iter().any(|a| a.conversation_id == app.conversation_id) {
        return Ok(());
    }
    apps.push(app);
    save_apps_internal(&apps).await
}

/// Demote an app (remove from tray) by conversation_id
#[tauri::command]
pub async fn demote_app(conversation_id: String) -> Result<(), String> {
    let mut apps = load_apps_internal()?;
    apps.retain(|a| a.conversation_id != conversation_id);
    save_apps_internal(&apps).await
}

/// Check if a conversation is promoted
#[tauri::command]
pub fn is_app_promoted(conversation_id: String) -> Result<bool, String> {
    let apps = load_apps_internal()?;
    Ok(apps.iter().any(|a| a.conversation_id == conversation_id))
}

/// Read a thumbnail file and return it as base64-encoded PNG
#[tauri::command]
pub async fn read_thumbnail_base64(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read thumbnail: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}
