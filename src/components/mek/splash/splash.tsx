"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Loader2, ShieldCheck, ChevronRight, Wrench, ArrowRight, ArrowLeft,
  KeyRound, UserRound, Sparkles, Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { useT, LANGS, type Lang } from "@/lib/use-t";
import { COUNTRIES } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MechanicApplicationForm } from "./mechanic-application";

type Stage = "entry" | "phone" | "otp";

export function Splash() {
  const { enterApp, lang, setLang } = useApp();
  const { t, isFa } = useT();
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
      toast.error(t("splash.validPhone"));
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
      toast.success(t("splash.codeSent") + (data.code ? ` · ${data.code}` : ""));
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (code.length < 6) {
      toast.error(t("splash.enterCodeShort"));
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
      toast.success(`${t("splash.welcome")}${data.user?.name ? "، " + data.user.name.split(" ")[0] + "!" : "!"}`);
      enterApp("customer", {
        userId: data.user.id,
        phone: fullPhone,
        name: data.user.name,
        isGuest: false,
        verified: true,
      });
    } catch (e: any) {
      toast.error(e.message ?? t("splash.invalidCode"));
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = () => {
    enterApp("customer", { isGuest: true, verified: false, phone: null, name: "Guest", userId: null });
  };



  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050607]">
      <div className="absolute inset-0 mk-grid-bg opacity-[0.22]" />
      <div className="absolute left-1/2 top-1/3 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(circle, oklch(0.74 0.16 68 / 0.12), transparent 62%)" }} />

      {/* Language toggle — top-right */}
      <div className="absolute end-5 top-5 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/60 p-0.5 backdrop-blur">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code as Lang)}
            className={`relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${lang === l.code ? "text-black" : "text-muted-foreground hover:text-foreground"}`}
          >
            {lang === l.code && (
              <motion.div layoutId="splash-lang-pill" className="absolute inset-0 rounded-md bg-amber" transition={{ type: "spring", stiffness: 350, damping: 30 }} />
            )}
            <span className="relative">{l.label}</span>
          </button>
        ))}
      </div>

      {/* Center hero */}
      <div className="relative z-20 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 pb-10">
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
              {/* HERO LOGO — big, dynamic, the brand statement */}
              <HeroLogo />

              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4, duration: 0.5 }}
                className="mt-6 font-display text-5xl font-bold tracking-tight sm:text-6xl"
                dir={isFa ? "rtl" : "ltr"}
              >
                {t("splash.title")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.55 }}
                className="mt-3 text-sm text-muted-foreground sm:text-base"
                dir={isFa ? "rtl" : "ltr"}
              >
                {t("splash.subtitle")}
                <br />{t("splash.subtitle2")}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.7 }}
                className="mt-10 space-y-2.5"
              >
                <Button onClick={() => setStage("phone")} className="h-12 w-full bg-amber text-black hover:bg-amber/90">
                  <Phone className="mr-2 size-4" /> {t("splash.signInMobile")}
                </Button>
                <Button onClick={continueAsGuest} variant="outline" className="h-11 w-full">
                  <UserRound className="mr-2 size-4" /> {t("splash.continueGuest")}
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.85 }}
                className="mt-5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground"
                dir={isFa ? "rtl" : "ltr"}
              >
                <button onClick={() => setApplyOpen(true)} className="inline-flex items-center gap-1.5 transition-colors hover:text-amber">
                  <Wrench className="size-3.5" /> {t("splash.applyMechanic")}
                  <ArrowRight className={isFa ? "size-3 rotate-180" : "size-3"} />
                </button>

              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.0 }}
                className="mt-6 text-[10px] text-muted-foreground"
                dir={isFa ? "rtl" : "ltr"}
              >
                {t("splash.guestHint")}
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
              dir={isFa ? "rtl" : "ltr"}
            >
              <BackBtn onClick={() => setStage("entry")} label={t("splash.back")} />
              <div className="mt-2 text-center">
                <h2 className="font-display text-2xl font-semibold">{t("splash.signIn")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("splash.enterMobile")}</p>
              </div>

              <div className="mt-6 space-y-3">
                <div>
                  <Label className="text-xs">{t("splash.mobileNumber")}</Label>
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
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ChevronRight className={isFa ? "mr-2 size-4 rotate-180" : "mr-2 size-4"} />}
                  {t("splash.sendCode")}
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
              dir={isFa ? "rtl" : "ltr"}
            >
              <BackBtn onClick={() => setStage("phone")} label={t("splash.back")} />
              <div className="mt-2 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-amber/30 bg-amber/10">
                  <KeyRound className="size-5 text-amber" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-semibold">{t("splash.enterCode")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("splash.sentTo")} <span className="font-medium text-foreground">{fullPhone}</span>
                </p>
                {sentCode && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[11px] text-amber">
                    <Sparkles className="size-3" /> {t("splash.demoCode")}: {sentCode}
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <OtpInput value={code} onChange={setCode} length={6} />
                <Button onClick={verifyOtp} disabled={busy || code.length < 6} className="h-11 w-full bg-amber text-black hover:bg-amber/90">
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
                  {t("splash.verifyContinue")}
                </Button>
                <button onClick={sendOtp} className="w-full text-center text-[11px] text-muted-foreground hover:text-amber">
                  {t("splash.resend")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="mt-10 flex items-center gap-2 text-[10px] text-muted-foreground" dir={isFa ? "rtl" : "ltr"}>
          <ShieldCheck className="size-3 text-emerald-glow" />
          {t("splash.securedBy")}
        </div>
      </div>

      <MechanicApplicationForm open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}

// ─── Hero logo: real brand mark, inverted to light via CSS filter on pure black ───
function HeroLogo() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      className="relative mx-auto grid place-items-center"
      style={{ width: 280, height: 200 }}
    >
      {/* Subtle amber ambient glow behind the mark — atmospheric, not a solid disk */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.9 }}
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 260, height: 260,
          background: "radial-gradient(circle, oklch(0.74 0.16 68 / 0.12), transparent 60%)",
        }}
      />

      {/* The real logo — inverted to light via CSS filter so the dark logo reads on black */}
      <motion.img
        src="/logo.png"
        alt="MEKANIX"
        className="relative z-10 select-none object-contain"
        style={{ width: 220, height: "auto", filter: "invert(1) hue-rotate(180deg) brightness(1.15)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </motion.div>
  );
}

function BackBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> {label}
    </button>
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
