import { useEffect } from "react";

interface KeyboardShortcutActions {
  onNewConversation: () => void;
  onFocusChatPane: () => void;
  onFocusRendererPane: () => void;
  onToggleLibrary: () => void;
  onExport?: () => void;
  onIncreaseFontSize?: () => void;
  onDecreaseFontSize?: () => void;
  onToggleChatSearch?: () => void;
  onToggleAppTray?: () => void;
}

/**
 * Global keyboard shortcuts:
 * - Ctrl+N: New conversation
 * - Ctrl+1: Focus chat pane
 * - Ctrl+2: Focus renderer pane
 * - Ctrl+L: Toggle library view
 * - Ctrl+E: Export (if handler provided)
 * - Ctrl+F: Search within chat
 * - Ctrl+=: Increase font size
 * - Ctrl+-: Decrease font size
 * - Ctrl+T: Toggle App Tray view
 * - Escape: Blur current focus / close modals
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === "n") {
        e.preventDefault();
        actions.onNewConversation();
      } else if (isCtrl && e.key === "1") {
        e.preventDefault();
        actions.onFocusChatPane();
      } else if (isCtrl && e.key === "2") {
        e.preventDefault();
        actions.onFocusRendererPane();
      } else if (isCtrl && e.key === "l") {
        e.preventDefault();
        actions.onToggleLibrary();
      } else if (isCtrl && e.key === "e" && actions.onExport) {
        e.preventDefault();
        actions.onExport();
      } else if (isCtrl && e.key === "f" && actions.onToggleChatSearch) {
        e.preventDefault();
        actions.onToggleChatSearch();
      } else if (isCtrl && (e.key === "=" || e.key === "+") && actions.onIncreaseFontSize) {
        e.preventDefault();
        actions.onIncreaseFontSize();
      } else if (isCtrl && e.key === "-" && actions.onDecreaseFontSize) {
        e.preventDefault();
        actions.onDecreaseFontSize();
      } else if (isCtrl && e.key === "t" && actions.onToggleAppTray) {
        e.preventDefault();
        actions.onToggleAppTray();
      } else if (e.key === "Escape") {
        // Blur active element
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
