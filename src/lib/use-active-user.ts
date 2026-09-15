"use client";
import { useEffect, useState } from "react";
import type { User, Customer, Technician } from "./api";
import { useApp } from "./store";

// Resolves the active demo identity for the current role.
export type DemoUser = User & { customer?: Customer | null; technician?: Technician | null };

export function useActiveUser() {
  const role = useApp((s) => s.role);
  const [state, setState] = useState<{ user: DemoUser | null; loadedRole: string | null }>({
    user: null,
    loadedRole: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/demo")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState({ user: (data[role] as DemoUser) ?? null, loadedRole: role });
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, loadedRole: role });
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  return { user: state.user, loading: state.loadedRole !== role, role };
}
