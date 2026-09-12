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
  const isDeafened = useCallStore((s) => s.isDeafened);

  return (
    <>
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} muted={isDeafened} />
      ))}
    </>
  );
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  return <audio ref={ref} autoPlay className="hidden" />;
}
