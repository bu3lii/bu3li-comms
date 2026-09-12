import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { REACTION_EMOJIS } from "../../lib/reactions";
import type { ReactionSummary } from "../../types/message";

interface ReactionBarProps {
  reactions: ReactionSummary[];
  currentUserId: string;
  onToggle: (emoji: string, isActive: boolean) => void;
}

// Rough estimate of the picker's own footprint, used to keep it inside the
// viewport and to decide whether to open above or below the trigger.
const PICKER_WIDTH = 230;
const PICKER_HEIGHT = 44;
const VIEWPORT_MARGIN = 8;

export function ReactionBar({ reactions, currentUserId, onToggle }: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Rendered via a portal into document.body and positioned with `fixed`
  // coordinates from the trigger's own bounding rect — not `absolute`
  // inside the message list. An absolutely positioned popover there would
  // extend that list's scrollable content area every time it opened,
  // forcing the whole chat pane to scroll just to reveal it.
  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();

      let left = rect.left;
      left = Math.min(left, window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN);
      left = Math.max(left, VIEWPORT_MARGIN);

      const opensAbove = rect.top > PICKER_HEIGHT + VIEWPORT_MARGIN * 2;
      const top = opensAbove ? rect.top - PICKER_HEIGHT - 6 : rect.bottom + 6;

      setPosition({ top, left });
    }

    place();

    function close() {
      setPickerOpen(false);
    }

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || pickerRef.current?.contains(target)) {
        return;
      }
      close();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    // Capture phase: scroll events on a nested scrollable ancestor (the
    // message list) don't bubble, but capture-phase window listeners still
    // see them on the way down.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const isActive = reaction.user_ids.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onToggle(reaction.emoji, isActive)}
            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              isActive
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-border bg-surface-raised text-text-secondary hover:border-border-strong"
            }`}
            aria-pressed={isActive}
            aria-label={`${reaction.emoji} reaction, ${reaction.user_ids.length}`}
          >
            <span aria-hidden="true">{reaction.emoji}</span>
            <span className="font-mono tabular-nums">{reaction.user_ids.length}</span>
          </button>
        );
      })}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-label="Add reaction"
        aria-expanded={pickerOpen}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary"
      >
        <SmileIcon />
      </button>

      {pickerOpen &&
        position &&
        createPortal(
          <div
            ref={pickerRef}
            role="menu"
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="animate-rise-in z-50 flex gap-0.5 rounded-[8px] border border-border bg-surface-raised p-1 shadow-lg"
          >
            {REACTION_EMOJIS.map((emoji) => {
              const isActive = reactions.find((r) => r.emoji === emoji)?.user_ids.includes(currentUserId) ?? false;
              return (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggle(emoji, isActive);
                    setPickerOpen(false);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-[6px] text-base hover:bg-surface-sunken ${
                    isActive ? "bg-accent/15" : ""
                  }`}
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function SmileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 9.5c.6.9 1.5 1.4 2.5 1.4s1.9-.5 2.5-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="6.5" r="0.75" fill="currentColor" />
      <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
    </svg>
  );
}
