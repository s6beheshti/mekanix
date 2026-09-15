"use client";
import { useApp } from "@/lib/store";
import { CustomerApp } from "@/components/mek/customer/customer-app";
import { TechnicianApp } from "@/components/mek/technician/technician-app";
import { AdminApp } from "@/components/mek/admin/admin-app";

export default function Home() {
  const role = useApp((s) => s.role);
  if (role === "TECHNICIAN") return <TechnicianApp />;
  if (role === "ADMIN") return <AdminApp />;
  return <CustomerApp />;
}
