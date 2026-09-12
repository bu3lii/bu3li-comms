export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function isSameDay(a: string, b: string): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function formatDateDivider(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: diffDays < 7 ? "long" : undefined,
    month: diffDays < 7 ? undefined : "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** Two messages belong in the same visual cluster: same sender, close in time. */
export function shouldGroupWithPrevious(current: { sender_id: string; created_at: string }, previous: { sender_id: string; created_at: string } | undefined): boolean {
  if (!previous || previous.sender_id !== current.sender_id) {
    return false;
  }
  const gapMs = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
  return gapMs < 5 * 60_000 && isSameDay(previous.created_at, current.created_at);
}
