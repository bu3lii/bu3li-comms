import type { ConnectionStatus } from "../../realtime/socket";

interface StatusPresentation {
  label: string;
  color: string;
  pulsing: boolean;
}

const PRESENTATION: Record<ConnectionStatus, StatusPresentation> = {
  connected: { label: "connected", color: "var(--color-online)", pulsing: false },
  connecting: { label: "connecting", color: "var(--color-away)", pulsing: true },
  reconnecting: { label: "reconnecting", color: "var(--color-away)", pulsing: true },
  disconnected: { label: "offline", color: "var(--color-text-tertiary)", pulsing: false },
};

const BAR_HEIGHTS = [5, 8, 11];

/**
 * The app's signature status readout: three signal bars styled like
 * telecom equipment rather than a generic colored dot, since the whole
 * point of this product is the live connection underneath it.
 */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { label, color, pulsing } = PRESENTATION[status];

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-sunken px-2.5 py-1"
      role="status"
    >
      <span className="flex items-end gap-[2.5px]" aria-hidden="true">
        {BAR_HEIGHTS.map((height, i) => (
          <span
            key={height}
            className={pulsing ? "animate-signal-pulse" : ""}
            style={{
              width: "3px",
              height: `${height}px`,
              backgroundColor: color,
              borderRadius: "1px",
              animationDelay: pulsing ? `${i * 0.18}s` : undefined,
            }}
          />
        ))}
      </span>
      <span className="font-mono text-[0.7rem] uppercase tracking-wide text-text-secondary">{label}</span>
    </div>
  );
}
