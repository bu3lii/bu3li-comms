import { useCallStore } from "../../stores/callStore";
import { IncomingCallModal } from "./IncomingCallModal";
import { ActiveCallBar } from "./ActiveCallBar";
import { FullScreenCallView } from "./FullScreenCallView";
import { CallAudioSinks } from "./CallAudioSinks";

/** Mounted once at the authenticated shell — a call isn't tied to any one conversation view. */
export function CallOverlay({ currentUserId }: { currentUserId: string }) {
  const status = useCallStore((s) => s.status);
  const isExpanded = useCallStore((s) => s.isExpanded);

  return (
    <>
      <CallAudioSinks />
      <IncomingCallModal />
      {(status === "active" || status === "outgoing") &&
        (isExpanded ? (
          <FullScreenCallView currentUserId={currentUserId} />
        ) : (
          <ActiveCallBar currentUserId={currentUserId} />
        ))}
    </>
  );
}
