import { NextResponse } from "next/server";
import { calculateTargetCalories, type SettingsProfile } from "@/lib/settings";
import { ensureUserHousehold, resolveAccountContext } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OnboardingPayload = SettingsProfile & {
  notifications?: {
    expiryAlerts?: boolean;
    nutritionReminders?: boolean;
    recipeSuggestions?: boolean;
  };
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Partial<OnboardingPayload> | null;

  if (!payload) {
    return NextResponse.json({ ok: false, message: "Payload JSON required" }, { status: 400 });
  }

  let supabase;

  try {
    supabase = createSupabaseServerClient();
  } catch {
    return NextResponse.json({ ok: false, message: "Supabase server client not configured" }, { status: 500 });
  }

  const context = await resolveAccountContext(request, supabase);

  if (!context.authenticated || !context.appUserId) {
    return NextResponse.json({ ok: false, message: "Utilisateur non authentifie" }, { status: 401 });
  }

  try {
    await ensureUserHousehold(supabase, context);
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Unable to resolve household", error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }

  const profile = normalizeProfile(payload);
  const notifications = payload.notifications ?? {};

  const { error: preferencesError } = await supabase.from("user_preferences").upsert(
    {
      user_id: context.appUserId,
      app_mode: profile.appMode,
      household_size: profile.householdSize,
      diet: profile.diet
    },
    { onConflict: "user_id" }
  );

  if (preferencesError) {
    return NextResponse.json({ ok: false, message: "Unable to save preferences", error: preferencesError.message }, { status: 500 });
  }

  const { error: healthError } = await supabase.from("user_health_profiles").upsert(
    {
      user_id: context.appUserId,
      sex: profile.sex,
      height_cm: Math.round(profile.heightCm),
      weight_kg: profile.weightKg,
      birthdate: ageToBirthdate(profile.age)
    },
    { onConflict: "user_id" }
  );

  if (healthError) {
    return NextResponse.json({ ok: false, message: "Unable to save health profile", error: healthError.message }, { status: 500 });
  }

  const targetCalories = calculateTargetCalories(profile);

  if (targetCalories !== null) {
    await supabase
      .from("nutrition_goals")
      .update({ is_active: false })
      .eq("user_id", context.appUserId)
      .eq("is_active", true);

    await supabase.from("nutrition_goals").insert({
      user_id: context.appUserId,
      calories_kcal: targetCalories,
      is_active: true
    });
  }

  await supabase.from("notification_preferences").upsert(
    {
      user_id: context.appUserId,
      expiration_alert_enabled: notifications.expiryAlerts ?? true,
      weekly_summary_enabled: notifications.nutritionReminders ?? true
    },
    { onConflict: "user_id" }
  );

  const { error: userError } = await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", context.appUserId);

  if (userError) {
    return NextResponse.json({ ok: false, message: "Unable to mark onboarding complete", error: userError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function normalizeProfile(payload: Partial<OnboardingPayload>): SettingsProfile {
  return {
    householdSize: clampInteger(payload.householdSize, 1, 12, 1),
    diet: isDiet(payload.diet) ? payload.diet : "omnivore",
    appMode: payload.appMode === "athlete" ? "athlete" : "general_public",
    age: clampInteger(payload.age, 1, 120, 30),
    weightKg: clampNumber(payload.weightKg, 20, 400, 70),
    heightCm: clampNumber(payload.heightCm, 80, 260, 175),
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

function ageToBirthdate(age: number) {
  const birthdate = new Date();
  birthdate.setFullYear(birthdate.getFullYear() - age);
  return birthdate.toISOString().slice(0, 10);
}

function isDiet(value: unknown): value is SettingsProfile["diet"] {
  return value === "omnivore" || value === "vegetarian" || value === "vegan" || value === "pescatarian";
}

