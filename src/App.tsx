import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChatPane } from "./components/ChatPane";
import { RendererPane } from "./components/RendererPane";
import { LibraryView } from "./components/LibraryView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Splitter } from "./components/Splitter";
import { ToastContainer } from "./components/Toast";
import { useClaudeChat } from "./hooks/useClaudeChat";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useExport } from "./hooks/useExport";
import { useRendererBridge } from "./hooks/useRendererBridge";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { useAppTray } from "./hooks/useAppTray";
import { AppTrayView } from "./components/AppTrayView";
import type { PromotedApp } from "./lib/types";

type View = "chat" | "library" | "settings" | "apptray";

function App() {
  const [view, setView] = useState<View>("chat");
  const [showSearch, setShowSearch] = useState(false);
  const chatPaneRef = useRef<HTMLDivElement>(null);
  const rendererPaneRef = useRef<HTMLDivElement>(null);
  const {
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
  } = useClaudeChat();

  // Toast notifications
  const { toasts, addToast, removeToast } = useToast();

  // Get the last assistant message text for the renderer and export to parse file paths from
  const lastResponseText = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    return lastAssistant?.content ?? "";
  }, [messages]);

  const { exportHtml, exportJson, exportTinsReadme, exportBuildLog, isTinsGenerating, tinsProgress, isExporting } = useExport({
    messages,
    conversationId,
    conversationTitle,
    workspacePath,
    lastResponseText,
    onSuccess: (msg: string) => addToast("success", msg),
    onError: (msg: string) => addToast("error", msg),
  });

  // Theme: user-configurable accent color, high contrast, font size, system prompt, splitter
  const {
    accentColor,
    updateAccentColor,
    highContrast,
    toggleHighContrast,
    fontSize,
    increaseFontSize,
    decreaseFontSize,
    systemPrompt,
    updateSystemPrompt,
    splitterPosition,
    updateSplitterPosition,
    desktopColor,
    updateDesktopColor,
  } = useTheme();

  // App Tray: promoted apps management
  const {
    promotedApps,
    loading: appTrayLoading,
    refresh: refreshAppTray,
    promoteApp,
    demoteApp,
    isPromoted,
  } = useAppTray();

  // Track whether the current conversation is promoted
  const [currentIsPromoted, setCurrentIsPromoted] = useState(false);

  // Track the currently rendered HTML file path (reported by RendererPane)
  const [currentRenderedFile, setCurrentRenderedFile] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId) {
      isPromoted(conversationId)
        .then(setCurrentIsPromoted)
        .catch(() => setCurrentIsPromoted(false));
    }
  }, [conversationId, isPromoted]);

  // Splitter state: initialize from persisted settings
  const [splitPercent, setSplitPercent] = useState(40);
  const splitterInitialized = useRef(false);

  useEffect(() => {
    if (!splitterInitialized.current && splitterPosition) {
      setSplitPercent(Math.round(splitterPosition * 100));
      splitterInitialized.current = true;
    }
  }, [splitterPosition]);

  // Debounced splitter position save
  const saveSplitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSplitChange = useCallback(
    (percent: number) => {
      setSplitPercent(percent);
      // Debounce save to settings
      if (saveSplitTimerRef.current) clearTimeout(saveSplitTimerRef.current);
      saveSplitTimerRef.current = setTimeout(() => {
        updateSplitterPosition(percent / 100);
      }, 500);
    },
    [updateSplitterPosition],
  );

  // Bridge: relay BRIDGE_EXECUTE postMessages from iframe to Rust backend
  useRendererBridge();

  const leftCollapsed = splitPercent === 0;
  const rightCollapsed = splitPercent === 100;

  const handleOpenConversation = useCallback(
    async (id: string) => {
      await loadConversation(id);
      setView("chat");
    },
    [loadConversation],
  );

  const handleNewConversation = useCallback(() => {
    newConversation();
    setView("chat");
  }, [newConversation]);

  const handleToggleSearch = useCallback(() => {
    setShowSearch((s) => !s);
  }, []);

  // Promote / demote the current conversation's app
  const handleTogglePromote = useCallback(async () => {
    if (!conversationId) return;

    if (currentIsPromoted) {
      await demoteApp(conversationId);
      setCurrentIsPromoted(false);
    } else {
      if (!currentRenderedFile) {
        addToast("error", "No rendered app to promote");
        return;
      }

      const thumbPath = `${workspacePath.replace(/[/\\]workspace\/?$/, "/thumbnails")}/${conversationId}.png`;

      // Use the HTML filename (without extension) as the icon label
      const fileName = currentRenderedFile.split(/[/\\]/).pop() ?? "";
      const appName = fileName.replace(/\.html?$/i, "").replace(/[-_]/g, " ") || conversationTitle;

      await promoteApp({
        conversation_id: conversationId,
        name: appName,
        thumbnail_path: thumbPath,
        html_path: currentRenderedFile,
        promoted_at: new Date().toISOString(),
      });
      setCurrentIsPromoted(true);
      addToast("success", `"${appName}" promoted to App Tray`);
    }
  }, [conversationId, currentIsPromoted, conversationTitle, workspacePath, currentRenderedFile, demoteApp, promoteApp, addToast]);

  // Launch an app from the App Tray
  const handleLaunchApp = useCallback(
    async (app: PromotedApp) => {
      await loadConversation(app.conversation_id);
      setView("chat");
    },
    [loadConversation],
  );

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewConversation: handleNewConversation,
    onFocusChatPane: () => {
      if (leftCollapsed) setSplitPercent(40);
      const textarea = chatPaneRef.current?.querySelector("textarea");
      textarea?.focus();
    },
    onFocusRendererPane: () => {
      if (rightCollapsed) setSplitPercent(60);
      const iframe = rendererPaneRef.current?.querySelector("iframe");
      iframe?.focus();
    },
    onToggleLibrary: () => {
      setView((v) => (v === "chat" ? "library" : "chat"));
    },
    onExport: exportHtml,
    onIncreaseFontSize: increaseFontSize,
    onDecreaseFontSize: decreaseFontSize,
    onToggleChatSearch: handleToggleSearch,
    onToggleAppTray: () => {
      setView((v) => {
        if (v === "apptray") return "chat";
        refreshAppTray();
        return "apptray";
      });
    },
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Left pane — chat, library, or settings */}
      {!leftCollapsed && (
        <div
          ref={chatPaneRef}
          style={{ width: `${splitPercent}%` }}
          className="flex flex-col h-full"
        >
          {view === "chat" ? (
            <ChatPane
              messages={messages}
              currentResponse={currentResponse}
              isStreaming={isStreaming}
              onSend={sendMessage}
              title={conversationTitle}
              onTitleChange={updateTitle}
              onShowLibrary={() => setView("library")}
              onShowSettings={() => setView("settings")}
              onExportHtml={exportHtml}
              onExportJson={exportJson}
              onExportTinsReadme={exportTinsReadme}
              onExportBuildLog={exportBuildLog}
              isTinsGenerating={isTinsGenerating}
              tinsProgress={tinsProgress}
              isExporting={isExporting}
              showSearch={showSearch}
              onToggleSearch={handleToggleSearch}
              conversationId={conversationId}
              isPromoted={currentIsPromoted}
              onTogglePromote={handleTogglePromote}
              onShowAppTray={() => {
                setView("apptray");
                refreshAppTray();
              }}
            />
          ) : view === "library" ? (
            <LibraryView
              onOpenConversation={handleOpenConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={deleteConversation}
              onToggleFavorite={toggleFavorite}
              onUpdateTags={updateTags}
              listConversations={listConversations}
            />
          ) : view === "apptray" ? (
            <AppTrayView
              promotedApps={promotedApps}
              loading={appTrayLoading}
              desktopColor={desktopColor}
              onLaunchApp={handleLaunchApp}
              onDemoteApp={async (id) => {
                await demoteApp(id);
                await refreshAppTray();
              }}
              onClose={() => setView("chat")}
            />
          ) : (
            <SettingsPanel
              accentColor={accentColor}
              onAccentColorChange={updateAccentColor}
              highContrast={highContrast}
              onToggleHighContrast={toggleHighContrast}
              fontSize={fontSize}
              onIncreaseFontSize={increaseFontSize}
              onDecreaseFontSize={decreaseFontSize}
              systemPrompt={systemPrompt}
              onSystemPromptChange={updateSystemPrompt}
              onClose={() => setView("chat")}
              desktopColor={desktopColor}
              onDesktopColorChange={updateDesktopColor}
            />
          )}
        </div>
      )}

      <Splitter
        onResize={handleSplitChange}
        onDoubleClick={() => handleSplitChange(50)}
      />

      {/* Right pane — renderer */}
      {!rightCollapsed && (
        <div
          ref={rendererPaneRef}
          style={{ width: `${100 - splitPercent}%` }}
          className="flex flex-col h-full"
        >
          <RendererPane
            isStreaming={isStreaming}
            workspacePath={workspacePath}
            lastResponseText={lastResponseText}
            onErrorFeedback={sendMessage}
            conversationId={conversationId}
            onFileChange={setCurrentRenderedFile}
          />
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

export default App;
