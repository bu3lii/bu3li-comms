import type { ReactNode } from "react";

interface AppShellProps {
  /** Leftmost server-icon rail — present on every authenticated screen so switching between DMs and servers is always one click away. */
  rail: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  /** Optional right-hand panel (server members list). Hidden below the lg breakpoint — narrow viewports don't have room for a fourth column. */
  rightPanel?: ReactNode;
  /** Below the md breakpoint, only one pane shows at a time; the rail travels with the sidebar pane. */
  mobilePane: "sidebar" | "conversation";
}

export function AppShell({ rail, sidebar, children, rightPanel, mobilePane }: AppShellProps) {
  return (
    <div
      className={`smooth-swap grid h-dvh grid-cols-1 bg-canvas text-text-primary md:grid-cols-[72px_280px_1fr] ${
        rightPanel ? "lg:grid-cols-[72px_280px_1fr_240px]" : ""
      }`}
    >
      <nav
        className={`flex-row items-center gap-2 overflow-x-auto border-b border-border bg-surface-sunken px-3 py-2 md:w-[72px] md:flex-col md:overflow-y-auto md:overflow-x-visible md:border-b-0 md:border-r md:px-0 md:py-3 ${
          mobilePane === "sidebar" ? "flex" : "hidden md:flex"
        }`}
      >
        {rail}
      </nav>
      <aside
        className={`flex-col border-r border-border bg-surface ${
          mobilePane === "sidebar" ? "flex" : "hidden md:flex"
        }`}
      >
        {sidebar}
      </aside>
      <main className={`min-w-0 flex-col ${mobilePane === "conversation" ? "flex" : "hidden md:flex"}`}>
        {children}
      </main>
      {rightPanel && (
        <aside className="hidden border-l border-border bg-surface lg:flex lg:flex-col">{rightPanel}</aside>
      )}
    </div>
  );
}
