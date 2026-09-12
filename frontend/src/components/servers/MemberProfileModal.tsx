import { useEffect, useRef } from "react";
import { Avatar } from "../ui/Avatar";
import { formatMonthYear } from "../../lib/format";
import type { ServerMember } from "../../types/server";

/** A small, non-intrusive profile popover — not a full-screen takeover — showing a server member's role and when they joined the server and the platform. */
export function MemberProfileModal({ member, serverName, onClose }: { member: ServerMember; serverName: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-label={`${member.username}'s profile`}
      className="w-full max-w-xs rounded-[14px] border border-border bg-surface p-0 text-text-primary backdrop:bg-black/40"
    >
      {/*
       * `relative` must live on this inner wrapper, not the <dialog> itself
       * — overriding the dialog's own `position` breaks the browser's
       * top-layer/viewport-centered rendering entirely (see index.css for
       * the related margin:auto fix).
       */}
      <div className="relative p-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-raised hover:text-text-primary"
        >
          <CloseIcon />
        </button>

        <div className="flex items-center gap-3">
          <Avatar seed={member.user_id} name={member.username} userId={member.user_id} hasAvatar={member.has_avatar} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-text-primary">{member.username}</p>
            {member.is_owner ? (
              <span className="mt-1 inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                Owner
              </span>
            ) : (
              <span
                className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${member.role_color}26`, color: member.role_color }}
              >
                {member.role_name}
              </span>
            )}
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-tertiary">Joined {serverName}</dt>
            <dd className="font-medium text-text-primary">{formatMonthYear(member.joined_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-tertiary">Joined bu3li comms</dt>
            <dd className="font-medium text-text-primary">{formatMonthYear(member.user_created_at)}</dd>
          </div>
        </dl>
      </div>
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
