"use client";

import { useEffect, useState } from "react";
import { Bell, UserRound } from "lucide-react";
import { readStoredSettingsProfile, sanitizeAllStoredSettingsProfiles, SETTINGS_PROFILE_STORAGE_KEY } from "@/lib/settings-storage";
import { getBrowserAccountStatus } from "@/lib/supabase/browser-account";

export function Topbar() {
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("Mon compte");

  useEffect(() => {
    try {
      sanitizeAllStoredSettingsProfiles(window.localStorage);
      const stored = readStoredSettingsProfile(window.localStorage, [SETTINGS_PROFILE_STORAGE_KEY]);
      if (stored) {
        setModeLabel(stored.appMode === "athlete" ? "Sportif" : "Grand Public");
        return;
      }
    } catch {
      // ignore
    }

    setModeLabel(null);
  }, []);

  useEffect(() => {
    let active = true;

    getBrowserAccountStatus()
      .then((status) => {
        if (!active) {
          return;
        }

        setAccountLabel(formatAccountLabel(status.displayName, status.email));
      })
      .catch(() => {
        if (active) {
          setAccountLabel("Mon compte");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm text-slate-500">Compte</p>
          <h1 className="font-semibold">{accountLabel}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:inline-flex">
            <span className="text-slate-500">Mode :</span>
            <strong>{modeLabel ?? "Sportif"}</strong>
          </span>
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </button>
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Profil">
            <UserRound className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function formatAccountLabel(displayName?: string | null, email?: string | null) {
  const cleanDisplayName = displayName?.trim();

  if (cleanDisplayName) {
    return cleanDisplayName;
  }

  return email?.trim() || "Mon compte";
}

