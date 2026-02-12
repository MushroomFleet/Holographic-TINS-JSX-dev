import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppSettings {
  accent_color: string;
  high_contrast: boolean;
  font_size: number;
  system_prompt: string;
  splitter_position: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  accent_color: "#00d4ff",
  high_contrast: false,
  font_size: 13,
  system_prompt: "",
  splitter_position: 0.4,
};

/** High-contrast overrides applied via CSS custom properties */
const HIGH_CONTRAST_VARS: Record<string, string> = {
  "--color-bg-primary": "#000000",
  "--color-bg-secondary": "#0a0a0a",
  "--color-bg-tertiary": "#222222",
  "--color-text-primary": "#ffffff",
  "--color-text-secondary": "#cccccc",
  "--color-error": "#ff4444",
  "--color-success": "#44ff44",
  "--color-warning": "#ffcc00",
};

/** Normal theme defaults (for reverting high-contrast) */
const NORMAL_VARS: Record<string, string> = {
  "--color-bg-primary": "#0a0a1a",
  "--color-bg-secondary": "#12122a",
  "--color-bg-tertiary": "#1a1a3e",
  "--color-text-primary": "#e0e0e0",
  "--color-text-secondary": "#8888aa",
  "--color-error": "#ff6b6b",
  "--color-success": "#4ade80",
  "--color-warning": "#fbbf24",
};

function applyHighContrast(enabled: boolean) {
  const vars = enabled ? HIGH_CONTRAST_VARS : NORMAL_VARS;
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
  }
  document.documentElement.classList.toggle("high-contrast", enabled);
}

function applyFontSize(size: number) {
  document.documentElement.style.setProperty("--chat-font-size", `${size}px`);
}

/**
 * Manages theme settings: accent color, high-contrast mode, font size,
 * system prompt override, and splitter position.
 * Loads from settings on mount, applies as CSS variables, and persists changes.
 */
export function useTheme() {
  const [accentColor, setAccentColor] = useState(DEFAULT_SETTINGS.accent_color);
  const [highContrast, setHighContrast] = useState(DEFAULT_SETTINGS.high_contrast);
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.font_size);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SETTINGS.system_prompt);
  const [splitterPosition, setSplitterPosition] = useState(DEFAULT_SETTINGS.splitter_position);

  // Load saved settings on mount
  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then((settings) => {
        if (settings.accent_color) {
          setAccentColor(settings.accent_color);
          document.documentElement.style.setProperty(
            "--color-accent",
            settings.accent_color,
          );
        }
        if (settings.high_contrast !== undefined) {
          setHighContrast(settings.high_contrast);
          applyHighContrast(settings.high_contrast);
        }
        if (settings.font_size) {
          setFontSize(settings.font_size);
          applyFontSize(settings.font_size);
        }
        if (settings.system_prompt !== undefined) {
          setSystemPrompt(settings.system_prompt);
        }
        if (settings.splitter_position) {
          setSplitterPosition(settings.splitter_position);
        }
      })
      .catch(console.error);
  }, []);

  const saveSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      try {
        await invoke("save_settings", {
          settings: {
            accent_color: updates.accent_color ?? accentColor,
            high_contrast: updates.high_contrast ?? highContrast,
            font_size: updates.font_size ?? fontSize,
            system_prompt: updates.system_prompt ?? systemPrompt,
            splitter_position: updates.splitter_position ?? splitterPosition,
          },
        });
      } catch (err) {
        console.error("Failed to save settings:", err);
      }
    },
    [accentColor, highContrast, fontSize, systemPrompt, splitterPosition],
  );

  const updateAccentColor = useCallback(
    async (color: string) => {
      setAccentColor(color);
      document.documentElement.style.setProperty("--color-accent", color);
      await saveSettings({ accent_color: color });
    },
    [saveSettings],
  );

  const toggleHighContrast = useCallback(async () => {
    const newValue = !highContrast;
    setHighContrast(newValue);
    applyHighContrast(newValue);
    await saveSettings({ high_contrast: newValue });
  }, [highContrast, saveSettings]);

  const updateFontSize = useCallback(
    async (size: number) => {
      const clamped = Math.min(20, Math.max(10, size));
      setFontSize(clamped);
      applyFontSize(clamped);
      await saveSettings({ font_size: clamped });
    },
    [saveSettings],
  );

  const increaseFontSize = useCallback(async () => {
    if (fontSize >= 20) return;
    await updateFontSize(fontSize + 1);
  }, [fontSize, updateFontSize]);

  const decreaseFontSize = useCallback(async () => {
    if (fontSize <= 10) return;
    await updateFontSize(fontSize - 1);
  }, [fontSize, updateFontSize]);

  const updateSystemPrompt = useCallback(
    async (prompt: string) => {
      setSystemPrompt(prompt);
      await saveSettings({ system_prompt: prompt });
    },
    [saveSettings],
  );

  const updateSplitterPosition = useCallback(
    async (position: number) => {
      setSplitterPosition(position);
      await saveSettings({ splitter_position: position });
    },
    [saveSettings],
  );

  return {
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
  };
}
