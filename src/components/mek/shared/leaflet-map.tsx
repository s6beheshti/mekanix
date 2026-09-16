"use client";
import { useEffect, useRef } from "react";
import type { MapPoint } from "./map-view";

// Real Leaflet map — uses OpenStreetMap tiles which work in Iran (unlike Google Maps).
// Loaded dynamically by MapView to avoid SSR issues (Leaflet needs window).
export function LeafletMap({
  points,
  route,
  center,
  height = 360,
}: {
  points?: MapPoint[];
  route?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number };
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import leaflet (client-only)
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // Fix default marker icons (Leaflet's CDN icons don't load with Next bundling)
      // We use custom divIcons instead so this isn't needed for our markers.

      const defaultCenter: [number, number] = center
        ? [center.lat, center.lng]
        : points && points[0]
        ? [points[0].lat, points[0].lng]
        : [35.6892, 51.3890]; // Tehran default

      const map = L.map(containerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      // OpenStreetMap tiles (works in Iran, no API key needed).
      // CARTO also has free tiles; we use the standard OSM for reliability.
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Theme-aware background until tiles load
      const isDark = document.documentElement.classList.contains("dark");
      containerRef.current.style.background = isDark ? "#0a0b0d" : "#e5e7eb";

      // Add markers
      const allPoints = points ?? [];
      const bounds: [number, number][] = [];

      allPoints.forEach((p) => {
        const color =
          p.kind === "customer"
            ? "#F5A524"
            : p.kind === "technician"
            ? "#10b981"
            : p.kind === "active-job"
            ? "#8b5cf6"
            : "#3b82f6";

        const icon = L.divIcon({
          className: "mek-map-marker",
          html: `
            <div style="position: relative; display: grid; place-items: center;">
              ${p.kind === "technician" ? `<span style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: ${color}33; animation: mek-map-pulse 2s infinite;"></span>` : ""}
              <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>
            </div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        if (p.label) marker.bindPopup(p.label);
        bounds.push([p.lat, p.lng]);
      });

      // Draw route as polyline
      if (route && route.length > 1) {
        const latlngs = route.map((r) => [r.lat, r.lng] as [number, number]);
        L.polyline(latlngs, {
          color: "#F5A524",
          weight: 4,
          opacity: 0.8,
          dashArray: "6 8",
        }).addTo(map);
        bounds.push(...latlngs);
      }

      // Fit bounds to show all points
      if (bounds.length > 1) {
        map.fitBounds(bounds as any, { padding: [40, 40] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points, route, center]);

  return <div ref={containerRef} style={{ height, width: "100%", zIndex: 0 }} />;
}
