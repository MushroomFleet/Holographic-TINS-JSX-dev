import type { RendererStatus } from "../lib/types";

interface StatusBadgeProps {
  status: RendererStatus;
}

const statusConfig: Record<
  RendererStatus,
  { label: string; dot: string; bg: string }
> = {
  idle: { label: "Ready", dot: "bg-text-secondary", bg: "bg-bg-tertiary" },
  transpiling: {
    label: "Transpiling",
    dot: "bg-warning animate-pulse",
    bg: "bg-bg-tertiary",
  },
  rendered: { label: "Rendered", dot: "bg-success", bg: "bg-bg-tertiary" },
  error: { label: "Error", dot: "bg-error", bg: "bg-bg-tertiary" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={`absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${config.bg} text-text-secondary`}
    >
      <div className={`w-2 h-2 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
}
