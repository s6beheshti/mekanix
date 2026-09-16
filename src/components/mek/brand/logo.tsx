"use client";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

// MEKANIX brand mark — the geometric step/zig-zag path in amber gradient.
// Inlined so it inherits theme-aware colors (no external file dependency,
// no invert-filter issues on different backgrounds).
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mek-amber-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5A524" />
          <stop offset="1" stopColor="#E8612C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" className="fill-card stroke-border" strokeWidth="1" />
      <path
        d="M16 16 L32 16 L32 24 L40 24 L40 32 L48 32 L48 48 L32 48 L32 40 L24 40 L24 32 L16 32 Z"
        fill="url(#mek-amber-grad)"
      />
      <circle cx="20" cy="20" r="2.4" className="fill-card" />
      <circle cx="44" cy="44" r="2.4" className="fill-card" />
      <rect x="29" y="29" width="6" height="6" className="fill-card" />
    </svg>
  );
}

// Full logo with wordmark — for in-app headers, sidebars, footers.
// Theme-aware: the badge background uses `fill-card` so it always contrasts
// against the surrounding `bg-background`.
export function Logo({
  className,
  withWordmark = true,
  size = 30,
}: {
  className?: string;
  withWordmark?: boolean;
  size?: number;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display font-bold tracking-tight text-[15px]",
              isDark ? "text-amber" : "text-foreground"
            )}
          >
            MEKANIX
          </span>
          <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            Field Repair Ops
          </span>
        </div>
      )}
    </div>
  );
}
