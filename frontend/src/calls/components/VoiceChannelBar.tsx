import { useVoiceChannelParticipants } from "../../stores/voiceChannelStore";
import { useCall } from "../../hooks/useCall";
import { useDisplayName } from "../../hooks/useDisplayName";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { VoiceIcon } from "./icons";

/** Ambient voice-channel row for a group conversation: shows who's in it, whether or not you've joined. */
export function VoiceChannelBar({ conversationId }: { conversationId: string }) {
  const participantIds = useVoiceChannelParticipants(conversationId);
  const { status, conversationId: activeConversationId, start, leave } = useCall();

  const isJoined = activeConversationId === conversationId && status !== "idle" && status !== "incoming";
  const isBusyElsewhere = status !== "idle" && activeConversationId !== conversationId;

  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-surface-sunken px-4 py-2">
      <span className="text-text-tertiary">
        <VoiceIcon />
      </span>
      <span className="text-xs font-medium text-text-secondary">Voice channel</span>

      <div className="flex -space-x-2">
        {participantIds.map((userId) => (
          <ParticipantChip key={userId} userId={userId} />
        ))}
      </div>
      {participantIds.length === 0 && <span className="font-mono text-xs text-text-tertiary">empty</span>}

      <div className="ml-auto">
        {isJoined ? (
          <Button variant="danger" onClick={() => leave()} className="!px-2.5 !py-1 text-xs">
            Leave
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void start(conversationId)}
            disabled={isBusyElsewhere}
            title={isBusyElsewhere ? "You're already in a call" : undefined}
            className="!px-2.5 !py-1 text-xs"
          >
            Join
          </Button>
        )}
      </div>
    </div>
  );
}

function ParticipantChip({ userId }: { userId: string }) {
  const name = useDisplayName(userId);
  return (
    <span className="rounded-full ring-2 ring-surface-sunken" title={name.text}>
      <Avatar seed={userId} name={name.text} size="sm" />
    </span>
  );
}
