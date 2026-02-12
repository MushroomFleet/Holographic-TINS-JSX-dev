use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Application settings stored in ~/.holographic/settings.json
#[derive(Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub accent_color: String,
    #[serde(default)]
    pub high_contrast: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u8,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_splitter")]
    pub splitter_position: f64,
    #[serde(default = "default_desktop_color")]
    pub desktop_color: String,
}

fn default_font_size() -> u8 {
    13
}

fn default_splitter() -> f64 {
    0.4
}

fn default_desktop_color() -> String {
    "#008080".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            accent_color: "#00d4ff".to_string(),
            high_contrast: false,
            font_size: 13,
            system_prompt: String::new(),
            splitter_position: 0.4,
            desktop_color: "#008080".to_string(),
        }
    }
}

fn get_settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".holographic").join("settings.json"))
}

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    let path = get_settings_path()?;
    if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    tokio::fs::write(&path, json)
        .await
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
