"use client";
import { useEffect, useState } from "react";
import {
  Home, Car, Wrench, MapPin, Receipt, History, MessageSquare, Bell, Settings, Plus,
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
import { EmptyState } from "@/components/mek/shared/primitives";
import { Bell as BellIcon } from "lucide-react";
import { NotificationCenter } from "@/components/mek/shared/notification-center";

export function CustomerApp() {
  const { view } = useApp();
  const { user, loading } = useActiveUser();
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
      <EmptyState icon={Wrench} title="No customer profile" description="Reseed the demo data to continue." className="m-6" />
    );
  }

  const nav: NavItem[] = [
    { view: "home", label: "Home", icon: Home },
    { view: "vehicles", label: "My Fleet", icon: Car },
    { view: "service-history", label: "Service History", icon: History },
    { view: "notifications", label: "Alerts", icon: Bell },
    { view: "settings", label: "Settings", icon: Settings },
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
