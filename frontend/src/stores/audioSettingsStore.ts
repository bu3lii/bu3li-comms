import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AudioSettingsStore {
  /** null means "system default" — deviceId is only meaningful once the user has explicitly picked one. */
  inputDeviceId: string | null;
  setInputDeviceId: (deviceId: string | null) => void;
}

export const useAudioSettingsStore = create<AudioSettingsStore>()(
  persist(
    (set) => ({
      inputDeviceId: null,
      setInputDeviceId: (inputDeviceId) => set({ inputDeviceId }),
    }),
    { name: "bu3li:audio-settings" },
  ),
);
