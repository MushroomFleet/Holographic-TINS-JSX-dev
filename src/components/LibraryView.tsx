import { useState, useEffect, useCallback } from "react";
import type { ConversationSummary } from "../lib/types";

interface LibraryViewProps {
  onOpenConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onToggleFavorite: (id: string, currentValue: boolean) => Promise<void>;
  onUpdateTags: (id: string, tags: string[]) => Promise<void>;
  listConversations: () => Promise<ConversationSummary[]>;
}

/** Inline tag editor — shows existing tags with remove buttons + input to add */
function TagEditor({
  tags,
  onUpdate,
}: {
  tags: string[];
  onUpdate: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onUpdate([...tags, tag]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onUpdate(tags.filter((t) => t !== tag));
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 mt-1"
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent"
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="hover:text-error ml-0.5"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={tags.length === 0 ? "Add tag..." : "+"}
        className="bg-transparent text-[9px] text-text-secondary outline-none w-12 placeholder:text-text-secondary/50"
      />
    </div>
  );
}

export function LibraryView({
  onOpenConversation,
  onNewConversation,
  onDeleteConversation,
  onToggleFavorite,
  onUpdateTags,
  listConversations,
}: LibraryViewProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [loading, setLoading] = useState(true);
  const [editingTags, setEditingTags] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listConversations();
    setConversations(list);
    setLoading(false);
  }, [listConversations]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await onDeleteConversation(id);
    await refresh();
  };

  const handleToggleFavorite = async (
    id: string,
    current: boolean,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    await onToggleFavorite(id, current);
    await refresh();
  };

  const handleUpdateTags = async (id: string, tags: string[]) => {
    await onUpdateTags(id, tags);
    await refresh();
  };

  // Filter and search
  const filtered = conversations.filter((c) => {
    if (filter === "favorites" && !c.favorite) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary flex-shrink-0">
        <span className="text-sm font-medium text-text-primary">Library</span>
        <button
          onClick={onNewConversation}
          className="text-xs bg-accent text-bg-primary px-3 py-1 rounded hover:opacity-90 transition-opacity font-medium"
        >
          + New
        </button>
      </div>

      {/* Search + filter */}
      <div className="px-4 py-2 border-b border-bg-tertiary flex-shrink-0 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-bg-tertiary text-text-primary rounded px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent placeholder:text-text-secondary"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              filter === "all"
                ? "bg-accent/20 text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("favorites")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              filter === "favorites"
                ? "bg-accent/20 text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Favorites
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            <div className="text-center space-y-2 px-8">
              <p className="text-lg opacity-30">No conversations yet</p>
              <p className="text-xs">
                Start chatting to create your first conversation.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {filtered.map((convo) => (
              <div
                key={convo.id}
                onClick={() => onOpenConversation(convo.id)}
                className="p-3 rounded-lg bg-bg-secondary hover:bg-bg-tertiary cursor-pointer transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {/* Favorite toggle */}
                      <button
                        onClick={(e) =>
                          handleToggleFavorite(convo.id, convo.favorite, e)
                        }
                        className={`text-xs transition-colors flex-shrink-0 ${
                          convo.favorite
                            ? "text-warning"
                            : "text-text-secondary/30 hover:text-warning"
                        }`}
                        title={
                          convo.favorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                      >
                        &#9733;
                      </button>
                      <span className="text-sm font-medium text-text-primary truncate">
                        {convo.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                      {convo.preview}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-text-secondary opacity-60">
                        {convo.message_count} messages
                      </span>
                      <span className="text-[10px] text-text-secondary opacity-60">
                        {new Date(convo.updated_at).toLocaleDateString()}
                      </span>
                      {/* Tag display / edit toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTags(
                            editingTags === convo.id ? null : convo.id,
                          );
                        }}
                        className="text-[9px] text-text-secondary/50 hover:text-accent transition-colors"
                        title="Edit tags"
                      >
                        {convo.tags.length > 0
                          ? `${convo.tags.length} tags`
                          : "+ tag"}
                      </button>
                    </div>

                    {/* Tag editor (expanded) */}
                    {editingTags === convo.id ? (
                      <TagEditor
                        tags={convo.tags}
                        onUpdate={(tags) => handleUpdateTags(convo.id, tags)}
                      />
                    ) : (
                      convo.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {convo.tags.slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDelete(convo.id, e)}
                    className="text-text-secondary hover:text-error text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Delete conversation"
                  >
                    &#10005;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
