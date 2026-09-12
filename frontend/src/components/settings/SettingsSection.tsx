import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border py-8 first:pt-0 last:border-b-0">
      <h2 className="font-display text-base font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
