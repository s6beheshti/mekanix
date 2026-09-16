"use client";
import { useEffect, useState } from "react";
import {
  Home, Car, Wrench, MapPin, Receipt, History, MessageSquare, Bell, Settings, Plus, Crown,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/mek/app-shell";
import { useApp } from "@/lib/store";
import { useActiveUser } from "@/lib/use-active-user";
import { CustomerHome } from "./home";
import { CustomerVehicles } from "./vehicles";
import { RequestType, DescribeProblem, Matching, TechnicianProfileView } from "./request-flow";
import { CustomerTracking } from "./tracking";
import { CustomerInvoice } from "./invoice";
import { InvoiceDocument } from "./invoice-document";
import { CustomerCompletion } from "./completion";
import { CustomerHistory } from "./service-history";
import { CustomerChat } from "./chat";
import { CustomerSettings } from "./settings";
import { CustomerVip } from "./vip";
import { EmptyState } from "@/components/mek/shared/primitives";
import { Bell as BellIcon } from "lucide-react";
import { NotificationCenter } from "@/components/mek/shared/notification-center";
import { useT } from "@/lib/use-t";

export function CustomerApp() {
  const { view } = useApp();
  const { user, loading } = useActiveUser();
  const { t } = useT();
  const [incomingRequest, setIncomingRequest] = useState(0);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-amber border-t-transparent" />
      </div>
    );
  }
  if (!user) {
    return (
      <EmptyState icon={Wrench} title={t("common.noCustomerTitle")} description={t("common.noCustomerDesc")} className="m-6" />
    );
  }

  const nav: NavItem[] = [
    { view: "home", label: t("nav.home"), icon: Home },
    { view: "vehicles", label: t("nav.vehicles"), icon: Car },
    { view: "service-history", label: t("nav.serviceHistory"), icon: History },
    { view: "vip", label: t("nav.vip"), icon: Crown },
    { view: "notifications", label: t("nav.alerts"), icon: Bell },
    { view: "settings", label: t("nav.settings"), icon: Settings },
  ];

  const render = () => {
    switch (view) {
      case "home": return <CustomerHome customer={user} />;
      case "vehicles": return <CustomerVehicles customer={user} />;
      case "request-type": return <RequestType customer={user} />;
      case "describe": return <DescribeProblem customer={user} />;
      case "matching": return <Matching customer={user} />;
      case "technician-profile": return <TechnicianProfileView customer={user} />;
      case "track": return <CustomerTracking customer={user} />;
      case "invoice": return <CustomerInvoice customer={user} />;
      case "invoice-document": return <InvoiceDocument customer={user} />;
      case "completion": return <CustomerCompletion customer={user} />;
      case "service-history": return <CustomerHistory customer={user} />;
      case "chat": return <CustomerChat customer={user} />;
      case "vip": return <CustomerVip userId={user.id} />;
      case "notifications": return (
        <div className="rounded-xl border border-border bg-card" style={{ height: "calc(100vh - 8rem)" }}>
          <NotificationCenter userId={user.id} />
        </div>
      );
      case "settings": return <CustomerSettings customer={user} />;
      default: return <CustomerHome customer={user} />;
    }
  };

  return (
    <AppShell nav={nav}>
      {render()}
    </AppShell>
  );
}
