import { useCallback, useRef } from "react";

interface SplitterProps {
  onResize: (percent: number) => void;
  onDoubleClick: () => void;
}

export function Splitter({ onResize, onDoubleClick }: SplitterProps) {
  const draggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        const raw = (moveEvent.clientX / window.innerWidth) * 100;

        // Allow full collapse: snap to 0 or 100 near edges
        let clamped: number;
        if (raw < 5) {
          clamped = 0; // Collapse left pane
        } else if (raw > 95) {
          clamped = 100; // Collapse right pane
        } else {
          clamped = Math.min(Math.max(raw, 15), 85);
        }

        onResize(clamped);
      };

      const handleMouseUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes. Drag to resize, double-click to reset."
      tabIndex={0}
      className="w-1 cursor-col-resize bg-bg-tertiary hover:bg-accent/50 transition-colors flex-shrink-0 relative group focus:outline-none focus:bg-accent/50"
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Grip indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-1 h-1 rounded-full bg-text-secondary" />
        <div className="w-1 h-1 rounded-full bg-text-secondary" />
        <div className="w-1 h-1 rounded-full bg-text-secondary" />
      </div>
    </div>
  );
}
