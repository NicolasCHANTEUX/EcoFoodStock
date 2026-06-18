import { NextResponse } from "next/server";
import { getRequestLogContext, logError } from "@/lib/observability/logger";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";

type ProductNutritionRow = {
  per_unit?: string | null;
  calories_kcal?: unknown;
  protein_g?: unknown;
  carbs_g?: unknown;
  fat_g?: unknown;
};

type ProductRow = {
  id?: string;
  name?: string | null;
  is_raw_fresh?: boolean | null;
  is_seasonal?: boolean | null;
  category?: string | null;
  product_nutrition?: ProductNutritionRow[] | ProductNutritionRow | null;
};

type MovementRow = {
  quantity_delta?: unknown;
  products?: ProductRow[] | ProductRow | null;
};

type BatchRow = {
  quantity_remaining?: unknown;
  products?: ProductRow[] | ProductRow | null;
};

function safeNumber(value: unknown) {
  if (value === null || value === undefined) {
    return 0;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function firstOrSelf<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCategory(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export async function GET(req: Request) {
  const access = await requireHouseholdAccess(req, { allowDemo: true, requireAuth: false });

  if (!access.ok) {
    return access.response;
  }

  const { householdId, supabase } = access;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: movements } = await supabase
      .from("inventory_movements")
      .select(
        "product_id, quantity_delta, unit, created_at, products(id, name, is_raw_fresh, is_seasonal, category, product_nutrition(per_unit, calories_kcal, protein_g, carbs_g, fat_g))"
      )
      .eq("household_id", householdId)
      .in("type", ["consume", "cook"])
      .gte("created_at", since);

    const mac = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const movementRows = Array.isArray(movements) ? (movements as unknown as MovementRow[]) : [];

    for (const movement of movementRows) {
      const quantity = Math.abs(safeNumber(movement.quantity_delta));
      const product = firstOrSelf(movement.products);
      const nutrition = firstOrSelf(product?.product_nutrition);

      if (!nutrition) {
        continue;
      }

      const match = String(nutrition.per_unit || "100").match(/(\d+(?:\.\d+)?)/);
      const perUnitValue = match ? Number(match[1]) : 100;
      const factor = perUnitValue > 0 ? quantity / perUnitValue : 0;

      mac.calories += safeNumber(nutrition.calories_kcal) * factor;
      mac.protein_g += safeNumber(nutrition.protein_g) * factor;
      mac.carbs_g += safeNumber(nutrition.carbs_g) * factor;
      mac.fat_g += safeNumber(nutrition.fat_g) * factor;
    }

    const { data: batches } = await supabase
      .from("inventory_batches")
      .select("quantity_remaining, products(id, is_raw_fresh, is_seasonal, category, name)")
      .eq("household_id", householdId)
      .eq("status", "active");

    const inventoryRows = Array.isArray(batches) ? (batches as unknown as BatchRow[]) : [];
    let totalQty = 0;
    let freshQty = 0;
    let seasonalQty = 0;
    const radarBuckets: Record<string, number> = {
      fruits: 0,
      vegetables: 0,
      starches: 0,
      dairy: 0,
      proteins: 0
    };

    for (const row of inventoryRows) {
      const quantity = safeNumber(row.quantity_remaining);
      const product = firstOrSelf(row.products);
      const category = normalizeCategory(product?.category);

      totalQty += quantity;

      if (product?.is_raw_fresh) {
        freshQty += quantity;
      }

      if (product?.is_seasonal) {
        seasonalQty += quantity;
      }

      if (category.includes("fruit")) {
        radarBuckets.fruits += quantity;
      } else if (category.includes("legume") || category.includes("veget")) {
        radarBuckets.vegetables += quantity;
      } else if (category.includes("feculent") || category.includes("pate") || category.includes("riz")) {
        radarBuckets.starches += quantity;
      } else if (category.includes("lait") || category.includes("yaourt") || category.includes("fromage")) {
        radarBuckets.dairy += quantity;
      } else {
        radarBuckets.proteins += quantity;
      }
    }

    const freshnessRatio =
      totalQty > 0
        ? {
            fresh: Math.round((freshQty / totalQty) * 100),
            processed: Math.round(((totalQty - freshQty) / totalQty) * 100)
          }
        : { fresh: 0, processed: 0 };
    const seasonalityScore = totalQty > 0 ? Math.round((seasonalQty / totalQty) * 100) : 0;
    const maxRadar = Math.max(...Object.values(radarBuckets), 1);
    const radar = Object.fromEntries(
      Object.entries(radarBuckets).map(([key, value]) => [key, Math.round((value / maxRadar) * 100)])
    );

    return NextResponse.json({
      ok: true,
      macronutrients: {
        calories: Math.round(mac.calories),
        protein_g: Math.round(mac.protein_g),
        carbs_g: Math.round(mac.carbs_g),
        fat_g: Math.round(mac.fat_g)
      },
      freshnessRatio,
      radar,
      seasonalityScore
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError("health.summary_failed", error, getRequestLogContext(req, "/api/health/summary"));
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
