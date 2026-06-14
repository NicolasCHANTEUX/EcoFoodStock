import { defaultSettingsProfile, type SettingsProfile } from "@/lib/settings";

export const SETTINGS_PROFILE_STORAGE_KEY = "ecofoodstock:settings-profile";

type LocalSettingsProfile = Pick<SettingsProfile, "appMode" | "diet" | "householdSize">;

type StoredSettingsProfile = {
  version: 2;
  profile: LocalSettingsProfile;
};

export function toLocalSettingsProfile(profile: Partial<SettingsProfile>): LocalSettingsProfile {
  return {
    appMode: profile.appMode === "athlete" ? "athlete" : "general_public",
    diet: isDiet(profile.diet) ? profile.diet : defaultSettingsProfile.diet,
    householdSize: clampHouseholdSize(profile.householdSize)
  };
}

export function writeStoredSettingsProfile(storage: Storage, key: string, profile: SettingsProfile) {
  const payload: StoredSettingsProfile = {
    version: 2,
    profile: toLocalSettingsProfile(profile)
  };

  storage.setItem(key, JSON.stringify(payload));
}

export function readStoredSettingsProfile(storage: Storage, keys: string[]) {
  for (const key of keys) {
    const stored = storage.getItem(key);

    if (!stored) {
      continue;
    }

    const profile = parseStoredSettingsProfile(stored);

    if (profile) {
      return profile;
    }
  }

  return null;
}

export function sanitizeStoredSettingsProfiles(storage: Storage, keys: string[]) {
  for (const key of keys) {
    const stored = storage.getItem(key);

    if (!stored) {
      continue;
    }

    const profile = parseStoredSettingsProfile(stored);

    if (profile) {
      storage.setItem(key, JSON.stringify({ version: 2, profile }));
    }
  }
}

export function sanitizeAllStoredSettingsProfiles(storage: Storage) {
  const keysToSanitize: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key === SETTINGS_PROFILE_STORAGE_KEY || key?.startsWith(`${SETTINGS_PROFILE_STORAGE_KEY}:`)) {
      keysToSanitize.push(key);
    }
  }

  sanitizeStoredSettingsProfiles(storage, keysToSanitize);
}

function parseStoredSettingsProfile(raw: string): LocalSettingsProfile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettingsProfile> & Partial<SettingsProfile>;
    const profileSource = typeof parsed.profile === "object" && parsed.profile ? parsed.profile : parsed;
    return toLocalSettingsProfile(profileSource);
  } catch {
    return null;
  }
}

function isDiet(value: unknown): value is SettingsProfile["diet"] {
  return value === "omnivore" || value === "vegetarian" || value === "vegan" || value === "pescatarian";
}

function clampHouseholdSize(value: unknown) {
  const numeric = Math.round(Number(value));

  if (!Number.isFinite(numeric)) {
    return defaultSettingsProfile.householdSize;
  }

  return Math.min(12, Math.max(1, numeric));
}
