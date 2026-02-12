import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StatusBadge } from "./StatusBadge";
import type { RendererStatus } from "../lib/types";

/** Simple 32-bit string hash for content change detection */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

interface RendererPaneProps {
  isStreaming: boolean;
  workspacePath: string;
  /** The full accumulated response text from Claude (finalized messages + current stream) */
  lastResponseText: string;
  /** Send an error message back to Claude for self-correction */
  onErrorFeedback?: (message: string) => void;
  /** Current conversation ID for thumbnail saving */
  conversationId?: string;
}

/**
 * Extract .html file paths from Claude's response text.
 * Looks for paths like /Users/.../foo.html or C:\Users\...\foo.html or ~/.holographic/workspace/foo.html
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
 * Inject an error-catching wrapper into HTML content.
 * This catches runtime JS errors and reports them to the parent via postMessage.
 */
function injectErrorCatcher(html: string): string {
  const errorScript = `
<script>
  // Catch runtime errors and report to parent
  window.onerror = function(msg, source, line, col, error) {
    window.parent.postMessage({
      type: 'HOLOGRAPHIC_ERROR',
      error: msg + (line ? ' (line ' + line + ')' : ''),
      source: source || ''
    }, '*');
  };
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    window.parent.postMessage({
      type: 'HOLOGRAPHIC_ERROR',
      error: 'Unhandled Promise: ' + (e.reason?.message || e.reason || 'unknown'),
      source: ''
    }, '*');
  });
  // Signal successful render after DOM is ready
  window.addEventListener('DOMContentLoaded', function() {
    // Small delay to let React/other frameworks mount
    setTimeout(function() {
      window.parent.postMessage({ type: 'HOLOGRAPHIC_RENDERED' }, '*');
    }, 500);
  });

  // Listen for thumbnail capture request from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'HOLOGRAPHIC_CAPTURE_THUMBNAIL') {
      // Dynamically load html2canvas and capture
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = function() {
        html2canvas(document.body, {
          scale: 0.5,
          width: 800,
          height: 600,
          logging: false,
          useCORS: true
        }).then(function(canvas) {
          var dataUrl = canvas.toDataURL('image/png');
          // Strip the data:image/png;base64, prefix
          var base64 = dataUrl.replace(/^data:image\\/png;base64,/, '');
          window.parent.postMessage({
            type: 'HOLOGRAPHIC_THUMBNAIL',
            base64: base64
          }, '*');
        }).catch(function() {
          // Silently fail — thumbnails are optional
        });
      };
      document.head.appendChild(script);
    }
  });
</script>`;

  // Insert the error catcher right after <head> or at the very start
  if (html.includes("<head>")) {
    return html.replace("<head>", "<head>" + errorScript);
  } else if (html.includes("<html>")) {
    return html.replace("<html>", "<html><head>" + errorScript + "</head>");
  } else {
    return errorScript + html;
  }
}

export function RendererPane({
  isStreaming,
  workspacePath,
  lastResponseText,
  onErrorFeedback,
  conversationId,
}: RendererPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<RendererStatus>("idle");
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const prevFileRef = useRef<string | null>(null);
  const prevModTimeRef = useRef<number>(0);
  const errorFeedbackSentRef = useRef<string | null>(null);

  const loadHtmlFile = useCallback(
    async (filePath: string, force = false) => {
      if (!force && filePath === prevFileRef.current) return false;

      try {
        setStatus("transpiling");
        setRenderError(null);
        const content = await invoke<string>("read_html_file", { filePath });
        prevFileRef.current = filePath;
        setCurrentFile(filePath);
        setHtmlContent(injectErrorCatcher(content));
        setStatus("rendered");
        return true;
      } catch (err) {
        console.error("Failed to load HTML file:", filePath, err);
        return false;
      }
    },
    [],
  );

  // Listen for postMessage from iframe (errors + render success)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "HOLOGRAPHIC_ERROR") {
        const errorMsg = data.error || "Unknown render error";
        setRenderError(errorMsg);
        setStatus("error");

        // Auto-feedback: send error to Claude for self-correction (once per error)
        if (
          onErrorFeedback &&
          currentFile &&
          errorFeedbackSentRef.current !== errorMsg
        ) {
          errorFeedbackSentRef.current = errorMsg;
          const fileName = currentFile.split(/[/\\]/).pop() ?? currentFile;
          onErrorFeedback(
            `The rendered app "${fileName}" has a runtime error:\n\n${errorMsg}\n\nPlease fix this error in the HTML file.`,
          );
        }
      } else if (data.type === "HOLOGRAPHIC_RENDERED") {
        // Successful render clears any previous error
        if (status === "error" || renderError) {
          setRenderError(null);
          setStatus("rendered");
          errorFeedbackSentRef.current = null;
        }

        // Request thumbnail capture after successful render
        if (conversationId && iframeRef.current?.contentWindow) {
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "HOLOGRAPHIC_CAPTURE_THUMBNAIL" },
              "*",
            );
          }, 1000); // Wait 1s for full render
        }
      } else if (data.type === "HOLOGRAPHIC_THUMBNAIL" && data.base64) {
        // Save thumbnail via Rust backend
        if (conversationId) {
          invoke("save_thumbnail", {
            conversationId,
            base64Data: data.base64,
          }).catch((err: unknown) =>
            console.error("Failed to save thumbnail:", err),
          );
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onErrorFeedback, currentFile, status, renderError, conversationId]);

  // Shared logic to find and load the latest HTML file
  const findAndLoadLatestHtml = useCallback(
    async (responseText: string) => {
      // Strategy 1: Parse Claude's response for explicit file paths
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
          if (await loadHtmlFile(expandedPath)) return true;
        } catch {
          // This path didn't work, try next
        }
      }

      // Strategy 2: Check workspace directory for newest .html
      if (workspacePath) {
        try {
          const files = await invoke<string[]>("list_workspace_html");
          if (files.length > 0 && files[0] !== prevFileRef.current) {
            if (await loadHtmlFile(files[0])) return true;
          }
        } catch (err) {
          console.error("Failed to list workspace:", err);
        }
      }

      return false;
    },
    [workspacePath, loadHtmlFile],
  );

  // When streaming ends, find the HTML file to display
  useEffect(() => {
    if (isStreaming || !lastResponseText) return;

    const timer = setTimeout(() => findAndLoadLatestHtml(lastResponseText), 800);
    return () => clearTimeout(timer);
  }, [isStreaming, lastResponseText, findAndLoadLatestHtml]);

  // Hot-reload during streaming: poll workspace for new/modified files
  useEffect(() => {
    if (!isStreaming || !workspacePath) return;

    const pollInterval = setInterval(async () => {
      try {
        const files = await invoke<string[]>("list_workspace_html");
        if (files.length > 0) {
          const newestFile = files[0];
          // Check if this is a new file or the current file was modified
          if (newestFile !== prevFileRef.current) {
            await loadHtmlFile(newestFile);
          } else if (newestFile === prevFileRef.current) {
            // Re-read to check for modification (compare content)
            try {
              const content = await invoke<string>("read_html_file", {
                filePath: newestFile,
              });
              const contentHash = simpleHash(content);
              if (contentHash !== prevModTimeRef.current) {
                prevModTimeRef.current = contentHash;
                setHtmlContent(injectErrorCatcher(content));
                setRenderError(null);
                setStatus("rendered");
              }
            } catch {
              // File might still be written
            }
          }
        }
      } catch {
        // Workspace might not be ready yet
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isStreaming, workspacePath, loadHtmlFile]);

  // Update iframe srcdoc when HTML content changes
  useEffect(() => {
    if (htmlContent && iframeRef.current) {
      iframeRef.current.srcdoc = htmlContent;
    }
  }, [htmlContent]);

  // Extract just the filename for display
  const displayName = currentFile
    ? currentFile.split(/[/\\]/).pop() ?? currentFile
    : null;

  return (
    <div className="relative flex-1 flex flex-col bg-bg-secondary h-full" role="region" aria-label="Renderer pane">
      <StatusBadge status={status} />

      {displayName && (
        <div className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded text-[10px] bg-bg-tertiary text-text-secondary opacity-70 flex items-center gap-1.5">
          <span>{displayName}</span>
          <button
            onClick={() => {
              if (currentFile) navigator.clipboard.writeText(currentFile);
            }}
            className="hover:text-accent transition-colors"
            title="Copy file path"
          >
            &#128203;
          </button>
        </div>
      )}

      {/* Error overlay */}
      {renderError && (
        <div role="alert" aria-live="assertive" className="absolute bottom-10 left-2 right-2 z-20 p-3 rounded-lg bg-error/10 border border-error/30 text-error text-xs font-mono max-h-[120px] overflow-auto">
          <div className="font-semibold mb-1">Runtime Error</div>
          <div className="whitespace-pre-wrap">{renderError}</div>
          {onErrorFeedback && (
            <div className="text-text-secondary mt-1 text-[10px]">
              Auto-sent to Claude for correction
            </div>
          )}
        </div>
      )}

      {htmlContent ? (
        <iframe
          ref={iframeRef}
          className="flex-1 border-0 w-full h-full bg-white"
          sandbox="allow-scripts allow-same-origin"
          title="Holographic App"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-secondary">
          <div className="text-center space-y-5 max-w-[380px] px-8">
            {/* Holographic diamond animation */}
            <div className="relative inline-block">
              <div className="text-6xl opacity-15 animate-pulse">&#9670;</div>
              <div className="absolute inset-0 text-6xl opacity-10 animate-ping" style={{ animationDuration: '3s' }}>&#9670;</div>
            </div>

            <div className="space-y-1.5">
              <p className="text-lg font-medium text-text-primary opacity-80">Holographic Renderer</p>
              <p className="text-xs leading-relaxed opacity-70">
                Your apps will appear here in real-time as Claude builds them.
              </p>
            </div>

            <div className="text-left bg-bg-tertiary/50 rounded-lg p-4 space-y-2.5">
              <p className="text-[11px] font-medium text-text-primary opacity-70 uppercase tracking-wider">Try asking Claude to build:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-accent opacity-60">&#9656;</span>
                  <span className="opacity-60">"Make a calculator app"</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-accent opacity-60">&#9656;</span>
                  <span className="opacity-60">"Build a kanban board with drag-and-drop"</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-accent opacity-60">&#9656;</span>
                  <span className="opacity-60">"Create a markdown editor with live preview"</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 text-[10px] opacity-50">
              <span>Ctrl+1 Focus chat</span>
              <span className="text-bg-tertiary">|</span>
              <span>Ctrl+2 Focus renderer</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
