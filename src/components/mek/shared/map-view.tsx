"use client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { haversine, fmtDistance } from "@/lib/format";

// Premium abstract map. Designed so a real provider (Mapbox/Google) can
// replace the inner <MapCanvas> later without changing the API.
export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  kind: "customer" | "technician" | "active-job" | "service-area";
  label?: string;
  tone?: string;
}

export function MapView({
  points,
  route,
  center,
  className,
  height = 360,
  showGrid = true,
  children,
}: {
  points?: MapPoint[];
  route?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number };
  className?: string;
  height?: number;
  showGrid?: boolean;
  children?: React.ReactNode;
}) {
  // Normalize all points + route into a 0..100 coordinate space
  const all = [...(points ?? []), ...(route ?? [])];
  if (center) all.push(center);
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats) - 0.01;
  const maxLat = Math.max(...lats) + 0.01;
  const minLng = Math.min(...lngs) - 0.01;
  const maxLng = Math.max(...lngs) + 0.01;
  const project = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng || 1)) * 100;
    const y = 100 - ((lat - minLat) / (maxLat - minLat || 1)) * 100;
    return { x, y };
  };

  const routePts = route?.map((p) => project(p.lat, p.lng)) ?? [];

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-border bg-[oklch(0.16_0.008_260)]", className)}
      style={{ height }}
    >
      {/* base gradient + grid */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.18_0.01_260)] via-[oklch(0.16_0.008_260)] to-[oklch(0.13_0.006_260)]" />
      {showGrid && <div className="absolute inset-0 mk-grid-bg opacity-50" />}
      {/* fake streets */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full opacity-[0.22]">
        <g stroke="currentColor" strokeWidth={0.4} fill="none" className="text-foreground">
          <path d="M-5,30 Q30,28 55,40 T110,48" />
          <path d="M-5,70 Q40,68 60,62 T110,55" />
          <path d="M20,-5 Q22,40 30,60 T40,110" />
          <path d="M75,-5 Q70,40 78,80 T85,110" />
          <path d="M-5,15 L110,18" strokeWidth={0.2} />
          <path d="M-5,85 L110,88" strokeWidth={0.2} />
          <path d="M10,-5 L12,110" strokeWidth={0.2} />
          <path d="M90,-5 L88,110" strokeWidth={0.2} />
        </g>
        <g fill="currentColor" className="text-amber/30">
          <circle cx="25" cy="35" r="0.8" />
          <circle cx="70" cy="45" r="0.6" />
          <circle cx="45" cy="70" r="0.7" />
        </g>
      </svg>

      {/* route */}
      {routePts.length > 1 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <motion.path
            d={`M ${routePts.map((p) => `${p.x},${p.y}`).join(" L ")}`}
            fill="none"
            stroke="oklch(0.78 0.16 68)"
            strokeWidth={0.9}
            strokeLinecap="round"
            strokeDasharray="1.5 1"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        </svg>
      )}

      {/* points */}
      {points?.map((p) => {
        const { x, y } = project(p.lat, p.lng);
        return <MapMarker key={p.id} x={x} y={y} point={p} />;
      })}

      {/* scanline accent */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px mk-scan-line opacity-40" />

      {/* children overlay (controls / legend) */}
      {children}

      {/* compass */}
      <div className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg border border-border bg-background/70 backdrop-blur">
        <span className="font-mono text-[9px] text-muted-foreground">N</span>
      </div>
    </div>
  );
}

function MapMarker({ x, y, point }: { x: number; y: number; point: MapPoint }) {
  const tone =
    point.tone ?? (point.kind === "customer" ? "amber" : point.kind === "technician" ? "emerald" : point.kind === "active-job" ? "violet" : "blue");
  const color: Record<string, string> = {
    amber: "oklch(0.78 0.16 68)",
    emerald: "oklch(0.74 0.16 160)",
    violet: "oklch(0.65 0.2 300)",
    blue: "oklch(0.7 0.15 230)",
  };
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      {point.kind === "technician" && (
        <div className="relative grid place-items-center">
          <span className="absolute size-8 rounded-full" style={{ background: `${color[tone]}22`, animation: "mk-pulse 2s infinite" }} />
          <span className="absolute size-5 rounded-full" style={{ background: `${color[tone]}33` }} />
          <div className="relative grid size-3.5 place-items-center rounded-full border-2 border-background" style={{ background: color[tone] }} />
        </div>
      )}
      {point.kind === "customer" && (
        <div className="relative grid place-items-center">
          <span className="absolute size-7 rounded-full" style={{ background: `${color[tone]}1a` }} />
          <div className="relative grid size-5 place-items-center rounded-full border-2 border-background" style={{ background: color[tone] }}>
            <WrenchSvg className="size-2.5 text-black" />
          </div>
        </div>
      )}
      {point.kind === "active-job" && (
        <div className="relative grid place-items-center">
          <span className="absolute size-6 rounded-full" style={{ background: `${color[tone]}22`, animation: "mk-pulse 2s infinite" }} />
          <div className="relative size-2.5 rounded-full" style={{ background: color[tone] }} />
        </div>
      )}
      {point.kind === "service-area" && (
        <div className="size-3 rounded-full border" style={{ borderColor: color[tone], background: `${color[tone]}1a` }} />
      )}
      {point.label && (
        <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-background/90 px-1.5 py-0.5 font-mono text-[9px] text-foreground backdrop-blur">
          {point.label}
        </div>
      )}
    </div>
  );
}

function WrenchSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function routeInfo(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const km = haversine(a, b);
  // assume ~35 km/h urban avg
  const mins = Math.max(3, Math.round((km / 35) * 60));
  return { km, mins, label: `${fmtDistance(km)} · ${mins} min` };
}
