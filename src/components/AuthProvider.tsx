"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types/db";

// Sprint 12 — the server-computed entitlement seam. Mirrors GET /api/entitlement.
// Build 3 repoints the six legacy counter readers to consume this; for now it
// is established alongside `me` without changing any existing reader.
export interface Entitlement {
  sessionsUsed: number;
  allowance: number;
  isPro: boolean;
  entitled: boolean;
}

type AuthContextValue = {
  session: Session | null;
  me: User | null;
  entitlement: Entitlement | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  me: null,
  entitlement: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setSession(session);
    if (session) {
      supabase.realtime.setAuth(session.access_token);
      let { data } = await supabase.from("users").select("*").maybeSingle();
      if (!data) {
        try {
          await fetch("/api/auth/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          ({ data } = await supabase.from("users").select("*").maybeSingle());
        } catch (err) {
          console.error("[AuthProvider] sync failed:", err);
        }
      }
      setMe((data as User | null) ?? null);

      // Fetch the server-computed entitlement seam. Non-fatal: on failure we
      // leave the previous value so a transient error doesn't flip the UI.
      try {
        const res = await fetch("/api/entitlement", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          setEntitlement((await res.json()) as Entitlement);
        }
      } catch (err) {
        console.error("[AuthProvider] entitlement fetch failed:", err);
      }
    } else {
      setMe(null);
      setEntitlement(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refresh();
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ session, me, entitlement, loading, refresh }),
    [session, me, entitlement, loading, refresh],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useMe(): User | null {
  return useContext(AuthContext).me;
}

export function useUserId(): string | null {
  return useContext(AuthContext).me?.id ?? null;
}

export function useIsPro(): boolean {
  return useContext(AuthContext).me?.subscription_status === "pro";
}

// Sprint 12 — the server-computed entitlement seam. Returns null until the
// first fetch resolves. Build 3 migrates the legacy counter readers onto this.
export function useEntitlement(): Entitlement | null {
  return useContext(AuthContext).entitlement;
}
