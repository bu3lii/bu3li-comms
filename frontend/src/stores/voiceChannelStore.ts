import { create } from "zustand";

/**
 * Ambient "who's in the voice channel" state per conversation, independent
 * of whether this device is one of the participants — the backend
 * broadcasts call.joined/call.left to every conversation member so an idle
 * member can see the channel is active before joining, the same way
 * Discord shows who's in a voice channel you haven't clicked into.
 */
interface VoiceChannelStore {
  participantsByConversation: Record<string, string[]>;
  setParticipants: (conversationId: string, participantIds: string[]) => void;
  clear: (conversationId: string) => void;
}

const EMPTY: string[] = [];

export const useVoiceChannelStore = create<VoiceChannelStore>((set) => ({
  participantsByConversation: {},
  setParticipants: (conversationId, participantIds) =>
    set((state) => ({
      participantsByConversation: { ...state.participantsByConversation, [conversationId]: participantIds },
    })),
  clear: (conversationId) =>
    set((state) => {
      const next = { ...state.participantsByConversation };
      delete next[conversationId];
      return { participantsByConversation: next };
    }),
}));

export function useVoiceChannelParticipants(conversationId: string): string[] {
  return useVoiceChannelStore((state) => state.participantsByConversation[conversationId] ?? EMPTY);
}
