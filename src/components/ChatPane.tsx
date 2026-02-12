import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { marked } from "marked";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { StreamingIndicator } from "./StreamingIndicator";
import { ConnectionStatus } from "./ConnectionStatus";
import { ChatSearch } from "./ChatSearch";
import type { Message } from "../lib/types";

interface ChatPaneProps {
  messages: Message[];
  currentResponse: string;
  isStreaming: boolean;
  onSend: (message: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  onShowLibrary: () => void;
  onShowSettings?: () => void;
  onExportHtml?: () => void;
  onExportJson?: () => void;
  onExportTinsReadme?: () => void;
  onExportBuildLog?: () => void;
  isTinsGenerating?: boolean;
  tinsProgress?: string | null;
  isExporting?: boolean;
  showSearch?: boolean;
  onToggleSearch?: () => void;
}

/** Renders the streaming response as live markdown */
function StreamingMessage({ content }: { content: string }) {
  const html = useMemo(() => marked.parse(content) as string, [content]);
  return (
    <div className="flex justify-start px-4 py-1">
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-bg-tertiary text-text-primary">
        <div
          className="chat-message-text prose-holographic break-words leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

/** Editable title — click to edit, Enter to confirm, Escape to cancel with focus restore */
function EditableTitle({
  title,
  onChange,
}: {
  title: string;
  onChange: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={100}
        onBlur={() => {
          setEditing(false);
          if (draft.trim()) onChange(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            if (draft.trim()) onChange(draft.trim());
          } else if (e.key === "Escape") {
            setEditing(false);
            setDraft(title);
            // Restore focus to title span
            requestAnimationFrame(() => {
              titleRef.current?.focus();
            });
          }
        }}
        className="bg-transparent text-sm font-medium text-text-primary outline-none border-b border-accent px-0 py-0 w-full max-w-[200px]"
      />
    );
  }

  return (
    <span
      ref={titleRef}
      tabIndex={0}
      className="text-sm font-medium text-text-primary cursor-pointer hover:text-accent transition-colors truncate max-w-[200px]"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setEditing(true);
      }}
      title="Click to rename"
    >
      {title}
    </span>
  );
}

export function ChatPane({
  messages,
  currentResponse,
  isStreaming,
  onSend,
  title,
  onTitleChange,
  onShowLibrary,
  onShowSettings,
  onExportHtml,
  onExportJson,
  onExportTinsReadme,
  onExportBuildLog,
  isTinsGenerating,
  tinsProgress,
  isExporting,
  showSearch,
  onToggleSearch,
}: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlightedMsg, setHighlightedMsg] = useState<number | null>(null);

  const exportDisabled = !!(isExporting || isTinsGenerating);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, currentResponse]);

  // Scroll to highlighted message from search
  const handleHighlight = useCallback(
    (index: number | null) => {
      setHighlightedMsg(index);
      if (index !== null && scrollRef.current) {
        const msgElements = scrollRef.current.querySelectorAll("[data-msg-index]");
        const target = msgElements[index];
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    },
    [],
  );

  return (
    <div className="flex flex-col h-full bg-bg-primary" role="region" aria-label="Chat pane">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <EditableTitle title={title} onChange={onTitleChange} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {onExportHtml && (
            <button
              onClick={onExportHtml}
              disabled={exportDisabled}
              className={`text-text-secondary hover:text-accent text-[10px] transition-colors ${exportDisabled ? "opacity-50 cursor-wait" : ""}`}
              title="Export HTML (Ctrl+E)"
            >
              Export
            </button>
          )}
          {onExportJson && (
            <button
              onClick={onExportJson}
              disabled={exportDisabled}
              className={`text-text-secondary hover:text-accent text-[10px] transition-colors ${exportDisabled ? "opacity-50 cursor-wait" : ""}`}
              title="Export conversation JSON"
            >
              JSON
            </button>
          )}
          {onExportTinsReadme && (
            <button
              onClick={onExportTinsReadme}
              disabled={exportDisabled}
              className={`text-text-secondary hover:text-accent text-[10px] transition-colors ${
                isTinsGenerating ? "opacity-50 cursor-wait animate-pulse" : exportDisabled ? "opacity-50 cursor-wait" : ""
              }`}
              title={isTinsGenerating ? `Generating TINS README${tinsProgress ? ` (${tinsProgress})` : "..."}` : "Generate TINS specification README"}
            >
              {isTinsGenerating ? (tinsProgress ? `TINS ${tinsProgress}` : "TINS...") : "TINS"}
            </button>
          )}
          {onExportBuildLog && (
            <button
              onClick={onExportBuildLog}
              disabled={exportDisabled}
              className={`text-text-secondary hover:text-accent text-[10px] transition-colors ${exportDisabled ? "opacity-50 cursor-wait" : ""}`}
              title="Export build provenance log"
            >
              Log
            </button>
          )}
          <button
            onClick={onShowLibrary}
            className="text-text-secondary hover:text-accent text-xs transition-colors"
            title="Open Library (Ctrl+L)"
          >
            Library
          </button>
          {onShowSettings && (
            <button
              onClick={onShowSettings}
              className="text-text-secondary hover:text-accent text-[10px] transition-colors"
              title="Settings"
            >
              &#9881;
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Chat search overlay */}
        {showSearch && onToggleSearch && (
          <ChatSearch
            messages={messages}
            onHighlight={handleHighlight}
            onClose={onToggleSearch}
          />
        )}

        <div ref={scrollRef} className="h-full overflow-y-auto py-3 space-y-1" role="log" aria-label="Message history" aria-live="polite">
          {messages.length === 0 && !isStreaming && (
            <div className="flex items-center justify-center h-full text-text-secondary text-sm">
              <div className="text-center space-y-2 px-8">
                <p className="text-lg">Welcome to the Holographic Playground</p>
                <p className="text-xs">
                  Ask Claude to build any UI component, tool, or application.
                  <br />
                  It will render live in the right pane.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              data-msg-index={idx}
              className={highlightedMsg === idx ? "ring-1 ring-accent/50 rounded-lg" : ""}
            >
              <ChatMessage message={msg} />
            </div>
          ))}

          {/* Streaming response — rendered as markdown */}
          {isStreaming && currentResponse && (
            <StreamingMessage content={currentResponse} />
          )}

          {isStreaming && <StreamingIndicator />}
        </div>
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} disabled={isStreaming} />

      {/* Connection status indicator — bottom-left */}
      <ConnectionStatus />
    </div>
  );
}
