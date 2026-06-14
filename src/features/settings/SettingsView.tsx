"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  History,
  KeyRound,
  LogOut,
  RotateCcw,
  Settings,
  Target,
  Trash2,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { HistoryView } from "@/features/history/HistoryView";
import { buildAccountStorageKey } from "@/lib/account-storage";
import { routes } from "@/lib/routes";
import { clearBrowserAccountStatusCache } from "@/lib/supabase/browser-account";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calculateBmi,
  calculateMaintenanceCalories,
  calculateTargetCalories,
  defaultSettingsProfile,
  formatBmi,
  formatCalories,
  getBmiLabel,
  getGoalDefaultAdjustment,
  getGoalLabel,
  type SettingsProfile
} from "@/lib/settings";
import {
  readStoredSettingsProfile,
  sanitizeAllStoredSettingsProfiles,
  sanitizeStoredSettingsProfiles,
  SETTINGS_PROFILE_STORAGE_KEY,
  writeStoredSettingsProfile
} from "@/lib/settings-storage";
import { applyThemePreference, isThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const STORAGE_KEY = SETTINGS_PROFILE_STORAGE_KEY;

type SettingsSection = "household" | "personal" | "history" | "account" | "application";
type ConfirmState =
  | { type: "logout" }
  | { type: "delete-account"; step: "intro" | "phrase"; phrase: string }
  | null;

const settingsSectionConfigs: Record<SettingsSection, { title: string; description: string; icon: LucideIcon }> = {
  household: {
    title: "Mon profil & foyer",
    description: "Mode, régime, taille du foyer et invitations.",
    icon: UsersRound
  },
  personal: {
    title: "Infos perso & objectifs",
    description: "Âge, poids, taille et objectifs nutritionnels.",
    icon: Target
  },
  history: {
    title: "Historique",
    description: "Actions du stock, des courses et des paramètres.",
    icon: History
  },
  account: {
    title: "Compte & sécurité",
    description: "Mot de passe, export, déconnexion et suppression.",
    icon: KeyRound
  },
  application: {
    title: "Application",
    description: "Thème, cache local et données temporaires.",
    icon: Settings
  }
};

const selectableButtonBase = "rounded-lg border px-3 py-3 text-sm font-semibold transition";
const selectableActiveClass = "settings-choice-active";
const selectableInactiveClass = "settings-choice-inactive";

export function SettingsView() {
  const router = useRouter();
  const [profile, setProfile] = useState<SettingsProfile>(defaultSettingsProfile);
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountActionStatus, setAccountActionStatus] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const baselineRef = useRef<SettingsProfile>(defaultSettingsProfile);

  useEffect(() => {
    let active = true;

    async function hydrateProfile() {
      let nextStorageKey = buildAccountStorageKey(STORAGE_KEY, null);

      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        nextStorageKey = buildAccountStorageKey(STORAGE_KEY, data.session?.user?.id ?? null);
        setAccountEmail(data.session?.user?.email ?? null);
      } catch {
        nextStorageKey = STORAGE_KEY;
      }

      if (!active) {
        return;
      }

      setStorageKey(nextStorageKey);

      const storedThemePreference = window.localStorage.getItem(THEME_STORAGE_KEY);
      const nextThemePreference = isThemePreference(storedThemePreference) ? storedThemePreference : "system";
      setThemePreference(nextThemePreference);
      applyThemePreference(nextThemePreference);

      sanitizeAllStoredSettingsProfiles(window.localStorage);
      sanitizeStoredSettingsProfiles(window.localStorage, [nextStorageKey, STORAGE_KEY]);
      const storedProfile = readStoredSettingsProfile(window.localStorage, [nextStorageKey, STORAGE_KEY]);

      if (storedProfile) {
        const localProfile = { ...defaultSettingsProfile, ...storedProfile };
        setProfile(localProfile);
        baselineRef.current = localProfile;
      }

      try {
        const settingsResponse = await fetch("/api/settings", {
          cache: "no-store",
          headers: await getBrowserAuthHeaders()
        });
        const settingsPayload = (await settingsResponse.json().catch(() => null)) as { profile?: SettingsProfile } | null;

        if (active && settingsResponse.ok && settingsPayload?.profile) {
          setProfile(settingsPayload.profile);
          baselineRef.current = settingsPayload.profile;
          writeStoredSettingsProfile(window.localStorage, nextStorageKey, settingsPayload.profile);
          writeStoredSettingsProfile(window.localStorage, STORAGE_KEY, settingsPayload.profile);
        }
      } catch {
        // Le profil local reste utilisable si la connexion est temporairement indisponible.
      }

      setLoaded(true);
    }

    void hydrateProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function syncSystemTheme() {
      if (themePreference === "system") {
        applyThemePreference("system");
      }
    }

    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [themePreference]);

  useEffect(() => {
    if (!status) {
      return;
    }

    const timeoutId = window.setTimeout(() => setStatus(null), 5500);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const bmi = useMemo(() => calculateBmi(profile), [profile]);
  const maintenanceCalories = useMemo(() => calculateMaintenanceCalories(profile), [profile]);
  const targetCalories = useMemo(() => calculateTargetCalories(profile), [profile]);
  const activeSectionConfig = activeSection ? settingsSectionConfigs[activeSection] : null;

  async function saveSettings() {
    setSaving(true);
    setStatus(null);

    try {
      persistProfileLocally(profile);
      const authHeaders = await getBrowserAuthHeaders();
      const settingsResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(profile)
      });
      const settingsPayload = (await settingsResponse.json().catch(() => null)) as {
        profile?: SettingsProfile;
        historyEventCreated?: boolean;
        message?: string;
        error?: string;
      } | null;

      if (!settingsResponse.ok) {
        throw new Error(formatSettingsSaveError(settingsPayload, settingsResponse.status));
      }

      const savedProfile = settingsPayload?.profile ?? profile;
      baselineRef.current = savedProfile;
      persistProfileLocally(savedProfile);
      setProfile(savedProfile);
      setStatus(settingsPayload?.historyEventCreated ? "Paramètres enregistrés et ajoutés à l'historique." : "Paramètres enregistrés.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Impossible d'enregistrer les paramètres pour le moment.");
    } finally {
      setSaving(false);
    }
  }

  function persistProfileLocally(nextProfile: SettingsProfile, forcedStorageKey?: string) {
    const nextStorageKey = forcedStorageKey ?? storageKey ?? STORAGE_KEY;
    writeStoredSettingsProfile(window.localStorage, nextStorageKey, nextProfile);
    writeStoredSettingsProfile(window.localStorage, STORAGE_KEY, nextProfile);
  }

  function openSection(section: SettingsSection) {
    if (section === "personal") {
      setAdvancedOpen(false);
    }

    setActiveSection(section);
  }

  function updateProfile<K extends keyof SettingsProfile>(key: K, value: SettingsProfile[K]) {
    setProfile((current) => {
      const nextProfile = { ...current, [key]: value };
      persistProfileLocally(nextProfile);
      return nextProfile;
    });
  }

  function updateGoal(goal: SettingsProfile["goal"]) {
    setProfile((current) => {
      const nextProfile = {
        ...current,
        goal,
        dailyCaloriesAdjustment: goal === "maintenance" ? 0 : getGoalDefaultAdjustment(goal)
      };
      persistProfileLocally(nextProfile);
      return nextProfile;
    });
  }

  function updateMode(appMode: SettingsProfile["appMode"]) {
    setProfile((current) => {
      const nextProfile = { ...current, appMode };
      persistProfileLocally(nextProfile);
      return nextProfile;
    });
  }

  function updateThemePreference(preference: ThemePreference) {
    setThemePreference(preference);
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    applyThemePreference(preference);
  }

  async function generateInvite() {
    setGeneratingInvite(true);
    setStatus(null);
    setInviteToken(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus("Veuillez vous connecter pour générer une invitation.");
        return;
      }

      const res = await fetch("/api/household/invite", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const json = await res.json();
      if (!res.ok) {
        setStatus(json?.error ?? "Impossible de générer l'invitation.");
        return;
      }

      setInviteToken(json.token);
      setInviteExpiresAt(json.expires_at || null);
      setStatus("Invitation générée.");
    } catch {
      setStatus("Erreur lors de la génération de l'invitation.");
    } finally {
      setGeneratingInvite(false);
    }
  }

  function copyInvite() {
    if (!inviteToken) return;
    const url = `${window.location.origin}/join?token=${encodeURIComponent(inviteToken)}`;
    navigator.clipboard.writeText(url).then(() => setStatus("Lien d'invitation copié."));
  }

  async function signOut() {
    setSigningOut(true);
    setStatus(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      clearBrowserAccountStatusCache();
      router.replace(routes.login);
    } catch {
      setStatus("Impossible de vous déconnecter pour le moment.");
    } finally {
      setSigningOut(false);
      setConfirmState(null);
    }
  }

  async function clearLocalCache() {
    setClearingCache(true);
    setStatus(null);

    try {
      await Promise.all([clearCacheStorage(), unregisterServiceWorkers()]);
      clearEcoFoodStockStorage(window.localStorage);
      clearEcoFoodStockStorage(window.sessionStorage);
      clearBrowserAccountStatusCache();
      setInviteToken(null);
      setInviteExpiresAt(null);
      setStatus("Cache local vidé. Rechargez la page pour repartir sur un état propre.");
    } catch {
      setStatus("Impossible de vider tout le cache local pour le moment.");
    } finally {
      setClearingCache(false);
    }
  }

  async function exportAccountData() {
    setExportingData(true);
    setAccountActionStatus(null);

    try {
      const headers = await getBrowserAuthHeaders();

      if (!headers.Authorization) {
        router.replace(routes.login);
        return;
      }

      const response = await fetch("/api/account/export", {
        method: "GET",
        headers
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Impossible d'exporter les données pour le moment.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ecofoodstock-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setAccountActionStatus("Export CSV téléchargé.");
    } catch (error) {
      setAccountActionStatus((error as Error).message ?? "Impossible d'exporter les données pour le moment.");
    } finally {
      setExportingData(false);
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    setAccountActionStatus(null);

    try {
      const headers = await getBrowserAuthHeaders();

      if (!headers.Authorization) {
        router.replace(routes.login);
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Impossible de supprimer le compte pour le moment.");
      }

      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      } catch {
        // Le compte Auth peut déjà être supprimé côté serveur.
      }

      clearEcoFoodStockStorage(window.localStorage);
      clearEcoFoodStockStorage(window.sessionStorage);
      await clearCacheStorage();
      clearBrowserAccountStatusCache();
      router.replace(routes.login);
    } catch (error) {
      setAccountActionStatus((error as Error).message ?? "Impossible de supprimer le compte pour le moment.");
    } finally {
      setDeletingAccount(false);
      setConfirmState(null);
    }
  }

  async function updatePassword() {
    setPasswordStatus(null);

    if (newPassword.length < 8) {
      setPasswordStatus("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (newPassword !== newPasswordConfirmation) {
      setPasswordStatus("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setChangingPassword(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace(routes.login);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        throw error;
      }

      setNewPassword("");
      setNewPasswordConfirmation("");
      setPasswordEditorOpen(false);
      setPasswordStatus("Mot de passe mis à jour.");
    } catch (error) {
      setPasswordStatus((error as Error).message ?? "Impossible de modifier le mot de passe pour le moment.");
    } finally {
      setChangingPassword(false);
    }
  }

  function renderActiveSection() {
    if (activeSection === "household") {
      return (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium">Taille du foyer</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((size) => (
                <button
                  key={size}
                  className={`h-11 w-11 ${selectableButtonBase} ${
                    profile.householdSize === size ? selectableActiveClass : selectableInactiveClass
                  }`}
                  type="button"
                  onClick={() => updateProfile("householdSize", size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Régime alimentaire</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { label: "Omnivore", value: "omnivore" as const },
                { label: "Végétarien", value: "vegetarian" as const },
                { label: "Vegan", value: "vegan" as const },
                { label: "Pescétarien", value: "pescatarian" as const }
              ].map((diet) => (
                <button
                  key={diet.value}
                  className={`${selectableButtonBase} ${
                    profile.diet === diet.value ? selectableActiveClass : selectableInactiveClass
                  }`}
                  type="button"
                  onClick={() => updateProfile("diet", diet.value)}
                >
                  {diet.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Mode actuel</p>
              <p className="text-sm text-slate-500">
                {profile.appMode === "athlete" ? "Sportif / Macros" : "Grand public"}
              </p>
            </div>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => updateMode("general_public")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  profile.appMode === "general_public" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Grand public
              </button>
              <button
                type="button"
                onClick={() => updateMode("athlete")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  profile.appMode === "athlete" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Sportif / macros
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <p className="font-semibold">Invitations</p>
            <p className="mt-1 text-sm text-slate-600">Invitez des membres dans votre foyer en générant un lien.</p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={() => void generateInvite()} disabled={generatingInvite}>
                {generatingInvite ? "Génération..." : "Générer une invitation"}
              </Button>

              {inviteToken ? (
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    readOnly
                    className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3"
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/join?token=${inviteToken}`}
                  />
                  <Button variant="secondary" onClick={copyInvite}>
                    Copier
                  </Button>
                </div>
              ) : null}
            </div>

            {inviteExpiresAt ? <p className="mt-2 text-xs text-slate-500">Expire le {new Date(inviteExpiresAt).toLocaleString()}</p> : null}
          </div>

          <SaveSettingsFooter status={status} saving={saving} onSave={() => void saveSettings()} />
        </div>
      );
    }

    if (activeSection === "personal") {
      return (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <label className="space-y-2 text-sm">
              <span>Âge</span>
              <input
                type="number"
                className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3"
                value={profile.age}
                onChange={(event) => updateProfile("age", Number(event.target.value) || 0)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Poids (kg)</span>
              <input
                type="number"
                step="0.1"
                className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3"
                value={profile.weightKg}
                onChange={(event) => updateProfile("weightKg", Number(event.target.value) || 0)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Taille (cm)</span>
              <input
                type="number"
                step="0.1"
                className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3"
                value={profile.heightCm}
                onChange={(event) => updateProfile("heightCm", Number(event.target.value) || 0)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sexe</span>
              <select
                className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3"
                value={profile.sex}
                onChange={(event) => updateProfile("sex", event.target.value as SettingsProfile["sex"])}
              >
                <option value="male">Homme</option>
                <option value="female">Femme</option>
                <option value="other">Autre</option>
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard label="IMC" value={formatBmi(bmi)} helper={getBmiLabel(bmi)} />
            <MetricCard label="Besoin calorique" value={formatCalories(maintenanceCalories)} helper="Base quotidienne estimée" />
            <MetricCard
              label="Objectif quotidien"
              value={formatCalories(targetCalories)}
              helper={`${getGoalLabel(profile.goal)} (${profile.dailyCaloriesAdjustment > 0 ? "+" : ""}${profile.dailyCaloriesAdjustment})`}
            />
          </div>

          {advancedOpen ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Options avancées</p>
                  <p className="text-sm text-slate-500">Réglages utiles si vous voulez suivre un objectif sportif.</p>
                </div>
                <Button variant="secondary" type="button" className="gap-2" onClick={() => setAdvancedOpen(false)}>
                  <ChevronUp className="h-4 w-4" />
                  Masquer
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span>Objectif</span>
                  <select
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3"
                    value={profile.goal}
                    onChange={(event) => updateGoal(event.target.value as SettingsProfile["goal"])}
                  >
                    <option value="mass_gain">Prise de masse</option>
                    <option value="cut">Sèche</option>
                    <option value="maintenance">Maintien normal</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span>Calories supplémentaires quotidiennes</span>
                  <input
                    type="number"
                    step="25"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                    value={profile.goal === "maintenance" ? 0 : profile.dailyCaloriesAdjustment}
                    disabled={profile.goal === "maintenance"}
                    onChange={(event) => updateProfile("dailyCaloriesAdjustment", Number(event.target.value) || 0)}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div>
                <p className="font-semibold">Options avancées</p>
                <p className="text-sm text-slate-500">Objectif et ajustement calorique visibles ici si vous en avez besoin.</p>
              </div>
              <Button variant="secondary" type="button" className="gap-2" onClick={() => setAdvancedOpen(true)}>
                <ChevronDown className="h-4 w-4" />
                Afficher
              </Button>
            </div>
          )}

          <SaveSettingsFooter status={status} saving={saving} onSave={() => void saveSettings()} />
        </div>
      );
    }

    if (activeSection === "history") {
      return <HistoryView embedded />;
    }

    if (activeSection === "account") {
      return (
        <div className="space-y-4">
          <ActionPanel
            icon={KeyRound}
            title="Modifier le mot de passe"
            description={accountEmail ?? "Compte connecté"}
            action={
              <Button variant="secondary" className="gap-2" onClick={() => setPasswordEditorOpen((current) => !current)}>
                <KeyRound className="h-4 w-4" />
                {passwordEditorOpen ? "Fermer" : "Modifier"}
              </Button>
            }
          />

          {passwordEditorOpen ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span>Nouveau mot de passe</span>
                  <input
                    type="password"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span>Confirmer le mot de passe</span>
                  <input
                    type="password"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3"
                    value={newPasswordConfirmation}
                    onChange={(event) => setNewPasswordConfirmation(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {passwordStatus ? <p className="text-sm font-medium text-slate-700">{passwordStatus}</p> : <span />}
                <Button className="gap-2 sm:shrink-0" onClick={() => void updatePassword()} disabled={changingPassword}>
                  <KeyRound className="h-4 w-4" />
                  {changingPassword ? "Mise à jour..." : "Mettre à jour"}
                </Button>
              </div>
            </div>
          ) : null}

          <ActionPanel
            icon={Download}
            title="Exporter mes données"
            description="Téléchargez un fichier CSV avec votre profil, vos préférences, votre inventaire, vos courses et votre historique."
            status={accountActionStatus}
            action={
              <Button
                variant="secondary"
                type="button"
                className="gap-2 sm:shrink-0"
                onClick={() => void exportAccountData()}
                disabled={exportingData || deletingAccount || signingOut || clearingCache}
              >
                <Download className="h-4 w-4" />
                {exportingData ? "Export..." : "Exporter en CSV"}
              </Button>
            }
          />

          <ActionPanel
            icon={LogOut}
            title="Se déconnecter"
            description="Fermer la session sur cet appareil."
            action={
              <Button
                variant="secondary"
                type="button"
                className="gap-2 sm:shrink-0"
                onClick={() => setConfirmState({ type: "logout" })}
                disabled={signingOut || clearingCache || deletingAccount || exportingData}
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Déconnexion..." : "Se déconnecter"}
              </Button>
            }
          />

          <ActionPanel
            danger
            icon={Trash2}
            title="Supprimer mon compte définitivement"
            description="Cette action supprime votre compte, vos données personnelles et votre foyer si vous en êtes le seul membre."
            status={accountActionStatus}
            action={
              <Button
                variant="danger"
                type="button"
                className="gap-2 sm:shrink-0"
                onClick={() => setConfirmState({ type: "delete-account", step: "intro", phrase: "" })}
                disabled={deletingAccount || exportingData || signingOut || clearingCache}
              >
                <Trash2 className="h-4 w-4" />
                {deletingAccount ? "Suppression..." : "Supprimer mon compte"}
              </Button>
            }
          />
        </div>
      );
    }

    if (activeSection === "application") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-950">Apparence</p>
            <p className="mt-1 text-sm text-slate-600">Choisissez un thème clair, sombre, ou suivez le réglage de votre appareil.</p>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {[
                { label: "Clair", value: "light" as const },
                { label: "Sombre", value: "dark" as const },
                { label: "Système", value: "system" as const }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`h-10 rounded-lg px-2 text-sm font-semibold transition ${
                    themePreference === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  }`}
                  onClick={() => updateThemePreference(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <ActionPanel
            icon={RotateCcw}
            title="Vider le cache local"
            description="Nettoyer les données temporaires conservées sur cet appareil."
            action={
              <Button variant="secondary" className="gap-2" onClick={() => void clearLocalCache()} disabled={clearingCache || signingOut}>
                <RotateCcw className="h-4 w-4" />
                {clearingCache ? "Nettoyage..." : "Vider le cache local"}
              </Button>
            }
          />
        </div>
      );
    }

    return null;
  }

  if (!loaded) {
    return (
      <div>
        <PageHeader icon={Settings} title="Paramètres" />
        <Card className="p-6 text-sm text-slate-500">Chargement des paramètres...</Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <Settings className="mt-1 h-6 w-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold tracking-normal">
            Paramètres
            {activeSectionConfig ? (
              <span key={activeSection} className="inline-block animate-settings-breadcrumb text-slate-500">
                {" / "}
                {activeSectionConfig.title}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Ajustez le foyer, vos données personnelles, votre compte et l'application.</p>
        </div>
      </div>

      {status ? (
        <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
          {status}
        </div>
      ) : null}

      <div className="overflow-hidden">
        <div className={`flex w-[200%] transition-transform duration-300 ease-out ${activeSection ? "-translate-x-1/2" : "translate-x-0"}`}>
          <div className="w-1/2 shrink-0 space-y-3">
            {(Object.entries(settingsSectionConfigs) as Array<[SettingsSection, (typeof settingsSectionConfigs)[SettingsSection]]>).map(
              ([section, config]) => (
                <SettingsCategory
                  key={section}
                  title={config.title}
                  description={config.description}
                  icon={config.icon}
                  open={activeSection === section}
                  onToggle={() => openSection(section)}
                />
              )
            )}
          </div>

          <div className="w-1/2 shrink-0">
            {activeSectionConfig ? (
              <SettingsDetailShell
                description={activeSectionConfig.description}
                icon={activeSectionConfig.icon}
                title={activeSectionConfig.title}
                onBack={() => setActiveSection(null)}
              >
                {renderActiveSection()}
              </SettingsDetailShell>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmState?.type === "logout"}
        title="Se déconnecter ?"
        description="La session sera fermée sur cet appareil. Vous pourrez vous reconnecter à tout moment."
        confirmLabel="Se déconnecter"
        onCancel={() => setConfirmState(null)}
        onConfirm={() => void signOut()}
      />

      <ConfirmDialog
        open={confirmState?.type === "delete-account"}
        title={confirmState?.type === "delete-account" && confirmState.step === "phrase" ? "Confirmation finale" : "Supprimer le compte ?"}
        description={
          confirmState?.type === "delete-account" && confirmState.step === "phrase"
            ? "Tapez supprimer pour confirmer. Cette action est définitive."
            : "Cette action supprimera définitivement votre compte EcoFoodStock. Si vous êtes le seul membre du foyer, les données du foyer seront aussi supprimées."
        }
        confirmLabel={confirmState?.type === "delete-account" && confirmState.step === "phrase" ? "Supprimer définitivement" : "Continuer"}
        danger
        confirmDisabled={confirmState?.type === "delete-account" && confirmState.step === "phrase" && confirmState.phrase.trim().toLocaleLowerCase("fr-FR") !== "supprimer"}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState?.type === "delete-account" && confirmState.step === "intro") {
            setConfirmState({ type: "delete-account", step: "phrase", phrase: "" });
            return;
          }

          void deleteAccount();
        }}
      >
        {confirmState?.type === "delete-account" && confirmState.step === "phrase" ? (
          <input
            autoFocus
            className="mt-4 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 outline-none focus:border-brand-500"
            value={confirmState.phrase}
            placeholder="supprimer"
            onChange={(event) => setConfirmState({ type: "delete-account", step: "phrase", phrase: event.target.value })}
          />
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function MetricCard({ helper, label, value }: { helper: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function SaveSettingsFooter({ onSave, saving, status }: { onSave: () => void; saving: boolean; status: string | null }) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        {status ?? "Les paramètres sont enregistrés localement, puis synchronisés avec Supabase lors de la sauvegarde."}
      </p>
      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? "Enregistrement..." : "Enregistrer les paramètres"}
      </Button>
    </div>
  );
}

function ActionPanel({
  action,
  danger = false,
  description,
  icon: Icon,
  status,
  title
}: {
  action: ReactNode;
  danger?: boolean;
  description: string;
  icon: LucideIcon;
  status?: string | null;
  title: string;
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${danger ? "border-rose-100 bg-rose-50" : "border-slate-200 bg-white"}`}>
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${danger ? "text-rose-600" : "text-brand-700"}`} />
          <div className="min-w-0">
            <p className={`font-semibold ${danger ? "text-rose-950" : "text-slate-950"}`}>{title}</p>
            <p className={`mt-1 text-sm ${danger ? "text-rose-800" : "text-slate-600"}`}>{description}</p>
            {status ? <p className={`mt-2 text-sm font-medium ${danger ? "text-rose-800" : "text-slate-700"}`}>{status}</p> : null}
          </div>
        </div>
      </div>
      <div className="sm:shrink-0">{action}</div>
    </div>
  );
}

function SettingsCategory({
  description,
  icon: Icon,
  onToggle,
  open,
  title
}: {
  description: string;
  icon: LucideIcon;
  onToggle: () => void;
  open: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition ${
        open ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );
}

function SettingsDetailShell({
  children,
  description,
  icon: Icon,
  onBack,
  title
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  onBack: () => void;
  title: string;
}) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-700" />
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>
        <Button variant="secondary" className="h-9 gap-2 px-3" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>
      {children}
    </Card>
  );
}

function clearEcoFoodStockStorage(storage: Storage) {
  const keysToDelete: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key?.startsWith("ecofoodstock:") || key?.startsWith("ecofoodstock-")) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => storage.removeItem(key));
}

function formatSettingsSaveError(payload: { message?: string; error?: string } | null, status: number) {
  if (payload?.message && payload.error) {
    return `${payload.message}: ${payload.error}`;
  }

  if (payload?.message) {
    return payload.message;
  }

  return `Impossible d'enregistrer les paramètres pour le moment. HTTP ${status}`;
}

async function clearCacheStorage() {
  if (!("caches" in window)) {
    return;
  }

  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
