import { useState } from "react";
import { attachmentUrl } from "../../api/messages";

interface MediaAttachmentProps {
  messageId: string;
  widthPx: number;
  heightPx: number;
}

const MAX_PREVIEW_WIDTH = 280;
const MAX_PREVIEW_HEIGHT = 320;

export function ImageAttachment({ messageId, widthPx, heightPx }: MediaAttachmentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const aspectRatio = widthPx > 0 && heightPx > 0 ? `${widthPx} / ${heightPx}` : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block overflow-hidden rounded-[8px]"
        style={{ maxWidth: MAX_PREVIEW_WIDTH, maxHeight: MAX_PREVIEW_HEIGHT, aspectRatio }}
        aria-label="Open image"
      >
        <img src={attachmentUrl(messageId)} alt="" className="h-full w-full object-cover" loading="lazy" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setIsOpen(false)}
        >
          <img
            src={attachmentUrl(messageId)}
            alt=""
            className="max-h-full max-w-full rounded-[8px] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close image preview"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </>
  );
}

export function VideoAttachment({ messageId, widthPx, heightPx }: MediaAttachmentProps) {
  const aspectRatio = widthPx > 0 && heightPx > 0 ? `${widthPx} / ${heightPx}` : undefined;

  return (
    <video
      src={attachmentUrl(messageId)}
      controls
      preload="metadata"
      className="block rounded-[8px]"
      style={{ maxWidth: MAX_PREVIEW_WIDTH, maxHeight: MAX_PREVIEW_HEIGHT, aspectRatio }}
    />
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 2l12 12M14 2 2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
