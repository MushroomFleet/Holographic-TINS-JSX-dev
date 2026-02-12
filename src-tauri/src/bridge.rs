use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::Command;

/// A shell command request from the iframe via postMessage relay.
#[derive(Clone, Deserialize)]
pub struct ShellRequest {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
}

/// Result of running a shell command.
#[derive(Clone, Serialize)]
pub struct ShellResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Bridge configuration: which commands and paths are allowed.
#[derive(Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub allowed_commands: Vec<String>,
    pub allowed_paths: Vec<String>,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        BridgeConfig {
            // Sensible defaults: common media/dev tools
            allowed_commands: vec![
                "ffmpeg".to_string(),
                "ffprobe".to_string(),
                "convert".to_string(), // imagemagick
                "magick".to_string(),
                "python".to_string(),
                "python3".to_string(),
                "node".to_string(),
                "npx".to_string(),
            ],
            allowed_paths: vec![],
        }
    }
}

/// Get the bridge config path (~/.holographic/bridge-config.json)
fn get_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".holographic").join("bridge-config.json"))
}

/// Load bridge configuration from disk, or create default.
fn load_config() -> Result<BridgeConfig, String> {
    let path = get_config_path()?;
    if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read bridge config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse bridge config: {}", e))
    } else {
        let config = BridgeConfig::default();
        // Save default config
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&path, json).ok();
        Ok(config)
    }
}

/// Execute an allowlisted shell command.
#[tauri::command]
pub async fn bridge_execute(request: ShellRequest) -> Result<ShellResult, String> {
    let config = load_config()?;

    // Validate command against allowlist
    let cmd_name = request
        .command
        .split(['/', '\\'])
        .last()
        .unwrap_or(&request.command);

    if !config.allowed_commands.iter().any(|allowed| {
        cmd_name.eq_ignore_ascii_case(allowed)
            || cmd_name.eq_ignore_ascii_case(&format!("{}.exe", allowed))
    }) {
        return Err(format!(
            "Command '{}' is not in the bridge allowlist. Allowed: {:?}",
            request.command, config.allowed_commands
        ));
    }

    // Validate working directory if specified
    if let Some(ref cwd) = request.cwd {
        let cwd_path = PathBuf::from(cwd);
        if !cwd_path.exists() || !cwd_path.is_dir() {
            return Err(format!("Working directory '{}' does not exist", cwd));
        }

        // Check if path is in allowed paths (if any are configured)
        if !config.allowed_paths.is_empty() {
            let cwd_canonical = cwd_path.canonicalize().unwrap_or(cwd_path.clone());
            let path_allowed = config.allowed_paths.iter().any(|allowed| {
                let allowed_path = PathBuf::from(allowed);
                let allowed_canonical = allowed_path
                    .canonicalize()
                    .unwrap_or(allowed_path.clone());
                cwd_canonical.starts_with(&allowed_canonical)
            });

            if !path_allowed {
                return Err(format!(
                    "Working directory '{}' is not in allowed paths",
                    cwd
                ));
            }
        }
    }

    // Execute the command
    let mut cmd = Command::new(&request.command);
    cmd.args(&request.args);

    if let Some(ref cwd) = request.cwd {
        cmd.current_dir(cwd);
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute '{}': {}", request.command, e))?;

    Ok(ShellResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

/// Get the current bridge configuration.
#[tauri::command]
pub fn get_bridge_config() -> Result<BridgeConfig, String> {
    load_config()
}

/// Update the bridge configuration.
#[tauri::command]
pub async fn update_bridge_config(config: BridgeConfig) -> Result<(), String> {
    let path = get_config_path()?;
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    tokio::fs::write(&path, json)
        .await
        .map_err(|e| format!("Failed to write bridge config: {}", e))?;
    Ok(())
}
