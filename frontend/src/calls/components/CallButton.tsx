import { useCall } from "../../hooks/useCall";
import { VoiceIcon, PhoneIcon } from "./icons";

/** Header control for a direct conversation: start a 1:1 call. */
export function CallButton({ conversationId }: { conversationId: string }) {
  const { status, conversationId: activeConversationId, start } = useCall();
  const isThisCallActive = activeConversationId === conversationId && status !== "idle";
  const isBusyElsewhere = status !== "idle" && activeConversationId !== conversationId;

  if (isThisCallActive) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-xs text-online">
        <VoiceIcon /> in call
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start(conversationId)}
      disabled={isBusyElsewhere}
      aria-label="Start voice call"
      title={isBusyElsewhere ? "You're already in a call" : "Start voice call"}
      className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <PhoneIcon />
    </button>
  );
}
