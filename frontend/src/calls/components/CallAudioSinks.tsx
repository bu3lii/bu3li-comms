import { useEffect, useRef } from "react";
import { useCallStore } from "../../stores/callStore";

/**
 * Renders the actual <audio> elements for every remote stream. Kept
 * separate from and mounted independently of whichever visual (bar or
 * full-screen) is showing, so switching between them never interrupts
 * playback by remounting the audio element.
 */
export function CallAudioSinks() {
  const remoteStreams = useCallStore((s) => s.remoteStreams);

  return (
    <>
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} />
      ))}
    </>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return <audio ref={ref} autoPlay className="hidden" />;
}
