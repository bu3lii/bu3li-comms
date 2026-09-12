import { useCallStore } from "../../stores/callStore";
import { callManager } from "../callManager";
import { useConversations } from "../../hooks/useConversations";
import { otherMembers } from "../../lib/conversation";
import { CallParticipantTile } from "./CallParticipantTile";
import { CollapseIcon, MicIcon, MicOffIcon, PhoneOffIcon } from "./icons";

export function FullScreenCallView({ currentUserId }: { currentUserId: string }) {
  const conversationId = useCallStore((s) => s.conversationId);
  const participantIds = useCallStore((s) => s.participantIds);
  const remoteStreams = useCallStore((s) => s.remoteStreams);
  const localStream = useCallStore((s) => s.localStream);
  const isMuted = useCallStore((s) => s.isMuted);

  const others = participantIds.filter((id) => id !== currentUserId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-label="Voice call">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-sm font-semibold text-text-primary">bu3li</span>
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-text-tertiary">comms · call</span>
        </div>
        <button
          type="button"
          onClick={() => useCallStore.getState().setExpanded(false)}
          aria-label="Collapse call"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised hover:text-text-primary"
        >
          <CollapseIcon />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6">
        {others.length === 0 ? (
          <RingingState conversationId={conversationId} currentUserId={currentUserId} />
        ) : (
          <div className="flex flex-wrap items-start justify-center gap-8">
            <CallParticipantTile userId={currentUserId} stream={localStream} size="lg" showName />
            {others.map((userId) => (
              <CallParticipantTile key={userId} userId={userId} stream={remoteStreams[userId]} size="lg" showName />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 pb-10 pt-4">
        <button
          type="button"
          onClick={() => callManager.toggleMute()}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={isMuted}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            isMuted ? "bg-danger/15 text-danger" : "bg-surface-raised text-text-secondary hover:text-text-primary"
          }`}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button
          type="button"
          onClick={() => callManager.leave()}
          aria-label="Leave call"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white hover:bg-danger-strong"
        >
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  );
}

function RingingState({ conversationId, currentUserId }: { conversationId: string | null; currentUserId: string }) {
  const { data: conversations } = useConversations();
  const conversation = conversations?.find((c) => c.id === conversationId);
  const peer = conversation ? otherMembers(conversation, currentUserId)[0] : undefined;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="font-display text-lg font-semibold text-text-primary">
        {peer ? `Calling ${peer.username}…` : "Waiting for others to join…"}
      </p>
      <p className="max-w-xs text-sm text-text-secondary">
        {peer ? "Waiting for them to pick up." : "Share this voice channel and wait for someone to join."}
      </p>
    </div>
  );
}
