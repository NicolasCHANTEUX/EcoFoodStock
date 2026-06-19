import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestLogContext, logWarn } from "@/lib/observability/logger";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";

type ExportRow = {
  section: string;
  key: string;
  value: string;
  date: string;
};

export async function GET(request: Request) {
  const access = await requireHouseholdAccess(request, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, supabase } = access;
  const appUserId = context.appUserId!;
  const rateLimit = await checkRateLimits([
    {
      scope: "account_export:ip",
      subject: rateLimitSubject(getClientIp(request)),
      limit: 20,
      windowSeconds: 60 * 60
    },
    {
      scope: "account_export:user",
      subject: rateLimitSubject(appUserId),
      limit: 5,
      windowSeconds: 24 * 60 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  const rows = await buildExportRows(supabase, appUserId);
  const csv = toCsv(rows);
  const today = new Date().toISOString().slice(0, 10);

  const { error: exportLogError } = await supabase.from("data_exports").insert({
    user_id: appUserId,
    format: "csv",
    status: "ready",
    requested_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  if (exportLogError) {
    logWarn("account.export_log_failed", "Data export was generated but could not be recorded", {
      ...getRequestLogContext(request, "/api/account/export"),
      error: exportLogError.message
    });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ecofoodstock-export-${today}.csv"`
    }
  });
}

async function buildExportRows(supabase: SupabaseClient, appUserId: string) {
  const rows: ExportRow[] = [];

  const { data: user } = await supabase.from("users").select("*").eq("id", appUserId).maybeSingle<Record<string, unknown>>();
  const { data: preferences } = await supabase.from("user_preferences").select("*").eq("user_id", appUserId).maybeSingle<Record<string, unknown>>();
  const { data: healthProfile } = await supabase.from("user_health_profiles").select("*").eq("user_id", appUserId).maybeSingle<Record<string, unknown>>();
  const { data: nutritionGoals } = await supabase
    .from("nutrition_goals")
    .select("*")
    .eq("user_id", appUserId)
    .order("created_at", { ascending: false })
    .returns<Record<string, unknown>[]>();
  const { data: memberships } = await supabase
    .from("household_members")
    .select("household_id, role, joined_at")
    .eq("user_id", appUserId)
    .returns<Array<{ household_id: string; role: string; joined_at: string }>>();

  addObjectRows(rows, "compte", user, "id");
  addObjectRows(rows, "preferences", preferences, "user_id");
  addObjectRows(rows, "profil_sante", healthProfile, "user_id");
  addCollectionRows(rows, "objectifs_nutrition", nutritionGoals ?? [], "id");
  addCollectionRows(rows, "foyers", memberships ?? [], "household_id");

  const householdIds = Array.from(new Set((memberships ?? []).map((membership) => membership.household_id)));

  if (householdIds.length === 0) {
    return rows;
  }

  const { data: inventory } = await supabase
    .from("active_inventory_summary")
    .select("*")
    .in("household_id", householdIds)
    .order("name", { ascending: true })
    .returns<Record<string, unknown>[]>();
  const { data: inventoryBatches } = await supabase
    .from("inventory_batches")
    .select("id, household_id, product_id, quantity_initial, quantity_remaining, unit, storage_area, expiration_date, status, source, created_at, updated_at")
    .in("household_id", householdIds)
    .order("created_at", { ascending: false })
    .returns<Record<string, unknown>[]>();
  const { data: shoppingLists } = await supabase
    .from("shopping_lists")
    .select("id, household_id, name, is_active, created_at, archived_at")
    .in("household_id", householdIds)
    .order("created_at", { ascending: false })
    .returns<Array<Record<string, unknown> & { id: string }>>();
  const { data: activityEvents } = await supabase
    .from("activity_events")
    .select("id, household_id, type, title, description, can_undo, undone_at, metadata, created_at")
    .in("household_id", householdIds)
    .order("created_at", { ascending: false })
    .returns<Record<string, unknown>[]>();

  addCollectionRows(rows, "inventaire_resume", inventory ?? [], "product_id");
  addCollectionRows(rows, "lots_inventaire", inventoryBatches ?? [], "id");
  addCollectionRows(rows, "listes_courses", shoppingLists ?? [], "id");
  addCollectionRows(rows, "historique", activityEvents ?? [], "id");

  const shoppingListIds = (shoppingLists ?? []).map((list) => list.id).filter(Boolean);

  if (shoppingListIds.length > 0) {
    const { data: shoppingItems } = await supabase
      .from("shopping_items")
      .select("id, shopping_list_id, label, quantity, unit, category, status, source, checked_at, transferred_at, created_at, updated_at")
      .in("shopping_list_id", shoppingListIds)
      .order("created_at", { ascending: false })
      .returns<Record<string, unknown>[]>();

    addCollectionRows(rows, "articles_courses", shoppingItems ?? [], "id");
  }

  return rows;
}

function addObjectRows(rows: ExportRow[], section: string, value: Record<string, unknown> | null | undefined, keyField: string) {
  if (!value) {
    return;
  }

  addCollectionRows(rows, section, [value], keyField);
}

function addCollectionRows(rows: ExportRow[], section: string, values: Record<string, unknown>[], keyField: string) {
  values.forEach((value, index) => {
    rows.push({
      section,
      key: String(value[keyField] ?? `${section}_${index + 1}`),
      value: JSON.stringify(value),
      date: String(value.created_at ?? value.updated_at ?? value.joined_at ?? "")
    });
  });
}

function toCsv(rows: ExportRow[]) {
  const header = ["section", "key", "value", "date"];
  const lines = rows.map((row) => [row.section, row.key, row.value, row.date].map(escapeCsvCell).join(","));
  return [header.join(","), ...lines].join("\n");
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
