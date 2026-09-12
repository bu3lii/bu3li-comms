import { ConnectionBadge } from "../ui/ConnectionBadge";
import { useConnectionStore } from "../../stores/connectionStore";

export function SidebarHeader() {
  const status = useConnectionStore((s) => s.status);

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-lg font-semibold tracking-tight text-text-primary">bu3li</span>
        <span className="font-mono text-[0.7rem] uppercase tracking-widest text-text-tertiary">comms</span>
      </div>
      <ConnectionBadge status={status} />
    </div>
  );
}
