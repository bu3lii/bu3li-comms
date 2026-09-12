import { useCallback, useEffect, useState } from "react";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

/**
 * Lists microphones. Labels are blank until the browser has granted mic
 * permission at least once in this origin — `requestPermission` triggers
 * that (via a throwaway getUserMedia call) and re-lists.
 */
export function useAudioInputDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [hasLabels, setHasLabels] = useState(false);

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    setDevices(inputs);
    setHasLabels(inputs.every((d) => !d.label.startsWith("Microphone ")) && inputs.length > 0);
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  async function requestPermission(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    await refresh();
  }

  return { devices, hasLabels, requestPermission };
}
