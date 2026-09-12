import { useCallStore } from "../../stores/callStore";
import { callManager } from "../callManager";
import { useDisplayName } from "../../hooks/useDisplayName";
import { Avatar } from "../../components/ui/Avatar";
import { PhoneIcon, PhoneOffIcon } from "./icons";

/** Global ring overlay — mounted once at the authenticated shell, since a call can arrive while viewing any conversation. */
export function IncomingCallModal() {
  const status = useCallStore((s) => s.status);
  const callerId = useCallStore((s) => s.callerId);
  const caller = useDisplayName(callerId ?? "");

  if (status !== "incoming" || !callerId) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Incoming call from ${caller.text}`}
      className="animate-rise-in fixed inset-x-0 top-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 rounded-[12px] border border-border bg-surface p-4 shadow-lg"
    >
      <Avatar seed={callerId} name={caller.text} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{caller.text}</p>
        <p className="font-mono text-xs text-text-tertiary">incoming call</p>
      </div>
      <button
        type="button"
        onClick={() => callManager.decline()}
        aria-label="Decline call"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-danger/15 text-danger hover:bg-danger/25"
      >
        <PhoneOffIcon />
      </button>
      <button
        type="button"
        onClick={() => void callManager.accept()}
        autoFocus
        aria-label="Accept call"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-online/15 text-online hover:bg-online/25"
      >
        <PhoneIcon />
      </button>
    </div>
  );
}
