"use client";
import { useEffect, useState } from "react";
import { Wrench, Loader2, BadgeCheck } from "lucide-react";
import { api, type Technician } from "@/lib/api";
import { AdminTable, type Column } from "@/components/mek/shared/admin-table";
import { StarRating, SectionHeader, EmptyState } from "@/components/mek/shared/primitives";
import { TECH_LEVELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export function AdminTechnicians() {
  const [rows, setRows] = useState<Technician[] | null>(null);

  const load = () => api.adminList("technicians").then(setRows).catch(() => setRows([]));
  useEffect(load, []);

  const toggleVerify = async (t: Technician) => {
    setRows((prev) => prev?.map((x) => x.id === t.id ? { ...x, verified: !x.verified } : x) ?? null);
    try {
      await api.adminUpdate("technicians", t.id, { verified: !t.verified });
      toast.success(`${t.user.name} ${t.verified ? "unverified" : "verified"}`);
    } catch {
      toast.error("Update failed");
      load();
    }
  };

  const columns: Column<Technician>[] = [
    {
      key: "name",
      header: "Technician",
      sortValue: (t) => t.user.name,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center overflow-hidden rounded-full border border-border bg-muted">
            {t.user.avatar ? <img src={t.user.avatar} alt="" className="size-full object-cover" /> : <span className="text-[10px]">{t.user.name[0]}</span>}
          </div>
          <div>
            <p className="font-medium">{t.user.name}</p>
            <p className="text-[11px] text-muted-foreground">{t.specialties.length} specialties</p>
          </div>
        </div>
      ),
    },
    { key: "level", header: "Level", cell: (t) => { const l = TECH_LEVELS.find((x) => x.slug === t.level) ?? TECH_LEVELS[0]; return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${l.color}22`, color: l.color }}>{l.label}</span>; }, sortValue: (t) => t.level },
    { key: "rating", header: "Rating", cell: (t) => <span className="inline-flex items-center gap-1"><StarRating value={t.rating} size={11} /><span className="tabular-nums">{t.rating.toFixed(1)}</span></span>, sortValue: (t) => t.rating },
    { key: "jobs", header: "Jobs", cell: (t) => <span className="tabular-nums">{t.completedJobs}</span>, sortValue: (t) => t.completedJobs },
    { key: "rate", header: "Rate", cell: (t) => <span className="tabular-nums">{fmtMoney(t.hourlyRate)}/hr</span>, sortValue: (t) => t.hourlyRate },
    { key: "status", header: "Online", cell: (t) => <Badge variant={t.status === "ONLINE" ? "default" : "secondary"} className={t.status === "ONLINE" ? "bg-emerald-glow/15 text-emerald-glow" : ""}>{t.status}</Badge> },
    { key: "verified", header: "Verified", cell: (t) => <div onClick={(e) => e.stopPropagation()}><Switch checked={t.verified} onCheckedChange={() => toggleVerify(t)} /></div> },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Technicians" subtitle="Manage technician profiles & verification" />
      {rows === null ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-amber" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wrench} title="No technicians yet" />
      ) : (
        <AdminTable data={rows} columns={columns} searchable searchKeys={["user"]} pageSize={12} emptyIcon={Wrench} />
      )}
    </div>
  );
}
