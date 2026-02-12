use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// A single chat message in a conversation.
#[derive(Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub role: String,        // "user" | "assistant"
    pub content: String,
    pub timestamp: String,
    pub jsx_snapshot: Option<String>,
    pub jsx_valid: Option<bool>,
}

/// Full conversation with metadata.
#[derive(Clone, Serialize, Deserialize)]
pub struct Conversation {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<ConversationMessage>,
    pub current_html_path: Option<String>,
    pub thumbnail_path: Option<String>,
}

/// Lightweight summary for library listing (avoids loading full message arrays).
#[derive(Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub current_html_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub preview: String, // First ~100 chars of first user message
}

fn default_schema_version() -> u32 {
    1
}

/// Get the conversations directory (~/.holographic/conversations/).
fn get_conversations_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let convos = home.join(".holographic").join("conversations");
    if !convos.exists() {
        std::fs::create_dir_all(&convos)
            .map_err(|e| format!("Failed to create conversations dir: {}", e))?;
    }
    Ok(convos)
}

/// Save a conversation to disk.
#[tauri::command]
pub async fn save_conversation(conversation: Conversation) -> Result<(), String> {
    let dir = get_conversations_dir()?;
    let file_path = dir.join(format!("{}.json", conversation.id));
    let json = serde_json::to_string_pretty(&conversation)
        .map_err(|e| format!("Failed to serialize conversation: {}", e))?;
    tokio::fs::write(&file_path, json)
        .await
        .map_err(|e| format!("Failed to write conversation file: {}", e))?;
    Ok(())
}

/// Load a conversation from disk by ID.
#[tauri::command]
pub async fn load_conversation(id: String) -> Result<Conversation, String> {
    let dir = get_conversations_dir()?;
    let file_path = dir.join(format!("{}.json", id));
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("Failed to read conversation '{}': {}", id, e))?;
    let convo: Conversation = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse conversation '{}': {}", id, e))?;
    Ok(convo)
}

/// List all conversations as lightweight summaries, sorted by updated_at (newest first).
#[tauri::command]
pub async fn list_conversations() -> Result<Vec<ConversationSummary>, String> {
    let dir = get_conversations_dir()?;
    let mut summaries: Vec<ConversationSummary> = Vec::new();

    let mut read_dir = tokio::fs::read_dir(&dir)
        .await
        .map_err(|e| format!("Failed to read conversations dir: {}", e))?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        match tokio::fs::read_to_string(&path).await {
            Ok(content) => {
                if let Ok(convo) = serde_json::from_str::<Conversation>(&content) {
                    let preview = convo
                        .messages
                        .iter()
                        .find(|m| m.role == "user")
                        .map(|m| {
                            if m.content.len() > 100 {
                                format!("{}...", &m.content[..100])
                            } else {
                                m.content.clone()
                            }
                        })
                        .unwrap_or_default();

                    summaries.push(ConversationSummary {
                        id: convo.id,
                        title: convo.title,
                        tags: convo.tags,
                        favorite: convo.favorite,
                        created_at: convo.created_at,
                        updated_at: convo.updated_at,
                        message_count: convo.messages.len(),
                        current_html_path: convo.current_html_path,
                        thumbnail_path: convo.thumbnail_path,
                        preview,
                    });
                }
            }
            Err(e) => {
                eprintln!("Warning: Failed to read conversation file {:?}: {}", path, e);
            }
        }
    }

    // Sort newest first by updated_at
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

/// Update a conversation's metadata (favorite, tags, title) without rewriting messages.
#[tauri::command]
pub async fn update_conversation_meta(
    id: String,
    favorite: Option<bool>,
    tags: Option<Vec<String>>,
    title: Option<String>,
) -> Result<(), String> {
    let dir = get_conversations_dir()?;
    let file_path = dir.join(format!("{}.json", id));
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("Failed to read conversation '{}': {}", id, e))?;
    let mut convo: Conversation = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse conversation '{}': {}", id, e))?;

    if let Some(fav) = favorite {
        convo.favorite = fav;
    }
    if let Some(t) = tags {
        convo.tags = t;
    }
    if let Some(ttl) = title {
        convo.title = ttl;
    }
    convo.updated_at = chrono::Utc::now().to_rfc3339();

    let json = serde_json::to_string_pretty(&convo)
        .map_err(|e| format!("Failed to serialize conversation: {}", e))?;
    tokio::fs::write(&file_path, json)
        .await
        .map_err(|e| format!("Failed to write conversation file: {}", e))?;
    Ok(())
}

/// Delete a conversation by ID.
#[tauri::command]
pub async fn delete_conversation(id: String) -> Result<(), String> {
    let dir = get_conversations_dir()?;
    let file_path = dir.join(format!("{}.json", id));
    if file_path.exists() {
        tokio::fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("Failed to delete conversation '{}': {}", id, e))?;
    }
    Ok(())
}
