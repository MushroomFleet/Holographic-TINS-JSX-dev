import { useState, useEffect, useRef, useCallback } from "react";
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
    else onHighlight(null);
  }, [query, messages, onHighlight]);

  const navigate = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return;
      const next = (current + dir + matches.length) % matches.length;
      setCurrent(next);
      onHighlight(matches[next]);
    },
    [current, matches, onHighlight],
  );

  return (
    <div className="absolute top-0 left-0 right-0 bg-bg-secondary border-b border-border px-3 py-2 flex items-center gap-2 z-10">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onHighlight(null);
            onClose();
          }
          if (e.key === "Enter") navigate(e.shiftKey ? -1 : 1);
        }}
        placeholder="Search messages..."
        className="flex-1 bg-bg-primary text-text-primary text-[12px] rounded px-2 py-1 border border-bg-tertiary outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-[10px] text-text-secondary min-w-[60px] text-center">
        {matches.length > 0
          ? `${current + 1}/${matches.length}`
          : query.trim()
            ? "No results"
            : ""}
      </span>
      <button
        onClick={() => navigate(-1)}
        className="text-text-secondary hover:text-accent text-[12px]"
        title="Previous match (Shift+Enter)"
      >
        &#9650;
      </button>
      <button
        onClick={() => navigate(1)}
        className="text-text-secondary hover:text-accent text-[12px]"
        title="Next match (Enter)"
      >
        &#9660;
      </button>
      <button
        onClick={() => {
          onHighlight(null);
          onClose();
        }}
        className="text-text-secondary hover:text-accent text-[12px]"
        title="Close (Escape)"
      >
        &#10005;
      </button>
    </div>
  );
}
