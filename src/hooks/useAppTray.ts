import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PromotedApp } from "../lib/types";

export function useAppTray() {
  const [promotedApps, setPromotedApps] = useState<PromotedApp[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const apps = await invoke<PromotedApp[]>("list_promoted_apps");
      setPromotedApps(apps);
    } catch (err) {
      console.error("Failed to list promoted apps:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const promoteApp = useCallback(
    async (app: PromotedApp) => {
      await invoke("promote_app", { app });
      await refresh();
    },
    [refresh],
  );

  const demoteApp = useCallback(
    async (conversationId: string) => {
      await invoke("demote_app", { conversationId });
      await refresh();
    },
    [refresh],
  );

  const isPromoted = useCallback(async (conversationId: string) => {
    return invoke<boolean>("is_app_promoted", { conversationId });
  }, []);

  return { promotedApps, loading, refresh, promoteApp, demoteApp, isPromoted };
}
