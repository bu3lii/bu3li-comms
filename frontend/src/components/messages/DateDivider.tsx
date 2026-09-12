import { formatDateDivider } from "../../lib/format";

export function DateDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3 px-1" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="font-mono text-[0.68rem] uppercase tracking-wide text-text-tertiary">
        {formatDateDivider(iso)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
