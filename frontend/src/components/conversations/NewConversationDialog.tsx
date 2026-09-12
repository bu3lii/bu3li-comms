import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Avatar } from "../ui/Avatar";
import { useStartConversation } from "../../hooks/useConversationMutations";
import { useUserSearch } from "../../hooks/useUserSearch";
import type { ConversationType } from "../../types/conversation";
import type { User } from "../../types/user";

export function NewConversationDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        className="mx-4 mt-3"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        + New conversation
      </Button>
      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        className="w-full max-w-md rounded-[12px] border border-border bg-surface p-0 text-text-primary backdrop:bg-black/50"
      >
        {isOpen && <DialogContent onDone={() => dialogRef.current?.close()} />}
      </dialog>
    </>
  );
}

function DialogContent({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<ConversationType>("direct");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<User[]>([]);
  const { data: results = [], isFetching } = useUserSearch(query);
  const startConversation = useStartConversation();
  const navigate = useNavigate();

  function toggle(user: User) {
    setSelected((prev) => {
      const alreadySelected = prev.some((u) => u.id === user.id);
      if (alreadySelected) return prev.filter((u) => u.id !== user.id);
      return type === "direct" ? [user] : [...prev, user];
    });
  }

  function handleTypeChange(next: ConversationType) {
    setType(next);
    setSelected((prev) => (next === "direct" ? prev.slice(0, 1) : prev));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selected.length === 0) return;

    startConversation.mutate(
      { type, memberIds: selected.map((u) => u.id) },
      {
        onSuccess: (conversation) => {
          onDone();
          navigate(`/chat/${conversation.id}`);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-base font-semibold">New conversation</h2>

      <fieldset className="flex gap-4">
        <legend className="sr-only">Conversation type</legend>
        {(["direct", "group"] as const).map((option) => (
          <label key={option} className="flex items-center gap-1.5 text-sm text-text-secondary">
            <input
              type="radio"
              name="conversation-type"
              checked={type === option}
              onChange={() => handleTypeChange(option)}
              className="accent-accent"
            />
            {option === "direct" ? "Direct message" : "Group"}
          </label>
        ))}
      </fieldset>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((user) => (
            <span
              key={user.id}
              className="flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-1 text-xs"
            >
              {user.username}
              <button
                type="button"
                onClick={() => toggle(user)}
                aria-label={`Remove ${user.username}`}
                className="text-text-tertiary hover:text-text-primary"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <Input
        label="Search people by username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        autoFocus
      />

      <div className="max-h-52 overflow-y-auto rounded-[8px] border border-border" role="listbox" aria-label="Search results">
        {results.length === 0 ? (
          <p className="p-3 text-sm text-text-tertiary">{isFetching ? "Searching…" : "No users found."}</p>
        ) : (
          results.map((user) => {
            const isSelected = selected.some((u) => u.id === user.id);
            return (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(user)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-raised ${
                  isSelected ? "bg-surface-raised" : ""
                }`}
              >
                <Avatar seed={user.id} name={user.username} size="sm" userId={user.id} hasAvatar={user.has_avatar} />
                <span className="flex-1 truncate">{user.username}</span>
                {isSelected && <CheckIcon />}
              </button>
            );
          })
        )}
      </div>

      <Button type="submit" loading={startConversation.isPending} disabled={selected.length === 0}>
        {type === "direct" ? "Start conversation" : `Create group${selected.length > 0 ? ` (${selected.length})` : ""}`}
      </Button>
    </form>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
