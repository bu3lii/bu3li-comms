import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MotionStore {
  /** "Smooth mode": opts into transitions/animations across the app (dialogs, conversation swaps, hover/focus states) that are otherwise instant. */
  smooth: boolean;
  setSmooth: (smooth: boolean) => void;
}

export const useMotionStore = create<MotionStore>()(
  persist(
    (set) => ({
      smooth: true,
      setSmooth: (smooth) => set({ smooth }),
    }),
    { name: "bu3li:motion" },
  ),
);
