interface SettingsPanelProps {
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  fontSize: number;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  onClose: () => void;
  desktopColor: string;
  onDesktopColorChange: (color: string) => void;
}

const PRESET_COLORS = [
  { name: "Electric Blue", value: "#00d4ff" },
  { name: "Neon Green", value: "#00ff88" },
  { name: "Hot Pink", value: "#ff3399" },
  { name: "Amber", value: "#ffaa00" },
  { name: "Violet", value: "#aa66ff" },
  { name: "Coral", value: "#ff6b6b" },
  { name: "Teal", value: "#00ccaa" },
  { name: "Gold", value: "#ffd700" },
];

/** Expand 3-digit hex (#RGB) to 6-digit (#RRGGBB) */
function expandHex(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

export function SettingsPanel({
  accentColor,
  onAccentColorChange,
  highContrast,
  onToggleHighContrast,
  fontSize,
  onIncreaseFontSize,
  onDecreaseFontSize,
  systemPrompt,
  onSystemPromptChange,
  onClose,
  desktopColor,
  onDesktopColorChange,
}: SettingsPanelProps) {
  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary flex-shrink-0">
        <span className="text-sm font-medium text-text-primary">Settings</span>
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-accent text-xs transition-colors"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Accent color */}
        <div>
          <label className="text-xs font-medium text-text-primary block mb-2">
            Accent Color
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => onAccentColorChange(preset.value)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  accentColor === preset.value
                    ? "border-white scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: preset.value }}
                title={preset.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => onAccentColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
                  onAccentColorChange(expandHex(v));
                }
              }}
              className="bg-bg-tertiary text-text-primary rounded px-2 py-1 text-xs font-mono w-24 outline-none focus:ring-1 focus:ring-accent"
              placeholder="#00d4ff"
            />
          </div>
        </div>

        {/* App Tray background color */}
        <div>
          <label className="text-xs font-medium text-text-primary block mb-2">
            App Tray Background
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { name: "Win 3.1 Teal", value: "#008080" },
              { name: "Deep Navy", value: "#000080" },
              { name: "Forest Green", value: "#006400" },
              { name: "Charcoal", value: "#1a1a2e" },
              { name: "Midnight Purple", value: "#1a0033" },
              { name: "Slate", value: "#2f4f4f" },
            ].map((preset) => (
              <button
                key={preset.value}
                onClick={() => onDesktopColorChange(preset.value)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  desktopColor === preset.value
                    ? "border-white scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: preset.value }}
                title={preset.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={desktopColor}
              onChange={(e) => onDesktopColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={desktopColor}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
                  onDesktopColorChange(expandHex(v));
                }
              }}
              className="bg-bg-tertiary text-text-primary rounded px-2 py-1 text-xs font-mono w-24 outline-none focus:ring-1 focus:ring-accent"
              placeholder="#008080"
            />
          </div>
        </div>

        {/* High-contrast mode */}
        <div>
          <label className="text-xs font-medium text-text-primary block mb-2">
            Accessibility
          </label>
          <button
            onClick={onToggleHighContrast}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left text-xs transition-colors ${
              highContrast
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className="text-base">{highContrast ? "\u2B24" : "\u25CB"}</span>
            <div>
              <div className="font-medium">High Contrast Mode</div>
              <div className="text-[10px] opacity-70 mt-0.5">
                Increases color contrast for better readability
              </div>
            </div>
          </button>
        </div>

        {/* Font size control */}
        <div>
          <label className="text-xs font-medium text-text-primary block mb-2">
            Chat Font Size
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={onDecreaseFontSize}
              disabled={fontSize <= 10}
              className="w-8 h-8 rounded bg-bg-tertiary text-text-primary hover:text-accent transition-colors flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
              title="Decrease font size (Ctrl+-)"
            >
              -
            </button>
            <span className="text-sm font-mono text-text-primary w-12 text-center">
              {fontSize}px
            </span>
            <button
              onClick={onIncreaseFontSize}
              disabled={fontSize >= 20}
              className="w-8 h-8 rounded bg-bg-tertiary text-text-primary hover:text-accent transition-colors flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
              title="Increase font size (Ctrl+=)"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-text-secondary mt-1.5 opacity-70">
            Range: 10px - 20px. Also use Ctrl+/Ctrl- shortcuts.
          </p>
        </div>

        {/* System prompt override */}
        <div>
          <label className="text-xs font-medium text-text-primary block mb-2">
            System Prompt Override
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            placeholder="Leave empty for default system prompt..."
            className="w-full h-20 bg-bg-tertiary text-text-primary text-[11px] rounded p-2 border border-bg-tertiary outline-none focus:ring-1 focus:ring-accent resize-none"
            maxLength={2000}
          />
          <p className="text-[10px] text-text-secondary mt-1 opacity-70">
            Custom instructions for Claude. Leave blank for default behavior.
          </p>
        </div>

        {/* Keyboard shortcuts reference */}
        <div>
          <h3 className="text-xs font-medium text-text-primary mb-2">
            Keyboard Shortcuts
          </h3>
          <div className="space-y-1 text-[11px] text-text-secondary">
            <div className="flex justify-between">
              <span>New conversation</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+N
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Focus chat</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+1
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Focus renderer</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+2
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Toggle library</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+L
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Export HTML</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+E
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Search messages</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+F
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Increase font size</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+=
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Decrease font size</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+-
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Toggle App Tray</span>
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">
                Ctrl+T
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
