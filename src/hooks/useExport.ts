import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import type { Message, Conversation } from "../lib/types";

interface ExportOptions {
  messages: Message[];
  conversationId: string;
  conversationTitle: string;
  workspacePath: string;
  lastResponseText: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Extract .html file paths from Claude's response text.
 * Mirrors the logic in RendererPane so export buttons find the same files.
 */
function extractHtmlPaths(text: string): string[] {
  const paths: string[] = [];
  const regex = /(?:[A-Za-z]:[/\\]|[/~])[^\s`"'*<>|]+\.html/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let p = match[0];
    p = p.replace(/[)}\],:;]+$/, "");
    if (!paths.includes(p)) {
      paths.push(p);
    }
  }
  return paths;
}

/**
 * Find the best HTML file: first try extracting paths from response text,
 * then fall back to workspace directory scan.
 */
async function findHtmlFile(responseText: string): Promise<string | null> {
  // Strategy 1: Extract paths mentioned in Claude's response
  const mentionedPaths = extractHtmlPaths(responseText);
  for (const p of mentionedPaths) {
    try {
      let expandedPath = p;
      if (p.startsWith("~/")) {
        const wsPath = await invoke<string>("get_workspace_path");
        const homeDir = wsPath.replace(
          /[/\\]\.holographic[/\\]workspace\/?$/,
          "",
        );
        expandedPath = p.replace("~", homeDir);
      }
      // Verify the file is readable
      await invoke<string>("read_html_file", { filePath: expandedPath });
      return expandedPath;
    } catch {
      // This path didn't work, try next
    }
  }

  // Strategy 2: Scan workspace directory
  try {
    const files = await invoke<string[]>("list_workspace_html");
    if (files.length > 0) return files[0];
  } catch {
    // Workspace scan failed
  }

  return null;
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useExport(options: ExportOptions) {
  const {
    messages,
    conversationId,
    conversationTitle,
    lastResponseText,
    onSuccess,
    onError,
  } = options;
  const [isTinsGenerating, setIsTinsGenerating] = useState(false);
  const [tinsProgress, setTinsProgress] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Listen for TINS generation progress events from Rust backend
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<{ lines_received: number }>("tins-progress", (event) => {
      setTinsProgress(`${event.payload.lines_received} lines`);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  /** Export the current HTML app as a standalone file */
  const exportHtml = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filePath = await findHtmlFile(lastResponseText);
      if (!filePath) {
        onError?.("No HTML files to export");
        return;
      }

      const content = await invoke<string>("read_html_file", { filePath });
      const origName = filePath.split(/[/\\]/).pop() ?? "app.html";

      const savePath = await save({
        defaultPath: origName,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });

      if (savePath) {
        await invoke("export_to_file", { filePath: savePath, content });
        onSuccess?.("HTML exported successfully");
      }
    } catch (err) {
      onError?.(`Export failed: ${formatError(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, lastResponseText, onSuccess, onError]);

  /** Export the full conversation as JSON */
  const exportJson = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
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
        onSuccess?.("JSON exported successfully");
      }
    } catch (err) {
      onError?.(`Export failed: ${formatError(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, messages, conversationId, conversationTitle, onSuccess, onError]);

  /**
   * Export a static build log (the OLD "TINS" export, renamed).
   * This is a provenance document, NOT a TINS-compliant specification.
   */
  const exportBuildLog = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const userMessages = messages.filter((m) => m.role === "user");
      const assistantMessages = messages.filter((m) => m.role === "assistant");
      const filePath = await findHtmlFile(lastResponseText);
      const latestFile = filePath ? filePath.split(/[/\\]/).pop() ?? null : null;

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
        onSuccess?.("Build log exported successfully");
      }
    } catch (err) {
      onError?.(`Export failed: ${formatError(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, messages, conversationId, conversationTitle, lastResponseText, onSuccess, onError]);

  /**
   * Generate a TRUE TINS-compliant README by sending the HTML to Claude
   * and having it reverse-engineer a specification document.
   */
  const exportTinsReadme = useCallback(async () => {
    if (isTinsGenerating || isExporting) return;
    try {
      setIsTinsGenerating(true);
      setTinsProgress(null);

      // Find the HTML file using response text extraction + workspace fallback
      const filePath = await findHtmlFile(lastResponseText);
      if (!filePath) {
        onError?.("No HTML files found — cannot generate TINS README");
        setIsTinsGenerating(false);
        return;
      }

      const htmlContent = await invoke<string>("read_html_file", { filePath });

      // Get the first user message as context for what the user asked for
      const firstUserMsg =
        messages.find((m) => m.role === "user")?.content ?? "";

      let readmeContent: string;

      try {
        // Call Claude to generate the TINS README
        // Backend streams progress events and has a 5-minute timeout
        readmeContent = await invoke<string>("generate_tins_readme", {
          htmlContent,
          projectTitle: conversationTitle,
          userDescription: firstUserMsg,
        });
      } catch (err) {
        // Don't save a garbage fallback — just report the error
        onError?.(`TINS generation failed: ${formatError(err)}`);
        setIsTinsGenerating(false);
        return;
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
        onSuccess?.("TINS README exported successfully");
      }
    } catch (err) {
      onError?.(`TINS export failed: ${formatError(err)}`);
      setIsTinsGenerating(false);
    }
  }, [isTinsGenerating, isExporting, messages, conversationId, conversationTitle, lastResponseText, onSuccess, onError]);

  return {
    exportHtml,
    exportJson,
    exportTinsReadme,
    exportBuildLog,
    isTinsGenerating,
    tinsProgress,
    isExporting,
  };
}
