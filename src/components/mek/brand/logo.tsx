"use client";
import { cn } from "@/lib/utils";

export function Logo({ className, withWordmark = true, size = 28 }: { className?: string; withWordmark?: boolean; size?: number }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="relative grid place-items-center rounded-xl"
        style={{ width: size, height: size, background: "linear-gradient(135deg, oklch(0.74 0.17 63), oklch(0.66 0.21 38))" }}
      >
        <svg viewBox="0 0 64 64" width={size * 0.62} height={size * 0.62} fill="none">
          <path d="M16 16 L32 16 L32 24 L40 24 L40 32 L48 32 L48 48 L32 48 L32 40 L24 40 L24 32 L16 32 Z" fill="#17181C" />
          <circle cx="20" cy="20" r="2.4" fill="oklch(0.74 0.17 63)" />
          <circle cx="44" cy="44" r="2.4" fill="oklch(0.74 0.17 63)" />
          <rect x="29" y="29" width="6" height="6" fill="oklch(0.74 0.17 63)" />
        </svg>
      </div>
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-display font-bold tracking-tight text-[15px]">MEKANIX</span>
          <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Field Repair Ops</span>
        </div>
      )}
    </div>
  );
}
