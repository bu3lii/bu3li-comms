import { create } from "zustand";

interface PresenceStore {
  online: Set<string>;
  setOnline: (userId: string, isOnline: boolean) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  online: new Set(),
  setOnline: (userId, isOnline) =>
    set((state) => {
      const next = new Set(state.online);
      if (isOnline) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return { online: next };
    }),
}));

export function useIsOnline(userId: string | undefined): boolean {
  return usePresenceStore((state) => (userId ? state.online.has(userId) : false));
}
