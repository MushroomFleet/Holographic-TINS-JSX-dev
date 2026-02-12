use base64::Engine;

/// Write content to a file path (used after the frontend picks a save location via dialog).
#[tauri::command]
pub async fn export_to_file(file_path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&file_path, content)
        .await
        .map_err(|e| format!("Failed to write export file '{}': {}", file_path, e))
}

/// Save a base64-encoded PNG thumbnail image for a conversation.
/// The data_url should be a base64 string (without the `data:image/png;base64,` prefix).
#[tauri::command]
pub async fn save_thumbnail(conversation_id: String, base64_data: String) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let thumbs_dir = home.join(".holographic").join("thumbnails");

    if !thumbs_dir.exists() {
        tokio::fs::create_dir_all(&thumbs_dir)
            .await
            .map_err(|e| format!("Failed to create thumbnails dir: {}", e))?;
    }

    let file_path = thumbs_dir.join(format!("{}.png", conversation_id));

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64 thumbnail: {}", e))?;

    tokio::fs::write(&file_path, bytes)
        .await
        .map_err(|e| format!("Failed to write thumbnail: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}
