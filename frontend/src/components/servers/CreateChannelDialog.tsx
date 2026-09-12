import { useRef, useState, type FormEvent } from "react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useCreateChannel } from "../../hooks/useServerMutations";
import type { ChannelType } from "../../types/server";

export function CreateChannelDialog({ serverId }: { serverId: string }) {
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
        aria-label="Create a channel"
        title="Create a channel"
        className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:text-accent"
      >
        <PlusIcon />
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        className="w-full max-w-sm rounded-[12px] border border-border bg-surface p-0 text-text-primary backdrop:bg-black/50"
      >
        {isOpen && <DialogContent serverId={serverId} onDone={() => dialogRef.current?.close()} />}
      </dialog>
    </>
  );
}

function DialogContent({ serverId, onDone }: { serverId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("text");
  const createChannel = useCreateChannel();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createChannel.mutate(
      { serverId, name: trimmed, type },
      {
        onSuccess: () => {
          setName("");
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-base font-semibold">Create a channel</h2>

      <fieldset className="flex gap-4">
        <legend className="sr-only">Channel type</legend>
        {(["text", "voice"] as const).map((option) => (
          <label key={option} className="flex items-center gap-1.5 text-sm text-text-secondary">
            <input
              type="radio"
              name="channel-type"
              checked={type === option}
              onChange={() => setType(option)}
              className="accent-accent"
            />
            {option === "text" ? "Text" : "Voice"}
          </label>
        ))}
      </fieldset>

      <Input label="Channel name" value={name} onChange={(e) => setName(e.target.value)} placeholder="general" autoFocus required />

      <Button type="submit" loading={createChannel.isPending} disabled={!name.trim()}>
        Create channel
      </Button>
    </form>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
