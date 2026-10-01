import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface AvatarProps {
  name: string;
  className?: string;
  decorative?: boolean;
  /** Drawn instead of the initials (a mark, a logo). */
  icon?: ReactNode;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") : parts[0]?.slice(0, 2) || "AI").toUpperCase();
}

export function Avatar({ name, className, decorative = false, icon }: AvatarProps) {
  return <span className={cn("ui-avatar", className)} data-icon={icon ? true : undefined} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : name}>{icon ?? initials(name)}</span>;
}
