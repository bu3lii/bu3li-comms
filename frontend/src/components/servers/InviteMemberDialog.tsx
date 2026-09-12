import { useRef, useState } from "react";
import { Input } from "../ui/Input";
import { Avatar } from "../ui/Avatar";
import { useUserSearch } from "../../hooks/useUserSearch";
import { useAddServerMember } from "../../hooks/useServerMutations";
import type { ServerMember } from "../../types/server";

export function InviteMemberDialog({ serverId, existingMembers }: { serverId: string; existingMembers: ServerMember[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
        aria-label="Invite a member"
        title="Invite a member"
        className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:text-accent"
      >
        <PlusIcon />
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        className="w-full max-w-sm rounded-[12px] border border-border bg-surface p-0 text-text-primary backdrop:bg-black/50"
      >
        {isOpen && <DialogContent serverId={serverId} existingMembers={existingMembers} />}
      </dialog>
    </>
  );
}

function DialogContent({ serverId, existingMembers }: { serverId: string; existingMembers: ServerMember[] }) {
  const [query, setQuery] = useState("");
  const { data: results = [], isFetching } = useUserSearch(query);
  const addMember = useAddServerMember();
  const existingIds = new Set(existingMembers.map((m) => m.user_id));
  const candidates = results.filter((u) => !existingIds.has(u.id));

  return (
    <div className="flex flex-col gap-3 p-5">
      <h2 className="font-display text-base font-semibold">Invite a member</h2>
      <Input label="Search people by username" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" autoFocus />
      <div className="max-h-52 overflow-y-auto rounded-[8px] border border-border" role="listbox" aria-label="Search results">
        {candidates.length === 0 ? (
          <p className="p-3 text-sm text-text-tertiary">{isFetching ? "Searching…" : "Search for someone to invite."}</p>
        ) : (
          candidates.map((user) => (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => addMember.mutate({ serverId, userId: user.id })}
              disabled={addMember.isPending}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-raised disabled:opacity-50"
            >
              <Avatar seed={user.id} name={user.username} size="sm" userId={user.id} hasAvatar={user.has_avatar} />
              <span className="flex-1 truncate">{user.username}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
