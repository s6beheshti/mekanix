"use client";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Car, Truck, Wrench, ShieldCheck, LogOut } from "lucide-react";
import { useApp } from "@/lib/store";
import { MACHINE_MODES, typesForMode, type MachineMode } from "@/lib/constants";
import { MekIcon } from "@/components/mek/shared/icons";
import { Logo } from "@/components/mek/brand/logo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ModeSelect() {
  const { auth, setMachineMode, machineMode, exitToSplash, go, reset } = useApp();

  const choose = (mode: MachineMode) => {
    setMachineMode(mode);
    // Move from mode-select → app (customer)
    useApp.setState({ bootStage: "app", portal: "customer", role: "CUSTOMER", view: "home", params: {}, history: [] });
    toast.success(mode === "heavy" ? "Heavy Machinery mode" : "Passenger Vehicles mode");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 mk-grid-bg opacity-[0.3]" />
      <div className="absolute -left-40 top-0 size-[480px] rounded-full bg-amber/12 blur-[120px] mk-radial-fade" />
      <div className="absolute -right-40 bottom-0 size-[480px] rounded-full bg-emerald-glow/8 blur-[120px] mk-radial-fade" />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between p-5">
        <button onClick={exitToSplash} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Sign out
        </button>
        <Logo size={28} />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <div className="grid size-7 place-items-center overflow-hidden rounded-full border border-border bg-muted">
            {auth.name ? <span className="text-[10px] font-medium">{auth.name[0]}</span> : <ShieldCheck className="size-3.5" />}
          </div>
          <span className="hidden sm:inline">{auth.isGuest ? "Guest" : auth.phone ?? "Member"}</span>
        </div>
      </div>

      {/* Heading */}
      <div className="relative z-20 mx-auto max-w-5xl px-6 pt-6 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber"
        >
          {auth.isGuest ? "Browsing as guest" : "Welcome back"}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          What do you need serviced today?
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mt-2 text-sm text-muted-foreground"
        >
          Choose a category to get matched with the right specialists
        </motion.p>
      </div>

      {/* Two large mode cards */}
      <div className="relative z-20 mx-auto grid max-w-5xl gap-5 px-6 py-8 sm:grid-cols-2">
        {MACHINE_MODES.map((mode, i) => (
          <motion.button
            key={mode.slug}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 200 }}
            whileHover={{ y: -4 }}
            onClick={() => choose(mode.slug)}
            className={`group relative overflow-hidden rounded-2xl border bg-card p-7 text-left transition-colors ${mode.tone === "amber" ? "border-amber/40 hover:border-amber" : "border-emerald-glow/40 hover:border-emerald-glow"}`}
          >
            {/* ambient glow */}
            <div className={`absolute -right-16 -top-16 size-48 rounded-full blur-3xl ${mode.tone === "amber" ? "bg-amber/20" : "bg-emerald-glow/15"}`} />

            <div className="relative flex items-start justify-between">
              <div className={`grid size-16 place-items-center rounded-2xl border ${mode.tone === "amber" ? "border-amber/40 bg-amber/10" : "border-emerald-glow/40 bg-emerald-glow/10"}`}>
                <MekIcon name={mode.icon} className={`size-8 ${mode.tone === "amber" ? "text-amber" : "text-emerald-glow"}`} />
              </div>
              <ArrowRight className={`size-5 transition-transform group-hover:translate-x-1 ${mode.tone === "amber" ? "text-amber" : "text-emerald-glow"}`} />
            </div>

            <div className="relative mt-6">
              <h2 className="font-display text-2xl font-bold tracking-tight">{mode.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{mode.desc}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground" dir="rtl">{mode.labelFa}</p>
            </div>

            <div className="relative mt-5 flex flex-wrap gap-1.5">
              {mode.types.slice(0, 6).map((t) => (
                <span key={t} className="rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                  {t}
                </span>
              ))}
              {mode.types.length > 6 && (
                <span className="rounded-md px-1.5 py-0.5 text-[9px] text-muted-foreground">+{mode.types.length - 6} more</span>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Helper strip */}
      <div className="relative z-20 mx-auto max-w-5xl px-6 pb-8">
        <div className="grid gap-2 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-3">
          {[
            { icon: Wrench, label: "Verified specialists", desc: "Background-checked" },
            { icon: ShieldCheck, label: "6-month warranty", desc: "On parts & labor" },
            { icon: Car, label: "On-site service", desc: "We come to you" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-lg border border-border bg-background">
                <f.icon className="size-4 text-amber" />
              </div>
              <div>
                <p className="text-xs font-medium">{f.label}</p>
                <p className="text-[10px] text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        {auth.isGuest && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            You're browsing as a guest — sign in to submit service requests.
          </p>
        )}
      </div>
    </div>
  );
}
