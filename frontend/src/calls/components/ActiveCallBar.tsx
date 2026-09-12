import { useCallStore } from "../../stores/callStore";
import { callManager } from "../callManager";
import { CallParticipantTile } from "./CallParticipantTile";
import { ExpandIcon, MicIcon, MicOffIcon, PhoneOffIcon } from "./icons";

/** Compact "you're in a call" bar — persists across navigation since the call itself isn't tied to one conversation view. */
export function ActiveCallBar({ currentUserId }: { currentUserId: string }) {
  const participantIds = useCallStore((s) => s.participantIds);
  const remoteStreams = useCallStore((s) => s.remoteStreams);
  const localStream = useCallStore((s) => s.localStream);
  const isMuted = useCallStore((s) => s.isMuted);

  const others = participantIds.filter((id) => id !== currentUserId);

  return (
    <div className="animate-rise-in fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-lg">
      <div className="flex items-center gap-1.5">
        <CallParticipantTile userId={currentUserId} stream={localStream} />
        {others.length === 0 ? (
          <span className="ml-1 font-mono text-xs text-text-tertiary">ringing…</span>
        ) : (
          others.map((userId) => <CallParticipantTile key={userId} userId={userId} stream={remoteStreams[userId]} />)
        )}
      </div>

      <button
        type="button"
        onClick={() => callManager.toggleMute()}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
        aria-pressed={isMuted}
        className={`flex h-8 w-8 items-center justify-center rounded-full ${
          isMuted ? "bg-danger/15 text-danger" : "bg-surface-raised text-text-secondary hover:text-text-primary"
        }`}
      >
        {isMuted ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button
        type="button"
        onClick={() => useCallStore.getState().setExpanded(true)}
        aria-label="Expand call to full screen"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-text-secondary hover:text-text-primary"
      >
        <ExpandIcon />
      </button>
      <button
        type="button"
        onClick={() => callManager.leave()}
        aria-label="Leave call"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/15 text-danger hover:bg-danger/25"
      >
        <PhoneOffIcon />
      </button>
    </div>
  );
}
