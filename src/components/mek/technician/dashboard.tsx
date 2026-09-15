"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Inbox, Wallet, Star, TrendingUp, Clock, MapPin, ChevronRight, CircleDot, Zap, Activity,
} from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { api, type Job, type Payment } from "@/lib/api";
import { StatCard, SectionHeader, EmptyState } from "@/components/mek/shared/primitives";
import { StatusBadge, UrgencyBadge } from "@/components/mek/shared/status-badge";
import { MekIcon, iconForMachineType } from "@/components/mek/shared/icons";
import { fmtMoney, fmtRelative, fmtDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function TechnicianDashboard({ user }: { user: DemoUser }) {
  const { go } = useApp();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [online, setOnline] = useState(user.technician?.status === "ONLINE");
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);

  useEffect(() => {
    if (!user.technician) return;
    api.listJobs({ technicianId: user.technician.id }).then((list) => {
      setJobs(list);
      const active = list.filter((j) => ["ACCEPTED", "EN_ROUTE", "ARRIVED", "DIAGNOSING", "REPAIRING", "WAITING_APPROVAL"].includes(j.status));
      // mock today/week earnings from completed jobs
      const completed = list.filter((j) => j.status === "COMPLETED");
      const today = completed.slice(0, 2).reduce((s, j) => s + (j.invoice?.total ?? 0), 0);
      const week = completed.reduce((s, j) => s + (j.invoice?.total ?? 0), 0);
      setTodayEarnings(today);
      setWeekEarnings(week);
    }).catch(() => setJobs([]));
  }, [user]);

  const toggleOnline = async () => {
    const next = !online;
    setOnline(next);
    try {
      await fetch(`/api/technicians/${user.technician!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "ONLINE" : "OFFLINE", availableNow: next }),
      });
      toast.success(next ? "You're now online" : "You're offline");
    } catch {
      setOnline(!next);
      toast.error("Could not update status");
    }
  };

  const active = (jobs ?? []).filter((j) => ["ACCEPTED", "EN_ROUTE", "ARRIVED", "DIAGNOSING", "REPAIRING", "WAITING_APPROVAL"].includes(j.status));
  const incoming = (jobs ?? []).filter((j) => j.status === "REQUESTED");

  return (
    <div className="space-y-5">
      {/* Status hero */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-amber/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`grid size-11 place-items-center rounded-xl border ${online ? "border-emerald-glow/40 bg-emerald-glow/10" : "border-border bg-muted"}`}>
                <CircleDot className={`size-5 ${online ? "text-emerald-glow" : "text-muted-foreground"}`} />
              </div>
              {online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-glow mk-status-pulse" />}
            </div>
            <div>
              <p className="font-display text-sm font-semibold">{online ? "You're Online" : "You're Offline"}</p>
              <p className="text-[11px] text-muted-foreground">{online ? "Receiving job requests" : "Toggle on to receive jobs"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{online ? "Online" : "Offline"}</span>
            <Switch checked={online} onCheckedChange={toggleOnline} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today" value={fmtMoney(todayEarnings)} icon={Wallet} tone="amber" sub="Earnings" />
        <StatCard label="This Week" value={fmtMoney(weekEarnings)} icon={TrendingUp} tone="emerald" sub="Revenue" />
        <StatCard label="Rating" value={(user.technician.rating ?? 0).toFixed(1)} icon={Star} tone="violet" sub={`${user.technician.reviewCount} reviews`} />
        <StatCard label="Completed" value={user.technician.completedJobs} icon={Zap} tone="blue" sub="Lifetime jobs" />
      </div>

      {/* Incoming requests */}
      <section>
        <SectionHeader title="Incoming Requests" subtitle="New jobs matched to your expertise" action={<Button variant="ghost" size="sm" onClick={() => go("requests")}>All <ChevronRight className="size-3.5" /></Button>} />
        <div className="mt-3">
          {jobs === null ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/60 mk-shimmer" />)}</div>
          ) : incoming.length === 0 ? (
            <EmptyState icon={Inbox} title="No incoming requests" description={online ? "You'll be notified when a job matches you." : "Go online to receive requests."} />
          ) : (
            <div className="space-y-2">
              {incoming.map((job) => (
                <JobRow key={job.id} job={job} onClick={() => go("job-detail", { jobId: job.id })} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Active jobs */}
      <section>
        <SectionHeader title="Active Jobs" subtitle="Jobs currently in progress" action={<Button variant="ghost" size="sm" onClick={() => go("requests")}>View all <ChevronRight className="size-3.5" /></Button>} />
        <div className="mt-3">
          {active.length === 0 ? (
            <EmptyState icon={Activity} title="No active jobs" description="Accept an incoming request to begin." />
          ) : (
            <div className="space-y-2">
              {active.map((job) => (
                <JobRow key={job.id} job={job} onClick={() => go("job-detail", { jobId: job.id })} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function JobRow({ job, onClick }: { job: Job; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left mk-card-hover hover:border-amber/40"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-background">
        <MekIcon name={iconForMachineType(job.request.vehicle.type)} className="size-5 text-amber" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{job.code}</span>
          <UrgencyBadge urgency={job.request.urgency} />
        </div>
        <p className="mt-0.5 truncate text-sm font-medium">{job.request.title}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{job.request.customer.user.name}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" /> {job.request.vehicle.location ?? "On-site"}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5"><Clock className="size-3" /> {fmtDuration(job.etaMins)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge status={job.status} />
        <span className="text-[10px] text-muted-foreground">{fmtRelative(job.updatedAt)}</span>
      </div>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}
