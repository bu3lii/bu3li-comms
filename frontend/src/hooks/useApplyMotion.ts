import { useEffect } from "react";
import { useMotionStore } from "../stores/motionStore";

/** The smooth-mode CSS (src/index.css) keys off `data-motion="smooth"` on <html>; this keeps that attribute in sync with the store. */
export function useApplyMotion(): void {
  const smooth = useMotionStore((s) => s.smooth);

  useEffect(() => {
    if (smooth) {
      document.documentElement.setAttribute("data-motion", "smooth");
    } else {
      document.documentElement.removeAttribute("data-motion");
    }
  }, [smooth]);
}
