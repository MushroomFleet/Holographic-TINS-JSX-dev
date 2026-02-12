import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";

interface UpdateStatus {
  available: boolean;
  version?: string;
  checking: boolean;
  error?: string;
}

/**
 * Checks for application updates on mount.
 * Silently handles errors (endpoint may not be configured yet).
 */
export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({
    available: false,
    checking: false,
  });

  useEffect(() => {
    let cancelled = false;

    const checkForUpdates = async () => {
      setStatus((prev) => ({ ...prev, checking: true }));
      try {
        const update = await check();
        if (cancelled) return;

        if (update) {
          setStatus({
            available: true,
            version: update.version,
            checking: false,
          });
        } else {
          setStatus({ available: false, checking: false });
        }
      } catch {
        // Silently fail — updater endpoint may not be configured yet
        if (!cancelled) {
          setStatus({ available: false, checking: false });
        }
      }
    };

    checkForUpdates();

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
