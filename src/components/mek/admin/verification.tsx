"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, BadgeCheck, FileText, Clock } from "lucide-react";
import { api, type Technician } from "@/lib/api";
import { SectionHeader, EmptyState, StarRating } from "@/components/mek/shared/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function AdminVerification() {
  const [rows, setRows] = useState<Technician[] | null>(null);

  const load = () => api.adminList("technicians").then(setRows).catch(() => setRows([]));
  useEffect(load, []);

  const verifyTech = async (t: Technician) => {
    await api.adminUpdate("technicians", t.id, { verified: !t.verified });
    toast.success(`${t.user.name} ${t.verified ? "unverified" : "verified"}`);
    load();
  };
  const verifyCert = async (t: Technician, certId: string, verified: boolean) => {
    // Update certification via technician update (certifications are nested; use direct patch through admin)
    try {
      await api.adminUpdate("technicians", t.id, { certifications: { update: { where: { id: certId }, data: { verified: !verified } } } } as any);
      toast.success("Certification updated");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // technicians with pending certifications or unverified
  const queue = (rows ?? []).filter((t) => !t.verified || t.certifications.some((c) => !c.verified));

  return (
    <div className="space-y-4">
      <SectionHeader title="Verification Queue" subtitle="Approve technicians & certifications" />
      {rows === null ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-amber" /></div>
      ) : queue.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="Queue is clear" description="All technicians & certifications are verified." />
      ) : (
        <div className="space-y-3">
          {queue.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                    {t.user.avatar ? <img src={t.user.avatar} alt="" className="size-full object-cover" /> : <span className="font-semibold">{t.user.name[0]}</span>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t.user.name}</p>
                      <Badge variant={t.verified ? "default" : "secondary"} className={t.verified ? "bg-emerald-glow/15 text-emerald-glow" : ""}>{t.verified ? "Verified" : "Pending"}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t.specialties.length} specialties · {t.experienceYears} yrs · <span className="inline-flex items-center gap-1"><StarRating value={t.rating} size={10} />{t.rating.toFixed(1)}</span></p>
                  </div>
                </div>
                <Button size="sm" variant={t.verified ? "outline" : "default"} className={t.verified ? "" : "bg-emerald-glow text-black hover:bg-emerald-glow/90"} onClick={() => verifyTech(t)}>
                  {t.verified ? "Revoke verification" : "Verify technician"}
                </Button>
              </div>

              {t.certifications.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {t.certifications.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                      <div className={`grid size-8 place-items-center rounded-lg border ${c.verified ? "border-emerald-glow/30 bg-emerald-glow/10" : "border-amber/30 bg-amber/10"}`}>
                        {c.verified ? <BadgeCheck className="size-4 text-emerald-glow" /> : <Clock className="size-4 text-amber" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{c.issuer} · {c.year}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => verifyCert(t, c.id, c.verified)}>
                        {c.verified ? "Revoke" : "Approve"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
