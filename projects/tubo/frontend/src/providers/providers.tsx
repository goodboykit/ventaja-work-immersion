"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiClient } from "@/lib/api-client";
import { ToastProvider } from "@/components/toast";

interface AuthState {
  session: Session | null;
  loading: boolean;
}

interface AppContextValue {
  supabase: SupabaseClient;
  session: Session | null;
  loading: boolean;
  api: ApiClient;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [auth, setAuth] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuth({ session: data.session, loading: false });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth({ session, loading: false });
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuth({ session: null, loading: false });
  }, [supabase]);

  const api = useMemo(
    () =>
      new ApiClient(
        async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        },
        {
          onUnauthorized: () => {
            signOut();
          },
        },
      ),
    [supabase, signOut],
  );

  const value = useMemo<AppContextValue>(
    () => ({ supabase, session: auth.session, loading: auth.loading, api, signOut }),
    [supabase, auth.session, auth.loading, api, signOut],
  );

  return (
    <AppContext value={value}>
      <ToastProvider>{children}</ToastProvider>
    </AppContext>
  );
}
