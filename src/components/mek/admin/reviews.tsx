"use client";
import { useEffect, useState } from "react";
import { Star, Loader2, Flag } from "lucide-react";
import { api, type Review } from "@/lib/api";
import { AdminTable, type Column } from "@/components/mek/shared/admin-table";
import { StarRating, SectionHeader, EmptyState } from "@/components/mek/shared/primitives";
import { fmtRelative } from "@/lib/format";

export function AdminReviews() {
  const [rows, setRows] = useState<(Review & { technician: { user: { name: string } } })[] | null>(null);

  useEffect(() => {
    api.adminList("reviews").then(setRows).catch(() => setRows([]));
  }, []);

  const columns: Column<any>[] = [
    { key: "rating", header: "Rating", cell: (r) => <span className="inline-flex items-center gap-1"><StarRating value={r.rating} size={12} /><span className="tabular-nums">{r.rating}.0</span></span>, sortValue: (r) => r.rating },
    { key: "customer", header: "From", cell: (r) => r.fromUser?.name ?? "—", sortValue: (r) => r.fromUser?.name ?? "" },
    { key: "tech", header: "Technician", cell: (r) => r.technician?.user.name ?? "—", sortValue: (r) => r.technician?.user.name ?? "" },
    { key: "comment", header: "Comment", cell: (r) => <span className="line-clamp-2 max-w-md text-muted-foreground">{r.comment ?? "—"}</span> },
    { key: "date", header: "When", cell: (r) => <span className="text-muted-foreground">{fmtRelative(r.createdAt)}</span>, sortValue: (r) => new Date(r.createdAt).getTime() },
    { key: "action", header: "", cell: () => <button className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Flag className="mr-1 inline size-3" />Flag</button> },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Reviews" subtitle="All customer reviews across jobs" />
      {rows === null ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-amber" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Star} title="No reviews yet" />
      ) : (
        <AdminTable data={rows} columns={columns} searchable searchKeys={["comment"]} pageSize={12} emptyIcon={Star} />
      )}
    </div>
  );
}
