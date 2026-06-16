import { NextResponse } from "next/server";
import { z } from "zod";
import { buildActivityEventInsert } from "@/lib/activity-events";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatQuantity, normalizeQuantityUnit } from "@/lib/units";

type ShoppingListRow = {
  id: string;
  household_id: string;
  is_active: boolean;
  archived_at: string | null;
};

type ShoppingItemRow = {
  id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  status: "active" | "checked" | "archived";
};

const COMPLETED_SESSION_VISIBLE_MS = 24 * 60 * 60 * 1000;

const categorySchema = z.preprocess((value) => normalizeCategory(value), z.enum(["fresh", "frozen", "dry", "other"]));
const quantityUnitSchema = z.preprocess(
  (value) => normalizeQuantityUnit(value),
  z.enum(["g", "ml", "pieces", "portions", "pots", "paquets", "bouteilles"])
);

const shoppingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_item"),
    label: z.string().trim().min(1),
    quantity: z.coerce.number().positive(),
    unit: quantityUnitSchema,
    category: categorySchema
  }),
  z.object({
    action: z.literal("toggle_item"),
    itemId: z.string().trim().min(1),
    checked: z.coerce.boolean()
  }),
  z.object({
    action: z.literal("toggle_all"),
    checked: z.coerce.boolean()
  }),
  z.object({
    action: z.literal("delete_item"),
    itemId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("complete_list")
  }),
  z.object({
    action: z.literal("archive_list")
  })
]);

export async function GET(req: Request) {
  const access = await requireHouseholdAccess(req, { allowDemo: true, requireAuth: false });

  if (!access.ok) {
    return access.response;
  }

  const state = await loadShoppingState(access.supabase, access.householdId);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request) {
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = shoppingActionSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const payload = parsedPayload.data;
  const access = await requireHouseholdAccess(req, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, householdId, supabase } = access;

  if (payload.action === "add_item") {
    const listId = await getOrCreateActiveListId(supabase, householdId).catch((error) => {
      console.error("shopping active list creation failed", error);
      return null;
    });

    if (!listId) {
      return shoppingMutationError();
    }

    const { error } = await supabase.from("shopping_items").insert({
      shopping_list_id: listId,
      label: payload.label,
      quantity: payload.quantity,
      unit: payload.unit,
      category: payload.category,
      status: "active",
      source: "manual",
      added_by: context.appUserId ?? null
    });

    if (error) {
      console.error("shopping item insert failed", error.message);
      return shoppingMutationError();
    }
  } else if (payload.action === "toggle_item") {
    const listId = await getActiveListId(supabase, householdId);

    if (!listId) {
      return NextResponse.json({ ok: false, message: "No active shopping list" }, { status: 400 });
    }

    const { error } = await supabase
      .from("shopping_items")
      .update({
        status: payload.checked ? "checked" : "active",
        checked_at: payload.checked ? new Date().toISOString() : null,
        checked_by: payload.checked ? context.appUserId ?? null : null
      })
      .eq("id", payload.itemId)
      .eq("shopping_list_id", listId);

    if (error) {
      console.error("shopping item update failed", error.message);
      return shoppingMutationError();
    }
  } else if (payload.action === "toggle_all") {
    const listId = await getActiveListId(supabase, householdId);

    if (!listId) {
      return NextResponse.json({ ok: false, message: "No active shopping list" }, { status: 400 });
    }

    const { error } = await supabase
      .from("shopping_items")
      .update({
        status: payload.checked ? "checked" : "active",
        checked_at: payload.checked ? new Date().toISOString() : null,
        checked_by: payload.checked ? context.appUserId ?? null : null
      })
      .eq("shopping_list_id", listId)
      .in("status", ["active", "checked"]);

    if (error) {
      console.error("shopping items bulk update failed", error.message);
      return shoppingMutationError();
    }
  } else if (payload.action === "delete_item") {
    const listId = await getActiveListId(supabase, householdId);

    if (!listId) {
      return NextResponse.json({ ok: false, message: "No active shopping list" }, { status: 400 });
    }

    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", payload.itemId)
      .eq("shopping_list_id", listId);

    if (error) {
      console.error("shopping item delete failed", error.message);
      return shoppingMutationError();
    }
  } else if (payload.action === "complete_list" || payload.action === "archive_list") {
    const { data: activeList } = await supabase
      .from("shopping_lists")
      .select("id, household_id, is_active, archived_at")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ShoppingListRow>();

    if (!activeList) {
      return NextResponse.json({ ok: false, message: "No active shopping list" }, { status: 400 });
    }

    const { data: checkedItems } = await supabase
      .from("shopping_items")
      .select("id, label, quantity, unit, category, status")
      .eq("shopping_list_id", activeList.id)
      .eq("status", "checked")
      .returns<ShoppingItemRow[]>();

    const archivedAt = new Date().toISOString();

    await supabase
      .from("shopping_items")
      .update({ status: "archived" })
      .eq("shopping_list_id", activeList.id)
      .eq("status", "active");

    const { error: archiveError } = await supabase
      .from("shopping_lists")
      .update({ is_active: false, archived_at: archivedAt })
      .eq("id", activeList.id);

    if (archiveError) {
      console.error("shopping list archive failed", archiveError.message);
      return shoppingMutationError();
    }

    if ((checkedItems ?? []).length > 0) {
      await supabase.from("activity_events").insert(
        buildActivityEventInsert({
          household_id: householdId,
          user_id: context.appUserId ?? null,
          type: "shopping_finished",
          title: "Courses terminées",
          description: `${checkedItems?.length ?? 0} article(s) cochés`,
          can_undo: false,
          metadata: {
            source: "shopping",
            shopping_list_id: activeList.id,
            completed_at: archivedAt
          }
        })
      );
    }
  } else {
    return NextResponse.json({ ok: false, message: "Unsupported action" }, { status: 400 });
  }

  const state = await loadShoppingState(supabase, householdId);
  return NextResponse.json({ ok: true, ...state });
}

async function loadShoppingState(supabase: ReturnType<typeof createSupabaseServerClient>, householdId: string) {
  const { data: activeList } = await supabase
    .from("shopping_lists")
    .select("id, household_id, is_active, archived_at")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ShoppingListRow>();

  const { data: archivedList } = await supabase
    .from("shopping_lists")
    .select("id, household_id, is_active, archived_at")
    .eq("household_id", householdId)
    .eq("is_active", false)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(1)
    .maybeSingle<ShoppingListRow>();

  let groups: Array<{ category: string; items: Array<{ id: string; label: string; quantity: string; icon: string; checked: boolean }> }> = [];

  if (activeList) {
    const { data: activeItems } = await supabase
      .from("shopping_items")
      .select("id, label, quantity, unit, category, status")
      .eq("shopping_list_id", activeList.id)
      .in("status", ["active", "checked"])
      .order("created_at", { ascending: true })
      .returns<ShoppingItemRow[]>();

    groups = groupShoppingItems(activeItems ?? []);
  }

  let completedSession: {
    completedAt: string;
    groups: Array<{ category: string; items: Array<{ id: string; label: string; quantity: string; icon: string; checked: boolean }> }>;
  } | null = null;

  if (archivedList?.archived_at && isRecentCompletedSession(archivedList.archived_at)) {
    const { data: checkedItems } = await supabase
      .from("shopping_items")
      .select("id, label, quantity, unit, category, status")
      .eq("shopping_list_id", archivedList.id)
      .eq("status", "checked")
      .order("updated_at", { ascending: true })
      .returns<ShoppingItemRow[]>();

    const checkedGroups = groupShoppingItems(checkedItems ?? []);
    if (checkedGroups.length > 0) {
      completedSession = {
        completedAt: archivedList.archived_at,
        groups: checkedGroups
      };
    }
  }

  return { groups, completedSession };
}

async function getOrCreateActiveListId(supabase: ReturnType<typeof createSupabaseServerClient>, householdId: string) {
  const existingId = await getActiveListId(supabase, householdId);

  if (existingId) {
    return existingId;
  }

  const { data: created, error } = await supabase
    .from("shopping_lists")
    .insert({ household_id: householdId, is_active: true, name: "Liste active" })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !created?.id) {
    throw new Error(error?.message ?? "Unable to create shopping list");
  }

  return created.id;
}

async function getActiveListId(supabase: ReturnType<typeof createSupabaseServerClient>, householdId: string) {
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return existing?.id ?? null;
}

function normalizeCategory(value: unknown) {
  if (value === "fresh" || value === "frozen" || value === "dry") {
    return value;
  }

  return "other";
}

function shoppingMutationError() {
  return NextResponse.json(
    { ok: false, message: "Impossible de mettre à jour la liste de courses pour le moment." },
    { status: 500 }
  );
}

function groupShoppingItems(items: ShoppingItemRow[]) {
  const grouped = new Map<string, Array<{ id: string; label: string; quantity: string; icon: string; checked: boolean }>>();

  items.forEach((item) => {
    const category = categoryLabel(item.category);
    const existing = grouped.get(category) ?? [];
    existing.push({
      id: item.id,
      label: item.label,
      quantity: formatQuantityLabel(item.quantity, item.unit),
      icon: createIconLabel(item.label),
      checked: item.status === "checked"
    });
    grouped.set(category, existing);
  });

  return Array.from(grouped.entries()).map(([category, groupedItems]) => ({
    category,
    items: groupedItems
  }));
}

function categoryLabel(value: string) {
  if (value === "fresh") {
    return "Frais";
  }

  if (value === "frozen") {
    return "Surgelés";
  }

  if (value === "dry") {
    return "Épicerie";
  }

  return "Autres";
}

function formatQuantityLabel(quantity: number | null, unit: string | null) {
  if (!quantity || quantity <= 0) {
    return "À définir";
  }

  return formatQuantity(quantity, normalizeQuantityUnit(unit));
}

function isRecentCompletedSession(archivedAt: string) {
  const archivedTime = Date.parse(archivedAt);

  if (!Number.isFinite(archivedTime)) {
    return false;
  }

  return Date.now() - archivedTime < COMPLETED_SESSION_VISIBLE_MS;
}

function createIconLabel(name: string) {
  const compact = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  return compact || "PR";
}
