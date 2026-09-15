"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Clock, Banknote, Calendar } from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { api, type Job, type Payment } from "@/lib/api";
import { StatCard, SectionHeader, EmptyState } from "@/components/mek/shared/primitives";
import { RevenueAreaChart, MiniSparkline } from "@/components/mek/shared/charts";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TechnicianEarnings({ user }: { user: DemoUser }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (!user.technician) return;
    api.listJobs({ technicianId: user.technician.id }).then(async (list) => {
      setJobs(list);
      // collect payments for this technician's jobs
      const pays = await Promise.all(
        list.filter((j) => j.invoice?.payment).map(async (j) => j.invoice!.payment!)
      );
      setPayments(pays);
    });
  }, [user]);

  const completed = (jobs ?? []).filter((j) => j.status === "COMPLETED");
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const today = payments.filter((p) => Date.now() - new Date(p.createdAt).getTime() < 86400000).reduce((s, p) => s + p.amount, 0);
  const week = payments.filter((p) => Date.now() - new Date(p.createdAt).getTime() < 7 * 86400000).reduce((s, p) => s + p.amount, 0);

  // build 14-day revenue series
  const series = Array.from({ length: 14 }).map((_, i) => {
    const start = Date.now() - (14 - i) * 86400000;
    const end = start + 86400000;
    const rev = payments.filter((p) => {
      const t = new Date(p.createdAt).getTime();
      return t >= start && t < end;
    }).reduce((s, p) => s + p.amount, 0);
    return { date: new Date(end).toISOString().slice(5, 10), revenue: Math.round(rev), jobs: completed.filter((j) => { const t = new Date(j.completedAt ?? 0).getTime(); return t >= start && t < end; }).length };
  });

  const spark = series.map((s) => s.revenue);

  return (
    <div className="space-y-5">
      <SectionHeader title="Earnings" subtitle="Your revenue, payouts & job economics" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available" value={fmtMoney(total * 0.8)} icon={Wallet} tone="amber" sub="Ready to withdraw" />
        <StatCard label="Today" value={fmtMoney(today)} icon={TrendingUp} tone="emerald" />
        <StatCard label="This Week" value={fmtMoney(week)} icon={Calendar} tone="violet" />
        <StatCard label="Pending" value={fmtMoney(total * 0.2)} icon={Clock} tone="blue" sub="In escrow" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Revenue — last 14 days</h3>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full bg-amber" /> Earned
            </div>
          </div>
          <RevenueAreaChart data={series} height={200} className="mt-3" />
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-display text-sm font-semibold">Payout Schedule</h3>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-emerald-glow/30 bg-emerald-glow/5 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-glow">Next payout</p>
              <p className="mt-0.5 font-display text-lg font-bold text-amber">{fmtMoney(total * 0.8)}</p>
              <p className="text-[11px] text-muted-foreground">Fri · auto-deposit to ••4821</p>
            </div>
            <Button className="w-full bg-amber text-black hover:bg-amber/90" onClick={() => toast.success("Payout requested")}>
              <Banknote className="mr-2 size-4" /> Withdraw Now
            </Button>
          </div>
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">14-day trend</p>
            <MiniSparkline data={spark.length ? spark : [0, 0, 0, 0]} className="mt-1" height={40} />
          </div>
        </div>
      </div>

      {/* Recent payments */}
      <div>
        <SectionHeader title="Recent Payments" />
        <div className="mt-3">
          {payments.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments yet" description="Completed & paid jobs will appear here." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Job</th>
                    <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const job = jobs?.find((j) => j.invoice?.payment?.id === p.id);
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-2.5 font-mono text-[11px]">{job?.code ?? p.code}</td>
                        <td className="px-4 py-2.5">{job?.request.customer.user.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(p.createdAt)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-amber">{fmtMoney(p.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
