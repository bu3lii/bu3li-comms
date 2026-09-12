import { useRef, useState } from "react";
import { attachmentUrl } from "../../api/messages";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VoiceMessagePlayer({ messageId, durationMs }: { messageId: string; durationMs: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const totalSeconds = durationMs / 1000;

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  return (
    <div className="flex min-w-[210px] items-center gap-2.5">
      <audio
        ref={audioRef}
        src={attachmentUrl(messageId)}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-text hover:bg-accent-strong"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        type="range"
        min={0}
        max={totalSeconds || 1}
        step={0.1}
        value={currentTime}
        onChange={(e) => {
          const time = Number(e.target.value);
          if (audioRef.current) audioRef.current.currentTime = time;
          setCurrentTime(time);
        }}
        aria-label="Seek voice message"
        className="h-1 flex-1 accent-accent"
      />
      <span className="font-mono text-[0.68rem] tabular-nums text-text-tertiary">
        {formatDuration(isPlaying || currentTime > 0 ? currentTime : totalSeconds)}
      </span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M2 1.2v9.6l8-4.8-8-4.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="1.5" width="3" height="9" />
      <rect x="7" y="1.5" width="3" height="9" />
    </svg>
  );
}
