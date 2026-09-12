import type { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Below the md breakpoint, only one pane shows at a time. */
  mobilePane: "sidebar" | "conversation";
}

export function AppShell({ sidebar, children, mobilePane }: AppShellProps) {
  return (
    <div className="grid h-dvh grid-cols-1 bg-canvas text-text-primary md:grid-cols-[280px_1fr]">
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
    </div>
  );
}
