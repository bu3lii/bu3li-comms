const SPEAKING_THRESHOLD = 16;
const HOLD_MS = 300;

/**
 * Polls an audio stream's volume via the Web Audio API and reports
 * speaking transitions. HOLD_MS avoids flicker during brief pauses within
 * a sentence rather than reporting speaking as a series of blips.
 */
export function watchSpeaking(stream: MediaStream, onChange: (isSpeaking: boolean) => void): () => void {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let rafId: number;
  let isSpeaking = false;
  let lastAboveThresholdAt = 0;

  function tick() {
    analyser.getByteFrequencyData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i]!;
    const average = sum / data.length;

    const now = performance.now();
    if (average > SPEAKING_THRESHOLD) {
      lastAboveThresholdAt = now;
      if (!isSpeaking) {
        isSpeaking = true;
        onChange(true);
      }
    } else if (isSpeaking && now - lastAboveThresholdAt > HOLD_MS) {
      isSpeaking = false;
      onChange(false);
    }

    rafId = requestAnimationFrame(tick);
  }
  tick();

  return () => {
    cancelAnimationFrame(rafId);
    source.disconnect();
    void audioContext.close();
  };
}
