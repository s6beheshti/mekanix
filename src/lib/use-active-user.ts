"use client";
import { useEffect, useState } from "react";
import type { User, Customer, Technician } from "./api";
import { useApp } from "./store";

// Resolves the active identity. Prefers the real authenticated user (from store.auth),
// otherwise falls back to the seeded demo user for the current role.
export type DemoUser = User & { customer?: Customer | null; technician?: Technician | null };

export function useActiveUser() {
  const role = useApp((s) => s.role);
  const authUserId = useApp((s) => s.auth.userId);
  const [state, setState] = useState<{ user: DemoUser | null; loadedKey: string | null }>({
    user: null,
    loadedKey: null,
  });

  useEffect(() => {
    let cancelled = false;
    const key = authUserId ?? `demo:${role}`;
    // If a real authenticated user exists, resolve them; otherwise the demo user for the role.
    const url = authUserId
      ? `/api/auth/session` // POST below
      : `/api/auth/demo`;
    const run = async () => {
      try {
        let data: any;
        if (authUserId) {
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: authUserId }),
          });
          data = await res.json();
          if (!data.user) data = { [role]: null };
          const u = data.user as DemoUser | undefined;
          if (!cancelled) setState({ user: u ?? null, loadedKey: key });
        } else {
          const res = await fetch(url);
          data = await res.json();
          if (cancelled) return;
          const u = (data[role] as DemoUser | undefined) ?? null;
          setState({ user: u, loadedKey: key });
        }
      } catch {
        if (!cancelled) setState({ user: null, loadedKey: key });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [role, authUserId]);

  return { user: state.user, loading: state.loadedKey !== (authUserId ?? `demo:${role}`), role };
}
