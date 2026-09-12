import { useTypingUsers } from "../../stores/typingStore";
import { useDisplayName } from "../../hooks/useDisplayName";

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const typingUserIds = useTypingUsers(conversationId);
  const ids = [...typingUserIds];

  if (ids.length === 0) {
    return <div className="h-6" aria-hidden="true" />;
  }

  return (
    <div className="flex h-6 items-center gap-2 px-4 text-xs text-text-secondary" role="status">
      <TypingDots />
      <TypingNames userIds={ids} />
    </div>
  );
}

function TypingNames({ userIds }: { userIds: string[] }) {
  const first = useDisplayName(userIds[0]!);

  if (userIds.length === 1) {
    return <span>{first.text} is typing…</span>;
  }
  return <span>{first.text} and {userIds.length - 1} other{userIds.length > 2 ? "s" : ""} typing…</span>;
}

function TypingDots() {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-text-tertiary"
          style={{ animation: "typing-bounce 1.2s infinite", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
