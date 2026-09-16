"use client";
import { useState } from "react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { SectionHeader } from "@/components/mek/shared/primitives";
import { MapView, type MapPoint } from "@/components/mek/shared/map-view";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { CalendarClock, Clock, MapPin, Plus } from "lucide-react";
import { fmtDistance } from "@/lib/format";
import { useT } from "@/lib/use-t";

const TIME_SLOTS = ["06–09", "09–12", "12–15", "15–18", "18–21", "21–24"];

export function TechnicianSchedule({ user }: { user: DemoUser }) {
  const { t, isFa } = useT();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [slots, setSlots] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    TIME_SLOTS.forEach((s, i) => (init[s] = i < 4));
    return init;
  });
  const tech = user.technician!;
  const areas = tech.serviceAreas;
  const points: MapPoint[] = areas.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, kind: "service-area", label: a.name }));

  const toggle = (slot: string) => setSlots((p) => ({ ...p, [slot]: !p[slot] }));

  return (
    <div className="space-y-5" dir={isFa ? "rtl" : "ltr"}>
      <SectionHeader title={t("tech.schedule.title")} subtitle={t("tech.schedule.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="size-4 text-amber" /> {t("tech.schedule.calendar")}</CardTitle></CardHeader>
          <CardContent>
            <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-lg border border-border p-2" />
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {date?.toLocaleDateString(isFa ? "fa-IR" : "en-US", { weekday: "long", month: "short", day: "numeric" })}
              </p>
              <div className="mt-2 space-y-1.5">
                {TIME_SLOTS.map((slot) => (
                  <div key={slot} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="size-3.5 text-amber" />
                      <span>{slot}</span>
                    </div>
                    <Switch checked={slots[slot]} onCheckedChange={() => toggle(slot)} />
                  </div>
                ))}
              </div>
              <Button className="mt-3 w-full bg-amber text-black hover:bg-amber/90" onClick={() => toast.success(t("tech.schedule.saved"))}>{t("tech.schedule.save")}</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-amber" /> {t("tech.schedule.serviceAreas")}</CardTitle></CardHeader>
          <CardContent>
            <MapView points={points} height={220} center={{ lat: tech.lat ?? 37.77, lng: tech.lng ?? -122.42 }} />
            <div className="mt-3 space-y-2">
              {areas.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-amber" />
                    <span className="font-medium">{a.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{fmtDistance(a.radiusKm, isFa ? "fa" : "en")} {t("tech.schedule.radius")}</span>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => toast.info(t("tech.schedule.addAreaDesc"))}><Plus className="mr-2 size-4" /> {t("tech.schedule.addArea")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
