import type { AppMode } from "@/types/domain";

export type Sex = "male" | "female" | "other";
export type DietType = "omnivore" | "vegetarian" | "vegan" | "pescatarian";
export type NutritionGoal = "mass_gain" | "cut" | "maintenance";

export type SettingsProfile = {
  householdSize: number;
  diet: DietType;
  appMode: AppMode;
  age: number;
  weightKg: number;
  heightCm: number;
  sex: Sex;
  goal: NutritionGoal;
  dailyCaloriesAdjustment: number;
};

export const MIN_DAILY_CALORIES_ADJUSTMENT = -2000;
export const MAX_DAILY_CALORIES_ADJUSTMENT = 2000;

export const defaultSettingsProfile: SettingsProfile = {
  householdSize: 3,
  diet: "omnivore",
  appMode: "general_public",
  age: 21,
  weightKg: 70,
  heightCm: 178,
  sex: "male",
  goal: "maintenance",
  dailyCaloriesAdjustment: 0
};

export function normalizeDailyCaloriesAdjustment(value: unknown, fallback = 0) {
  const numberValue = Math.round(Number(value));

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(MAX_DAILY_CALORIES_ADJUSTMENT, Math.max(MIN_DAILY_CALORIES_ADJUSTMENT, numberValue));
}

export function getGoalDefaultAdjustment(goal: NutritionGoal) {
  if (goal === "mass_gain") {
    return 300;
  }

  if (goal === "cut") {
    return -200;
  }

  return 0;
}

export function getGoalLabel(goal: NutritionGoal) {
  if (goal === "mass_gain") {
    return "Prise de masse";
  }

  if (goal === "cut") {
    return "Sèche";
  }

  return "Maintien";
}

export function calculateBmi(profile: SettingsProfile) {
  if (profile.heightCm <= 0 || profile.weightKg <= 0) {
    return null;
  }

  const heightMeters = profile.heightCm / 100;
  return profile.weightKg / (heightMeters * heightMeters);
}

export function getBmiLabel(bmi?: number | null) {
  if (!bmi) {
    return "Non calculé";
  }

  if (bmi < 18.5) {
    return "Insuffisance pondérale";
  }

  if (bmi < 25) {
    return "Corpulence normale";
  }

  if (bmi < 30) {
    return "Surpoids";
  }

  return "Obésité";
}

export function calculateBmr(profile: SettingsProfile) {
  if (profile.age <= 0 || profile.heightCm <= 0 || profile.weightKg <= 0) {
    return null;
  }

  const sexOffset = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : 0;
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexOffset;
}

export function getActivityFactor(appMode: AppMode) {
  return appMode === "athlete" ? 1.55 : 1.35;
}

export function calculateMaintenanceCalories(profile: SettingsProfile) {
  const bmr = calculateBmr(profile);

  if (!bmr) {
    return null;
  }

  return Math.round(bmr * getActivityFactor(profile.appMode));
}

export function calculateTargetCalories(profile: SettingsProfile) {
  const maintenance = calculateMaintenanceCalories(profile);

  if (!maintenance) {
    return null;
  }

  const adjustment = profile.goal === "maintenance" ? 0 : profile.dailyCaloriesAdjustment;
  return Math.max(0, Math.round(maintenance + adjustment));
}

export function formatCalories(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${Math.round(value)} kcal`;
}

export function formatBmi(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(1);
}

export function buildSettingsChangeSummary(previous: SettingsProfile, next: SettingsProfile) {
  const changes: string[] = [];

  if (previous.appMode !== next.appMode) {
    changes.push(`mode ${previous.appMode === "athlete" ? "sportif" : "grand public"} → ${next.appMode === "athlete" ? "sportif" : "grand public"}`);
  }

  if (previous.householdSize !== next.householdSize) {
    changes.push(`foyer ${previous.householdSize} → ${next.householdSize} pers.`);
  }

  if (previous.diet !== next.diet) {
    changes.push(`régime ${previous.diet} → ${next.diet}`);
  }

  if (previous.age !== next.age) {
    changes.push(`âge ${previous.age} → ${next.age} ans`);
  }

  if (previous.weightKg !== next.weightKg) {
    changes.push(`poids ${previous.weightKg} → ${next.weightKg} kg`);
  }

  if (previous.heightCm !== next.heightCm) {
    changes.push(`taille ${previous.heightCm} → ${next.heightCm} cm`);
  }

  if (previous.sex !== next.sex) {
    changes.push(`sexe ${previous.sex} → ${next.sex}`);
  }

  if (previous.goal !== next.goal) {
    changes.push(`objectif ${getGoalLabel(previous.goal)} → ${getGoalLabel(next.goal)}`);
  }

  if (previous.dailyCaloriesAdjustment !== next.dailyCaloriesAdjustment) {
    changes.push(`ajustement ${previous.dailyCaloriesAdjustment > 0 ? "+" : ""}${previous.dailyCaloriesAdjustment} → ${next.dailyCaloriesAdjustment > 0 ? "+" : ""}${next.dailyCaloriesAdjustment} kcal`);
  }

  return changes.length > 0 ? changes.join(", ") : "Aucune modification";
}
