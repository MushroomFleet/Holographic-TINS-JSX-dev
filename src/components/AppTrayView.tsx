import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PromotedApp } from "../lib/types";

interface AppTrayViewProps {
  promotedApps: PromotedApp[];
  loading: boolean;
  desktopColor: string;
  onLaunchApp: (app: PromotedApp) => void;
  onDemoteApp: (conversationId: string) => void;
  onClose: () => void;
}

/** Loads a thumbnail from disk via Rust base64 command */
function AppIcon({
  app,
  onLaunch,
  onContextMenu,
}: {
  app: PromotedApp;
  onLaunch: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  useEffect(() => {
    if (app.thumbnail_path) {
      invoke<string>("read_thumbnail_base64", { path: app.thumbnail_path })
        .then((b64) => setThumbSrc(`data:image/png;base64,${b64}`))
        .catch(() => setThumbSrc(null));
    }
  }, [app.thumbnail_path]);

  return (
    <button
      className="flex flex-col items-center gap-1.5 p-2 rounded-lg
        hover:bg-white/10 active:bg-white/20
        transition-colors cursor-pointer group"
      onClick={onLaunch}
      onContextMenu={onContextMenu}
      title={`Launch ${app.name}`}
    >
      {/* Thumbnail or fallback icon */}
      <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center shadow-lg">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={app.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-2xl opacity-50">&#128196;</span>
        )}
      </div>
      {/* App name label */}
      <span className="text-[10px] text-white text-center leading-tight max-w-[80px] line-clamp-2 drop-shadow-sm">
        {app.name}
      </span>
    </button>
  );
}

export function AppTrayView({
  promotedApps,
  loading,
  desktopColor,
  onLaunchApp,
  onDemoteApp,
  onClose,
}: AppTrayViewProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    app: PromotedApp;
  } | null>(null);

  // Close context menu on click anywhere
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, [closeContextMenu]);

  return (
    <div
      className="flex flex-col h-full relative select-none"
      style={{ backgroundColor: desktopColor }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur-sm flex-shrink-0 z-10">
        <span className="text-sm font-medium text-white drop-shadow">
          App Tray
        </span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-xs transition-colors"
        >
          Back to Chat
        </button>
      </div>

      {/* Desktop area — icon grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/60 text-sm">
            Loading...
          </div>
        ) : promotedApps.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 px-8">
              <div className="text-5xl opacity-20">&#128187;</div>
              <p className="text-white/80 text-sm font-medium">
                No apps promoted yet
              </p>
              <p className="text-white/50 text-xs leading-relaxed max-w-[280px]">
                Create an app in a conversation, then click the Promote
                button to add it to your desktop.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-4">
            {promotedApps.map((app) => (
              <AppIcon
                key={app.conversation_id}
                app={app}
                onLaunch={() => onLaunchApp(app)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, app });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLaunchApp(contextMenu.app);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            Launch App
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDemoteApp(contextMenu.app.conversation_id);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-error hover:bg-bg-tertiary transition-colors"
          >
            Remove from Desktop
          </button>
        </div>
      )}
    </div>
  );
}
