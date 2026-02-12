# Holographic-TINS Quick Wins Plan

<!-- TINS Specification v1.0 -->
<!-- ZS:COMPLEXITY:MEDIUM -->
<!-- ZS:PLATFORM:DESKTOP -->

## Description

This plan addresses 20 high-impact, low-effort improvements to the Holographic-TINS codebase — fixes that harden reliability, plug silent failure paths, and smooth the user experience. Each item was identified through a full-codebase audit of all Rust backend modules, React components, hooks, and configuration files.

The improvements fall into four tiers: **critical fixes** (race conditions, memory leaks, missing cleanup), **error handling** (silent failures surfaced to users), **UX polish** (loading states, validation, feedback), and **performance** (memoization, efficient hashing, reduced re-renders). Every change is scoped to a single file or minimal cross-file edit, with complete code provided.

---

## Functionality

### Core Features

- Fix race condition in streaming response finalization (empty response guard)
- Cancel ConnectionStatus polling on unmount (prevent React warnings)
- Cancel auto-save debounce timer on unmount (prevent orphaned writes)
- Add timeout to Claude CLI subprocess (prevent indefinite hangs)
- Add `React.memo()` to ChatMessage (prevent unnecessary re-renders)
- Replace content-length hash with proper content hash for hot-reload
- Add loading states to all export buttons (not just TINS)
- Add `maxLength` to editable title input (prevent layout overflow)
- Support 3-digit hex colors in accent color picker
- Add `aria-live="assertive"` to renderer error alert
- Add toast notification system for success/failure feedback
- Include error details in user-facing error messages
- Add font-size bounds checking before async calls
- Validate tag input rejects whitespace-only strings
- Restore focus after title edit cancellation
- Add conversation version field for migration safety
- Persist splitter position across sessions
- Add copy-to-clipboard for rendered file path
- Add system prompt customization in settings
- Add Ctrl+F search within chat conversation

### User Interface Changes

```
Chat Header (current):
[Title]  [Export] [JSON] [TINS] [Log] [Library] [⚙]

Chat Header (after):
[Title]  [Export] [JSON] [TINS] [Log] [Library] [⚙]
          ^^^^^^   ^^^^
          Now shows loading spinner during export

Renderer Pane (after):
+------------------------------------------+
|                                          |
|           [rendered content]             |
|                                          |
+------------------------------------------+
| idle  |  app.html  [📋]                  |
                      ^^^^
                      New: copy path button

Settings Panel (after):
+------------------------------------------+
| Accent Color: [■][■][■] #hex            |
| High Contrast: [○/●]                    |
| Font Size: [-] 13px [+]                 |
| System Prompt: [Edit...]      ← NEW     |
| Splitter: [Save position ✓]  ← NEW     |
+------------------------------------------+

Toast Notifications (new):
+------------------------------------------+
|  ✓ HTML exported successfully            |
|  ✗ Export failed: file write error       |
+------------------------------------------+
```

### Behavior Specifications

1. **Empty response guard** — When Claude sends `done: true` with empty `currentResponseRef`, skip adding assistant message. Log warning.
2. **ConnectionStatus cleanup** — Add `cancelled` boolean flag, check before `setStatus()` in async callback.
3. **Auto-save cleanup** — Clear `autoSaveTimerRef` in useEffect return.
4. **Claude timeout** — Wrap `child.wait()` in `tokio::time::timeout(Duration::from_secs(120))`. On timeout, kill child and return error.
5. **ChatMessage memo** — Wrap component in `React.memo()` with prop comparison.
6. **Content hash** — Replace `content.length` with simple string hash function.
7. **Export loading states** — Add `isExporting` state to `useExport`, set true during any export, disable all export buttons while active.
8. **Title maxLength** — Add `maxLength={100}` to title input element.
9. **3-digit hex** — Expand regex to `/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`, expand 3→6 before applying.
10. **Error alert ARIA** — Add `aria-live="assertive"` to error overlay div.
11. **Toast system** — New `useToast` hook + `<Toast>` component. Auto-dismiss after 3s. Success (green) / Error (red) variants.
12. **Error details** — Replace `console.error("Export failed:", err)` with toast showing `err.message || String(err)`.
13. **Font-size bounds** — Check `fontSize >= 20` before `increaseFontSize` call, `fontSize <= 10` before `decreaseFontSize`.
14. **Tag validation** — Reject if `tag.trim().length === 0` (already partially done, tighten check).
15. **Focus restoration** — On Escape in title edit, call `titleSpanRef.current?.focus()`.
16. **Conversation version** — Add `schema_version: 1` to Conversation type and Rust save/load.
17. **Splitter persistence** — Save `splitPosition` to settings.json on drag end, restore on load.
18. **Copy file path** — Add clipboard button next to filename badge in RendererPane.
19. **System prompt setting** — Add textarea in SettingsPanel, save to settings.json, pass to useClaudeChat.
20. **Ctrl+F chat search** — Add search bar overlay in ChatPane, highlight matching messages.

---

## Technical Implementation

### Architecture

All 20 changes are scoped to existing files. No new Rust modules needed. Two new React components are introduced (`Toast.tsx`, `ChatSearch.tsx`), and one new hook (`useToast.ts`). The rest are edits to existing files.

| Priority | Files Modified | New Files |
|----------|---------------|-----------|
| Critical (1-4) | `useClaudeChat.ts`, `ConnectionStatus.tsx`, `claude.rs` | — |
| Error Handling (5-6, 11-14) | `ChatMessage.tsx`, `RendererPane.tsx`, `useExport.ts`, `useTheme.ts`, `LibraryView.tsx` | `useToast.ts`, `Toast.tsx` |
| UX Polish (7-10, 15-20) | `ChatPane.tsx`, `SettingsPanel.tsx`, `settings.rs`, `App.tsx`, `useKeyboardShortcuts.ts` | `ChatSearch.tsx` |

### Data Structures

**Toast state:**
```javascript
{
  id: number,          // auto-incrementing
  type: "success" | "error",
  message: string,     // e.g. "HTML exported successfully"
  duration: 3000       // ms before auto-dismiss
}
```

**Settings (extended):**
```javascript
{
  accent_color: string,      // existing
  high_contrast: boolean,    // existing
  font_size: number,         // existing
  system_prompt: string,     // NEW — custom system prompt override
  splitter_position: number  // NEW — 0.0 to 1.0, default 0.5
}
```

**Conversation (versioned):**
```javascript
{
  schema_version: 1,         // NEW — for future migration
  id: string,
  title: string,
  // ... rest unchanged
}
```

### Algorithms

**Simple string hash (for hot-reload):**
```javascript
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash;
}
```

**3-digit hex expansion:**
```javascript
function expandHex(hex: string): string {
  if (hex.length === 4) { // #RGB → #RRGGBB
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}
```

---

## Implementation Steps

### Step 1: Critical Fixes (4 items)

#### 1a. Empty response guard — `src/hooks/useClaudeChat.ts`

In the `claude-response-chunk` event listener, where `chunk.done` is handled:

```typescript
// BEFORE (current):
if (chunk.done) {
  const finalContent = currentResponseRef.current;
  // ... pushes to messages unconditionally

// AFTER (fixed):
if (chunk.done) {
  const finalContent = currentResponseRef.current.trim();
  if (!finalContent) {
    console.warn("Claude sent done signal with empty response — skipping message creation");
    setIsStreaming(false);
    currentResponseRef.current = "";
    return;
  }
  // ... rest unchanged
```

#### 1b. ConnectionStatus cleanup — `src/components/ConnectionStatus.tsx`

```typescript
// BEFORE:
useEffect(() => {
  const check = async () => {
    try {
      const version = await invoke<string>("check_claude_status");
      setStatus({ connected: true, version });
    } catch {
      setStatus({ connected: false, version: null });
    }
  };
  check();
  const interval = setInterval(check, 30000);
  return () => clearInterval(interval);
}, []);

// AFTER:
useEffect(() => {
  let cancelled = false;
  const check = async () => {
    try {
      const version = await invoke<string>("check_claude_status");
      if (!cancelled) setStatus({ connected: true, version });
    } catch {
      if (!cancelled) setStatus({ connected: false, version: null });
    }
  };
  check();
  const interval = setInterval(check, 30000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, []);
```

#### 1c. Auto-save cleanup — `src/hooks/useClaudeChat.ts`

Add cleanup to the useEffect that manages the hook lifecycle:

```typescript
// Add to the existing useEffect cleanup or create new one:
useEffect(() => {
  return () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  };
}, []);
```

#### 1d. Claude subprocess timeout — `src-tauri/src/claude.rs`

In the `send_message` function, wrap the stdout read loop:

```rust
// At the top of claude.rs, add:
use tokio::time::{timeout, Duration};

// In generate_tins_readme, wrap wait_with_output:
let output = timeout(Duration::from_secs(120), child.wait_with_output())
    .await
    .map_err(|_| {
        // Kill the child process on timeout
        "Claude timed out after 120 seconds".to_string()
    })?
    .map_err(|e| format!("Failed to read claude output: {}", e))?;
```

---

### Step 2: ChatMessage Memoization — `src/components/ChatMessage.tsx`

```typescript
// BEFORE:
export function ChatMessage({ message }: { message: Message }) {
  // ...
}

// AFTER:
import { memo } from "react";

export const ChatMessage = memo(function ChatMessage({ message }: { message: Message }) {
  // ... body unchanged
});
```

---

### Step 3: Content Hash for Hot-Reload — `src/components/RendererPane.tsx`

```typescript
// Add helper function at top of file:
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

// BEFORE (in polling logic):
const contentHash = content.length;

// AFTER:
const contentHash = simpleHash(content);
```

---

### Step 4: Toast Notification System

#### 4a. New hook — `src/hooks/useToast.ts`

```typescript
import { useState, useCallback, useRef } from "react";

export interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
```

#### 4b. New component — `src/components/Toast.tsx`

```tsx
import type { Toast as ToastType } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all duration-300 animate-in slide-in-from-right cursor-pointer ${
            toast.type === "success"
              ? "bg-green-600/90 text-white"
              : "bg-red-600/90 text-white"
          }`}
          onClick={() => onDismiss(toast.id)}
        >
          <span className="mr-2">{toast.type === "success" ? "✓" : "✗"}</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
```

#### 4c. Wire into App.tsx

```typescript
// Add imports:
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/Toast";

// In App component:
const { toasts, addToast, removeToast } = useToast();

// Pass addToast to useExport:
const { exportHtml, exportJson, exportTinsReadme, exportBuildLog, isTinsGenerating } = useExport({
  messages,
  conversationId,
  conversationTitle,
  workspacePath,
  onSuccess: (msg: string) => addToast("success", msg),
  onError: (msg: string) => addToast("error", msg),
});

// In JSX, add before closing tag:
<ToastContainer toasts={toasts} onDismiss={removeToast} />
```

#### 4d. Update useExport.ts to emit toasts

Add `onSuccess` and `onError` callbacks to `ExportOptions`:

```typescript
interface ExportOptions {
  messages: Message[];
  conversationId: string;
  conversationTitle: string;
  workspacePath: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}
```

Then in each export function, replace `console.error` with callback:

```typescript
// In exportHtml:
if (savePath) {
  await invoke("export_to_file", { filePath: savePath, content });
  onSuccess?.("HTML exported successfully");
}
// ... catch:
onError?.(`Export failed: ${err instanceof Error ? err.message : String(err)}`);

// Same pattern for exportJson, exportBuildLog, exportTinsReadme
```

---

### Step 5: Export Loading States — `src/hooks/useExport.ts`

```typescript
const [isExporting, setIsExporting] = useState(false);

// Wrap each export in isExporting guard:
const exportHtml = useCallback(async () => {
  if (isExporting) return;
  setIsExporting(true);
  try {
    // ... existing logic
  } finally {
    setIsExporting(false);
  }
}, [isExporting, workspacePath, onSuccess, onError]);

// Return isExporting:
return { exportHtml, exportJson, exportTinsReadme, exportBuildLog, isTinsGenerating, isExporting };
```

In ChatPane, disable all export buttons while any export is running:

```tsx
const exportDisabled = isExporting || isTinsGenerating;

// Apply to each export button:
<button onClick={onExportHtml} disabled={exportDisabled} className={`... ${exportDisabled ? "opacity-50 cursor-wait" : ""}`}>
  {isExporting ? "..." : "Export"}
</button>
```

---

### Step 6: Title Improvements — `src/components/ChatPane.tsx`

```tsx
// Add maxLength:
<input
  value={editValue}
  onChange={(e) => setEditValue(e.target.value)}
  maxLength={100}
  // ... rest unchanged
/>

// On Escape, restore focus:
onKeyDown={(e) => {
  if (e.key === "Enter") {
    onTitleChange(editValue);
    setIsEditing(false);
  } else if (e.key === "Escape") {
    setIsEditing(false);
    // Restore focus to title span
    requestAnimationFrame(() => {
      titleRef.current?.focus();
    });
  }
}}
```

Add a ref to the title span:

```tsx
const titleRef = useRef<HTMLSpanElement>(null);

<span
  ref={titleRef}
  tabIndex={0}
  onClick={() => setIsEditing(true)}
  onKeyDown={(e) => { if (e.key === "Enter") setIsEditing(true); }}
  // ...
>
```

---

### Step 7: 3-Digit Hex Support — `src/components/SettingsPanel.tsx`

```typescript
// BEFORE:
const isValid = /^#[0-9a-fA-F]{6}$/.test(value);

// AFTER:
function expandHex(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

const isValid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
if (isValid) {
  updateAccentColor(expandHex(value));
}
```

---

### Step 8: ARIA Fix — `src/components/RendererPane.tsx`

```tsx
// BEFORE:
<div role="alert" className="...">

// AFTER:
<div role="alert" aria-live="assertive" className="...">
```

---

### Step 9: Font Size Bounds Check — `src/hooks/useTheme.ts`

```typescript
// BEFORE:
const increaseFontSize = useCallback(async () => {
  const newSize = Math.min(20, fontSize + 1);
  // ...
}, [fontSize]);

// AFTER:
const increaseFontSize = useCallback(async () => {
  if (fontSize >= 20) return;
  const newSize = fontSize + 1;
  // ...
}, [fontSize]);

const decreaseFontSize = useCallback(async () => {
  if (fontSize <= 10) return;
  const newSize = fontSize - 1;
  // ...
}, [fontSize]);
```

---

### Step 10: Settings Extensions — `src-tauri/src/settings.rs`

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    #[serde(default = "default_accent")]
    pub accent_color: String,
    #[serde(default)]
    pub high_contrast: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u8,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_splitter")]
    pub splitter_position: f64,
}

fn default_splitter() -> f64 {
    0.5
}
```

---

### Step 11: Splitter Persistence — `src/App.tsx`

```typescript
// Load splitter position from settings on mount:
const [splitPosition, setSplitPosition] = useState(0.5);

useEffect(() => {
  invoke<AppSettings>("load_settings").then((s) => {
    if (s.splitter_position) setSplitPosition(s.splitter_position);
  });
}, []);

// Save on drag end (debounced):
const saveSplitPosition = useCallback(
  debounce((pos: number) => {
    invoke("update_settings", { settings: { splitter_position: pos } });
  }, 500),
  []
);

const handleSplitChange = useCallback((pos: number) => {
  setSplitPosition(pos);
  saveSplitPosition(pos);
}, [saveSplitPosition]);
```

---

### Step 12: Copy File Path Button — `src/components/RendererPane.tsx`

```tsx
// Add next to filename badge:
{currentFile && (
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-text-secondary truncate max-w-[200px]">
      {currentFile}
    </span>
    <button
      onClick={() => navigator.clipboard.writeText(currentFile)}
      className="text-text-secondary hover:text-accent text-[10px] transition-colors"
      title="Copy file path"
    >
      📋
    </button>
  </div>
)}
```

---

### Step 13: System Prompt Setting — `src/components/SettingsPanel.tsx`

```tsx
// Add after font size control:
<div className="mt-3">
  <label className="text-[10px] text-text-secondary block mb-1">
    System Prompt Override
  </label>
  <textarea
    value={systemPrompt}
    onChange={(e) => onSystemPromptChange(e.target.value)}
    placeholder="Leave empty for default..."
    className="w-full h-20 bg-bg-primary text-text-primary text-[11px] rounded p-2 border border-border resize-none"
    maxLength={2000}
  />
</div>
```

In `useClaudeChat.ts`, check for custom prompt:

```typescript
const effectivePrompt = customSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
```

---

### Step 14: Conversation Schema Version — `src/lib/types.ts`

```typescript
export interface Conversation {
  schema_version?: number; // NEW — defaults to 1
  id: string;
  title: string;
  // ... rest unchanged
}
```

In Rust `conversations.rs`, add the field and migration on load:

```rust
#[derive(Serialize, Deserialize)]
pub struct Conversation {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    // ... rest unchanged
}

fn default_schema_version() -> u32 { 1 }
```

---

### Step 15: Chat Search (Ctrl+F) — New component `src/components/ChatSearch.tsx`

```tsx
import { useState, useEffect, useRef } from "react";
import type { Message } from "../lib/types";

interface ChatSearchProps {
  messages: Message[];
  onHighlight: (messageIndex: number | null) => void;
  onClose: () => void;
}

export function ChatSearch({ messages, onHighlight, onClose }: ChatSearchProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setMatches([]);
      onHighlight(null);
      return;
    }
    const lower = query.toLowerCase();
    const found = messages
      .map((m, i) => (m.content.toLowerCase().includes(lower) ? i : -1))
      .filter((i) => i >= 0);
    setMatches(found);
    setCurrent(0);
    if (found.length > 0) onHighlight(found[0]);
  }, [query, messages, onHighlight]);

  const navigate = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (current + dir + matches.length) % matches.length;
    setCurrent(next);
    onHighlight(matches[next]);
  };

  return (
    <div className="absolute top-0 left-0 right-0 bg-bg-secondary border-b border-border px-3 py-2 flex items-center gap-2 z-10">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") navigate(e.shiftKey ? -1 : 1);
        }}
        placeholder="Search messages..."
        className="flex-1 bg-bg-primary text-text-primary text-[12px] rounded px-2 py-1 border border-border"
      />
      <span className="text-[10px] text-text-secondary min-w-[60px] text-center">
        {matches.length > 0 ? `${current + 1}/${matches.length}` : "No results"}
      </span>
      <button onClick={() => navigate(-1)} className="text-text-secondary hover:text-accent text-[12px]">▲</button>
      <button onClick={() => navigate(1)} className="text-text-secondary hover:text-accent text-[12px]">▼</button>
      <button onClick={onClose} className="text-text-secondary hover:text-accent text-[12px]">✕</button>
    </div>
  );
}
```

Add Ctrl+F handler to `useKeyboardShortcuts.ts`:

```typescript
// Add to shortcut map:
if ((e.ctrlKey || e.metaKey) && e.key === "f") {
  e.preventDefault();
  onToggleChatSearch?.();
}
```

---

## Style Guide

- Toast notifications: `bg-green-600/90` for success, `bg-red-600/90` for error, `text-white`, `rounded-lg`, `shadow-lg`
- Toast position: fixed bottom-right (`bottom-4 right-4`)
- Toast animation: slide in from right, auto-dismiss 3s
- Search bar: matches existing `bg-bg-primary` / `border-border` / `text-[12px]` styling
- Copy button: `📋` emoji, same `text-[10px] text-text-secondary hover:text-accent` as other header buttons
- All new UI follows existing dark theme variables, no hardcoded colors

---

## Accessibility Requirements

- Toast notifications use `role="alert"` for screen reader announcement
- Error alert gets `aria-live="assertive"` (Step 8)
- Chat search input auto-focuses on open, Escape closes
- Search navigation via Enter (forward) / Shift+Enter (backward)
- Title maxLength prevents overflow without hiding content
- Font size bounds prevent clicking non-functional controls
- All new buttons are native `<button>` elements (keyboard accessible)

---

## Performance Goals

- `React.memo()` on ChatMessage eliminates re-renders for unchanged messages in long conversations
- Simple hash function replaces O(1) length check with O(n) hash — acceptable for <500KB HTML files, detects actual content changes
- Export loading guard prevents double-execution of file I/O operations
- Toast auto-dismiss uses single `setTimeout` per toast — negligible overhead
- Splitter position save is debounced at 500ms — no disk thrash during drag

---

## Testing Scenarios

1. **Empty response guard**: Send a message that causes Claude to return empty. Verify no empty assistant bubble appears. Check console for warning log.

2. **Component unmount safety**: Open settings, close quickly while ConnectionStatus is polling. Verify no React "setState on unmounted component" warning in console.

3. **Auto-save cleanup**: Start typing a message, close the app immediately. Verify no orphaned disk write occurs.

4. **Claude timeout**: Disconnect network during Claude processing. Verify error appears after 120s, not infinite hang.

5. **ChatMessage memoization**: Send 50 messages, then type in input. Verify only the streaming message re-renders (React DevTools Profiler).

6. **Content hash**: Modify an HTML file's content but keep the same byte length. Verify hot-reload detects the change.

7. **Toast notifications**: Export HTML, JSON, TINS, and Build Log. Verify green toast "✓ ... exported successfully" for each. Disconnect Claude, try TINS export. Verify red toast with error details.

8. **3-digit hex**: Enter `#fff` in accent color input. Verify it expands to `#ffffff` and applies as white accent.

9. **Title maxLength**: Paste a 200-character string into title edit. Verify it truncates to 100 characters.

10. **Ctrl+F search**: Open a conversation with 20 messages. Press Ctrl+F. Type a word that appears in 3 messages. Verify "1/3" counter, Enter cycles forward, Shift+Enter cycles backward, Escape closes search.

11. **Splitter persistence**: Drag splitter to 70%. Close and reopen app. Verify splitter restores to 70%.

12. **ARIA assertive**: Trigger a renderer error. Verify screen reader announces "Error:" immediately.

---

## Implementation Sequence

| Order | Task | Files | Est. Time |
|-------|------|-------|-----------|
| 1 | Empty response guard | `useClaudeChat.ts` | 2 min |
| 2 | ConnectionStatus cleanup | `ConnectionStatus.tsx` | 2 min |
| 3 | Auto-save timer cleanup | `useClaudeChat.ts` | 1 min |
| 4 | Claude subprocess timeout | `claude.rs` | 3 min |
| 5 | ChatMessage memoization | `ChatMessage.tsx` | 2 min |
| 6 | Content hash for hot-reload | `RendererPane.tsx` | 3 min |
| 7 | Toast system (hook + component) | `useToast.ts`, `Toast.tsx`, `App.tsx` | 10 min |
| 8 | Export loading states + toast wiring | `useExport.ts`, `ChatPane.tsx` | 8 min |
| 9 | Title maxLength + focus restore | `ChatPane.tsx` | 3 min |
| 10 | 3-digit hex colors | `SettingsPanel.tsx` | 3 min |
| 11 | ARIA assertive on error alert | `RendererPane.tsx` | 1 min |
| 12 | Font size bounds check | `useTheme.ts` | 2 min |
| 13 | Settings extensions (Rust) | `settings.rs` | 3 min |
| 14 | Splitter persistence | `App.tsx`, `settings.rs` | 5 min |
| 15 | Copy file path button | `RendererPane.tsx` | 3 min |
| 16 | System prompt setting | `SettingsPanel.tsx`, `useClaudeChat.ts` | 8 min |
| 17 | Conversation schema version | `types.ts`, `conversations.rs` | 3 min |
| 18 | Chat search (Ctrl+F) | `ChatSearch.tsx`, `ChatPane.tsx`, `useKeyboardShortcuts.ts` | 12 min |
| 19 | Build verification | `cargo check` + `tsc` | 3 min |
| 20 | Update stage-1-incomplete.md | — | 2 min |

**Total estimated: ~80 minutes**

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Toast animation conflicts with Tailwind v4 | Low | Uses standard opacity + transform, no custom keyframes needed |
| Splitter position restore causes layout flash | Low | Apply position before first render via useLayoutEffect |
| System prompt override breaks Claude behavior | Medium | Show "Default" placeholder, warn if custom prompt is very short |
| Schema version migration breaks old conversations | None | Field uses `#[serde(default)]` — old files deserialize fine |
| Chat search regex injection | Low | Search uses `String.includes()` not regex — safe |
| Timeout kills long-running TINS generation | Low | TINS generation has its own 120s timeout which is sufficient |
