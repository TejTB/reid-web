"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types/db";

type AuthContextValue = {
  session: Session | null;
  me: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  me: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setSession(session);
    if (session) {
      // Realtime channels need the auth token; set it once we have a session
      // so RLS-filtered subscriptions (e.g. /goals) receive updates.
      supabase.realtime.setAuth(session.access_token);
      const { data } = await supabase.from("users").select("*").maybeSingle();
      setMe((data as User | null) ?? null);
    } else {
      setMe(null);
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

  return (
    <AuthContext.Provider value={{ session, me, loading, refresh }}>
      {children}
    </AuthContext.Provider>
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
