"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Loader2, MapPin, Camera, Mic, Upload, Search, Star,
  BadgeCheck, Clock, Zap, ShieldCheck, Navigation as NavIcon, ArrowLeft, CheckCircle2,
} from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { api, type Vehicle, type Technician, type ServiceRequest } from "@/lib/api";
import { MACHINE_TYPES, SERVICE_CATEGORIES, URGENCY, JOB_STATUS_FLOW, typesForMode } from "@/lib/constants";
import { MekIcon, iconForMachineType, iconForCategory } from "@/components/mek/shared/icons";
import { VehicleCard } from "@/components/mek/shared/vehicle-card";
import { TechnicianCard } from "@/components/mek/shared/technician-card";
import { StarRating, EmptyState, SectionHeader } from "@/components/mek/shared/primitives";
import { UrgencyBadge } from "@/components/mek/shared/status-badge";
import { fmtDistance, fmtDuration, haversine } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { X } from "lucide-react";

// ─── Step 1: Select Machine ───
export function RequestType({ customer }: { customer: DemoUser }) {
  const { go, params } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(params.type ?? null);

  useEffect(() => {
    if (customer.customer) api.listVehicles(customer.customer.id).then(setVehicles).catch(() => setVehicles([]));
  }, [customer]);

  const saved = vehicles ?? [];
  const hasSaved = saved.length > 0;

  const proceed = (vehicle?: Vehicle, type?: string) => {
    go("describe", { vehicleId: vehicle?.id, type: type ?? vehicle?.type ?? selectedType ?? "CAR" });
  };

  return (
    <div className="space-y-5">
      <StepHeader step={1} total={3} title="Select Machine" subtitle="Choose a saved machine or pick a type to continue" onBack={() => go("home")} />

      {hasSaved && (
        <section>
          <SectionHeader title="Saved in Your Fleet" subtitle="Tap a machine to request service" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((v) => (
              <VehicleCard key={v.id} vehicle={v} selected={params.vehicleId === v.id} onSelect={() => proceed(v)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title={hasSaved ? "Or Pick a New Type" : "What needs service?"} subtitle="Select the machine category" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MACHINE_TYPES.map((m) => (
            <motion.button
              key={m.slug}
              whileHover={{ y: -2 }}
              onClick={() => { setSelectedType(m.slug); proceed(undefined, m.slug); }}
              className={`group relative overflow-hidden rounded-xl border bg-card p-4 text-center mk-card-hover ${selectedType === m.slug ? "border-amber mk-amber-glow" : "border-border hover:border-amber/40"}`}
            >
              <div className={`mx-auto grid size-12 place-items-center rounded-xl border ${selectedType === m.slug ? "border-amber/40 bg-amber/10" : "border-border bg-background"}`}>
                <MekIcon name={m.icon} className={`size-6 ${selectedType === m.slug ? "text-amber" : "text-muted-foreground"}`} />
              </div>
              <p className="mt-2 font-display text-sm font-semibold">{m.label}</p>
            </motion.button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Step 2: Describe Problem ───
export function DescribeProblem({ customer }: { customer: DemoUser }) {
  const { go, params, machineMode, auth, exitToSplash } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | undefined>(params.vehicleId);
  const [type, setType] = useState<string>(params.type ?? (machineMode === "heavy" ? "TRUCK" : "CAR"));
  const [category, setCategory] = useState<string>("");
  const [urgency, setUrgency] = useState<string>(params.urgency ?? "NORMAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("Pier 38, San Francisco, CA");
  const [media, setMedia] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [guestBlock, setGuestBlock] = useState(false);

  useEffect(() => {
    if (customer.customer) api.listVehicles(customer.customer.id).then((v) => setVehicles(v.filter((x) => typesForMode(machineMode).includes(x.type))));
  }, [customer, machineMode]);

  const addMockMedia = () => {
    const id = Math.floor(Math.random() * 1000);
    setMedia((m) => [...m, `https://picsum.photos/seed/mek${id}/120/120`]);
    toast.success("Photo attached");
  };

  const submit = async () => {
    if (auth.isGuest) { setGuestBlock(true); return; }
    if (!category) { toast.error("Pick a service category"); return; }
    if (!title.trim()) { toast.error("Add a short title"); return; }
    if (!vehicleId && !type) { toast.error("Select a machine"); return; }
    setSubmitting(true);
    try {
      const lat = 37.7749 + (Math.random() - 0.5) * 0.03;
      const lng = -122.4194 + (Math.random() - 0.5) * 0.03;
      const sr = await api.createRequest({
        customerId: customer.customer!.id,
        vehicleId: vehicleId ?? vehicles[0]?.id,
        category,
        urgency,
        title: title.trim(),
        description: description.trim(),
        mediaUrls: media,
        address,
        lat,
        lng,
      });
      toast.success(`Request ${sr.code} created`);
      go("matching", { requestId: sr.id });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  return (
    <div className="space-y-5">
      <StepHeader step={2} total={3} title="Describe the Problem" subtitle="Tell us what's going on with your machine" onBack={() => go("request-type")} />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {/* Machine */}
          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Machine</Label>
            {selectedVehicle ? (
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/5 p-3">
                <div className="grid size-10 place-items-center rounded-lg border border-border bg-background">
                  <MekIcon name={iconForMachineType(selectedVehicle.type)} className="size-5 text-amber" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedVehicle.make} {selectedVehicle.model}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedVehicle.type} · {selectedVehicle.year}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setVehicleId(undefined); }}>Change</Button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="grid size-10 place-items-center rounded-lg border border-border bg-background">
                  <MekIcon name={iconForMachineType(type)} className="size-5 text-amber" />
                </div>
                <span className="text-sm font-medium">{MACHINE_TYPES.find((m) => m.slug === type)?.label}</span>
              </div>
            )}
            {vehicles.length > 0 && !selectedVehicle && (
              <Select onValueChange={setVehicleId} value={vehicleId ?? ""}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Link to saved machine (optional)" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.make} {v.model} · {v.type}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Category */}
          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Service Category</Label>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SERVICE_CATEGORIES.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setCategory(c.slug)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${category === c.slug ? "border-amber bg-amber/10" : "border-border hover:bg-accent"}`}
                >
                  <MekIcon name={c.icon} className={`size-4 shrink-0 ${category === c.slug ? "text-amber" : "text-muted-foreground"}`} />
                  <span className="text-[11px] font-medium leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title + description */}
          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Problem Summary</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Loud knocking under load at 1600 RPM" className="mt-2" maxLength={120} />
            <Label className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Describe Symptoms</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When does it happen? Any warning lights? Recent changes? The more detail, the better the match."
              rows={4}
              className="mt-2"
              maxLength={1000}
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{description.length}/1000</p>
          </div>

          {/* Media */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Attach Photos / Video</Label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={addMockMedia}><Camera className="mr-1 size-3.5" /> Add</Button>
                <Button variant="ghost" size="sm" onClick={() => toast.info("Voice recording ready")}><Mic className="size-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => toast.info("Upload from device")}><Upload className="size-3.5" /></Button>
              </div>
            </div>
            {media.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {media.map((url, i) => (
                  <div key={i} className="relative">
                    { }
                    <img src={url} alt="" className="size-16 rounded-lg border border-border object-cover" />
                    <button onClick={() => setMedia((m) => m.filter((_, idx) => idx !== i))} className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-white"><X className="size-2.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: urgency + location + submit */}
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Urgency</Label>
            <div className="mt-3 space-y-2">
              {URGENCY.map((u) => (
                <button
                  key={u.slug}
                  onClick={() => setUrgency(u.slug)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${urgency === u.slug ? "border-amber bg-amber/5" : "border-border hover:bg-accent"}`}
                >
                  <UrgencyBadge urgency={u.slug} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{u.label}</p>
                    <p className="text-[11px] text-muted-foreground">{u.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Service Location</Label>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <MapPin className="size-4 text-amber" />
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="border-0 px-0 focus-visible:ring-0" />
            </div>
            <div className="mt-3 h-24 overflow-hidden rounded-lg border border-border bg-[oklch(0.16_0.008_260)]">
              <div className="size-full mk-grid-bg opacity-40" />
            </div>
          </div>

          <div className="sticky bottom-3">
            <Button onClick={submit} disabled={submitting} className="w-full bg-amber text-black hover:bg-amber/90">
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
              Find Technicians
            </Button>
          </div>
        </div>
      </div>

      {/* Guest sign-in prompt */}
      <Dialog open={guestBlock} onOpenChange={setGuestBlock}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <ShieldCheck className="size-4 text-amber" /> Sign in required
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            To submit a service request, please sign in with your mobile number. Guests can browse the platform but cannot place requests.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setGuestBlock(false)}>Later</Button>
            <Button className="bg-amber text-black hover:bg-amber/90" onClick={() => { exitToSplash(); }}>Sign in now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Step 3: Matching ───
export function Matching({ customer }: { customer: DemoUser }) {
  const { go, params } = useApp();
  const [techs, setTechs] = useState<Technician[] | null>(null);
  const [phase, setPhase] = useState<"searching" | "results">("searching");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const lat = 37.7749, lng = -122.4194;
    api.listTechnicians({ lat, lng }).then((t) => {
      // simulate searching delay
      setTimeout(() => {
        setTechs(t);
        setPhase("results");
      }, 1900);
    });
  }, []);

  const ranked = (techs ?? []).map((t) => {
    const km = t.lat && t.lng ? haversine({ lat: 37.7749, lng: -122.4194 }, { lat: t.lat, lng: t.lng }) : 99;
    const eta = Math.max(5, Math.round((km / 35) * 60) + t.responseMins);
    const score = t.rating * 20 - km * 0.4 + (t.verified ? 5 : 0) + t.completedJobs * 0.02;
    return { tech: t, km, eta, score };
  }).sort((a, b) => b.score - a.score);

  const onSelect = (techId: string) => {
    setSelected(techId);
    go("technician-profile", { requestId: params.requestId, technicianId: techId });
  };

  return (
    <div className="space-y-5">
      <StepHeader step={3} total={3} title="Matching Technicians" subtitle="We found qualified, verified specialists near you" onBack={() => go("describe")} />

      <AnimatePresence mode="wait">
        {phase === "searching" ? (
          <motion.div key="searching" exit={{ opacity: 0 }} className="grid place-items-center py-16">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-amber"
              />
              <div className="relative grid size-20 place-items-center rounded-full border-2 border-amber/30 bg-amber/10">
                <Search className="size-8 text-amber" />
              </div>
            </div>
            <p className="mt-6 font-display text-lg font-semibold">Searching nearby technicians…</p>
            <p className="text-sm text-muted-foreground">Analyzing distance, expertise, availability & ratings</p>
            <div className="mt-4 flex gap-6 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><NavIcon className="size-3 text-amber" /> Distance</span>
              <span className="inline-flex items-center gap-1"><Star className="size-3 text-amber" /> Rating</span>
              <span className="inline-flex items-center gap-1"><BadgeCheck className="size-3 text-amber" /> Certifications</span>
              <span className="inline-flex items-center gap-1"><Clock className="size-3 text-amber" /> ETA</span>
            </div>
          </motion.div>
        ) : (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {ranked.length === 0 ? (
              <EmptyState icon={Search} title="No technicians available" description="Try expanding your urgency or location. Emergency dispatch available 24/7." action={<Button onClick={() => go("describe")} variant="outline">Back to details</Button>} />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {ranked.map((r, i) => (
                  <TechnicianCard
                    key={r.tech.id}
                    tech={r.tech}
                    distanceKm={r.km}
                    etaMins={r.eta}
                    rank={i + 1}
                    selected={selected === r.tech.id}
                    onSelect={() => onSelect(r.tech.id)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Technician Profile ───
export function TechnicianProfileView({ customer }: { customer: DemoUser }) {
  const { go, params, back } = useApp();
  const [tech, setTech] = useState<Technician | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (params.technicianId) api.getTechnician(params.technicianId).then(setTech);
  }, [params.technicianId]);

  const request = async () => {
    setRequesting(true);
    try {
      // assign the technician to the request + create a job in REQUESTED state
      const sr = await fetch(`/api/service-requests`).then((r) => r.json()).then((list: ServiceRequest[]) => list.find((x) => x.id === params.requestId));
      if (!sr) throw new Error("Request not found");
      // create job
      const res = await fetch("/api/jobs", { method: "POST" as any }).catch(() => null);
      // The job creation needs a dedicated endpoint; use the matching+status flow instead:
      // We'll create the job by patching the request's matchedTech and creating via a dedicated endpoint.
      const jobRes = await fetch(`/api/service-requests/${sr.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: params.technicianId }),
      });
      const job = await jobRes.json();
      if (!job?.id) throw new Error("Failed to assign technician");
      toast.success(`${tech?.user.name} has been notified`);
      go("track", { jobId: job.id });
    } catch (e: any) {
      toast.error(e.message ?? "Could not assign technician");
    } finally {
      setRequesting(false);
    }
  };

  if (!tech) return <div className="h-64 rounded-xl bg-muted/60 mk-shimmer" />;

  return (
    <div className="space-y-5">
      <button onClick={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to results
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-amber/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-border bg-muted">
              {tech.user.avatar ? <img src={tech.user.avatar} alt={tech.user.name} className="size-full object-cover" /> : <span className="font-display text-2xl">{tech.user.name[0]}</span>}
            </div>
            {tech.verified && <div className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-card bg-amber text-black"><BadgeCheck className="size-4" /></div>}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold">{tech.user.name}</h1>
              <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber">{tech.level}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <StarRating value={tech.rating} />
              <span className="font-semibold">{tech.rating.toFixed(2)}</span>
              <span className="text-muted-foreground">· {tech.reviewCount} reviews · {tech.completedJobs} jobs</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tech.bio}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="font-display text-2xl font-bold text-amber">${tech.hourlyRate}<span className="text-xs text-muted-foreground">/hr</span></div>
            <div className="text-[11px] text-muted-foreground">{fmtDuration(tech.responseMins)} avg response</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* Specialties */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold">Specialties</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {tech.specialties.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
                  <MekIcon name={iconForCategory(s.category)} className="size-3.5 text-amber" />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold">Certifications</h3>
            <div className="mt-3 space-y-2">
              {tech.certifications.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5">
                  <div className={`grid size-9 place-items-center rounded-lg border ${c.verified ? "border-emerald-glow/30 bg-emerald-glow/10" : "border-border bg-muted"}`}>
                    <ShieldCheck className={`size-4 ${c.verified ? "text-emerald-glow" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{c.issuer} · {c.year}</p>
                  </div>
                  {c.verified ? <span className="rounded bg-emerald-glow/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-glow">Verified</span> : <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Pending</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Reviews */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold">Recent Reviews</h3>
            <div className="mt-3 space-y-3">
              {(tech as any).reviews?.slice(0, 3).map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center overflow-hidden rounded-full border border-border bg-muted">
                        {r.fromUser?.avatar ? <img src={r.fromUser.avatar} alt="" className="size-full object-cover" /> : <span className="text-[10px]">{r.fromUser?.name?.[0]}</span>}
                      </div>
                      <span className="text-xs font-medium">{r.fromUser?.name}</span>
                    </div>
                    <StarRating value={r.rating} size={11} />
                  </div>
                  {r.comment && <p className="mt-1.5 text-sm text-muted-foreground">"{r.comment}"</p>}
                </div>
              )) ?? <p className="text-sm text-muted-foreground">No reviews yet.</p>}
            </div>
          </div>
        </div>

        {/* Right: booking card */}
        <div className="space-y-4">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold">Request this Technician</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Hourly rate" value={`$${tech.hourlyRate}/hr`} />
              <Row label="Travel fee" value={`$${tech.travelFeeBase}`} />
              <Row label="Est. arrival" value={fmtDuration(tech.responseMins)} />
              <Row label="Experience" value={`${tech.experienceYears} yrs`} />
              <Row label="Level" value={tech.level} />
            </div>
            <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 p-3 text-[11px] text-muted-foreground">
              <ShieldCheck className="mr-1 inline size-3.5 text-amber" />
              MEKANIX guarantee: free re-diagnosis if fault persists within 7 days.
            </div>
            <Button onClick={request} disabled={requesting} className="mt-3 w-full bg-amber text-black hover:bg-amber/90">
              {requesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Zap className="mr-2 size-4" />}
              Request Now
            </Button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">No charge until work is approved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// ─── Shared step header ───
function StepHeader({ step, total, title, subtitle, onBack }: { step: number; total: number; title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" className="size-8" onClick={onBack}><ChevronLeft className="size-4" /></Button>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber">Step {step} / {total}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
