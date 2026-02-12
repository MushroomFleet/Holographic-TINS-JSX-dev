export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2 text-text-secondary text-sm" role="status" aria-label="Claude is generating a response">
      <span>Claude is thinking</span>
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}
