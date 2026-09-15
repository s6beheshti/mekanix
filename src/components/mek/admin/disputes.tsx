"use client";
import { AlertTriangle, CheckCircle2, XCircle, Clock, MessageSquare } from "lucide-react";
import { SectionHeader } from "@/components/mek/shared/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtRelative } from "@/lib/format";
import { toast } from "sonner";
import { motion } from "framer-motion";

// Mock disputes (no persistence needed for demo)
const DISPUTES = [
  { id: "DSP-2207", job: "JOB-4012", customer: "Daniel Reyes", technician: "Marcus Cole", reason: "Repair recurred within 2 days", amount: 482, status: "open", priority: "high", ts: Date.now() - 2 * 3600_000 },
  { id: "DSP-2198", job: "JOB-3905", customer: "Amara Okafor", technician: "Hassan Al-Farsi", reason: "Parts invoice higher than estimate", amount: 156, status: "investigating", priority: "medium", ts: Date.now() - 6 * 3600_000 },
  { id: "DSP-2185", job: "JOB-3890", customer: "Lukas Brandt", technician: "Tobias Klein", reason: "Technician arrived 90 min late", amount: 0, status: "open", priority: "low", ts: Date.now() - dayMs(1) },
  { id: "DSP-2171", job: "JOB-3871", customer: "Sara Lindqvist", technician: "Yuki Tanaka", reason: "Wrong part installed", amount: 220, status: "resolved", priority: "high", ts: Date.now() - dayMs(3) },
  { id: "DSP-2160", job: "JOB-3850", customer: "Mateo Herrera", technician: "Omar Saleh", reason: "Charged for unused parts", amount: 95, status: "resolved", priority: "low", ts: Date.now() - dayMs(5) },
];

function dayMs(d: number) { return d * 86400000; }

export function AdminDisputes() {
  const resolve = (id: string) => toast.success(`${id} resolved — refund processed`);
  const escalate = (id: string) => toast.info(`${id} escalated to senior ops`);

  return (
    <div className="space-y-4">
      <SectionHeader title="Disputes" subtitle="Customer & technician disputes requiring review" />
      <div className="space-y-2">
        {DISPUTES.map((d, i) => (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`grid size-10 shrink-0 place-items-center rounded-lg border ${d.priority === "high" ? "border-destructive/30 bg-destructive/10 text-destructive" : d.priority === "medium" ? "border-amber/30 bg-amber/10 text-amber" : "border-border bg-muted text-muted-foreground"}`}>
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{d.id}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">· {d.job}</span>
                    <Badge variant={d.status === "resolved" ? "default" : "secondary"} className={d.status === "resolved" ? "bg-emerald-glow/15 text-emerald-glow" : d.status === "investigating" ? "bg-amber/15 text-amber" : ""}>{d.status}</Badge>
                    <Badge variant="outline" className="capitalize">{d.priority}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium">{d.reason}</p>
                  <p className="text-[11px] text-muted-foreground">{d.customer} ↔ {d.technician} · {fmtRelative(d.ts)}{d.amount > 0 && ` · ${d.amount}`}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toast.info("Opening conversation")}><MessageSquare className="mr-1 size-3.5" /> Message</Button>
                {d.status !== "resolved" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => escalate(d.id)}><Clock className="mr-1 size-3.5" /> Escalate</Button>
                    <Button size="sm" className="bg-emerald-glow text-black hover:bg-emerald-glow/90" onClick={() => resolve(d.id)}><CheckCircle2 className="mr-1 size-3.5" /> Resolve</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => toast.info("Reopening dispute")}><XCircle className="mr-1 size-3.5" /> Reopen</Button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
