import { Avatar } from "../../components/ui/Avatar";
import { useDisplayName } from "../../hooks/useDisplayName";
import { useSpeaking } from "../../hooks/useSpeaking";

interface CallParticipantTileProps {
  userId: string;
  stream: MediaStream | null | undefined;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}

const RING_RADIUS: Record<NonNullable<CallParticipantTileProps["size"]>, string> = {
  sm: "rounded-[6px]",
  md: "rounded-[6px]",
  lg: "rounded-[10px]",
};

/** One participant's avatar in a call, glowing while their stream carries speech. */
export function CallParticipantTile({ userId, stream, size = "sm", showName = false }: CallParticipantTileProps) {
  const name = useDisplayName(userId);
  const isSpeaking = useSpeaking(stream);

  return (
    <div className={`flex flex-col items-center gap-2 ${size === "lg" ? "w-24" : ""}`}>
      <span className={`inline-flex ${RING_RADIUS[size]} ${isSpeaking ? "speaking-ring" : ""}`}>
        <Avatar seed={userId} name={name.text} size={size} />
      </span>
      {showName && (
        <span
          className={`w-full truncate text-center text-xs ${name.isKnown ? "text-text-secondary" : "text-text-tertiary italic"}`}
        >
          {name.text}
        </span>
      )}
    </div>
  );
}
