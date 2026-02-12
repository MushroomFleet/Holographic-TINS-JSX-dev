import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useState, useCallback, useRef, useEffect } from "react";
import type { Message, Conversation, ConversationSummary } from "../lib/types";

interface ResponseChunk {
  content: string;
  done: boolean;
}

/**
 * Build the system prompt that tells Claude Code to write a self-contained
 * HTML file to the workspace directory. Claude has full tool access.
 */
function buildSystemPrompt(workspacePath: string): string {
  const normalizedPath = workspacePath.replace(/\\/g, "/");
  return `You are a holographic app builder. You create fully self-contained single-file HTML applications.

OUTPUT DIRECTORY: ${normalizedPath}
You MUST write all output files to exactly this directory. Do NOT create subdirectories. Do NOT use ~/calculator/ or any other path.

WORKFLOW:
1. Write a single self-contained .html file to ${normalizedPath}/<name>.html
2. The file must include ALL HTML, CSS, and JavaScript inline — no external files except CDN scripts.
3. Use a descriptive kebab-case filename like "calculator.html", "kanban-board.html", etc.
4. After writing the file, briefly describe what you built.

For React-based apps, include these CDN scripts in the <head>:
- https://unpkg.com/react@18/umd/react.development.js
- https://unpkg.com/react-dom@18/umd/react-dom.development.js
- https://unpkg.com/@babel/standalone/babel.min.js
- https://cdn.tailwindcss.com

For simple apps, just use vanilla HTML/CSS/JS.

IMPORTANT: The EXACT output path is ${normalizedPath} — use this path and no other.`;
}

/** Generate a conversation title from the first user message */
function generateTitle(content: string): string {
  // Take first 60 chars, cut at last word boundary
  const trimmed = content.trim().replace(/\n/g, " ");
  if (trimmed.length <= 60) return trimmed;
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "...";
}

export function useClaudeChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [conversationId, setConversationId] = useState<string>(
    crypto.randomUUID(),
  );
  const [conversationTitle, setConversationTitle] = useState<string>(
    "New Conversation",
  );
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const currentResponseRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the Claude session ID for --resume support
  const sessionIdRef = useRef<string | null>(null);
  const messageCountRef = useRef(0);

  // Get workspace path on mount
  useEffect(() => {
    invoke<string>("get_workspace_path")
      .then(setWorkspacePath)
      .catch(console.error);
  }, []);

  // Auto-save conversation after each message exchange (debounced)
  const autoSave = useCallback(
    (msgs: Message[], title: string, convoId: string) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        if (msgs.length === 0) return;

        const conversation: Conversation = {
          id: convoId,
          title,
          tags: [],
          favorite: false,
          created_at: msgs[0]?.timestamp ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: msgs,
          current_html_path: null,
          thumbnail_path: null,
        };

        try {
          await invoke("save_conversation", { conversation });
        } catch (err) {
          console.error("Auto-save failed:", err);
        }
      }, 1500); // 1.5s debounce
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const setupListener = async () => {
      unlistenRef.current = await listen<ResponseChunk>(
        "claude-response-chunk",
        (event) => {
          if (cancelled) return;
          const chunk = event.payload;

          if (chunk.done) {
            const finalContent = currentResponseRef.current.trim();
            if (finalContent) {
              setMessages((msgs) => {
                const newMsgs = [
                  ...msgs,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    content: finalContent,
                    timestamp: new Date().toISOString(),
                    jsx_snapshot: null,
                    jsx_valid: null,
                  },
                ];
                // Trigger auto-save after assistant response
                // We need current title and id, so we read from refs
                return newMsgs;
              });
            }
            setCurrentResponse("");
            currentResponseRef.current = "";
            setIsStreaming(false);
          } else {
            const updated = currentResponseRef.current + chunk.content + "\n";
            currentResponseRef.current = updated;
            setCurrentResponse(updated);
          }
        },
      );
    };

    setupListener();

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  // Clean up auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Trigger auto-save whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      autoSave(messages, conversationTitle, conversationId);
    }
  }, [messages, conversationTitle, conversationId, autoSave]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!workspacePath) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        jsx_snapshot: null,
        jsx_valid: null,
      };

      // Set title from first user message
      setMessages((prev) => {
        if (prev.length === 0) {
          setConversationTitle(generateTitle(content));
        }
        return [...prev, userMsg];
      });

      setIsStreaming(true);
      setCurrentResponse("");
      currentResponseRef.current = "";
      messageCountRef.current += 1;

      // Determine whether to use --resume or send full context
      const isFollowUp = messageCountRef.current > 1 && sessionIdRef.current;

      let fullMessage: string;
      let sessionId: string | null = null;

      if (isFollowUp) {
        // Use --resume: just send the new message, Claude has context from the session
        fullMessage = content;
        sessionId = sessionIdRef.current;
      } else {
        // First message: send with system prompt and full context
        const historyLines: string[] = [];
        setMessages((prev) => {
          for (const msg of prev) {
            if (msg.role === "user") {
              historyLines.push(`User: ${msg.content}`);
            } else {
              historyLines.push(`Assistant: ${msg.content}`);
            }
          }
          return prev;
        });

        fullMessage =
          historyLines.length > 1 // > 1 because current message is already added
            ? `Previous conversation:\n${historyLines.slice(0, -1).join("\n\n")}\n\nCurrent request:\n${content}`
            : content;

        // Use conversationId as session ID for resume
        sessionIdRef.current = conversationId;
      }

      try {
        await invoke("send_message", {
          message: fullMessage,
          systemPrompt: isFollowUp ? null : buildSystemPrompt(workspacePath),
          sessionId,
        });
      } catch (err) {
        setIsStreaming(false);
        setCurrentResponse("");
        currentResponseRef.current = "";
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${err}`,
            timestamp: new Date().toISOString(),
            jsx_snapshot: null,
            jsx_valid: null,
          },
        ]);
      }
    },
    [workspacePath],
  );

  /** Start a new empty conversation */
  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(crypto.randomUUID());
    setConversationTitle("New Conversation");
    setCurrentResponse("");
    currentResponseRef.current = "";
    sessionIdRef.current = null;
    messageCountRef.current = 0;
  }, []);

  /** Load a conversation from disk */
  const loadConversation = useCallback(async (id: string) => {
    try {
      const convo = await invoke<Conversation>("load_conversation", { id });
      setMessages(convo.messages);
      setConversationId(convo.id);
      setConversationTitle(convo.title);
      setCurrentResponse("");
      currentResponseRef.current = "";
      // Reset session — loaded conversations start fresh (history will be sent on first new message)
      sessionIdRef.current = null;
      messageCountRef.current = 0;
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  }, []);

  /** List all saved conversations */
  const listConversations = useCallback(async () => {
    try {
      return await invoke<ConversationSummary[]>("list_conversations");
    } catch (err) {
      console.error("Failed to list conversations:", err);
      return [];
    }
  }, []);

  /** Delete a conversation */
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await invoke("delete_conversation", { id });
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }, []);

  /** Update the conversation title */
  const updateTitle = useCallback((title: string) => {
    setConversationTitle(title);
  }, []);

  /** Toggle favorite on a conversation (by ID) */
  const toggleFavorite = useCallback(async (id: string, currentValue: boolean) => {
    try {
      await invoke("update_conversation_meta", {
        id,
        favorite: !currentValue,
        tags: null,
        title: null,
      });
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  }, []);

  /** Update tags on a conversation (by ID) */
  const updateTags = useCallback(async (id: string, tags: string[]) => {
    try {
      await invoke("update_conversation_meta", {
        id,
        favorite: null,
        tags,
        title: null,
      });
    } catch (err) {
      console.error("Failed to update tags:", err);
    }
  }, []);

  return {
    messages,
    currentResponse,
    isStreaming,
    sendMessage,
    workspacePath,
    conversationId,
    conversationTitle,
    updateTitle,
    newConversation,
    loadConversation,
    listConversations,
    deleteConversation,
    toggleFavorite,
    updateTags,
  };
}
