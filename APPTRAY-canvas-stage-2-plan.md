# APPTRAY Canvas — Stage 2 Implementation Plan

## Feature Overview

The **APPTRAY** is a new third interface mode that transforms the left pane into a mock holographic desktop. Users can "promote" apps created in conversations to appear as clickable desktop icons. Clicking an icon launches the app in the renderer pane. The desktop uses a Windows 3.1 teal background by default, with color customization in Settings.

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│  App.tsx   View = "chat" | "library" | "settings" | "apptray"│
│                                                              │
│  ┌──────────────┬───┬──────────────────────┐                 │
│  │  Left Pane   │ S │   Right Pane         │                 │
│  │              │ P │                      │                 │
│  │  [AppTray]   │ L │  RendererPane        │                 │
│  │  grid of     │ I │  (launches promoted  │                 │
│  │  promoted    │ T │   app HTML)          │                 │
│  │  app icons   │ T │                      │                 │
│  │              │ E │                      │                 │
│  │              │ R │                      │                 │
│  └──────────────┴───┴──────────────────────┘                 │
│                                                              │
│  New state: promotedApps[] persisted in apptray.json         │
│  New Rust module: src-tauri/src/apptray.rs                   │
│  New React component: src/components/AppTrayView.tsx         │
│  New React hook: src/hooks/useAppTray.ts                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Model

### PromotedApp (TypeScript)

```typescript
// src/lib/types.ts — add this interface

export interface PromotedApp {
  /** conversation ID this app came from */
  conversation_id: string;
  /** display name extracted from HTML <title> or conversation title */
  name: string;
  /** absolute path to the thumbnail PNG (~/.holographic/thumbnails/{id}.png) */
  thumbnail_path: string | null;
  /** absolute path to the HTML file in workspace */
  html_path: string;
  /** ISO timestamp when promoted */
  promoted_at: string;
}
```

### PromotedApp (Rust)

```rust
// src-tauri/src/apptray.rs — new module

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
```

### Storage

- File: `~/.holographic/apptray.json`
- Format: JSON array of `PromotedApp` objects
- Separate from settings.json — keeps app registry independent

---

## Step-by-Step Implementation

### Step 1: Add Rust APPTRAY Module

**File: `src-tauri/src/apptray.rs`** (new file)

```rust
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
    // Avoid duplicates by conversation_id
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
```

### Step 2: Register New Tauri Commands

**File: `src-tauri/src/lib.rs`**

Add `mod apptray;` at the top with other module declarations, then register all 4 commands in the invoke handler:

```rust
mod apptray;   // <-- add this line

// In the invoke_handler, add:
apptray::list_promoted_apps,
apptray::promote_app,
apptray::demote_app,
apptray::is_app_promoted,
```

### Step 3: Add Desktop Background Color to Settings

**File: `src-tauri/src/settings.rs`** — add field to `AppSettings`:

```rust
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
    pub desktop_color: String,           // <-- new field
}

fn default_desktop_color() -> String {
    "#008080".to_string()   // Windows 3.1 teal
}
```

Also update the `Default` impl to include `desktop_color: "#008080".to_string()`.

### Step 4: Update TypeScript Types

**File: `src/lib/types.ts`** — add the PromotedApp interface:

```typescript
/** An app promoted to the APPTRAY desktop */
export interface PromotedApp {
  conversation_id: string;
  name: string;
  thumbnail_path: string | null;
  html_path: string;
  promoted_at: string;
}
```

### Step 5: Create the `useAppTray` Hook

**File: `src/hooks/useAppTray.ts`** (new file)

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PromotedApp } from "../lib/types";

export function useAppTray() {
  const [promotedApps, setPromotedApps] = useState<PromotedApp[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const apps = await invoke<PromotedApp[]>("list_promoted_apps");
      setPromotedApps(apps);
    } catch (err) {
      console.error("Failed to list promoted apps:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const promoteApp = useCallback(
    async (app: PromotedApp) => {
      await invoke("promote_app", { app });
      await refresh();
    },
    [refresh],
  );

  const demoteApp = useCallback(
    async (conversationId: string) => {
      await invoke("demote_app", { conversationId });
      await refresh();
    },
    [refresh],
  );

  const isPromoted = useCallback(async (conversationId: string) => {
    return invoke<boolean>("is_app_promoted", { conversationId });
  }, []);

  return { promotedApps, loading, refresh, promoteApp, demoteApp, isPromoted };
}
```

### Step 6: Update `useTheme` to Include Desktop Color

**File: `src/hooks/useTheme.ts`**

Add `desktop_color` to the `AppSettings` interface and expose `desktopColor` / `updateDesktopColor`:

```typescript
interface AppSettings {
  accent_color: string;
  high_contrast: boolean;
  font_size: number;
  system_prompt: string;
  splitter_position: number;
  desktop_color: string;           // <-- new field
}

const DEFAULT_SETTINGS: AppSettings = {
  accent_color: "#00d4ff",
  high_contrast: false,
  font_size: 13,
  system_prompt: "",
  splitter_position: 0.4,
  desktop_color: "#008080",        // <-- Windows 3.1 teal
};
```

Add state, loader, and update function:
```typescript
const [desktopColor, setDesktopColor] = useState(DEFAULT_SETTINGS.desktop_color);

// In the useEffect loading settings:
if (settings.desktop_color) {
  setDesktopColor(settings.desktop_color);
}

// New update function:
const updateDesktopColor = useCallback(
  async (color: string) => {
    setDesktopColor(color);
    await saveSettings({ desktop_color: color });
  },
  [saveSettings],
);

// Include desktop_color in the saveSettings merge:
await invoke("save_settings", {
  settings: {
    accent_color: updates.accent_color ?? accentColor,
    high_contrast: updates.high_contrast ?? highContrast,
    font_size: updates.font_size ?? fontSize,
    system_prompt: updates.system_prompt ?? systemPrompt,
    splitter_position: updates.splitter_position ?? splitterPosition,
    desktop_color: updates.desktop_color ?? desktopColor,
  },
});

// Return desktopColor and updateDesktopColor
```

### Step 7: Create the AppTrayView Component

**File: `src/components/AppTrayView.tsx`** (new file)

This is the holographic desktop view. It displays a grid of promoted app icons on a configurable background.

```typescript
import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PromotedApp } from "../lib/types";

interface AppTrayViewProps {
  promotedApps: PromotedApp[];
  loading: boolean;
  desktopColor: string;
  onLaunchApp: (app: PromotedApp) => void;
  onDemoteApp: (conversationId: string) => void;
  onClose: () => void;
}

export function AppTrayView({
  promotedApps,
  loading,
  desktopColor,
  onLaunchApp,
  onDemoteApp,
  onClose,
}: AppTrayViewProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    app: PromotedApp;
  } | null>(null);

  // Close context menu on click anywhere
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  return (
    <div
      className="flex flex-col h-full relative select-none"
      style={{ backgroundColor: desktopColor }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur-sm flex-shrink-0 z-10">
        <span className="text-sm font-medium text-white drop-shadow">
          App Tray
        </span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-xs transition-colors"
        >
          Back to Chat
        </button>
      </div>

      {/* Desktop area — icon grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/60 text-sm">
            Loading...
          </div>
        ) : promotedApps.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 px-8">
              <div className="text-5xl opacity-20">&#128187;</div>
              <p className="text-white/80 text-sm font-medium">
                No apps promoted yet
              </p>
              <p className="text-white/50 text-xs leading-relaxed max-w-[280px]">
                Create an app in a conversation, then click the Promote
                button to add it to your desktop.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-4">
            {promotedApps.map((app) => (
              <button
                key={app.conversation_id}
                className="flex flex-col items-center gap-1.5 p-2 rounded-lg
                  hover:bg-white/10 active:bg-white/20
                  transition-colors cursor-pointer group"
                onClick={() => onLaunchApp(app)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, app });
                }}
                title={`Launch ${app.name}`}
              >
                {/* Thumbnail or fallback icon */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center shadow-lg">
                  {app.thumbnail_path ? (
                    <img
                      src={convertFileSrc(app.thumbnail_path)}
                      alt={app.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-2xl opacity-50">&#128196;</span>
                  )}
                </div>
                {/* App name label */}
                <span className="text-[10px] text-white text-center leading-tight
                  max-w-[80px] line-clamp-2 drop-shadow-sm">
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLaunchApp(contextMenu.app);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            Launch App
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDemoteApp(contextMenu.app.conversation_id);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-error hover:bg-bg-tertiary transition-colors"
          >
            Remove from Desktop
          </button>
        </div>
      )}
    </div>
  );
}
```

### Step 8: Add "Promote" Button to ChatPane Header

**File: `src/components/ChatPane.tsx`**

Add new props and the Promote toggle button in the header bar.

**New props to add to `ChatPaneProps`:**
```typescript
interface ChatPaneProps {
  // ... existing props ...
  conversationId?: string;
  isPromoted?: boolean;
  onTogglePromote?: () => void;
  onShowAppTray?: () => void;
}
```

**Add to the header button row** (between the Log button and Library button):

```tsx
{/* Promote toggle */}
{onTogglePromote && conversationId && messages.length > 0 && (
  <button
    onClick={onTogglePromote}
    className={`text-[10px] transition-colors ${
      isPromoted
        ? "text-accent font-medium"
        : "text-text-secondary hover:text-accent"
    }`}
    title={isPromoted ? "Remove from App Tray" : "Promote to App Tray"}
  >
    {isPromoted ? "Promoted" : "Promote"}
  </button>
)}

{/* App Tray button */}
{onShowAppTray && (
  <button
    onClick={onShowAppTray}
    className="text-text-secondary hover:text-accent text-xs transition-colors"
    title="Open App Tray (Ctrl+T)"
  >
    AppTray
  </button>
)}
```

### Step 9: Add Desktop Color Setting to SettingsPanel

**File: `src/components/SettingsPanel.tsx`**

Add new props:
```typescript
interface SettingsPanelProps {
  // ... existing props ...
  desktopColor: string;
  onDesktopColorChange: (color: string) => void;
}
```

Add a new section after "Accent Color" (reusing the same pattern):

```tsx
{/* Desktop background color */}
<div>
  <label className="text-xs font-medium text-text-primary block mb-2">
    App Tray Background
  </label>
  <div className="flex flex-wrap gap-2 mb-3">
    {[
      { name: "Win 3.1 Teal", value: "#008080" },
      { name: "Deep Navy", value: "#000080" },
      { name: "Forest Green", value: "#006400" },
      { name: "Charcoal", value: "#1a1a2e" },
      { name: "Midnight Purple", value: "#1a0033" },
      { name: "Slate", value: "#2f4f4f" },
    ].map((preset) => (
      <button
        key={preset.value}
        onClick={() => onDesktopColorChange(preset.value)}
        className={`w-7 h-7 rounded-full border-2 transition-all ${
          desktopColor === preset.value
            ? "border-white scale-110"
            : "border-transparent hover:scale-105"
        }`}
        style={{ backgroundColor: preset.value }}
        title={preset.name}
      />
    ))}
  </div>
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={desktopColor}
      onChange={(e) => onDesktopColorChange(e.target.value)}
      className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
    />
    <input
      type="text"
      value={desktopColor}
      onChange={(e) => {
        const v = e.target.value;
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
          onDesktopColorChange(expandHex(v));
        }
      }}
      className="bg-bg-tertiary text-text-primary rounded px-2 py-1 text-xs font-mono w-24 outline-none focus:ring-1 focus:ring-accent"
      placeholder="#008080"
    />
  </div>
</div>
```

Also add `Ctrl+T` to the keyboard shortcuts reference section:
```tsx
<div className="flex justify-between">
  <span>Toggle App Tray</span>
  <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
    Ctrl+T
  </kbd>
</div>
```

### Step 10: Wire Everything Together in App.tsx

**File: `src/App.tsx`**

This is the main orchestration step. Key changes:

**1. Expand the View type:**
```typescript
type View = "chat" | "library" | "settings" | "apptray";
```

**2. Import new components/hooks:**
```typescript
import { AppTrayView } from "./components/AppTrayView";
import { useAppTray } from "./hooks/useAppTray";
```

**3. Add useAppTray hook:**
```typescript
const { promotedApps, loading: appTrayLoading, refresh: refreshAppTray, promoteApp, demoteApp, isPromoted } = useAppTray();
```

**4. Track promote state for current conversation:**
```typescript
const [currentIsPromoted, setCurrentIsPromoted] = useState(false);

// Check promote status when conversation changes
useEffect(() => {
  if (conversationId) {
    isPromoted(conversationId).then(setCurrentIsPromoted).catch(() => setCurrentIsPromoted(false));
  }
}, [conversationId, isPromoted]);
```

**5. Promote/demote handler:**
```typescript
const handleTogglePromote = useCallback(async () => {
  if (!conversationId) return;

  if (currentIsPromoted) {
    await demoteApp(conversationId);
    setCurrentIsPromoted(false);
  } else {
    // Find the current HTML file path from the renderer
    // Use workspace to find the latest HTML for this conversation
    let htmlPath = "";
    try {
      const files = await invoke<string[]>("list_workspace_html");
      if (files.length > 0) htmlPath = files[0];
    } catch { /* no file yet */ }

    if (!htmlPath) {
      addToast("error", "No rendered app to promote — send a message first");
      return;
    }

    // Determine thumbnail path
    const thumbPath = `${workspacePath.replace(/[/\\]workspace\/?$/, "/thumbnails")}/${conversationId}.png`;

    await promoteApp({
      conversation_id: conversationId,
      name: conversationTitle,
      thumbnail_path: thumbPath,
      html_path: htmlPath,
      promoted_at: new Date().toISOString(),
    });
    setCurrentIsPromoted(true);
    addToast("success", `"${conversationTitle}" promoted to App Tray`);
  }
}, [conversationId, currentIsPromoted, conversationTitle, workspacePath, demoteApp, promoteApp, addToast]);
```

**6. App launch handler** (loads HTML into renderer from apptray):
```typescript
const handleLaunchApp = useCallback(async (app: PromotedApp) => {
  // Load the conversation so the chat shows the history
  await loadConversation(app.conversation_id);
  setView("chat");
}, [loadConversation]);
```

**7. Add Ctrl+T keyboard shortcut:**

In `useKeyboardShortcuts` call:
```typescript
onToggleAppTray: () => {
  setView((v) => (v === "apptray" ? "chat" : "apptray"));
  if (view !== "apptray") refreshAppTray();
},
```

**8. Update the left pane rendering** to include the new AppTray view:

```tsx
{view === "chat" ? (
  <ChatPane
    {/* ...existing props... */}
    conversationId={conversationId}
    isPromoted={currentIsPromoted}
    onTogglePromote={handleTogglePromote}
    onShowAppTray={() => { setView("apptray"); refreshAppTray(); }}
  />
) : view === "library" ? (
  <LibraryView {/* ...existing props... */} />
) : view === "apptray" ? (
  <AppTrayView
    promotedApps={promotedApps}
    loading={appTrayLoading}
    desktopColor={desktopColor}
    onLaunchApp={handleLaunchApp}
    onDemoteApp={async (id) => {
      await demoteApp(id);
      await refreshAppTray();
    }}
    onClose={() => setView("chat")}
  />
) : (
  <SettingsPanel
    {/* ...existing props... */}
    desktopColor={desktopColor}
    onDesktopColorChange={updateDesktopColor}
  />
)}
```

**9. Pass desktopColor through from useTheme:**

Add `desktopColor` and `updateDesktopColor` to the useTheme destructuring at the top of App().

### Step 11: Update `useKeyboardShortcuts` Hook

**File: `src/hooks/useKeyboardShortcuts.ts`**

Add `onToggleAppTray` to the interface and register `Ctrl+T`:

```typescript
interface KeyboardShortcutHandlers {
  // ... existing ...
  onToggleAppTray?: () => void;
}

// In the keydown handler:
if (e.ctrlKey && e.key === "t") {
  e.preventDefault();
  handlers.onToggleAppTray?.();
}
```

### Step 12: Handle Thumbnail Loading via Tauri Asset Protocol

Thumbnails are stored as local PNGs. To display them in the webview, use Tauri's `convertFileSrc()` which converts absolute paths to the `asset://` protocol:

```typescript
import { convertFileSrc } from "@tauri-apps/api/core";

// In the AppTrayView icon rendering:
<img src={convertFileSrc(app.thumbnail_path)} />
```

This requires the `asset` protocol scope in Tauri config. Check `src-tauri/tauri.conf.json` and ensure the security scope allows reading from `~/.holographic/thumbnails/`:

```json
{
  "security": {
    "assetProtocol": {
      "enable": true,
      "scope": ["**"]
    }
  }
}
```

If the app currently doesn't use `convertFileSrc`, we may need to add `tauri-plugin-fs` or use `asset:` protocol scope. An alternative fallback is to read the thumbnail as base64 via a Rust command and render as a data URL — this avoids protocol scope issues entirely:

```rust
// src-tauri/src/apptray.rs — add this command
#[tauri::command]
pub async fn read_thumbnail_base64(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read thumbnail: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}
```

Then in the frontend:
```typescript
const [thumbSrc, setThumbSrc] = useState<string | null>(null);
useEffect(() => {
  if (app.thumbnail_path) {
    invoke<string>("read_thumbnail_base64", { path: app.thumbnail_path })
      .then(b64 => setThumbSrc(`data:image/png;base64,${b64}`))
      .catch(() => setThumbSrc(null));
  }
}, [app.thumbnail_path]);
```

**Decision: Use the base64 approach** — it avoids all protocol scope configuration and works reliably across platforms. The thumbnails are small (0.5 scale, ~10-30KB each) so the overhead is negligible. We can add a caching layer later if needed.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/src/apptray.rs` | **CREATE** | Rust module: PromotedApp CRUD + read_thumbnail_base64 |
| `src-tauri/src/lib.rs` | EDIT | Add `mod apptray;` + register 5 new commands |
| `src-tauri/src/settings.rs` | EDIT | Add `desktop_color` field to AppSettings |
| `src/lib/types.ts` | EDIT | Add `PromotedApp` interface |
| `src/hooks/useAppTray.ts` | **CREATE** | React hook for apptray state management |
| `src/hooks/useTheme.ts` | EDIT | Add desktopColor state + persistence |
| `src/hooks/useKeyboardShortcuts.ts` | EDIT | Add Ctrl+T for App Tray toggle |
| `src/components/AppTrayView.tsx` | **CREATE** | Desktop grid view with icons + context menu |
| `src/components/ChatPane.tsx` | EDIT | Add Promote button + AppTray nav button |
| `src/components/SettingsPanel.tsx` | EDIT | Add desktop color picker section |
| `src/App.tsx` | EDIT | Wire everything: new view, state, handlers |

**New files: 3** | **Modified files: 8** | **Total: 11 files**

---

## Implementation Order

1. **Rust backend first** — `apptray.rs`, then `lib.rs` and `settings.rs` changes
2. **TypeScript types** — `types.ts` update
3. **Hooks** — `useAppTray.ts` (new), `useTheme.ts` (edit), `useKeyboardShortcuts.ts` (edit)
4. **Components** — `AppTrayView.tsx` (new), `ChatPane.tsx` (edit), `SettingsPanel.tsx` (edit)
5. **Orchestration** — `App.tsx` (wire everything together)
6. **Test** — `cargo check`, then `npm run tauri dev` for manual verification

---

## UX Behavior Specification

### Promote Flow
1. User creates an app via conversation (Claude writes HTML → renders in right pane)
2. User clicks **"Promote"** button in the ChatPane header
3. System captures: conversation_id, conversationTitle as name, thumbnail_path, latest HTML path
4. Button changes to **"Promoted"** (highlighted in accent color)
5. Toast: `"Calculator" promoted to App Tray`
6. Clicking "Promoted" again **demotes** — removes from tray, button reverts

### App Tray View
1. User clicks **"AppTray"** button in ChatPane header (or presses `Ctrl+T`)
2. Left pane switches to the desktop view (replaces chat/library)
3. Desktop shows a responsive grid of app icons (thumbnail + name)
4. Background color is the configurable desktop color (default: Windows 3.1 teal `#008080`)
5. **Left-click** an icon → loads that conversation + renders its HTML in the right pane, switches back to chat view
6. **Right-click** an icon → context menu with "Launch App" and "Remove from Desktop"
7. **"Back to Chat"** button in the top bar returns to the chat view
8. Empty state shows a helpful message explaining how to promote apps

### Settings
- New "App Tray Background" section in SettingsPanel
- 6 preset colors (Win 3.1 Teal, Deep Navy, Forest Green, Charcoal, Midnight Purple, Slate)
- Custom color picker + hex input (same pattern as accent color)
- Persisted in `settings.json` as `desktop_color`

### Keyboard Shortcut
- `Ctrl+T` toggles between current view and App Tray (consistent with `Ctrl+L` for Library)
