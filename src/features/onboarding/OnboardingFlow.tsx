"use client";

import { BellRing, Box, ChevronLeft, CircleCheck, Flame, HeartPulse, UsersRound, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import { clearBrowserAccountStatusCache } from "@/lib/supabase/browser-account";
import { buildAccountStorageKey } from "@/lib/account-storage";
import { defaultSettingsProfile, getGoalDefaultAdjustment, type DietType, type SettingsProfile } from "@/lib/settings";
import { SETTINGS_PROFILE_STORAGE_KEY, toLocalSettingsProfile, writeStoredSettingsProfile } from "@/lib/settings-storage";
import { t } from "@/lib/i18n";

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

type OnboardingState = SettingsProfile & {
  notifications: {
    expiryAlerts: boolean;
    nutritionReminders: boolean;
    recipeSuggestions: boolean;
  };
};

const STORAGE_KEY = "ecofoodstock:onboarding-state";
const SETTINGS_KEY = SETTINGS_PROFILE_STORAGE_KEY;
const choiceActiveClass = "settings-choice-active";
const choiceInactiveClass = "settings-choice-inactive";

const notificationItems: Array<{
  key: keyof OnboardingState["notifications"];
  title: string;
  subtitle: string;
}> = [
  { key: "expiryAlerts", title: "Alertes de péremption", subtitle: "2 jours avant l'expiration" },
  { key: "nutritionReminders", title: "Rappels nutritionnels", subtitle: "Suivi des objectifs quotidiens" },
  { key: "recipeSuggestions", title: "Suggestions de recettes", subtitle: "Basées sur votre stock" }
];

const defaultOnboardingState: OnboardingState = {
  ...defaultSettingsProfile,
  notifications: {
    expiryAlerts: true,
    nutritionReminders: true,
    recipeSuggestions: true
  }
};

export function OnboardingFlow() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");
  const router = useRouter();
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [step, setStep] = useState<OnboardingStep>(1);
  const [state, setState] = useState<OnboardingState>(defaultOnboardingState);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<OnboardingState>;
        setState((current) => ({
          ...current,
          ...parsed,
          notifications: {
            ...current.notifications,
            ...(parsed.notifications ?? {})
          }
        }));
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...toLocalSettingsProfile(parsed),
            notifications: {
              ...defaultOnboardingState.notifications,
              ...(parsed.notifications ?? {})
            }
          })
        );
      }
    } catch {
      setState(defaultOnboardingState);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!inviteToken) return;
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        router.push(`/login?token=${encodeURIComponent(inviteToken)}`);
        return;
      }

      try {
        const res = await fetch("/api/household/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ token: inviteToken })
        });

        const body = await res.json();
        if (!res.ok) {
          setJoinStatus(body?.error ?? t("household.invalidToken"));
          return;
        }

        setJoinStatus(t("household.joinSuccess"));
        setTimeout(() => router.push("/dashboard"), 900);
      } catch (err) {
        setJoinStatus((err as Error).message ?? t("household.invalidToken"));
      }
    })();
  }, [inviteToken, router]);

  function persist(nextState: OnboardingState) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...toLocalSettingsProfile(nextState),
        notifications: nextState.notifications
      })
    );
  }

  function updateState<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((current) => {
      const nextState = { ...current, [key]: value };
      persist(nextState);
      return nextState;
    });
  }

  function toggleNotification(key: keyof OnboardingState["notifications"]) {
    setState((current) => {
      const nextState = {
        ...current,
        notifications: {
          ...current.notifications,
          [key]: !current.notifications[key]
        }
      };
      persist(nextState);
      return nextState;
    });
  }

  function nextStep() {
    setStep((current) => (current < 5 ? (current + 1) as OnboardingStep : current));
  }

  function previousStep() {
    setStep((current) => (current > 1 ? (current - 1) as OnboardingStep : current));
  }

  async function finishOnboarding(nextState = state) {
    setFinishing(true);
    setFinishError(null);

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getBrowserAuthHeaders()) },
        body: JSON.stringify(nextState)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Impossible de finaliser l'onboarding.");
      }

      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      const userSettingsKey = buildAccountStorageKey(SETTINGS_KEY, data.user?.id ?? null);

      writeStoredSettingsProfile(window.localStorage, userSettingsKey, nextState);
      writeStoredSettingsProfile(window.localStorage, SETTINGS_KEY, nextState);
      window.localStorage.setItem("ecofoodstock:onboarding-completed", "true");
      window.localStorage.removeItem(STORAGE_KEY);
      clearBrowserAccountStatusCache();
      router.push("/dashboard");
    } catch (error) {
      setFinishError((error as Error).message ?? "Impossible de finaliser l'onboarding.");
    } finally {
      setFinishing(false);
    }
  }

  function finishWithoutNotifications() {
    const nextState: OnboardingState = {
      ...state,
      notifications: {
        expiryAlerts: false,
        nutritionReminders: false,
        recipeSuggestions: false
      }
    };

    setState(nextState);
    persist(nextState);
    void finishOnboarding(nextState);
  }

  const canContinue =
    (step === 1 && state.householdSize > 0) ||
    (step === 2 && Boolean(state.diet)) ||
    (step === 3 && Boolean(state.appMode)) ||
    (step === 4 && state.age > 0 && state.heightCm > 0 && state.weightKg > 0) ||
    step === 5;

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
        <Card className="p-8 shadow-soft">Chargement...</Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {step > 1 ? (
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white"
                type="button"
                onClick={previousStep}
                aria-label="Etape précédente"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
              <Box className="h-6 w-6" />
            </div>
          </div>
          <p className="text-sm text-slate-600">Étape {step} sur 5</p>
        </div>

        <div className="mb-8 h-2 rounded-full bg-slate-200">
          <svg className="h-2 w-full text-slate-950" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
            <rect width={(step / 5) * 100} height="8" rx="4" fill="currentColor" />
          </svg>
        </div>

        <Card className="p-8 shadow-soft">
          {joinStatus ? <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{joinStatus}</div> : null}
          {finishError ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{finishError}</div> : null}

          {step === 1 ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <UsersRound className="h-7 w-7 text-brand-600" />
                <h1 className="text-2xl font-bold">Pour combien de personnes cuisinez-vous ?</h1>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[1, 2, 3, 4, 5].map((size) => (
                  <button
                    key={size}
                    className={getChoiceClass(state.householdSize === size, "rounded-xl border px-4 py-5 text-center transition")}
                    aria-pressed={state.householdSize === size}
                    type="button"
                    onClick={() => updateState("householdSize", size)}
                  >
                    <span className="block text-2xl font-bold">{size}</span>
                    <span className="text-xs text-slate-600">{size === 5 ? "5+" : "pers."}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <Utensils className="h-7 w-7 text-brand-600" />
                <h1 className="text-2xl font-bold">Avez-vous un régime particulier ?</h1>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Omnivore", value: "omnivore" as DietType, icon: "🍽️" },
                  { label: "Végétarien", value: "vegetarian" as DietType, icon: "🥗" },
                  { label: "Vegan", value: "vegan" as DietType, icon: "🌱" },
                  { label: "Pescétarien", value: "pescatarian" as DietType, icon: "🐟" }
                ].map((diet) => (
                  <button
                    key={diet.value}
                    className={getChoiceClass(state.diet === diet.value, "rounded-2xl border px-4 py-8 transition")}
                    aria-pressed={state.diet === diet.value}
                    type="button"
                    onClick={() => updateState("diet", diet.value)}
                  >
                    <div className="mb-3 text-3xl">{diet.icon}</div>
                    <div className="text-lg font-medium">{diet.label}</div>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <Flame className="h-7 w-7 text-brand-600" />
                <h1 className="text-2xl font-bold">Choisissez votre mode d'utilisation</h1>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Mode Grand Public",
                    value: "general_public" as const,
                    icon: "🌱",
                    title: "Équilibre global et anti-gaspillage.",
                    description: "Parfait pour gérer votre stock et réduire le gaspillage.",
                    badge: "Recommandé"
                  },
                  {
                    label: "Mode Sportif / Macros",
                    value: "athlete" as const,
                    icon: "💪",
                    title: "Suivi précis des protéines, glucides et lipides.",
                    description: "Pour les sportifs et le suivi nutritionnel avancé.",
                    badge: "Avancé"
                  }
                ].map((mode) => (
                  <button
                    key={mode.value}
                    className={getChoiceClass(state.appMode === mode.value, "rounded-2xl border p-5 text-left transition")}
                    aria-pressed={state.appMode === mode.value}
                    type="button"
                    onClick={() => updateState("appMode", mode.value)}
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-2xl">{mode.icon}</div>
                    <h2 className="text-xl font-bold">{mode.label}</h2>
                    <p className="mt-3 text-sm text-slate-600">{mode.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{mode.description}</p>
                    <span className="mt-4 inline-flex rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">{mode.badge}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <HeartPulse className="h-7 w-7 text-brand-600" />
                <h1 className="text-2xl font-bold">Calculons vos objectifs nutritionnels</h1>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Homme", value: "male" as const },
                  { label: "Femme", value: "female" as const },
                  { label: "Autre", value: "other" as const }
                ].map((sex) => (
                  <button
                    key={sex.value}
                    className={getChoiceClass(state.sex === sex.value, "rounded-xl border px-4 py-4 text-center transition")}
                    aria-pressed={state.sex === sex.value}
                    type="button"
                    onClick={() => updateState("sex", sex.value)}
                  >
                    {sex.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm">
                  <span>Age</span>
                  <input
                    type="number"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4"
                    value={state.age}
                    onChange={(event) => updateState("age", Number(event.target.value) || 0)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span>Taille (cm)</span>
                  <input
                    type="number"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4"
                    value={state.heightCm}
                    onChange={(event) => updateState("heightCm", Number(event.target.value) || 0)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span>Poids (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4"
                    value={state.weightKg}
                    onChange={(event) => updateState("weightKg", Number(event.target.value) || 0)}
                  />
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>Vos données servent à calculer localement votre IMC, vos calories de maintenance et vos objectifs quotidiens.</p>
                <p className="mt-2">Ajustement calorique par défaut : {state.goal === "maintenance" ? "0 kcal" : `${getGoalDefaultAdjustment(state.goal)} kcal`}</p>
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <BellRing className="h-7 w-7 text-brand-600" />
                <h1 className="text-2xl font-bold">Activez les notifications</h1>
              </div>

              <p className="mx-auto max-w-xl text-center text-sm text-slate-600">
                Recevez des alertes pour éviter de jeter vos produits périssables et suivre vos apports nutritionnels.
              </p>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                {notificationItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleNotification(item.key)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      state.notifications[item.key] ? choiceActiveClass : choiceInactiveClass
                    }`}
                    aria-pressed={state.notifications[item.key]}
                  >
                    <span className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full ${state.notifications[item.key] ? "bg-emerald-500 text-white" : "bg-slate-300 text-white"}`}>
                      <CircleCheck className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block font-medium">{item.title}</span>
                      <span className="block text-sm text-slate-500">{item.subtitle}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-8 flex gap-3">
            {step < 5 ? (
              <Button className="w-full" type="button" onClick={nextStep} disabled={!canContinue}>
                Continuer
              </Button>
            ) : (
              <>
                <Button variant="secondary" className="w-full" type="button" onClick={finishWithoutNotifications} disabled={finishing}>
                  Plus tard
                </Button>
                <Button className="w-full" type="button" onClick={() => void finishOnboarding()} disabled={finishing}>
                  {finishing ? "Activation..." : "Activer"}
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}

function getChoiceClass(active: boolean, baseClassName: string) {
  return `${baseClassName} ${active ? choiceActiveClass : choiceInactiveClass}`;
}

