"use client";
import { useEffect, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { AdminTable, type Column } from "@/components/mek/shared/admin-table";
import { StatusBadge, UrgencyBadge } from "@/components/mek/shared/status-badge";
import { SectionHeader, EmptyState } from "@/components/mek/shared/primitives";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useApp } from "@/lib/store";

type JobRow = {
  id: string; code: string; status: string;
  request: { title: string; urgency: string; customer: { user: { name: string } }; vehicle: { make: string; model: string; type: string } };
  technician: { user: { name: string } } | null;
  invoice: { total: number; status: string } | null;
  createdAt: string; completedAt: string | null;
};

export function AdminJobs() {
  const { setRole } = useApp();
  const [rows, setRows] = useState<JobRow[] | null>(null);

  useEffect(() => {
    api.adminList("jobs").then(setRows).catch(() => setRows([]));
  }, []);

  const columns: Column<JobRow>[] = [
    { key: "code", header: "Code", cell: (r) => <span className="font-mono text-[11px]">{r.code}</span>, sortValue: (r) => r.code },
    { key: "title", header: "Job", cell: (r) => (<div><p className="font-medium">{r.request.title}</p><p className="text-[11px] text-muted-foreground">{r.request.vehicle.make} {r.request.vehicle.model}</p></div>), sortValue: (r) => r.request.title },
    { key: "customer", header: "Customer", cell: (r) => r.request.customer.user.name, sortValue: (r) => r.request.customer.user.name },
    { key: "tech", header: "Technician", cell: (r) => r.technician?.user.name ?? <span className="text-muted-foreground">unassigned</span>, sortValue: (r) => r.technician?.user.name ?? "" },
    { key: "urgency", header: "Urgency", cell: (r) => <UrgencyBadge urgency={r.request.urgency} /> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "total", header: "Total", cell: (r) => r.invoice ? <span className="tabular-nums text-amber">{fmtMoney(r.invoice.total)}</span> : <span className="text-muted-foreground">—</span>, sortValue: (r) => r.invoice?.total ?? 0 },
    { key: "date", header: "Created", cell: (r) => <span className="text-muted-foreground">{fmtDate(r.createdAt)}</span>, sortValue: (r) => new Date(r.createdAt).getTime() },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Jobs" subtitle="All service jobs across the platform" />
      {rows === null ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-amber" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs yet" />
      ) : (
        <AdminTable data={rows} columns={columns} searchable searchKeys={["code", "request"]} pageSize={12} emptyIcon={Briefcase} />
      )}
    </div>
  );
}
