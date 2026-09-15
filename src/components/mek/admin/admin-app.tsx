"use client";
import {
  LayoutDashboard, Users, Wrench, Briefcase, CreditCard, Star, AlertTriangle,
  Layers, ShieldCheck, Settings, UserPlus,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/mek/app-shell";
import { useApp } from "@/lib/store";
import { AdminOverview } from "./overview";
import { AdminCustomers } from "./customers";
import { AdminTechnicians } from "./technicians";
import { AdminJobs } from "./jobs";
import { AdminPayments } from "./payments";
import { AdminReviews } from "./reviews";
import { AdminDisputes } from "./disputes";
import { AdminCategories } from "./categories";
import { AdminVerification } from "./verification";
import { AdminApplications } from "./applications";
import { AdminSettings } from "./settings";

const NAV: NavItem[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "applications", label: "Applications", icon: UserPlus },
  { view: "customers", label: "Customers", icon: Users },
  { view: "technicians", label: "Technicians", icon: Wrench },
  { view: "jobs", label: "Jobs", icon: Briefcase },
  { view: "payments", label: "Payments", icon: CreditCard },
  { view: "reviews", label: "Reviews", icon: Star },
  { view: "disputes", label: "Disputes", icon: AlertTriangle },
  { view: "categories", label: "Categories", icon: Layers },
  { view: "verification", label: "Verification", icon: ShieldCheck },
  { view: "settings", label: "Settings", icon: Settings },
];

export function AdminApp() {
  const { view } = useApp();
  const render = () => {
    switch (view) {
      case "overview": return <AdminOverview />;
      case "applications": return <AdminApplications />;
      case "customers": return <AdminCustomers />;
      case "technicians": return <AdminTechnicians />;
      case "jobs": return <AdminJobs />;
      case "payments": return <AdminPayments />;
      case "reviews": return <AdminReviews />;
      case "disputes": return <AdminDisputes />;
      case "categories": return <AdminCategories />;
      case "verification": return <AdminVerification />;
      case "settings": return <AdminSettings />;
      default: return <AdminOverview />;
    }
  };
  return <AppShell nav={NAV} footer={<AdminFooter />}>{render()}</AppShell>;
}

function AdminFooter() {
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground">
      <span className="font-mono">MEKANIX OPS · v1.0 · {new Date().getFullYear()}</span>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-glow mk-status-pulse" /> All systems operational</span>
        <span>Region: us-west</span>
      </div>
    </div>
  );
}
