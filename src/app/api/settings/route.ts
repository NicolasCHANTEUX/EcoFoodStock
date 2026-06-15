import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildSettingsChangeSummary,
  calculateBmi,
  calculateMaintenanceCalories,
  calculateTargetCalories,
  defaultSettingsProfile,
  formatBmi,
  formatCalories,
  getGoalLabel,
  type SettingsProfile
} from "@/lib/settings";

type UserPreferencesRow = {
  household_size?: number | null;
  diet?: SettingsProfile["diet"] | null;
  app_mode?: SettingsProfile["appMode"] | null;
};

type UserHealthProfileRow = {
  weight_kg?: number | string | null;
  height_cm?: number | null;
  sex?: SettingsProfile["sex"] | null;
  birthdate?: string | null;
};

type NutritionGoalRow = {
  calories_kcal?: number | null;
};

type SettingsHistoryPayload = {
  householdId: string;
  userId: string;
  previousProfile: SettingsProfile;
  profile: SettingsProfile;
  changes: string;
};

const GOAL_ADJUSTMENT_INFERENCE_THRESHOLD = 100;

const settingsProfileSchema = z.object({
  householdSize: z.coerce.number().optional(),
  diet: z.enum(["omnivore", "vegetarian", "vegan", "pescatarian"]).optional(),
  appMode: z.enum(["general_public", "athlete"]).optional(),
  age: z.coerce.number().optional(),
  weightKg: z.coerce.number().optional(),
  heightCm: z.coerce.number().optional(),
  sex: z.enum(["male", "female", "other"]).optional(),
  goal: z.enum(["mass_gain", "cut", "maintenance"]).optional(),
  dailyCaloriesAdjustment: z.coerce.number().optional()
});

export async function GET(req: Request) {
  const access = await requireHouseholdAccess(req, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const profile = await loadSettingsProfile(access.supabase, access.context.appUserId!);
  return NextResponse.json({ ok: true, profile });
}

export async function POST(req: Request) {
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = settingsProfileSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const access = await requireHouseholdAccess(req, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, householdId, supabase } = access;
  const appUserId = context.appUserId!;
  const previousProfile = await loadSettingsProfile(supabase, appUserId);
  const profile = normalizeProfile(parsedPayload.data);
  const changes = buildSettingsChangeSummary(previousProfile, profile);

  const { error: preferencesError } = await supabase.from("user_preferences").upsert(
    {
      user_id: appUserId,
      app_mode: profile.appMode,
      household_size: profile.householdSize,
      diet: profile.diet,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (preferencesError) {
    return NextResponse.json({ ok: false, message: "Unable to save preferences", error: preferencesError.message }, { status: 500 });
  }

  const { error: healthError } = await supabase.from("user_health_profiles").upsert(
    {
      user_id: appUserId,
      sex: profile.sex,
      height_cm: Math.round(profile.heightCm),
      weight_kg: profile.weightKg,
      birthdate: ageToBirthdate(profile.age),
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (healthError) {
    return NextResponse.json({ ok: false, message: "Unable to save health profile", error: healthError.message }, { status: 500 });
  }

  const targetCalories = calculateTargetCalories(profile);
  const previousTargetCalories = calculateTargetCalories(previousProfile);

  if (targetCalories !== null && targetCalories !== previousTargetCalories) {
    await supabase
      .from("nutrition_goals")
      .update({ is_active: false })
      .eq("user_id", appUserId)
      .eq("is_active", true);

    await supabase.from("nutrition_goals").insert({
      user_id: appUserId,
      calories_kcal: targetCalories,
      is_active: true
    });
  }

  let historyEventCreated = false;

  if (changes !== "Aucune modification") {
    const activityError = await createSettingsHistoryEvent(supabase, {
      householdId,
      userId: appUserId,
      previousProfile,
      profile,
      changes
    });

    if (activityError) {
      return NextResponse.json(
        { ok: false, message: "Settings saved but history event could not be recorded", error: activityError },
        { status: 500 }
      );
    }

    historyEventCreated = true;
  }

  return NextResponse.json({ ok: true, profile, historyEventCreated });
}

async function createSettingsHistoryEvent(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  payload: SettingsHistoryPayload
) {
  const bmi = calculateBmi(payload.profile);
  const maintenanceCalories = calculateMaintenanceCalories(payload.profile);
  const targetCalories = calculateTargetCalories(payload.profile);
  const description = `${payload.changes}. IMC ${formatBmi(bmi)}, besoin ${formatCalories(maintenanceCalories)}, objectif ${getGoalLabel(payload.profile.goal)} (${payload.profile.dailyCaloriesAdjustment > 0 ? "+" : ""}${payload.profile.dailyCaloriesAdjustment} kcal, cible ${formatCalories(targetCalories)}).`;
  const baseEvent = {
    household_id: payload.householdId,
    user_id: payload.userId,
    title: "Paramètres mis à jour",
    description,
    can_undo: true,
    metadata: {
      section: "settings",
      previous_profile: payload.previousProfile,
      next_profile: payload.profile
    }
  };

  const { error: adjustedError } = await supabase.from("activity_events").insert({
    ...baseEvent,
    type: "product_adjusted"
  });

  if (!adjustedError) {
    return null;
  }

  const { error: fallbackError } = await supabase.from("activity_events").insert({
    ...baseEvent,
    type: "undo",
    metadata: {
      ...baseEvent.metadata,
      fallback_type: "settings_updated",
      original_error: adjustedError.message
    }
  });

  return fallbackError?.message ?? null;
}

async function loadSettingsProfile(supabase: ReturnType<typeof createSupabaseServerClient>, appUserId: string) {
  const { data: prefs, error: prefsErr } = await supabase
    .from("user_preferences")
    .select("household_size, diet, app_mode")
    .eq("user_id", appUserId)
    .limit(1)
    .maybeSingle<UserPreferencesRow>();

  const { data: health, error: healthErr } = await supabase
    .from("user_health_profiles")
    .select("weight_kg, height_cm, sex, birthdate")
    .eq("user_id", appUserId)
    .limit(1)
    .maybeSingle<UserHealthProfileRow>();

  const { data: goal } = await supabase
    .from("nutrition_goals")
    .select("calories_kcal")
    .eq("user_id", appUserId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<NutritionGoalRow>();

  if (prefsErr || healthErr) {
    return defaultSettingsProfile;
  }

  const profile = { ...defaultSettingsProfile };

  if (prefs) {
    if (typeof prefs.household_size === "number") profile.householdSize = prefs.household_size;
    if (isDiet(prefs.diet)) profile.diet = prefs.diet;
    if (prefs.app_mode === "athlete" || prefs.app_mode === "general_public") profile.appMode = prefs.app_mode;
  }

  if (health) {
    if (health.weight_kg !== null && health.weight_kg !== undefined) profile.weightKg = Number(health.weight_kg);
    if (typeof health.height_cm === "number") profile.heightCm = Number(health.height_cm);
    if (health.sex === "female" || health.sex === "male" || health.sex === "other") profile.sex = health.sex;
    if (health.birthdate) {
      profile.age = birthdateToAge(health.birthdate, profile.age);
    }
  }

  if (goal?.calories_kcal) {
    const maintenanceCalories = calculateMaintenanceCalories(profile);

    if (maintenanceCalories !== null) {
      const inferredAdjustment = Math.round(goal.calories_kcal - maintenanceCalories);

      if (Math.abs(inferredAdjustment) < GOAL_ADJUSTMENT_INFERENCE_THRESHOLD) {
        profile.dailyCaloriesAdjustment = 0;
        profile.goal = "maintenance";
      } else if (inferredAdjustment > 0) {
        profile.dailyCaloriesAdjustment = inferredAdjustment;
        profile.goal = "mass_gain";
      } else {
        profile.dailyCaloriesAdjustment = inferredAdjustment;
        profile.goal = "cut";
      }
    }
  }

  return profile;
}

function normalizeProfile(payload: Partial<SettingsProfile>): SettingsProfile {
  return {
    householdSize: clampInteger(payload.householdSize, 1, 12, defaultSettingsProfile.householdSize),
    diet: isDiet(payload.diet) ? payload.diet : defaultSettingsProfile.diet,
    appMode: payload.appMode === "athlete" ? "athlete" : "general_public",
    age: clampInteger(payload.age, 1, 120, defaultSettingsProfile.age),
    weightKg: clampNumber(payload.weightKg, 20, 400, defaultSettingsProfile.weightKg),
    heightCm: clampNumber(payload.heightCm, 80, 260, defaultSettingsProfile.heightCm),
    sex: payload.sex === "female" || payload.sex === "other" ? payload.sex : "male",
    goal: payload.goal === "mass_gain" || payload.goal === "cut" ? payload.goal : "maintenance",
    dailyCaloriesAdjustment: Number.isFinite(Number(payload.dailyCaloriesAdjustment)) ? Number(payload.dailyCaloriesAdjustment) : 0
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Math.round(Number(value));

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numberValue));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numberValue));
}

function isDiet(value: unknown): value is SettingsProfile["diet"] {
  return value === "omnivore" || value === "vegetarian" || value === "vegan" || value === "pescatarian";
}

function ageToBirthdate(age: number) {
  const birthdate = new Date();
  birthdate.setFullYear(birthdate.getFullYear() - age);
  return birthdate.toISOString().slice(0, 10);
}

function birthdateToAge(value: string, fallback: number) {
  const birthdate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(birthdate.getTime())) {
    return fallback;
  }

  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDelta = today.getMonth() - birthdate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthdate.getDate())) {
    age -= 1;
  }

  return Math.max(1, age);
}
