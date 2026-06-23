"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { prefetchCoreAppData } from "@/lib/app-prefetch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearBrowserAccountStatusCache, getBrowserAccountStatus } from "@/lib/supabase/browser-account";
import { routes } from "@/lib/routes";

export function AuthGate({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const checkedAccessTokenRef = useRef<string | null>(null);
  const prefetchedAccessTokenRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const loginUrl = () => `${routes.login}?next=${encodeURIComponent(getCurrentPath())}`;

    async function handleSession(session: Session | null, options: { force?: boolean } = {}) {
      if (!active) {
        return;
      }

      if (!session) {
        checkedAccessTokenRef.current = null;
        prefetchedAccessTokenRef.current = null;
        clearBrowserAccountStatusCache();
        setAuthorized(false);
        router.replace(loginUrl());
        return;
      }

      if (!options.force && checkedAccessTokenRef.current === session.access_token) {
        setAuthorized(true);
        return;
      }

      let status;

      try {
        status = await getBrowserAccountStatus({ force: options.force });
      } catch {
        checkedAccessTokenRef.current = null;
        clearBrowserAccountStatusCache();
        setAuthorized(false);
        window.setTimeout(() => {
          if (active) {
            void handleSession(session, { force: true });
          }
        }, 1500);
        return;
      }

      if (!active) {
        return;
      }

      if (!status.authenticated) {
        checkedAccessTokenRef.current = null;
        prefetchedAccessTokenRef.current = null;
        clearBrowserAccountStatusCache();
        setAuthorized(false);
        router.replace(loginUrl());
        return;
      }

      if (!status.onboardingCompleted && window.location.pathname !== routes.onboarding) {
        checkedAccessTokenRef.current = session.access_token;
        setAuthorized(false);
        router.replace(routes.onboarding);
        return;
      }

      checkedAccessTokenRef.current = session.access_token;
      setAuthorized(true);

      if (prefetchedAccessTokenRef.current !== session.access_token) {
        prefetchedAccessTokenRef.current = session.access_token;
        prefetchCoreAppData(session.access_token);
      }
    }

    try {
      const supabase = createSupabaseBrowserClient();

      supabase.auth.getSession().then(({ data }) => {
        void handleSession(data.session);
      });

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          checkedAccessTokenRef.current = null;
          prefetchedAccessTokenRef.current = null;
          clearBrowserAccountStatusCache();
          setAuthorized(false);
          router.replace(loginUrl());
          return;
        }

        if (event === "TOKEN_REFRESHED") {
          checkedAccessTokenRef.current = null;
          prefetchedAccessTokenRef.current = null;
          void handleSession(session, { force: true });
          return;
        }

        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
          void handleSession(session);
        }
      });

      return () => {
        active = false;
        subscription.unsubscribe();
      };
    } catch {
      router.replace(routes.login);
    }

    return () => {
      active = false;
    };
  }, [router]);

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
        <p className="text-sm font-medium text-slate-600">Vérification de la session...</p>
      </main>
    );
  }

  return <>{children}</>;
}

function getCurrentPath() {
  return `${window.location.pathname}${window.location.search}`;
}
