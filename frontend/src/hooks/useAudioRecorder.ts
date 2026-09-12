import { useEffect, useRef, useState } from "react";

export interface RecordedAudio {
  blob: Blob;
  durationMs: number;
}

/** Wraps MediaRecorder for a single voice-message take: start, stop-and-get-the-clip, or cancel. */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cleanup(): void {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
    setElapsedMs(0);
  }

  useEffect(() => cleanup, []);

  async function start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.start();

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
  }

  function stop(): Promise<RecordedAudio | null> {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null);

    return new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const durationMs = Date.now() - startedAtRef.current;
          cleanup();
          resolve(durationMs > 0 ? { blob, durationMs } : null);
        },
        { once: true },
      );
      recorder.stop();
    });
  }

  function cancel(): void {
    recorderRef.current?.stop();
    cleanup();
  }

  return { isRecording, elapsedMs, start, stop, cancel };
}
