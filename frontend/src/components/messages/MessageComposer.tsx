import { useRef, useState, type KeyboardEvent } from "react";
import { useTypingIndicator } from "../../hooks/useTypingIndicator";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { useToastStore } from "../../stores/toastStore";

interface MessageComposerProps {
  conversationId: string;
  onSend: (content: string) => void;
  onSendVoice: (blob: Blob, durationMs: number) => void;
}

const MAX_TEXTAREA_HEIGHT_PX = 160;

export function MessageComposer({ conversationId, onSend, onSendVoice }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { notifyTyping, stopTyping } = useTypingIndicator(conversationId);
  const recorder = useAudioRecorder();
  const pushToast = useToastStore((s) => s.push);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }

  function handleChange(next: string) {
    setValue(next);
    if (next.trim()) {
      notifyTyping();
    } else {
      stopTyping();
    }
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    stopTyping();
    requestAnimationFrame(resize);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function startRecording() {
    try {
      await recorder.start();
    } catch {
      pushToast("Couldn't access your microphone.", "error");
    }
  }

  async function finishRecording() {
    const result = await recorder.stop();
    if (result) onSendVoice(result.blob, result.durationMs);
  }

  if (recorder.isRecording) {
    return (
      <div className="border-t border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3 rounded-[10px] border border-danger/40 bg-surface-sunken px-3 py-2">
          <span className="animate-signal-pulse h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
          <span className="font-mono text-sm tabular-nums text-text-primary">{formatElapsed(recorder.elapsedMs)}</span>
          <span className="flex-1 text-xs text-text-tertiary">Recording…</span>
          <button
            type="button"
            onClick={() => recorder.cancel()}
            aria-label="Cancel recording"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised"
          >
            <CancelIcon />
          </button>
          <button
            type="button"
            onClick={() => void finishRecording()}
            aria-label="Send voice message"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-accent text-accent-text hover:bg-accent-strong"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <div className="flex items-end gap-2 rounded-[10px] border border-border-strong bg-surface-sunken px-3 py-2 focus-within:ring-2 focus-within:ring-focus-ring">
        <label htmlFor="composer-input" className="sr-only">
          Message
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            handleChange(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Message…"
          className="max-h-40 flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none"
        />
        {value.trim() ? (
          <button
            type="button"
            onClick={submit}
            aria-label="Send message"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-accent text-accent-text transition-colors hover:bg-accent-strong"
          >
            <SendIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            aria-label="Record a voice message"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
          >
            <MicIcon />
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 font-mono text-[0.65rem] text-text-tertiary">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M14 2 6.5 9.5M14 2 9.5 14l-3-5.5L1 5.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="6" y="1.5" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
