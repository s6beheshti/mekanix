"use client";
import { useApp } from "@/lib/store";
import { Splash } from "@/components/mek/splash/splash";
import { ModeSelect } from "@/components/mek/splash/mode-select";
import { CustomerApp } from "@/components/mek/customer/customer-app";
import { TechnicianApp } from "@/components/mek/technician/technician-app";
import { AdminApp } from "@/components/mek/admin/admin-app";

export default function Home() {
  const bootStage = useApp((s) => s.bootStage);
  const portal = useApp((s) => s.portal);
  const role = useApp((s) => s.role);

  if (bootStage === "splash") return <Splash />;
  if (bootStage === "mode-select") return <ModeSelect />;

  // bootStage === "app"
  if (portal === "admin" || role === "ADMIN") return <AdminApp />;
  if (portal === "mechanic" || role === "TECHNICIAN") return <TechnicianApp />;
  return <CustomerApp />;
}
