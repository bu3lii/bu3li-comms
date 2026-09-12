import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useCreateServer } from "../../hooks/useServerMutations";

export function CreateServerDialog() {
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
        aria-label="Create a server"
        title="Create a server"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-raised text-text-secondary transition-colors hover:bg-online/15 hover:text-online"
      >
        <PlusIcon />
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        className="w-full max-w-sm rounded-[12px] border border-border bg-surface p-0 text-text-primary backdrop:bg-black/50"
      >
        {isOpen && <DialogContent onDone={() => dialogRef.current?.close()} />}
      </dialog>
    </>
  );
}

function DialogContent({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const createServer = useCreateServer();
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createServer.mutate(trimmed, {
      onSuccess: (server) => {
        onDone();
        navigate(`/servers/${server.id}`);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-base font-semibold">Create a server</h2>
      <p className="text-sm text-text-secondary">A place with its own channels for a group of people — you can add more channels and invite members after.</p>
      <Input label="Server name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My server" autoFocus required />
      <Button type="submit" loading={createServer.isPending} disabled={!name.trim()}>
        Create server
      </Button>
    </form>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
