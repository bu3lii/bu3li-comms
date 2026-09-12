import { useEffect, useState } from "react";
import { watchSpeaking } from "../calls/speakingDetector";

export function useSpeaking(stream: MediaStream | null | undefined): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    // No cleanup to run for a null stream: either this is the initial
    // render (isSpeaking already defaults to false) or the previous
    // effect's own cleanup already reset it when the stream went away.
    if (!stream) {
      return;
    }

    const stop = watchSpeaking(stream, setIsSpeaking);
    return () => {
      stop();
      setIsSpeaking(false);
    };
  }, [stream]);

  return isSpeaking;
}
