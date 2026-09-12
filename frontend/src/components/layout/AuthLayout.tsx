import type { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-text-primary">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-baseline justify-center gap-1.5">
          <span className="font-display text-2xl font-semibold tracking-tight">bu3li</span>
          <span className="font-mono text-xs uppercase tracking-widest text-text-tertiary">comms</span>
        </div>
        <div className="rounded-[12px] border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
