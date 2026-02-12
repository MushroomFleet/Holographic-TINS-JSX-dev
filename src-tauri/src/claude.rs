use serde::Serialize;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use std::process::Stdio;
use std::path::PathBuf;

#[derive(Clone, Serialize)]
struct ResponseChunk {
    content: String,
    done: bool,
}

#[derive(Clone, Serialize)]
struct TinsProgress {
    lines_received: u32,
}

/// Get the holographic workspace directory (~/.holographic/workspace/).
/// Creates it if it doesn't exist.
fn get_workspace_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let workspace = home.join(".holographic").join("workspace");
    if !workspace.exists() {
        std::fs::create_dir_all(&workspace)
            .map_err(|e| format!("Failed to create workspace dir: {}", e))?;
    }
    Ok(workspace)
}

/// Resolve the path to the `claude` CLI executable.
fn resolve_claude_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut where_cmd = std::process::Command::new("where");
        where_cmd.arg("claude");
        where_cmd.creation_flags(0x08000000);
        if let Ok(output) = where_cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.ends_with(".cmd") || line.ends_with(".exe") {
                        return PathBuf::from(line);
                    }
                }
                if let Some(first) = stdout.lines().next() {
                    let first = first.trim();
                    if !first.is_empty() {
                        return PathBuf::from(first);
                    }
                }
            }
        }

        if let Ok(appdata) = std::env::var("APPDATA") {
            let npm_path = PathBuf::from(&appdata).join("npm").join("claude.cmd");
            if npm_path.exists() {
                return npm_path;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = std::process::Command::new("which").arg("claude").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return PathBuf::from(path);
                }
            }
        }
    }

    PathBuf::from("claude")
}

/// Returns the workspace directory path to the frontend.
#[tauri::command]
pub fn get_workspace_path() -> Result<String, String> {
    let workspace = get_workspace_dir()?;
    Ok(workspace.to_string_lossy().to_string())
}

/// Read an HTML file from the workspace and return its contents.
#[tauri::command]
pub async fn read_html_file(file_path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("Failed to read '{}': {}", file_path, e))
}

/// List .html files in the workspace directory, sorted by modification time (newest first).
#[tauri::command]
pub async fn list_workspace_html() -> Result<Vec<String>, String> {
    let workspace = get_workspace_dir()?;
    let mut entries: Vec<(String, std::time::SystemTime)> = Vec::new();

    let mut dir = tokio::fs::read_dir(&workspace)
        .await
        .map_err(|e| format!("Failed to read workspace dir: {}", e))?;

    while let Ok(Some(entry)) = dir.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("html") {
            if let Ok(meta) = entry.metadata().await {
                let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                entries.push((path.to_string_lossy().to_string(), modified));
            }
        }
    }

    // Sort newest first
    entries.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(entries.into_iter().map(|(p, _)| p).collect())
}

/// Check if the Claude CLI is available and return its version string.
#[tauri::command]
pub async fn check_claude_status() -> Result<String, String> {
    let claude_path = resolve_claude_path();

    let mut cmd;
    #[cfg(target_os = "windows")]
    {
        let path_str = claude_path.to_string_lossy();
        if path_str.ends_with(".cmd") {
            cmd = std::process::Command::new("cmd.exe");
            cmd.arg("/C").arg(&claude_path);
        } else {
            cmd = std::process::Command::new(&claude_path);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd = std::process::Command::new(&claude_path);
    }

    cmd.arg("--version");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| format!("Claude CLI not found: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(version)
    } else {
        Err("Claude CLI returned non-zero exit code".to_string())
    }
}

#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    message: String,
    system_prompt: Option<String>,
    session_id: Option<String>,
) -> Result<(), String> {
    // Ensure workspace exists before Claude runs
    let _workspace = get_workspace_dir()?;

    let claude_path = resolve_claude_path();

    // On Windows, .cmd files must be executed via cmd.exe /C
    let mut cmd;
    #[cfg(target_os = "windows")]
    {
        let path_str = claude_path.to_string_lossy();
        if path_str.ends_with(".cmd") {
            cmd = Command::new("cmd.exe");
            cmd.arg("/C").arg(&claude_path);
        } else {
            cmd = Command::new(&claude_path);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd = Command::new(&claude_path);
    }

    cmd.arg("--print");

    // Claude Code runs with full tools — it writes .jsx and .html files autonomously
    // We use --dangerously-skip-permissions so Claude can write without prompts
    cmd.arg("--dangerously-skip-permissions");

    // Resume a previous session if session_id is provided
    if let Some(ref sid) = session_id {
        cmd.arg("--resume").arg(sid);
    }

    if let Some(ref prompt) = system_prompt {
        cmd.arg("--system-prompt").arg(prompt);
    }

    cmd.stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude at '{}': {}", claude_path.display(), e))?;

    // Write message to stdin, then close it
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(message.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        drop(stdin);
    }

    // Stream stdout line by line
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit(
                "claude-response-chunk",
                ResponseChunk {
                    content: line,
                    done: false,
                },
            );
        }
    }

    // Wait for process to complete
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for claude: {}", e))?;

    if !status.success() {
        let _ = app.emit(
            "claude-response-chunk",
            ResponseChunk {
                content: format!("[Claude exited with status: {}]", status),
                done: false,
            },
        );
    }

    // Signal completion
    let _ = app.emit(
        "claude-response-chunk",
        ResponseChunk {
            content: String::new(),
            done: true,
        },
    );

    Ok(())
}

/// Generate a TINS-compliant README by sending the HTML source to Claude
/// with a TINS specification system prompt. Streams progress events to the
/// frontend while collecting the full output. 5-minute timeout for complex apps.
#[tauri::command]
pub async fn generate_tins_readme(
    app: tauri::AppHandle,
    html_content: String,
    project_title: String,
    user_description: String,
) -> Result<String, String> {
    let claude_path = resolve_claude_path();

    let mut cmd;
    #[cfg(target_os = "windows")]
    {
        let path_str = claude_path.to_string_lossy();
        if path_str.ends_with(".cmd") {
            cmd = Command::new("cmd.exe");
            cmd.arg("/C").arg(&claude_path);
        } else {
            cmd = Command::new(&claude_path);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd = Command::new(&claude_path);
    }

    cmd.arg("--print");

    let system_prompt = r#"You are a TINS (There Is No Source) specification writer. TINS is a software distribution paradigm where only README files are distributed, and LLMs generate the implementation code on demand.

Your task: Given a working HTML application, reverse-engineer a comprehensive TINS-compliant README specification that would allow any capable LLM to regenerate an equivalent application from scratch.

The README MUST follow this EXACT structure with ALL required sections:

# Project Title

<!-- TINS Specification v1.0 -->
<!-- ZS:PLATFORM:WEB -->
<!-- ZS:LANGUAGE:JAVASCRIPT -->

## Description
[1-3 paragraphs: what the application does, its purpose, key value proposition]

## Functionality

### Core Features
[Bulleted list of every feature the application provides]

### User Interface
[ASCII art layout diagram showing the UI structure, followed by detailed description of each UI element, component, and their arrangement]

### Behavior Specifications
[Detailed explanation of how the application behaves: user interactions, state transitions, animations, edge cases, error states]

## Technical Implementation

### Architecture
[Single-file HTML architecture, framework choices (React/vanilla/etc), CDN dependencies, overall code organization]

### Data Structures
[JavaScript object definitions with field names, types, validation rules, and example values]

### Algorithms
[Key algorithms: sorting, filtering, calculations, state management logic]

### State Management
[How application state is organized, updated, and persisted]

## Style Guide
[Colors (exact hex values), typography (font families, sizes), spacing, border radius, animations, dark/light mode, responsive breakpoints]

## Accessibility Requirements
[Keyboard navigation, ARIA labels, focus management, color contrast, screen reader support]

## Performance Goals
[Load time targets, animation smoothness, memory usage]

## Testing Scenarios
[5-10 specific test cases that verify the core functionality works correctly]

RULES:
- Be EXPLICIT about every detail. Do not say "appropriate styling" — say "background: #1a1a2e, text: #e0e0e0, border-radius: 8px"
- Include ASCII art UI diagrams
- Include JavaScript data structure definitions with types and example values
- The README must be SELF-CONTAINED — no external references
- The README must contain SUFFICIENT DETAIL that an LLM reading only this README could produce a functionally equivalent application
- Do NOT include the source code itself — describe what it does, not how it's coded
- Output ONLY the README markdown, no preamble or explanation"#;

    cmd.arg("--system-prompt").arg(system_prompt);

    cmd.stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    // Build the input: HTML content + context
    let input = format!(
        "Project title: {}\n\nUser's original description: {}\n\nHere is the complete HTML source code of the working application. \
        Analyze it thoroughly and generate a TINS-compliant README specification:\n\n```html\n{}\n```",
        project_title,
        user_description,
        html_content
    );

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input.as_bytes()).await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        drop(stdin);
    }

    // Stream stdout line-by-line, collecting into full output.
    // Emit progress events so the frontend can show live status.
    //
    // Activity-based timeout: instead of a fixed deadline, we reset a
    // per-line timer every time output arrives. Claude can take as long as
    // it needs for complex apps — we only kill the process if it goes
    // silent for 90 seconds (stall detection). The initial wait is longer
    // (3 minutes) to allow for the thinking/analysis phase before any
    // output begins.
    let mut collected = String::new();
    let mut line_count: u32 = 0;

    // How long to wait for the very first line (Claude is analyzing the HTML)
    const INITIAL_WAIT: Duration = Duration::from_secs(180);
    // How long to wait between subsequent lines before declaring a stall
    const LINE_STALL: Duration = Duration::from_secs(90);

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        let mut current_timeout = INITIAL_WAIT;

        loop {
            match timeout(current_timeout, lines.next_line()).await {
                Ok(Ok(Some(line))) => {
                    if !collected.is_empty() {
                        collected.push('\n');
                    }
                    collected.push_str(&line);
                    line_count += 1;

                    // After first output, switch to the shorter stall timeout
                    current_timeout = LINE_STALL;

                    // Emit progress every 5 lines so the UI can update
                    if line_count % 5 == 0 {
                        let _ = app.emit("tins-progress", TinsProgress {
                            lines_received: line_count,
                        });
                    }
                }
                Ok(Ok(None)) => break,   // EOF — Claude finished
                Ok(Err(e)) => {
                    return Err(format!("Failed to read claude output: {}", e));
                }
                Err(_) => {
                    // No output for too long — Claude has stalled
                    let _ = child.kill().await;
                    if line_count == 0 {
                        return Err("Claude produced no output after 3 minutes".to_string());
                    } else {
                        return Err(format!(
                            "Claude stalled after {} lines (no output for 90s)",
                            line_count
                        ));
                    }
                }
            }
        }
    }

    // Wait for the process to fully exit
    let status = child.wait().await
        .map_err(|e| format!("Failed to wait for claude: {}", e))?;

    if !status.success() {
        return Err(format!("Claude exited with status: {}", status));
    }

    let readme = collected.trim().to_string();

    if readme.is_empty() {
        return Err("Claude produced empty output".to_string());
    }

    Ok(readme)
}
