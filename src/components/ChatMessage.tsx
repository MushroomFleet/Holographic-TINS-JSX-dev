import { memo, useMemo } from "react";
import { marked } from "marked";
import type { Message } from "../lib/types";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  const renderedHtml = useMemo(() => {
    if (isUser) return null;
    // Parse markdown for assistant messages
    return marked.parse(message.content) as string;
  }, [message.content, isUser]);

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} px-4 py-1`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-accent/15 text-accent border border-accent/20"
            : "bg-bg-tertiary text-text-primary"
        }`}
      >
        {isUser ? (
          <div className="chat-message-text whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div
            className="chat-message-text prose-holographic break-words leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderedHtml ?? "" }}
          />
        )}
        <div className="text-[10px] text-text-secondary mt-1 opacity-60">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
});
