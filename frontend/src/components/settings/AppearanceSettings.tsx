import { SettingsSection } from "./SettingsSection";
import { useThemeStore, type ThemeMode } from "../../stores/themeStore";

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <SettingsSection title="Appearance" description="Choose how bu3li comms looks on this device.">
      <div className="flex gap-3" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={`rounded-[8px] border px-4 py-2.5 text-sm font-medium transition-colors ${
              mode === option.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-strong text-text-secondary hover:border-text-tertiary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </SettingsSection>
  );
}
