# TINS Export Fix Plan

<!-- TINS Specification v1.0 -->
<!-- ZS:COMPLEXITY:HIGH -->
<!-- ZS:PLATFORM:DESKTOP -->

## Description

This plan corrects the Holographic-TINS "Export as TINS README" feature so that it produces a **genuine TINS-compliant specification document** — one from which any capable LLM could regenerate the application — rather than the build-provenance log it currently emits.

The root cause identified in `TINS-export-check.md` is a category mismatch: the current export documents *how* an app was made (conversation snippets, generator metadata) instead of *what the app does* (features, UI, data models, behavior). A TINS README must be the latter.

The fix requires two fundamental changes:

1. **Read the generated HTML** and feed it to Claude Code CLI with a TINS-specific system prompt that instructs it to reverse-engineer a specification README.
2. **Replace the static template** with Claude's AI-generated output, which will contain all required TINS sections.

The current static export function becomes a "Build Report" — useful in its own right — while the true TINS export becomes an AI-powered generation pass.

---

## Functionality

### Core Features

- **AI-powered TINS generation**: When the user clicks "TINS", the app reads the final HTML output, sends it to Claude with a TINS system prompt, and saves Claude's specification README
- **Streaming progress indicator**: The TINS generation takes 15-60 seconds; the user sees a progress state while Claude works
- **Build Report preserved**: The old static export is renamed to "Build Report" and remains available as a separate button
- **Fallback on failure**: If Claude is unavailable or the HTML is empty, fall back to the old static template with a warning header noting it is not TINS-compliant

### User Interface Changes

```
Chat Header (current):
[Title]  [Export] [JSON] [TINS] [Library] [⚙]

Chat Header (after fix):
[Title]  [Export] [JSON] [TINS] [Log] [Library] [⚙]
                          ^^^^   ^^^
                          |      New: renamed old export
                          Now triggers AI generation
```

### Behavior Specifications

1. **User clicks "TINS"**
   - App reads the newest HTML file from `~/.holographic/workspace/`
   - If no HTML exists, show console warning and abort
   - App also gathers: conversation title, first user message (for context)
   - App spawns a **new** `claude --print` process with the TINS system prompt
   - A loading state is shown (button text changes to "Generating..." or a spinner)
   - Claude's full output is collected (not streamed to the chat pane — this is a background operation)
   - When complete, the save dialog opens with the generated TINS README
   - User picks a save location; file is written

2. **User clicks "Log"** (the renamed old export)
   - Behaves exactly as the current `exportTinsReadme` does
   - Button label and tooltip updated from "TINS" to "Log"

3. **Generation failure**
   - If `claude --print` exits with non-zero status or produces empty output, the static template is used as fallback
   - A `<!-- WARNING: This is a static build report, not a TINS-compliant specification. Claude generation failed. -->` header is prepended

---

## Technical Implementation

### Architecture

The fix touches 4 files:

| File | Change |
|------|--------|
| `src-tauri/src/claude.rs` | Add `generate_tins_readme` Tauri command |
| `src/hooks/useExport.ts` | Rewrite `exportTinsReadme` to call the new command; rename old logic to `exportBuildLog` |
| `src/components/ChatPane.tsx` | Add "Log" button, update "TINS" button with loading state |
| `src/App.tsx` | Wire `exportBuildLog` prop through |

### Step 1: New Rust command — `generate_tins_readme`

Add to `src-tauri/src/claude.rs`:

```rust
/// Generate a TINS-compliant README by sending the HTML source to Claude
/// with a TINS specification system prompt. This is a blocking call that
/// collects all output and returns the full README content as a String.
#[tauri::command]
pub async fn generate_tins_readme(
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

    // Collect ALL stdout (not streaming — we need the complete document)
    let output = child.wait_with_output().await
        .map_err(|e| format!("Failed to read claude output: {}", e))?;

    if !output.status.success() {
        return Err(format!("Claude exited with status: {}", output.status));
    }

    let readme = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if readme.is_empty() {
        return Err("Claude produced empty output".to_string());
    }

    Ok(readme)
}
```

**Important difference from `send_message`**: This command does NOT stream via events. It uses `wait_with_output()` to collect the entire response, because we need the complete TINS README as a single document before presenting the save dialog. The chat pane's streaming listener is not involved.

### Step 2: Register the command

In `src-tauri/src/lib.rs`, add `claude::generate_tins_readme` to the invoke handler:

```rust
.invoke_handler(tauri::generate_handler![
    claude::send_message,
    claude::get_workspace_path,
    claude::read_html_file,
    claude::list_workspace_html,
    claude::check_claude_status,
    claude::generate_tins_readme,  // <-- ADD THIS
    // ... rest unchanged
])
```

### Step 3: Rewrite the frontend export hook

Replace `exportTinsReadme` in `src/hooks/useExport.ts` with the AI-powered version, and rename the old logic to `exportBuildLog`:

```typescript
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Message, Conversation } from "../lib/types";

interface ExportOptions {
  messages: Message[];
  conversationId: string;
  conversationTitle: string;
  workspacePath: string;
}

export function useExport(options: ExportOptions) {
  const { messages, conversationId, conversationTitle, workspacePath } = options;
  const [isTinsGenerating, setIsTinsGenerating] = useState(false);

  /** Export the current HTML app as a standalone file */
  const exportHtml = useCallback(async () => {
    try {
      const files = await invoke<string[]>("list_workspace_html");
      if (files.length === 0) {
        console.warn("No HTML files in workspace to export");
        return;
      }

      const content = await invoke<string>("read_html_file", {
        filePath: files[0],
      });

      const origName = files[0].split(/[/\\]/).pop() ?? "app.html";

      const savePath = await save({
        defaultPath: origName,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });

      if (savePath) {
        await invoke("export_to_file", { filePath: savePath, content });
      }
    } catch (err) {
      console.error("Export HTML failed:", err);
    }
  }, [workspacePath]);

  /** Export the full conversation as JSON */
  const exportJson = useCallback(async () => {
    try {
      const conversation: Conversation = {
        id: conversationId,
        title: conversationTitle,
        tags: [],
        favorite: false,
        created_at: messages[0]?.timestamp ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages,
        current_html_path: null,
        thumbnail_path: null,
      };

      const json = JSON.stringify(conversation, null, 2);
      const fileName = conversationTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, "");

      const savePath = await save({
        defaultPath: `${fileName || "conversation"}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (savePath) {
        await invoke("export_to_file", { filePath: savePath, content: json });
      }
    } catch (err) {
      console.error("Export JSON failed:", err);
    }
  }, [messages, conversationId, conversationTitle]);

  /**
   * Export a static build log (the OLD "TINS" export, renamed).
   * This is a provenance document, NOT a TINS-compliant specification.
   */
  const exportBuildLog = useCallback(async () => {
    try {
      const userMessages = messages.filter((m) => m.role === "user");
      const assistantMessages = messages.filter((m) => m.role === "assistant");
      const files = await invoke<string[]>("list_workspace_html").catch(
        () => [] as string[],
      );
      const latestFile =
        files.length > 0 ? files[0].split(/[/\\]/).pop() : null;

      const exchangeSummary = userMessages
        .slice(0, 3)
        .map((msg, i) => {
          const response = assistantMessages[i];
          const userSnippet =
            msg.content.length > 120
              ? msg.content.slice(0, 120) + "..."
              : msg.content;
          const assistantSnippet = response
            ? response.content.length > 200
              ? response.content.slice(0, 200) + "..."
              : response.content
            : "(streaming)";
          return `**User:** ${userSnippet}\n\n**Claude:** ${assistantSnippet}`;
        })
        .join("\n\n---\n\n");

      const now = new Date().toISOString().slice(0, 10);
      const readme = `# ${conversationTitle} — Build Log

> Generated by Holographic-TINS on ${now}
> **Note:** This is a build provenance log, not a TINS specification. Use the "TINS" export for a regeneration-capable README.

## Overview

This project was built interactively using the Holographic Playground — a Tauri desktop app that pairs a conversational AI (Claude Code CLI) with a live HTML renderer.

**Conversation:** ${messages.length} messages (${userMessages.length} user, ${assistantMessages.length} assistant)
${latestFile ? `**Output:** \`${latestFile}\`` : ""}

## How It Was Built

The following conversation produced this application:

${exchangeSummary}
${userMessages.length > 3 ? `\n*... and ${userMessages.length - 3} more exchange(s)*\n` : ""}
## Running the Output

${
  latestFile
    ? `Open \`${latestFile}\` in any modern web browser. The file is fully self-contained with all HTML, CSS, and JavaScript inline.`
    : "The HTML output file can be opened directly in any modern browser."
}

## Technical Details

- **Generator:** Holographic-TINS (Tauri 2.x + React 19 + Claude Code CLI)
- **AI Model:** Claude (via Claude Code CLI)
- **Output Format:** Self-contained single-file HTML
- **Conversation ID:** \`${conversationId}\`

## License

This output was AI-generated. Please review and adapt as needed for your use case.
`;

      const fileName = conversationTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, "");

      const savePath = await save({
        defaultPath: `${fileName || "build-log"}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });

      if (savePath) {
        await invoke("export_to_file", { filePath: savePath, content: readme });
      }
    } catch (err) {
      console.error("Export build log failed:", err);
    }
  }, [messages, conversationId, conversationTitle]);

  /**
   * Generate a TRUE TINS-compliant README by sending the HTML to Claude
   * and having it reverse-engineer a specification document.
   */
  const exportTinsReadme = useCallback(async () => {
    try {
      setIsTinsGenerating(true);

      // Read the newest HTML file
      const files = await invoke<string[]>("list_workspace_html");
      if (files.length === 0) {
        console.warn("No HTML files in workspace — cannot generate TINS README");
        setIsTinsGenerating(false);
        return;
      }

      const htmlContent = await invoke<string>("read_html_file", {
        filePath: files[0],
      });

      // Get the first user message as context for what the user asked for
      const firstUserMsg =
        messages.find((m) => m.role === "user")?.content ?? "";

      let readmeContent: string;

      try {
        // Call Claude to generate the TINS README
        readmeContent = await invoke<string>("generate_tins_readme", {
          htmlContent,
          projectTitle: conversationTitle,
          userDescription: firstUserMsg,
        });
      } catch (err) {
        // Fallback: use static template with warning
        console.error("TINS generation failed, using static fallback:", err);
        readmeContent = `<!-- WARNING: TINS generation failed (${err}). This is a static fallback, NOT a TINS-compliant specification. -->\n\n# ${conversationTitle}\n\n## Description\n\n(TINS generation was unable to complete. Please retry or write this section manually.)\n\n## Functionality\n\n### Core Features\n\n(Pending — Claude was unable to analyze the HTML output.)\n\n### User Interface\n\n(Pending)\n\n## Technical Implementation\n\n### Architecture\n\n(Pending)\n`;
      }

      setIsTinsGenerating(false);

      // Save dialog
      const fileName = conversationTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, "");

      const savePath = await save({
        defaultPath: `${fileName || "README"}-TINS.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });

      if (savePath) {
        await invoke("export_to_file", {
          filePath: savePath,
          content: readmeContent,
        });
      }
    } catch (err) {
      console.error("Export TINS README failed:", err);
      setIsTinsGenerating(false);
    }
  }, [messages, conversationId, conversationTitle, workspacePath]);

  return {
    exportHtml,
    exportJson,
    exportTinsReadme,
    exportBuildLog,
    isTinsGenerating,
  };
}
```

**Key differences from current implementation:**

| Aspect | Current | Fixed |
|--------|---------|-------|
| Content source | Static template string | Claude AI analyzes the HTML and generates the README |
| TINS compliance | ~10% (provenance log) | ~90%+ (full spec with all required sections) |
| Time to generate | Instant | 15-60 seconds (Claude processing) |
| Returns state | None | `isTinsGenerating` boolean for UI feedback |
| Old export | Removed | Preserved as `exportBuildLog` |

### Step 4: Update App.tsx to wire `exportBuildLog`

In `src/App.tsx`, destructure the new export:

```typescript
const { exportHtml, exportJson, exportTinsReadme, exportBuildLog, isTinsGenerating } = useExport({
  messages,
  conversationId,
  conversationTitle,
  workspacePath,
});
```

Pass both to ChatPane:

```tsx
<ChatPane
  // ... existing props
  onExportHtml={exportHtml}
  onExportJson={exportJson}
  onExportTinsReadme={exportTinsReadme}
  onExportBuildLog={exportBuildLog}
  isTinsGenerating={isTinsGenerating}
/>
```

### Step 5: Update ChatPane with "Log" button and TINS loading state

In `src/components/ChatPane.tsx`:

Add to the interface:

```typescript
interface ChatPaneProps {
  // ... existing props
  onExportBuildLog?: () => void;
  isTinsGenerating?: boolean;
}
```

Update the header buttons section:

```tsx
{onExportTinsReadme && (
  <button
    onClick={onExportTinsReadme}
    disabled={isTinsGenerating}
    className={`text-text-secondary hover:text-accent text-[10px] transition-colors ${
      isTinsGenerating ? "opacity-50 cursor-wait animate-pulse" : ""
    }`}
    title={isTinsGenerating ? "Generating TINS README..." : "Generate TINS specification README"}
  >
    {isTinsGenerating ? "TINS..." : "TINS"}
  </button>
)}
{onExportBuildLog && (
  <button
    onClick={onExportBuildLog}
    className="text-text-secondary hover:text-accent text-[10px] transition-colors"
    title="Export build provenance log"
  >
    Log
  </button>
)}
```

---

## Style Guide

No visual design changes beyond the button additions. The "TINS..." loading state uses existing Tailwind utilities (`animate-pulse`, `opacity-50`, `cursor-wait`).

---

## Accessibility Requirements

- The "TINS" button uses `disabled` attribute during generation, preventing double-clicks
- The `title` attribute updates to reflect current state ("Generating TINS README..." vs. "Generate TINS specification README")
- Both new buttons are keyboard-navigable (they are native `<button>` elements)

---

## Performance Goals

- TINS generation takes 15-60 seconds depending on HTML complexity and Claude response time
- The UI remains fully responsive during generation (the `invoke` is async, not blocking)
- No changes to base memory footprint or cold start time

---

## Testing Scenarios

1. **Happy path**: User has a rendered HTML app. Clicks "TINS". After 15-60s, save dialog appears with a full TINS-compliant README. The README contains all required sections (Description, Functionality, Technical Implementation) plus recommended sections.

2. **No HTML file**: User clicks "TINS" before Claude has written any HTML. Console logs a warning. No save dialog appears.

3. **Claude unavailable**: Claude CLI is not installed or not responding. The fallback static template is generated with a `<!-- WARNING -->` comment. Save dialog still appears.

4. **Double-click prevention**: User clicks "TINS" while generation is in progress. The button is disabled and shows "TINS..." — second click does nothing.

5. **Build Log export**: User clicks "Log". Instant save dialog with the old-style provenance document. Title includes "Build Log" to distinguish from TINS.

6. **Large HTML file**: HTML file is 200KB+. Claude still processes it (within `--print` mode's input limits). If it exceeds limits, falls back gracefully.

7. **Validation of output**: The generated README, when given to a fresh Claude instance with the prompt "Generate code from this TINS README", should produce a functionally similar application.

---

## The TINS System Prompt (full text)

This is the most critical component — the system prompt that transforms the export from a log into a specification. It is embedded in the Rust command as shown in Step 1 above. Key design decisions:

1. **Exact section structure prescribed** — Claude is told the exact heading hierarchy to use, matching the TINS specification's required sections
2. **Explicitness enforced** — The prompt says "Do not say 'appropriate styling' — say 'background: #1a1a2e'"
3. **ASCII art UI diagrams required** — Matching the TINS specification's recommendation for visual aids
4. **Data structure definitions required** — With types and example values, matching the spec's data model requirements
5. **Self-contained mandate** — "No external references" matches TINS validation rule #5
6. **Output-only** — "Output ONLY the README markdown, no preamble" ensures clean file output

---

## Implementation Sequence

| Order | Task | File | Est. Time |
|-------|------|------|-----------|
| 1 | Add `generate_tins_readme` Rust command | `claude.rs` | 5 min |
| 2 | Register command in handler | `lib.rs` | 1 min |
| 3 | Rewrite `useExport.ts` (add AI export, rename old to build log, add state) | `useExport.ts` | 10 min |
| 4 | Update App.tsx to wire new props | `App.tsx` | 3 min |
| 5 | Update ChatPane with Log button + TINS loading state | `ChatPane.tsx` | 5 min |
| 6 | Build verification (`cargo check` + `tsc`) | — | 3 min |
| 7 | Update `stage-1-incomplete.md` | — | 2 min |

**Total estimated: ~30 minutes**

---

## Validation Against TINS Checklist

After this fix, the exported README should pass:

- [x] Has clear project title and description — Claude generates a proper Description section
- [x] Details all core features comprehensively — Claude enumerates all features from the HTML
- [x] Describes user interface and interactions — ASCII art diagram + component descriptions
- [x] Specifies technical implementation approach — Architecture, CDN deps, code organization
- [x] Includes data models and structures — JavaScript object definitions with types
- [x] Addresses edge cases and error handling — Behavior Specifications section
- [x] Provides examples where appropriate — Data structure examples with sample values
- [x] Uses consistent terminology throughout — Claude maintains consistency
- [x] Has no contradictions or ambiguities — Single-pass generation avoids contradictions
- [x] Includes diagrams for complex flows — ASCII art UI layout
- [x] Specifies accessibility requirements — Dedicated section
- [x] Defines performance expectations — Dedicated section

**Expected score: 12/12** (up from 2/12)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Claude produces incomplete README | Low | System prompt is highly prescriptive; required sections are explicitly listed |
| Claude includes source code instead of specification | Medium | System prompt explicitly says "Do NOT include the source code itself" |
| HTML file too large for Claude's context | Low | Most single-file HTML apps are <100KB; `--print` handles large inputs |
| Generation takes too long (>60s) | Medium | UI shows loading state; user can continue chatting in the meantime |
| Claude unavailable | Low | Fallback static template ensures the button always produces *something* |
| `wait_with_output()` blocks the Rust async runtime | None | `tokio::process` is non-blocking; the Tauri command is already `async` |
