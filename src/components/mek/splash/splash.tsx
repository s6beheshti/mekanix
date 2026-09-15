"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Loader2, ShieldCheck, ChevronRight, Wrench, ArrowRight, ArrowLeft,
  KeyRound, UserRound, Sparkles,
} from "lucide-react";
import { Logo } from "@/components/mek/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { COUNTRIES } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MechanicApplicationForm } from "./mechanic-application";

type Stage = "entry" | "phone" | "otp";

export function Splash() {
  const { enterApp } = useApp();
  const [stage, setStage] = useState<Stage>("entry");
  const [dial, setDial] = useState("+98");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const fullPhone = `${dial}${phone.replace(/\D/g, "")}`;

  const sendOtp = async () => {
    if (phone.replace(/\D/g, "").length < 9) {
      toast.error("Enter a valid mobile number");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSentCode(data.code);
      setStage("otp");
      toast.success(`Verification code sent${data.code ? ` · ${data.code}` : ""}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (code.length < 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Welcome${data.user?.name ? ", " + data.user.name.split(" ")[0] : ""}!`);
      enterApp("customer", {
        userId: data.user.id,
        phone: fullPhone,
        name: data.user.name,
        isGuest: false,
        verified: true,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = () => {
    enterApp("customer", { isGuest: true, verified: false, phone: null, name: "Guest", userId: null });
  };

  const enterAdmin = () => {
    enterApp("admin", { isGuest: false, verified: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient industrial backdrop */}
      <div className="absolute inset-0 mk-grid-bg opacity-[0.35]" />
      <div className="absolute -left-40 top-0 size-[480px] rounded-full bg-amber/15 blur-[120px] mk-radial-fade" />
      <div className="absolute -right-32 bottom-0 size-[420px] rounded-full bg-emerald-glow/10 blur-[120px] mk-radial-fade" />
      <div className="absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber/5 blur-[100px]" />

      {/* Scan line */}
      <motion.div
        initial={{ y: "-100%" }}
        animate={{ y: "100vh" }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-amber/40 to-transparent"
      />

      {/* Top brand row */}
      <div className="relative z-20 flex items-center justify-between p-5">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-glow mk-status-pulse" />
          Field Repair Network · Online
        </div>
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          v1.0 · 24/7
        </div>
      </div>

      {/* Center hero */}
      <div className="relative z-20 mx-auto flex min-h-[calc(100vh-160px)] max-w-md flex-col items-center justify-center px-6 pb-10">
        <AnimatePresence mode="wait">
          {stage === "entry" && (
            <motion.div
              key="entry"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="w-full text-center"
            >
              <LogoMark />
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-7 font-display text-4xl font-bold tracking-tight sm:text-5xl"
              >
                MEKANIX
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-2 text-sm text-muted-foreground sm:text-base"
              >
                On-demand mobile repair & maintenance
                <br />for vehicles and heavy machinery
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="mt-9 space-y-2.5"
              >
                <Button onClick={() => setStage("phone")} className="h-12 w-full bg-amber text-black hover:bg-amber/90">
                  <Phone className="mr-2 size-4" /> Sign in with Mobile
                </Button>
                <Button onClick={continueAsGuest} variant="outline" className="h-11 w-full">
                  <UserRound className="mr-2 size-4" /> Continue as Guest
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground"
              >
                <button onClick={() => setApplyOpen(true)} className="inline-flex items-center gap-1.5 transition-colors hover:text-amber">
                  <Wrench className="size-3.5" /> Apply as Mechanic
                  <ArrowRight className="size-3" />
                </button>
                <span className="size-1 rounded-full bg-border" />
                <button onClick={enterAdmin} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
                  <ShieldCheck className="size-3.5" /> Operations
                </button>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.85 }}
                className="mt-6 text-[10px] text-muted-foreground"
              >
                Guests can browse the platform but cannot submit service requests.
              </motion.p>
            </motion.div>
          )}

          {stage === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full"
            >
              <BackBtn onClick={() => setStage("entry")} />
              <div className="mt-2 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-amber/30 bg-amber/10">
                  <Phone className="size-5 text-amber" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-semibold">Sign in</h2>
                <p className="mt-1 text-sm text-muted-foreground">Enter your mobile number to receive a verification code</p>
              </div>

              <div className="mt-6 space-y-3">
                <div>
                  <Label className="text-xs">Mobile Number</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Select value={dial} onValueChange={setDial}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.dial}>{c.dial} {c.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="912 345 6789"
                      inputMode="tel"
                      className="flex-1"
                      autoFocus
                    />
                  </div>
                </div>
                <Button onClick={sendOtp} disabled={busy} className="h-11 w-full bg-amber text-black hover:bg-amber/90">
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ChevronRight className="mr-2 size-4" />}
                  Send Verification Code
                </Button>
              </div>
            </motion.div>
          )}

          {stage === "otp" && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full"
            >
              <BackBtn onClick={() => setStage("phone")} />
              <div className="mt-2 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-amber/30 bg-amber/10">
                  <KeyRound className="size-5 text-amber" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-semibold">Enter code</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sent to <span className="font-medium text-foreground">{fullPhone}</span>
                </p>
                {sentCode && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[11px] text-amber">
                    <Sparkles className="size-3" /> Demo code: {sentCode}
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <OtpInput value={code} onChange={setCode} length={6} />
                <Button onClick={verifyOtp} disabled={busy || code.length < 6} className="h-11 w-full bg-amber text-black hover:bg-amber/90">
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
                  Verify & Continue
                </Button>
                <button onClick={sendOtp} className="w-full text-center text-[11px] text-muted-foreground hover:text-amber">
                  Resend code
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="mt-10 flex items-center gap-2 text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3 text-emerald-glow" />
          Secured by MEKANIX · Verified technicians · 6-month warranty
        </div>
      </div>

      <MechanicApplicationForm open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function LogoMark() {
  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className="relative mx-auto"
    >
      <div className="absolute inset-0 -m-6 rounded-full bg-amber/20 blur-2xl" />
      <div className="relative grid size-24 place-items-center rounded-3xl border border-amber/30 bg-gradient-to-br from-amber/15 to-transparent shadow-2xl">
        { }
        <img src="/logo.png" alt="MEKANIX" className="size-16 object-contain" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-amber border-t-transparent"
        />
      </div>
    </motion.div>
  );
}

function OtpInput({ value, onChange, length }: { value: string; onChange: (v: string) => void; length: number }) {
  const cells = Array.from({ length });
  return (
    <div className="flex justify-center gap-2">
      {cells.map((_, i) => (
        <input
          key={i}
          value={value[i] ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            const next = (value.slice(0, i) + v + value.slice(i + 1)).slice(0, length);
            onChange(next);
            if (v && i < length - 1) {
              const el = (e.target as HTMLElement).parentElement?.children[i + 1] as HTMLElement;
              el?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              const el = (e.target as HTMLElement).parentElement?.children[i - 1] as HTMLElement;
              el?.focus();
            }
          }}
          inputMode="numeric"
          maxLength={1}
          className="size-12 rounded-xl border border-border bg-card text-center font-display text-xl font-semibold focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/20"
        />
      ))}
    </div>
  );
}
