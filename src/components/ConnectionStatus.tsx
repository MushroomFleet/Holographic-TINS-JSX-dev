import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = "checking" | "connected" | "disconnected";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const ver = await invoke<string>("check_claude_status");
        if (!cancelled) {
          setVersion(ver);
          setStatus("connected");
        }
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    };

    check();

    // Re-check every 30 seconds
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dotColor =
    status === "connected"
      ? "bg-success"
      : status === "disconnected"
        ? "bg-error"
        : "bg-warning animate-pulse";

  const label =
    status === "connected"
      ? version || "Claude Connected"
      : status === "disconnected"
        ? "Claude Not Found"
        : "Checking...";

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-text-secondary border-t border-bg-tertiary">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="truncate" title={label}>
        {label}
      </span>
    </div>
  );
}
