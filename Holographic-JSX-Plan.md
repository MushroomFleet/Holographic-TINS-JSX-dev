# Holographic JSX Playground

## Description

A locally-installed desktop application that enables **holographic engineering** — the on-demand creation of fully functional applications at runtime, without installation, operating in real-time through a human-machine feedback loop powered by Claude Code.

The application presents a two-column layout: the left pane is a conversation interface with Claude Code, the right pane is a live JSX/HTML5 renderer. When a user requests a tool or application, Claude Code generates a JSX component which is immediately rendered in the right pane. The user iterates through conversation until the tool meets their needs. Each conversation becomes a **holographic app** — a complete, recallable application that exists as a conversation artifact.

The system transforms Claude Code from a terminal-based coding assistant into a **live application factory** where the conversation *is* the IDE, the build system, and the deployment pipeline simultaneously.

### Key Concepts

- **Holographic App**: An application that does not exist until requested, materializes instantly through AI generation, and persists as a conversation that can be recalled, resumed, and evolved.
- **Zero-Install Runtime**: JSX components render directly in an embedded browser context with no build step, no npm install, no webpack. Babel standalone transpiles JSX in-browser.
- **Conversational Iteration**: The user refines the application through natural language. Each message can modify, extend, or completely reimagine the running application.
- **Conversation-as-Project**: The conversation history serves as version history, design rationale, and project documentation simultaneously.

---

## Functionality

### Core Features

#### 1. Two-Column Layout
- **Left Pane — Conversation**: A chat interface rendered in Tauri's main webview. Messages are sent to Claude Code via Tauri commands (`invoke`), responses stream back via Tauri events (`listen`). The conversation is persistent and scrollable.
- **Right Pane — Live Renderer**: A sandboxed `<iframe>` within the same webview that renders the current JSX component. The iframe loads a self-contained HTML5 shell with React, Babel, and Tailwind via CDN. Updates in real-time when Claude generates or modifies code. The iframe sandbox attribute restricts access while allowing scripts: `sandbox="allow-scripts allow-same-origin"`.
- **Resizable Splitter**: A draggable divider between panes. Double-click to snap to 50/50. The user can collapse either pane fully.

#### 2. JSX Generation and Rendering Pipeline
When Claude Code produces a JSX code block in its response:
1. The system detects fenced code blocks with language tag `jsx`, `tsx`, or `react`.
2. The raw JSX source is extracted and written to a temporary file.
3. The renderer pane loads an HTML5 shell that includes:
   - React 18 via CDN (`react.production.min.js`, `react-dom.production.min.js`)
   - Babel Standalone for in-browser JSX transpilation
   - Tailwind CSS via CDN (play.tailwindcss.com script)
   - Any additional CDN libraries specified in a `<!-- deps: ... -->` comment at the top of the JSX
4. The JSX component is transpiled and mounted into the renderer's root `<div>`.
5. Hot-reload: when Claude outputs updated JSX, the renderer unmounts the previous component and mounts the new one without a full page reload.

#### 3. Automatic Code Detection and Validation
- Claude Code responses are parsed in real-time as they stream.
- When a JSX block is detected, a "Rendering..." indicator appears on the right pane.
- If transpilation fails, the error is displayed in-pane with the offending line highlighted, and the error message is automatically sent back to Claude Code as context so it can self-correct.
- A small status badge on the right pane shows: 🟢 Rendered | 🟡 Transpiling | 🔴 Error.

#### 4. Conversation History and Holographic App Library
- Each conversation is saved locally as a JSON file containing:
  - `id`: UUID
  - `title`: User-editable, defaults to first user message summary
  - `tags`: Array of user-defined strings
  - `favorite`: Boolean
  - `created_at`: ISO timestamp
  - `updated_at`: ISO timestamp
  - `messages`: Array of `{ role, content, timestamp, jsx_snapshot? }`
  - `current_jsx`: The latest JSX source (for instant recall without replay)
  - `metadata`: Any additional user notes
- A **Library View** (toggled from a sidebar or top nav) shows all saved conversations with:
  - Search by title, tag, or full-text content
  - Filter by favorites, tags, date range
  - Sort by recent, alphabetical, or most-used
  - Thumbnail preview: a static screenshot captured via `html2canvas` in the renderer iframe, saved as PNG
  - Click to open: loads the conversation and immediately renders the last JSX state in the right pane

#### 5. Iterative Refinement Workflow
The core loop:
1. User types: "I need a Kanban board for tracking game dev tasks"
2. Claude Code generates a JSX component → auto-renders on right pane
3. User sees it, types: "Add a column for 'In Review' and make the cards draggable"
4. Claude Code generates updated JSX → hot-reloads on right pane
5. User types: "Perfect. Now add local storage persistence"
6. Claude Code updates → hot-reloads
7. User renames the conversation to "Game Dev Kanban" and tags it `productivity`, `gamedev`

At any future point, the user opens "Game Dev Kanban" from the library and the Kanban board renders instantly.

#### 6. Backend Compute Bridge
Because Claude Code runs locally with full system access, and Tauri's Rust backend provides performant, type-safe IPC:
- The JSX frontend communicates with the Rust backend via a message relay: the iframe posts messages to the parent window, which invokes Tauri commands.
- Example: a video editing holographic app renders a timeline UI in JSX, and when the user clicks "Export," the iframe sends a postMessage to the parent, which calls `invoke('bridge_execute', ...)` in Rust, which executes `ffmpeg` and returns the output file path.
- This bridge is what distinguishes holographic apps from sandboxed web artifacts — they have access to the full power of the local machine through Tauri's Rust backend and Claude Code.

Security: Tauri's permission system (`capabilities` in `tauri.conf.json`) controls which commands the frontend can invoke. The Rust bridge additionally validates commands and paths against a user-configurable allowlist. The iframe sandbox prevents generated JSX from directly calling Tauri APIs.

#### 7. Export and Sharing
- **Export as Standalone HTML**: bundles the current JSX with all CDN dependencies into a single self-contained HTML file that runs anywhere.
- **Export as Conversation**: saves the full conversation JSON for sharing or backup.
- **Export as TINS README**: generates a TINS-compliant README from the conversation and final JSX, enabling anyone with an LLM to regenerate the application.

---

## Technical Implementation

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Tauri Window                        │
│                                                       │
│  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │   Left Pane      │  │    Right Pane             │   │
│  │                  │  │                           │   │
│  │  React Chat UI   │  │  <iframe> / Dynamic       │   │
│  │  ┌────────────┐  │  │  Webview                  │   │
│  │  │ Messages   │  │  │                           │   │
│  │  │            │  │  │  ┌─────────────────────┐  │   │
│  │  │            │  │  │  │ HTML5 Shell         │  │   │
│  │  │            │  │  │  │ ┌─────────────────┐ │  │   │
│  │  │            │  │  │  │ │ Babel           │ │  │   │
│  │  │            │  │  │  │ │ Transpiler      │ │  │   │
│  │  │            │  │  │  │ └───────┬─────────┘ │  │   │
│  │  │            │  │  │  │         ▼           │  │   │
│  │  │            │  │  │  │ ┌─────────────────┐ │  │   │
│  │  └────────────┘  │  │  │ │ React Mount     │ │  │   │
│  │  ┌────────────┐  │  │  │ │ Point           │ │  │   │
│  │  │ Input Box  │  │  │  │ └─────────────────┘ │  │   │
│  │  └────────────┘  │  │  └─────────────────────┘  │   │
│  └────────┬─────────┘  └────────────┬──────────────┘   │
│           │                         │                   │
│           ▼                         ▼                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │           Tauri Core (Rust)                        │ │
│  │                                                    │ │
│  │  ┌──────────────┐  ┌───────────────────────────┐  │ │
│  │  │ Claude Code   │  │ Compute Bridge            │  │ │
│  │  │ Subprocess    │  │ (#[tauri::command] fns)   │  │ │
│  │  │ (CLI spawn)   │  │                           │  │ │
│  │  └──────────────┘  └───────────────────────────┘  │ │
│  │                                                    │ │
│  │  ┌──────────────┐  ┌───────────────────────────┐  │ │
│  │  │ Conversation  │  │ JSX Parser /              │  │ │
│  │  │ Store (JSON)  │  │ Extractor                 │  │ │
│  │  └──────────────┘  └───────────────────────────┘  │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop Shell | Tauri 2.x | ~10MB binary vs ~150MB Electron, native webview, Rust backend for performance-critical bridge operations, strong security model with fine-grained permissions |
| Frontend | React 18, Vite, Tailwind CSS | Vite for fast dev builds, consistent with generated JSX ecosystem, Tauri's official frontend template |
| JSX Renderer | Sandboxed `<iframe>` with Babel Standalone 7 | In-browser transpilation, no build tooling needed, iframe isolation prevents generated JSX from accessing Tauri APIs directly |
| Claude Integration | Claude Code CLI (`claude` command) spawned via Rust `std::process::Command` | Direct access to Claude's coding capabilities, full local system access, async stdout streaming via `tokio` |
| Conversation Storage | Local JSON files in `~/.holographic/conversations/` | Simple, portable, human-readable, git-friendly. Rust `serde_json` for fast serialization |
| Compute Bridge | Tauri `#[tauri::command]` IPC | Type-safe Rust commands invoked from frontend via `@tauri-apps/api/core`, no HTTP server needed, inherits Tauri's permission system |
| Thumbnails | `html2canvas` in renderer iframe, passed to Rust for file write | Platform-agnostic screenshot capture without native API dependencies |

### Data Models

#### Conversation

```typescript
interface Conversation {
  id: string;                    // UUID v4
  title: string;                 // User-editable display name
  tags: string[];                // User-defined tags for filtering
  favorite: boolean;             // Pinned to top of library
  created_at: string;            // ISO 8601
  updated_at: string;            // ISO 8601
  messages: Message[];           // Full conversation history
  current_jsx: string | null;    // Latest rendered JSX source
  current_deps: string[];       // CDN URLs for current JSX dependencies
  thumbnail_path: string | null; // Path to screenshot thumbnail
  metadata: Record<string, any>; // Extensible metadata
}

interface Message {
  id: string;                    // UUID v4
  role: 'user' | 'assistant';
  content: string;               // Full message text
  timestamp: string;             // ISO 8601
  jsx_snapshot: string | null;   // JSX state after this message (if changed)
  jsx_valid: boolean | null;     // Whether the JSX transpiled successfully
}
```

#### Library Index

```typescript
interface LibraryIndex {
  version: number;
  conversations: ConversationSummary[];
}

interface ConversationSummary {
  id: string;
  title: string;
  tags: string[];
  favorite: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  has_jsx: boolean;
  thumbnail_path: string | null;
}
```

### JSX Extraction Algorithm

Claude Code responses are parsed using a streaming-compatible approach:

```
1. Buffer incoming text from Claude Code stdout
2. Detect opening fence: /```(?:jsx|tsx|react)\n/
3. Begin capturing JSX source
4. Detect closing fence: /\n```/
5. If multiple JSX blocks exist in one response, use the LAST one
   (earlier blocks are typically explanations, the last is the final version)
6. Validate: attempt Babel.transform() with react preset
7. If valid → update renderer
8. If invalid → display error, inject error context into next Claude Code prompt
```

### Renderer HTML Shell

The right pane loads this HTML template, with `{{JSX_SOURCE}}` replaced dynamically:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Dynamic dependency injection point -->
  {{ADDITIONAL_SCRIPTS}}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    #root { width: 100%; min-height: 100vh; }
    .holo-error { 
      padding: 20px; font-family: monospace; color: #ff6b6b; 
      background: #1a1a2e; white-space: pre-wrap; 
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    try {
      {{JSX_SOURCE}}
      
      // Auto-detect default export or named App component
      const Component = typeof App !== 'undefined' ? App 
        : typeof Default !== 'undefined' ? Default 
        : null;
      
      if (Component) {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<Component />);
      }
    } catch (err) {
      document.getElementById('root').innerHTML = 
        '<div class="holo-error">Render Error: ' + err.message + '</div>';
      // Signal error back to main process
      window.postMessage({ type: 'HOLO_ERROR', error: err.message }, '*');
    }
  </script>
</body>
</html>
```

### Claude Code Integration

Claude Code is spawned as a child process from Tauri's Rust backend:

```
Approach A — CLI Mode (Recommended for v1):
  - Spawn via Rust: tokio::process::Command::new("claude").arg("--print")
  - Pipe stdin/stdout asynchronously using tokio streams
  - Parse streamed responses, emitting JSX blocks to frontend via Tauri events
  - Frontend listens: listen('claude-response-chunk', handler)

Approach B — SDK Mode (Future):
  - Use Claude Code's SDK if/when a Rust or Node binding becomes available
  - Programmatic message passing
  - Richer metadata in responses
```

Rust-side streaming pattern:

```rust
#[tauri::command]
async fn send_message(
    app: tauri::AppHandle,
    message: String,
    conversation_id: String,
) -> Result<(), String> {
    let mut child = tokio::process::Command::new("claude")
        .arg("--print")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    // Write user message to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(message.as_bytes()).await.map_err(|e| e.to_string())?;
        drop(stdin);
    }

    // Stream stdout chunks to frontend as Tauri events
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
            app.emit("claude-response-chunk", &line).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
```

System prompt injection for Claude Code to ensure JSX-compatible output:

```
When the user requests a tool, application, or UI component, generate it as 
a single-file React JSX component using:
- React 18 (available globally as React/ReactDOM)
- Tailwind CSS utility classes (available via CDN)
- Default export or a component named App
- No import statements for React (it's global)
- Additional CDN deps declared as: // deps: https://cdn.example.com/lib.js
- All state, logic, and styling in one file
- No TypeScript — plain JSX only
```

### Compute Bridge Protocol

For holographic apps that need backend capabilities, the bridge uses Tauri's `#[tauri::command]` system:

```rust
// Rust backend — src-tauri/src/bridge.rs

#[derive(Deserialize)]
struct ShellRequest {
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
}

#[derive(Serialize)]
struct ShellResult {
    exit_code: i32,
    stdout: String,
    stderr: String,
    output_files: Vec<String>,
}

#[tauri::command]
async fn bridge_execute(
    request: ShellRequest,
    state: tauri::State<'_, BridgeConfig>,
) -> Result<ShellResult, String> {
    // Validate command against allowlist
    if !state.allowed_commands.contains(&request.command) {
        return Err(format!("Command '{}' not in allowlist", request.command));
    }
    
    // Validate cwd against allowed paths
    let cwd = request.cwd.unwrap_or_else(|| state.default_workspace.clone());
    if !state.allowed_paths.iter().any(|p| cwd.starts_with(p)) {
        return Err(format!("Path '{}' not in allowed paths", cwd));
    }

    let output = tokio::process::Command::new(&request.command)
        .args(&request.args)
        .current_dir(&cwd)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(ShellResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        output_files: vec![], // Populated by scanning cwd for new files
    })
}
```

```javascript
// Frontend (inside renderer iframe, via parent window relay)
// The main React app relays bridge calls from the iframe to Tauri

// In the main chat React app:
import { invoke } from '@tauri-apps/api/core';

window.addEventListener('message', async (event) => {
  if (event.data.type === 'BRIDGE_EXECUTE') {
    try {
      const result = await invoke('bridge_execute', { request: event.data.payload });
      event.source.postMessage({ type: 'BRIDGE_RESULT', result }, '*');
    } catch (err) {
      event.source.postMessage({ type: 'BRIDGE_ERROR', error: err }, '*');
    }
  }
});
```

Security is enforced at multiple layers: Tauri's built-in permission system restricts which commands the frontend can invoke, the Rust bridge validates against a user-configurable allowlist of executables and filesystem paths, and the iframe sandbox prevents the generated JSX from directly accessing Tauri APIs — all bridge calls must route through the parent window's message relay.

---

## Style Guide

### Application Chrome
- Dark theme by default (matches typical developer tooling)
- Monospace font for conversation code blocks: `JetBrains Mono` or `Fira Code`
- Sans-serif for conversation prose: `IBM Plex Sans` or equivalent
- Accent color: user-configurable, default electric blue `#00d4ff`
- The splitter bar: 4px, subtle, with a grip indicator (three dots)

### Library View
- Card grid layout with thumbnails
- Favorite items have a subtle glow or pin icon
- Tags displayed as small rounded chips below title
- Hover reveals quick actions: Open, Rename, Delete, Export

### Status Indicators
- Renderer status badge: top-right corner of right pane, small rounded pill
- Claude Code connection status: bottom-left of left pane
- Streaming indicator: animated dots while Claude is responding

---

## Testing Scenarios

### Scenario 1: First-Time JSX Generation
1. User opens app, sees empty right pane with welcome message
2. User types: "Create a calculator app"
3. Claude Code responds with JSX
4. Right pane renders a working calculator
5. Conversation is auto-saved

### Scenario 2: Iterative Refinement
1. User has a rendered component
2. User types: "Make the buttons bigger and add a history panel"
3. Claude updates JSX → hot-reloads
4. Previous JSX is preserved as `jsx_snapshot` on the prior message

### Scenario 3: Error Recovery
1. Claude generates invalid JSX (syntax error)
2. Right pane shows error with line number
3. Error is auto-injected into conversation context
4. Claude self-corrects in next response

### Scenario 4: Recall from Library
1. User opens Library, searches "kanban"
2. Sees thumbnail of Kanban board, clicks it
3. Conversation loads in left pane, Kanban renders immediately in right pane
4. User continues conversation: "Add a dark mode toggle"

### Scenario 5: Backend Compute Bridge
1. User requests: "Build me a video clip joiner"
2. Claude generates a drag-and-drop file upload UI in JSX
3. User drops video files, arranges order
4. User clicks "Join" → renderer calls bridge → Claude Code runs ffmpeg
5. Output file path returned, download link appears in the UI

### Scenario 6: Export as Standalone
1. User has a polished holographic app
2. Clicks "Export as HTML" in the menu
3. A single `.html` file is saved that runs the app in any browser, no server needed

---

## Accessibility Requirements

- Full keyboard navigation for both panes
- Screen reader support for conversation messages
- High-contrast mode option
- Resizable text in conversation pane
- Focus management when switching between panes

---

## Performance Goals

- JSX transpilation and render: < 500ms for components under 500 lines
- Conversation load from library: < 200ms
- Claude Code response streaming: first token visible within 2s
- Library search: < 100ms for up to 1000 conversations
- Memory: < 80MB base, < 200MB with active renderer (Tauri's native webview vs Electron's bundled Chromium)
- Binary size: < 15MB installer (vs ~150MB+ for Electron equivalent)
- Cold start: < 2s to interactive window

---

## Extended Features (Post-v1)

### Multi-Component Holographs
Support multiple JSX components rendered as tabs or split views in the right pane. Claude can generate a "page" component that composes several sub-components.

### Voice Input
Integrate speech-to-text for hands-free iteration. "Hey Claude, add a sidebar to this."

### Version Diffing
Visual diff between JSX snapshots at different conversation points. Slider to scrub through the evolution of a holographic app.

### Collaborative Holographs
Share a conversation link. Another user opens it, gets the same rendered app, can fork and continue their own iteration.

### Plugin Ecosystem
Users can install "holographic templates" — TINS READMEs that seed a conversation with a starting point. Example: "Start from the Dashboard template" instantly renders a base dashboard that the user customizes through conversation.

### Claude Code MCP Integration
If Claude Code supports MCP servers, holographic apps could connect to external services — databases, APIs, design tools — through MCP, massively expanding what a holographic app can do. Tauri's Rust backend is well-positioned to host MCP server connections directly, with serde providing natural JSON-RPC serialization.

---

## Implementation Stages

### Stage 1: Foundation
- Tauri 2.x app scaffold with Vite + React frontend
- Two-pane layout with resizable splitter
- Claude Code CLI integration (Rust `tokio::process::Command`, async stdout streaming)
- Basic chat UI in left pane with Tauri event listeners for streamed responses
- JSX block detection and extraction from Claude responses

### Stage 2: Live Renderer
- HTML5 shell with React/Babel/Tailwind CDN
- Sandboxed `<iframe>` in right pane loading the shell
- Hot-reload via `iframe.srcdoc` update when new JSX is extracted
- Error display and auto-feedback loop (iframe postMessage → parent → inject into conversation)

### Stage 3: Persistence
- Conversation save/load as JSON via Tauri `fs` plugin
- Library view with search, filter, tags, favorites
- Thumbnail capture via `html2canvas` in iframe
- `current_jsx` for instant recall

### Stage 4: Compute Bridge
- `#[tauri::command]` bridge functions in Rust
- iframe → parent → Tauri invoke message relay
- Allowlisted command execution and filesystem access
- Security configuration via Tauri capabilities + user settings UI

### Stage 5: Polish and Export
- Export as standalone HTML
- Export as TINS README
- Export conversation JSON
- Keyboard shortcuts, accessibility audit
- Performance optimization
- Tauri auto-updater integration

---

## Validation Checklist

- [x] Has clear project title and description
- [x] Details all core features comprehensively
- [x] Describes user interface and interactions
- [x] Specifies technical implementation approach
- [x] Includes data models and structures
- [x] Addresses edge cases and error handling
- [x] Provides examples where appropriate
- [x] Uses consistent terminology throughout
- [x] Has no contradictions or ambiguities
- [x] Includes diagrams for complex flows
- [x] Specifies accessibility requirements
- [x] Defines performance expectations
