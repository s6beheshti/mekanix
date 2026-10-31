"use client";
import { useEffect } from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { Splash } from "@/components/mek/splash/splash";
import { ModeSelect } from "@/components/mek/splash/mode-select";
import { CustomerApp } from "@/components/mek/customer/customer-app";
import { TechnicianApp } from "@/components/mek/technician/technician-app";
import { AdminApp } from "@/components/mek/admin/admin-app";
import { Onboarding } from "@/components/mek/onboarding";

export default function Home() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("payment");
    if (!status) return;

    if (status === "success") toast.success("پرداخت با موفقیت تأیید شد.");
    else if (status === "pending") toast.message("پرداخت انجام شده؛ تأیید نهایی در حال بررسی است.");
    else toast.error("پرداخت تکمیل نشد یا توسط کاربر لغو شد.");

    url.searchParams.delete("payment");
    url.searchParams.delete("payment_code");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  const bootStage = useApp((s) => s.bootStage);
  const portal = useApp((s) => s.portal);
  const role = useApp((s) => s.role);
  const onboardingRequired = useApp((s) => s.onboardingRequired);

  if (bootStage === "splash") return <Splash />;
  if (bootStage === "mode-select") return <ModeSelect />;

  if (onboardingRequired) return <Onboarding />;

  if (portal === "admin" || role === "ADMIN") return <AdminApp />;
  if (portal === "mechanic" || role === "TECHNICIAN") return <TechnicianApp />;
  return <CustomerApp />;
}
