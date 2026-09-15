"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, MapPin, Phone, MessageSquare, Navigation, Wrench, Check, Plus, Trash2,
  FileText, Send, ChevronRight, CircleCheck, CircleDashed, Package, ClipboardList,
} from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { api, type Job, type Invoice } from "@/lib/api";
import { MapView, routeInfo, type MapPoint } from "@/components/mek/shared/map-view";
import { JobStatusTimeline } from "@/components/mek/shared/job-status-timeline";
import { StatusBadge, UrgencyBadge } from "@/components/mek/shared/status-badge";
import { MekIcon, iconForMachineType, iconForCategory } from "@/components/mek/shared/icons";
import { fmtMoney, fmtDistance, fmtDuration, fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { JOB_STATUS_FLOW } from "@/lib/constants";

const NEXT_STATUS: Record<string, string> = {
  REQUESTED: "ACCEPTED",
  ACCEPTED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
  ARRIVED: "DIAGNOSING",
  DIAGNOSING: "REPAIRING",
  REPAIRING: "WAITING_APPROVAL",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  COMPLETED: "COMPLETED",
};

const NEXT_LABEL: Record<string, { label: string; icon: any }> = {
  REQUESTED: { label: "Accept Job", icon: Check },
  ACCEPTED: { label: "Start Travel", icon: Navigation },
  EN_ROUTE: { label: "Mark Arrived", icon: MapPin },
  ARRIVED: { label: "Begin Diagnosis", icon: ClipboardList },
  DIAGNOSING: { label: "Start Repair", icon: Wrench },
  REPAIRING: { label: "Send Estimate", icon: FileText },
  WAITING_APPROVAL: { label: "Awaiting Approval", icon: CircleDashed },
  COMPLETED: { label: "Completed", icon: CircleCheck },
};

export function TechnicianJobDetail({ user }: { user: DemoUser }) {
  const { go, params, back } = useApp();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [faultCode, setFaultCode] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [savingDiag, setSavingDiag] = useState(false);
  const [partName, setPartName] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partPrice, setPartPrice] = useState("");
  const [addingPart, setAddingPart] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  const load = useCallback(async () => {
    if (!params.jobId) return;
    try {
      const j = await api.getJob(params.jobId);
      setJob(j);
      if (!diagnosis && j.diagnosis) setDiagnosis(j.diagnosis);
    } catch {
      toast.error("Job not found");
      go("requests");
    } finally {
      setLoading(false);
    }
  }, [params.jobId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const advance = async () => {
    if (!job) return;
    const next = NEXT_STATUS[job.status];
    if (next === job.status) return;
    setAdvancing(true);
    try {
      const updated = await api.updateJobStatus(job.id, next);
      setJob(updated);
      toast.success(`Status → ${JOB_STATUS_FLOW.find((s) => s.key === next)?.label}`);
      if (next === "WAITING_APPROVAL") setShowInvoice(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdvancing(false);
    }
  };

  const saveDiagnosis = async () => {
    if (!job || !diagnosis.trim()) { toast.error("Add a diagnosis summary"); return; }
    setSavingDiag(true);
    try {
      const updated = await api.setJobDiagnosis(job.id, diagnosis.trim(), severity, faultCode || undefined);
      setJob(updated);
      toast.success("Diagnosis saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingDiag(false);
    }
  };

  const addPart = async () => {
    if (!job || !partName.trim()) { toast.error("Enter a part name"); return; }
    setAddingPart(true);
    try {
      await api.addPart(job.id, {
        name: partName.trim(),
        quantity: parseInt(partQty) || 1,
        unitPrice: parseFloat(partPrice) || 0,
      });
      const fresh = await api.getJob(job.id);
      setJob(fresh);
      setPartName(""); setPartQty("1"); setPartPrice("");
      toast.success("Part added");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingPart(false);
    }
  };

  const removePart = async (partId: string) => {
    if (!job) return;
    await api.removePart(job.id, partId);
    const fresh = await api.getJob(job.id);
    setJob(fresh);
    toast.success("Part removed");
  };

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="size-8 animate-spin text-amber" /></div>;
  if (!job) return null;

  const next = NEXT_STATUS[job.status];
  const nextMeta = NEXT_LABEL[job.status];
  const canAdvance = job.status !== "COMPLETED" && job.status !== "CANCELLED" && next !== job.status;
  const techLoc = { lat: user.technician?.lat ?? 37.77, lng: user.technician?.lng ?? -122.42 };
  const custLoc = { lat: job.request.lat, lng: job.request.lng };
  const info = routeInfo(techLoc, custLoc);
  const points: MapPoint[] = [
    { id: "tech", lat: techLoc.lat, lng: techLoc.lng, kind: "technician", label: "You" },
    { id: "cust", lat: custLoc.lat, lng: custLoc.lng, kind: "customer", label: job.request.vehicle.location ?? "Customer" },
  ];
  const isComplete = job.status === "COMPLETED";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8" onClick={back}><ArrowLeft className="size-4" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{job.code}</span>
              <UrgencyBadge urgency={job.request.urgency} />
            </div>
            <h1 className="font-display text-base font-semibold">{job.request.title}</h1>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Action bar */}
      {!isComplete && job.status !== "CANCELLED" && (
        <div className="sticky top-14 z-30 rounded-xl border border-amber/30 bg-background/95 p-3 backdrop-blur mk-amber-glow">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next action</p>
              <p className="font-display text-sm font-semibold">{nextMeta.label}</p>
            </div>
            <Button onClick={advance} disabled={!canAdvance || advancing} className="bg-amber text-black hover:bg-amber/90">
              {advancing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <nextMeta.icon className="mr-2 size-4" />}
              {canAdvance ? "Continue" : "Waiting"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* Map */}
          <div className="overflow-hidden rounded-xl border border-border">
            <MapView points={points} route={[techLoc, custLoc]} height={240} center={custLoc} />
          </div>

          {/* Customer + machine */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="grid size-10 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
                  {job.request.customer.user.avatar ? <img src={job.request.customer.user.avatar} alt="" className="size-full object-cover" /> : <span className="text-xs">{job.request.customer.user.name[0]}</span>}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.request.customer.user.name}</p>
                  <p className="text-[11px] text-muted-foreground">{job.request.customer.user.phone ?? "—"}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success("Calling…")}><Phone className="mr-1 size-3.5" /> Call</Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => go("chat", { jobId: job.id })}><MessageSquare className="mr-1 size-3.5" /> Chat</Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Machine</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg border border-border bg-background">
                  <MekIcon name={iconForMachineType(job.request.vehicle.type)} className="size-5 text-amber" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.request.vehicle.make} {job.request.vehicle.model}</p>
                  <p className="text-[11px] text-muted-foreground">{job.request.vehicle.type} · {job.request.vehicle.year}{job.request.vehicle.plate ? ` · ${job.request.vehicle.plate}` : ""}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px]">
                <MapPin className="size-3.5 text-amber" />
                <span className="truncate">{job.request.address}</span>
                <span className="ml-auto text-muted-foreground">{info.label}</span>
              </div>
            </div>
          </div>

          {/* Problem description */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reported Problem</p>
            <p className="mt-1 text-sm">{job.request.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <MekIcon name={iconForCategory(job.request.category)} className="size-3 text-amber" />
                {job.request.category}
              </Badge>
            </div>
          </div>

          {/* Diagnosis */}
          {["DIAGNOSING", "REPAIRING", "WAITING_APPROVAL", "COMPLETED"].includes(job.status) && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-4 text-amber" />
                <h3 className="font-display text-sm font-semibold">Diagnosis</h3>
              </div>
              <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Describe the root cause, severity, and recommended fix…" rows={3} className="mt-3" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Fault code</Label>
                  <Input value={faultCode} onChange={(e) => setFaultCode(e.target.value)} placeholder="e.g. SPN-1487" className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Severity</Label>
                  <div className="mt-1 flex gap-1">
                    {["low", "medium", "high"].map((s) => (
                      <button key={s} onClick={() => setSeverity(s)} className={`flex-1 rounded border px-2 py-1 text-[10px] capitalize ${severity === s ? "border-amber bg-amber/15 text-amber" : "border-border text-muted-foreground"}`}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={saveDiagnosis} disabled={savingDiag} size="sm" className="mt-2 bg-amber text-black hover:bg-amber/90">
                {savingDiag ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Check className="mr-1.5 size-3.5" />} Save Diagnosis
              </Button>
            </div>
          )}

          {/* Parts */}
          {["REPAIRING", "WAITING_APPROVAL", "COMPLETED"].includes(job.status) && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-amber" />
                <h3 className="font-display text-sm font-semibold">Parts & Materials</h3>
              </div>
              {job.parts.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {job.parts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="text-[11px] text-muted-foreground">×{p.quantity}</span>
                      <span className="tabular-nums text-amber">{fmtMoney(p.unitPrice)}</span>
                      <button onClick={() => removePart(p.id)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 grid grid-cols-[1fr_60px_80px_auto] gap-2">
                <Input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Part name" className="h-8 text-xs" />
                <Input value={partQty} onChange={(e) => setPartQty(e.target.value)} type="number" min={1} placeholder="Qty" className="h-8 text-xs" />
                <Input value={partPrice} onChange={(e) => setPartPrice(e.target.value)} type="number" placeholder="$" className="h-8 text-xs" />
                <Button onClick={addPart} disabled={addingPart} size="sm" className="bg-amber text-black hover:bg-amber/90">
                  {addingPart ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold">Progress</h3>
            <div className="mt-4"><JobStatusTimeline status={job.status} /></div>
          </div>

          {/* Estimate preview */}
          {["REPAIRING", "WAITING_APPROVAL", "COMPLETED"].includes(job.status) && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold">Estimate Preview</h3>
                {job.invoice && <StatusBadge status={job.invoice.status === "PAID" ? "COMPLETED" : "WAITING_APPROVAL"} />}
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <EstLine label={`Labor (est. ${job.invoice?.laborHours ?? 1.5}h)`} amount={(job.invoice?.laborHours ?? 1.5) * job.technician.hourlyRate} />
                <EstLine label="Parts" amount={job.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0)} />
                <EstLine label="Travel fee" amount={job.technician.travelFeeBase} />
                <div className="border-t border-border pt-1.5" />
                <div className="flex items-center justify-between">
                  <span className="font-medium">Est. Total</span>
                  <span className="font-display text-lg font-bold text-amber">
                    {fmtMoney((job.invoice?.total ?? (1.5 * job.technician.hourlyRate + job.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0) + job.technician.travelFeeBase) * 1.09))}
                  </span>
                </div>
              </div>
              {job.status === "REPAIRING" && (
                <Button onClick={advance} className="mt-3 w-full bg-amber text-black hover:bg-amber/90">
                  <FileText className="mr-2 size-4" /> Send Estimate to Customer
                </Button>
              )}
              {job.invoice && (
                <div className="mt-2 rounded-lg border border-amber/30 bg-amber/5 p-2.5 text-[11px] text-muted-foreground">
                  {job.invoice.status === "PAID" ? "Invoice paid — warranty activated." : job.customerApproved ? "Customer approved — begin repair." : "Waiting for customer approval."}
                </div>
              )}
              {job.invoice && (
                <Button onClick={() => toast.success(`Invoice ${job.invoice!.code} issued to customer`)} variant="outline" size="sm" className="mt-2 w-full">
                  <FileText className="mr-1.5 size-3.5" /> Issue Invoice {job.invoice.code}
                </Button>
              )}
            </div>
          )}

          {/* System messages */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold">Activity</h3>
            <div className="mt-2 space-y-1.5">
              {job.messages.filter((m) => m.kind === "system").slice(-4).map((m) => (
                <div key={m.id} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <span className="font-mono text-[9px]">{fmtRelative(m.createdAt)}</span> · {m.body}
                </div>
              ))}
              {job.messages.filter((m) => m.kind === "system").length === 0 && <p className="text-[11px] text-muted-foreground">No activity yet.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => go("chat", { jobId: job.id })}><MessageSquare className="mr-2 size-4" /> Open Chat</Button>
        {isComplete && <Button className="flex-1 bg-amber text-black hover:bg-amber/90" onClick={() => go("earnings")}>View Earnings <ChevronRight className="ml-1 size-4" /></Button>}
      </div>
    </div>
  );
}

function EstLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{fmtMoney(amount)}</span>
    </div>
  );
}
