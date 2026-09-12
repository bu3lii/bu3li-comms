import { SettingsSection } from "./SettingsSection";
import { Button } from "../ui/Button";
import { useAudioInputDevices } from "../../hooks/useAudioInputDevices";
import { useAudioSettingsStore } from "../../stores/audioSettingsStore";

export function AudioSettings() {
  const { devices, hasLabels, requestPermission } = useAudioInputDevices();
  const inputDeviceId = useAudioSettingsStore((s) => s.inputDeviceId);
  const setInputDeviceId = useAudioSettingsStore((s) => s.setInputDeviceId);

  return (
    <SettingsSection title="Microphone" description="Used for voice messages and calls.">
      <div className="flex max-w-sm flex-col gap-3">
        {!hasLabels && devices.length > 0 && (
          <Button variant="secondary" onClick={() => void requestPermission()} className="self-start">
            Allow microphone access to see device names
          </Button>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Input device</span>
          <select
            value={inputDeviceId ?? ""}
            onChange={(e) => setInputDeviceId(e.target.value || null)}
            className="rounded-[8px] border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <option value="">System default</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </SettingsSection>
  );
}
