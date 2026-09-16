"use client";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

// MEKANIX logo — uses the real brand image (/logo.png) directly.
// The logo is black with a small orange accent on a transparent background.
// On a light theme background, the black elements read naturally.
// On a dark theme background, we apply a CSS invert filter so the black
// elements become white (the orange accent is preserved via hue-rotate).
// No white background disk, no SVG replacement — just the real logo file.

export function Logo({
  className,
  withWordmark = true,
  size = 30,
  forceInvert = false,
}: {
  className?: string;
  withWordmark?: boolean;
  size?: number;
  forceInvert?: boolean; // for splash (always on pure black)
}) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme may be undefined during SSR / before hydration.
  // Default to invert=true (treat as dark) so the logo is always visible on the
  // initial dark-first render, then update to actual theme after mount.
  const isDark = forceInvert || resolvedTheme === "dark" || resolvedTheme === undefined;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img
        src="/logo.png"
        alt="MEKANIX"
        className="shrink-0 select-none object-contain"
        style={{
          height: size,
          width: "auto",
          // On dark backgrounds: invert black → white. Hue-rotate(180deg) keeps
          // the orange accent roughly in the amber range (180° shift of orange
          // lands near teal-blue, so we add a slight sepia/amber tint to recover
          // the warm tone). Brightness(1.1) keeps the whites crisp.
          // On light backgrounds: no filter — the black logo reads naturally.
          filter: isDark
            ? "invert(1) hue-rotate(180deg) brightness(1.1) saturate(0.85)"
            : "none",
        }}
      />
      {withWordmark && (
        <span className="sr-only">MEKANIX Field Repair Ops</span>
      )}
    </div>
  );
}

// Mark-only variant (no wordmark text) — for tight spaces like avatars/icons.
export function LogoMark({ size = 30, className, forceInvert = false }: { size?: number; className?: string; forceInvert?: boolean }) {
  return <Logo withWordmark={false} size={size} className={className} forceInvert={forceInvert} />;
}
