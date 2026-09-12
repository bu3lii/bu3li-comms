import { create } from "zustand";

export type CallStatus = "idle" | "outgoing" | "incoming" | "active";

interface CallStore {
  status: CallStatus;
  conversationId: string | null;
  /** Who's ringing us, only set while status is "incoming". */
  callerId: string | null;
  participantIds: string[];
  remoteStreams: Record<string, MediaStream>;
  localStream: MediaStream | null;
  isMuted: boolean;
  /** Whether the call UI has taken over the full page. Purely presentational — doesn't affect the call itself. */
  isExpanded: boolean;

  setIncoming: (conversationId: string, callerId: string) => void;
  setOutgoing: (conversationId: string) => void;
  setParticipants: (participantIds: string[]) => void;
  setRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setMuted: (isMuted: boolean) => void;
  setExpanded: (isExpanded: boolean) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as CallStatus,
  conversationId: null,
  callerId: null,
  participantIds: [],
  remoteStreams: {},
  localStream: null,
  isMuted: false,
  isExpanded: false,
};

export const useCallStore = create<CallStore>((set) => ({
  ...initial,

  setIncoming: (conversationId, callerId) => set({ status: "incoming", conversationId, callerId }),
  setOutgoing: (conversationId) => set({ status: "outgoing", conversationId, callerId: null }),
  setParticipants: (participantIds) => set({ status: "active", participantIds }),
  setRemoteStream: (userId, stream) =>
    set((state) => ({ remoteStreams: { ...state.remoteStreams, [userId]: stream } })),
  removeRemoteStream: (userId) =>
    set((state) => {
      const next = { ...state.remoteStreams };
      delete next[userId];
      return { remoteStreams: next };
    }),
  setLocalStream: (localStream) => set({ localStream }),
  setMuted: (isMuted) => set({ isMuted }),
  setExpanded: (isExpanded) => set({ isExpanded }),
  reset: () => set(initial),
}));
