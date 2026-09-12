import { SettingsSection } from "./SettingsSection";
import { useThemeStore, type ThemeMode } from "../../stores/themeStore";
import { useMotionStore } from "../../stores/motionStore";

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const smooth = useMotionStore((s) => s.smooth);
  const setSmooth = useMotionStore((s) => s.setSmooth);

  return (
    <SettingsSection title="Appearance" description="Choose how bu3li comms looks and moves on this device.">
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

      <label className="mt-5 flex items-start justify-between gap-4 rounded-[8px] border border-border-strong px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-text-primary">Smooth mode</span>
          <span className="block text-xs text-text-tertiary">
            Animate modals, conversation switches, and hover/focus states instead of snapping instantly. Respects your
            system's reduced-motion setting either way.
          </span>
        </span>
        <span
          role="switch"
          aria-checked={smooth}
          tabIndex={0}
          onClick={() => setSmooth(!smooth)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSmooth(!smooth);
            }
          }}
          className={`relative mt-0.5 flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
            smooth ? "bg-accent" : "bg-surface-sunken"
          }`}
        >
          <span
            className={`absolute h-[1.125rem] w-[1.125rem] rounded-full bg-white shadow transition-transform ${
              smooth ? "translate-x-6" : "translate-x-1"
            }`}
            aria-hidden="true"
          />
        </span>
      </label>
    </SettingsSection>
  );
}
