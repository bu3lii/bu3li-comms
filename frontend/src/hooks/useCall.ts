import { useCallStore } from "../stores/callStore";
import { callManager } from "../calls/callManager";

export function useCall() {
  const status = useCallStore((s) => s.status);
  const conversationId = useCallStore((s) => s.conversationId);
  const callerId = useCallStore((s) => s.callerId);
  const participantIds = useCallStore((s) => s.participantIds);
  const remoteStreams = useCallStore((s) => s.remoteStreams);
  const isMuted = useCallStore((s) => s.isMuted);
  const isDeafened = useCallStore((s) => s.isDeafened);

  return {
    status,
    conversationId,
    callerId,
    participantIds,
    remoteStreams,
    isMuted,
    isDeafened,
    start: (conversationId: string) => callManager.start(conversationId),
    accept: () => callManager.accept(),
    decline: () => callManager.decline(),
    leave: () => callManager.leave(),
    toggleMute: () => callManager.toggleMute(),
    toggleDeafen: () => callManager.toggleDeafen(),
  };
}
