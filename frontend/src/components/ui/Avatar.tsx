const PALETTE = [
  "#E8A33D", // accent amber
  "#4FC1B0", // teal
  "#7C9CE8", // periwinkle
  "#E58FA0", // rose
  "#8FBF6B", // moss
  "#C99AE8", // lavender
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

interface AvatarProps {
  /** Stable identity used to derive a consistent color, e.g. a user id. */
  seed: string;
  /** Text used to derive the visible initials, e.g. a username. */
  name: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 rounded-[6px] text-[0.65rem]",
  md: "h-9 w-9 rounded-[6px] text-xs",
  lg: "h-16 w-16 rounded-[10px] text-xl",
};

export function Avatar({ seed, name, size = "md" }: AvatarProps) {
  const color = PALETTE[hashString(seed) % PALETTE.length];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-display font-semibold ${SIZE_CLASSES[size]}`}
      style={{ backgroundColor: `${color}26`, color }}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
