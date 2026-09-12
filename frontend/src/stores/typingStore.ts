import { create } from "zustand";

/** How long a typing indicator is shown before it's assumed stale, in case `typing.stopped` never arrives. */
export const TYPING_EXPIRY_MS = 5000;

interface TypingStore {
  typingByConversation: Record<string, ReadonlySet<string>>;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
}

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(conversationId: string, userId: string): string {
  return `${conversationId}:${userId}`;
}

export const useTypingStore = create<TypingStore>((set) => ({
  typingByConversation: {},
  setTyping: (conversationId, userId, isTyping) => {
    const key = timerKey(conversationId, userId);
    const existingTimer = expiryTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      expiryTimers.delete(key);
    }

    const applyRemoval = () => {
      set((state) => {
        const current = state.typingByConversation[conversationId];
        if (!current?.has(userId)) {
          return state;
        }
        const next = new Set(current);
        next.delete(userId);
        return { typingByConversation: { ...state.typingByConversation, [conversationId]: next } };
      });
    };

    if (!isTyping) {
      applyRemoval();
      return;
    }

    set((state) => {
      const current = state.typingByConversation[conversationId] ?? new Set<string>();
      const next = new Set(current);
      next.add(userId);
      return { typingByConversation: { ...state.typingByConversation, [conversationId]: next } };
    });

    expiryTimers.set(
      key,
      setTimeout(() => {
        expiryTimers.delete(key);
        applyRemoval();
      }, TYPING_EXPIRY_MS),
    );
  },
}));

export function useTypingUsers(conversationId: string | undefined): ReadonlySet<string> {
  return useTypingStore((state) =>
    conversationId ? (state.typingByConversation[conversationId] ?? EMPTY_SET) : EMPTY_SET,
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();
