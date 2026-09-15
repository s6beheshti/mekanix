"use client";
import { useEffect, useState } from "react";
import { CreditCard, Loader2, DollarSign, TrendingUp, CheckCircle2 } from "lucide-react";
import { api, type Payment } from "@/lib/api";
import { AdminTable, type Column } from "@/components/mek/shared/admin-table";
import { StatCard, SectionHeader, EmptyState } from "@/components/mek/shared/primitives";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function AdminPayments() {
  const [rows, setRows] = useState<(Payment & { user: { name: string }; invoice: { code: string; job?: { code: string } } })[] | null>(null);

  useEffect(() => {
    api.adminList("payments").then(setRows).catch(() => setRows([]));
  }, []);

  const succeeded = (rows ?? []).filter((p) => p.status === "SUCCEEDED");
  const total = succeeded.reduce((s, p) => s + p.amount, 0);
  const failed = (rows ?? []).filter((p) => p.status === "FAILED");

  const columns: Column<any>[] = [
    { key: "code", header: "Payment", cell: (p) => <span className="font-mono text-[11px]">{p.code}</span>, sortValue: (p) => p.code },
    { key: "invoice", header: "Invoice", cell: (p) => <span className="font-mono text-[11px] text-muted-foreground">{p.invoice?.code ?? "—"}</span> },
    { key: "customer", header: "Customer", cell: (p) => p.user?.name ?? "—", sortValue: (p) => p.user?.name ?? "" },
    { key: "amount", header: "Amount", cell: (p) => <span className="tabular-nums font-medium text-amber">{fmtMoney(p.amount)}</span>, sortValue: (p) => p.amount },
    { key: "method", header: "Method", cell: (p) => <span className="capitalize">{p.method}</span> },
    { key: "status", header: "Status", cell: (p) => <Badge variant={p.status === "SUCCEEDED" ? "default" : p.status === "FAILED" ? "destructive" : "secondary"} className={p.status === "SUCCEEDED" ? "bg-emerald-glow/15 text-emerald-glow" : ""}>{p.status}</Badge> },
    { key: "date", header: "Date", cell: (p) => <span className="text-muted-foreground">{fmtDateTime(p.createdAt)}</span>, sortValue: (p) => new Date(p.createdAt).getTime() },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Payments" subtitle="All transactions across the platform" />
      {rows && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total Volume" value={fmtMoney(total)} icon={DollarSign} tone="amber" />
          <StatCard label="Successful" value={succeeded.length} icon={CheckCircle2} tone="emerald" />
          <StatCard label="Failed" value={failed.length} icon={TrendingUp} tone="rose" />
          <StatCard label="Avg. Transaction" value={fmtMoney(succeeded.length ? total / succeeded.length : 0)} icon={CreditCard} tone="violet" />
        </div>
      )}
      {rows === null ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-amber" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" />
      ) : (
        <AdminTable data={rows} columns={columns} searchable searchKeys={["code", "user"]} pageSize={12} emptyIcon={CreditCard} />
      )}
    </div>
  );
}
