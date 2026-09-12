import { useMemo, useState } from "react";
import { Avatar } from "../ui/Avatar";
import { Spinner } from "../ui/Spinner";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import { ImageAttachment, VideoAttachment } from "./MediaAttachment";
import { MessageContent } from "./MessageContent";
import { ReactionBar } from "./ReactionBar";
import { formatTime } from "../../lib/format";
import { useDisplayName } from "../../hooks/useDisplayName";
import { useUserDirectory } from "../../hooks/useUserDirectory";
import type { ChatMessage } from "../../types/message";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showMeta: boolean;
  isReadByPeer: boolean;
  currentUserId: string;
  onEdit: (content: string) => void;
  onDelete: () => void;
  onRetry: () => void;
  onToggleReaction: (emoji: string, isActive: boolean) => void;
}

export function MessageBubble({
  message,
  isOwn,
  showMeta,
  isReadByPeer,
  currentUserId,
  onEdit,
  onDelete,
  onRetry,
  onToggleReaction,
}: MessageBubbleProps) {
  const sender = useDisplayName(message.sender_id);
  const directory = useUserDirectory();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const wasEdited = message.updated_at !== message.created_at;

  const mentionUsernames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of directory.values()) {
      names.add(entry.username.toLowerCase());
    }
    return names;
  }, [directory]);

  function submitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit(trimmed);
    }
    setIsEditing(false);
  }

  function renderAttachment() {
    switch (message.attachment_kind) {
      case "image":
        return <ImageAttachment messageId={message.id} widthPx={message.attachment_width_px} heightPx={message.attachment_height_px} />;
      case "video":
        return <VideoAttachment messageId={message.id} widthPx={message.attachment_width_px} heightPx={message.attachment_height_px} />;
      default:
        return <VoiceMessagePlayer messageId={message.id} durationMs={message.attachment_duration_ms} />;
    }
  }

  return (
    <div className={`smooth-swap flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""} ${showMeta ? "mt-3" : "mt-0.5"}`}>
      <div className="w-7 shrink-0">
        {showMeta && !isOwn && (
          <Avatar seed={message.sender_id} name={sender.text} size="sm" userId={message.sender_id} hasAvatar={sender.hasAvatar} />
        )}
      </div>
      <div className={`flex max-w-[70%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {showMeta && !isOwn && (
          <span className={`mb-1 px-1 text-xs font-medium ${sender.isKnown ? "text-text-secondary" : "text-text-tertiary italic"}`}>
            {sender.text}
          </span>
        )}

        {isEditing ? (
          <div className="flex w-full flex-col gap-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitEdit();
                }
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setDraft(message.content);
                }
              }}
              rows={2}
              className="w-full resize-none rounded-[8px] border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={submitEdit} className="font-medium text-accent hover:text-accent-strong">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setDraft(message.content);
                }}
                className="text-text-tertiary hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`group relative rounded-[10px] px-3 py-2 text-sm leading-relaxed break-words ${
              message.has_attachment && message.attachment_kind !== "audio" ? "p-1.5" : ""
            } ${
              isOwn
                ? "border border-[var(--color-own-bubble-border)] bg-[var(--color-own-bubble)] text-text-primary"
                : "border border-border bg-surface-raised text-text-primary"
            } ${message.status === "pending" ? "opacity-60" : ""} ${message.status === "failed" ? "border-danger/50" : ""}`}
          >
            {message.has_attachment ? (
              renderAttachment()
            ) : (
              <p className="whitespace-pre-wrap">
                <MessageContent content={message.content} mentionUsernames={mentionUsernames} />
              </p>
            )}
          </div>
        )}

        {message.status === "sent" && (
          <ReactionBar reactions={message.reactions} currentUserId={currentUserId} onToggle={onToggleReaction} />
        )}

        <div className="mt-1 flex items-center gap-1.5 px-1 font-mono text-[0.68rem] text-text-tertiary">
          {message.status === "pending" && (
            <>
              <Spinner size="sm" />
              <span>sending</span>
            </>
          )}
          {message.status === "failed" && (
            <>
              <span className="text-danger">failed to send</span>
              <button type="button" onClick={onRetry} className="font-medium text-accent hover:text-accent-strong">
                retry
              </button>
            </>
          )}
          {message.status === "sent" && (
            <>
              <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
              {wasEdited && <span>· edited</span>}
              {isOwn && isReadByPeer && <span title="Read">· read</span>}
              {isOwn && !isEditing && (
                <>
                  {!message.has_attachment && (
                    <button type="button" onClick={() => setIsEditing(true)} className="hover:text-text-secondary">
                      edit
                    </button>
                  )}
                  {confirmingDelete ? (
                    <span className="flex items-center gap-1">
                      <span className="text-text-secondary">delete?</span>
                      <button type="button" onClick={onDelete} className="font-medium text-danger">
                        yes
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(false)} className="text-text-secondary">
                        no
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDelete(true)} className="hover:text-danger">
                      delete
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
