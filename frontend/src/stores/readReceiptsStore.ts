import { create } from "zustand";

interface ReadReceiptsStore {
  /** conversationId -> reader userId -> last message id they've read */
  lastReadByConversation: Record<string, Record<string, string>>;
  setLastRead: (conversationId: string, userId: string, messageId: string) => void;
}

export const useReadReceiptsStore = create<ReadReceiptsStore>((set) => ({
  lastReadByConversation: {},
  setLastRead: (conversationId, userId, messageId) =>
    set((state) => ({
      lastReadByConversation: {
        ...state.lastReadByConversation,
        [conversationId]: { ...state.lastReadByConversation[conversationId], [userId]: messageId },
      },
    })),
}));
