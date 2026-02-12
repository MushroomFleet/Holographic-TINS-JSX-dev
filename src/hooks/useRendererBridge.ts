import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ShellRequest {
  command: string;
  args: string[];
  cwd?: string;
}

interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
}

/**
 * Listens for BRIDGE_EXECUTE postMessages from the iframe and relays
 * them to the Rust backend's bridge_execute command.
 *
 * Message protocol from iframe:
 * { type: 'BRIDGE_EXECUTE', id: string, request: ShellRequest }
 *
 * Response back to iframe:
 * { type: 'BRIDGE_RESULT', id: string, result: ShellResult }
 * or
 * { type: 'BRIDGE_ERROR', id: string, error: string }
 */
export function useRendererBridge() {
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== "BRIDGE_EXECUTE") {
        return;
      }

      const { id, request } = data as {
        id: string;
        request: ShellRequest;
      };

      if (!id || !request || !request.command) return;

      try {
        const result = await invoke<ShellResult>("bridge_execute", { request });

        // Find the iframe and post the result back
        const iframes = document.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          iframe.contentWindow?.postMessage(
            { type: "BRIDGE_RESULT", id, result },
            "*",
          );
        });
      } catch (err) {
        const iframes = document.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          iframe.contentWindow?.postMessage(
            { type: "BRIDGE_ERROR", id, error: String(err) },
            "*",
          );
        });
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
}
