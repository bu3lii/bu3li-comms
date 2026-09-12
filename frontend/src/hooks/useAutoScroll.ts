import { useEffect, useRef } from "react";

const NEAR_BOTTOM_THRESHOLD_PX = 120;

/** Keeps a scroll container pinned to the bottom on new content, unless the user has scrolled up to read history. */
export function useAutoScroll(dependency: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (el && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [dependency]);

  return { containerRef, handleScroll };
}
