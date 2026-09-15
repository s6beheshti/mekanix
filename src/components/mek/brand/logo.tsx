"use client";
import { cn } from "@/lib/utils";

// MEKANIX logo — uses the real brand image (logo.png).
// Small mark + wordmark for headers/footers.
export function Logo({ className, withWordmark = true, size = 30 }: { className?: string; withWordmark?: boolean; size?: number }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      { }
      <img src="/logo.png" alt="MEKANIX" className="select-none" style={{ height: size, width: "auto" }} />
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-display font-bold tracking-tight text-[15px]">MEKANIX</span>
          <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Field Repair Ops</span>
        </div>
      )}
    </div>
  );
}
