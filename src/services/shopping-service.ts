import { apiResult, isMissingRpcError, isRecord, type ApiResult } from "@/lib/api/responses";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatQuantity, normalizeQuantityUnit } from "@/lib/units";
import type { ShoppingGroup } from "@/types/domain";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

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

export type ShoppingActionPayload =
  | {
      action: "add_item";
      label: string;
      quantity: number;
      unit: string;
      category: string;
    }
  | {
      action: "toggle_item";
      itemId: string;
      checked: boolean;
    }
  | {
      action: "toggle_all";
      checked: boolean;
    }
  | {
      action: "delete_item";
      itemId: string;
    }
  | {
      action: "complete_list";
    }
  | {
      action: "archive_list";
    };

type ShoppingCompletedSession = {
  completedAt: string;
  groups: ShoppingGroup[];
};

type ShoppingState = {
  groups: ShoppingGroup[];
  completedSession: ShoppingCompletedSession | null;
};

type ShoppingStateBody = ShoppingState & {
  ok: true;
  [key: string]: unknown;
};

type ShoppingRpcBody = {
  ok?: boolean;
  status?: number;
  message?: string;
  [key: string]: unknown;
};

type ShoppingMutationBody = ShoppingStateBody | ShoppingRpcBody;

const COMPLETED_SESSION_VISIBLE_MS = 24 * 60 * 60 * 1000;

export async function loadShoppingState(supabase: SupabaseServerClient, householdId: string): Promise<ShoppingState> {
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

  let groups: ShoppingGroup[] = [];

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

  let completedSession: ShoppingCompletedSession | null = null;

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

export async function mutateShoppingState(
  supabase: SupabaseServerClient,
  payload: {
    householdId: string;
    userId: string;
    action: ShoppingActionPayload;
  }
): Promise<ApiResult<ShoppingMutationBody>> {
  const mutationResult = await applyShoppingAction(supabase, payload);

  if (mutationResult.body.ok !== true) {
    return mutationResult;
  }

  const state = await loadShoppingState(supabase, payload.householdId);
  return apiResult({ ok: true, ...state });
}

export function normalizeShoppingCategory(value: unknown) {
  if (value === "fresh" || value === "frozen" || value === "dry") {
    return value;
  }

  return "other";
}

async function applyShoppingAction(
  supabase: SupabaseServerClient,
  payload: {
    householdId: string;
    userId: string;
    action: ShoppingActionPayload;
  }
): Promise<ApiResult<ShoppingRpcBody>> {
  const { data, error } = await supabase.rpc("apply_shopping_action", {
    p_household_id: payload.householdId,
    p_user_id: payload.userId,
    ...toShoppingActionRpcPayload(payload.action)
  });

  if (error) {
    console.error("apply_shopping_action rpc failed", {
      code: error.code,
      message: error.message
    });

    return apiResult(
      {
        ok: false,
        message: isMissingRpcError(error.message, error.code, "apply_shopping_action")
          ? "Shopping transaction RPC is not installed"
          : "Unable to apply shopping action in database transaction"
      },
      isMissingRpcError(error.message, error.code, "apply_shopping_action") ? 503 : 500
    );
  }

  if (!isRecord<ShoppingRpcBody>(data)) {
    console.error("apply_shopping_action rpc returned an unexpected payload", data);
    return apiResult({ ok: false, message: "Shopping transaction returned an invalid response" }, 500);
  }

  return apiResult(data);
}

function toShoppingActionRpcPayload(action: ShoppingActionPayload) {
  const rpcPayload = {
    p_action: action.action,
    p_item_id: null as string | null,
    p_label: null as string | null,
    p_quantity: null as number | null,
    p_unit: null as string | null,
    p_category: null as string | null,
    p_checked: null as boolean | null
  };

  if (action.action === "add_item") {
    rpcPayload.p_label = action.label;
    rpcPayload.p_quantity = action.quantity;
    rpcPayload.p_unit = action.unit;
    rpcPayload.p_category = action.category;
  } else if (action.action === "toggle_item") {
    rpcPayload.p_item_id = action.itemId;
    rpcPayload.p_checked = action.checked;
  } else if (action.action === "toggle_all") {
    rpcPayload.p_checked = action.checked;
  } else if (action.action === "delete_item") {
    rpcPayload.p_item_id = action.itemId;
  }

  return rpcPayload;
}

function groupShoppingItems(items: ShoppingItemRow[]): ShoppingGroup[] {
  const grouped = new Map<string, ShoppingGroup["items"]>();

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
    return "Surgeles";
  }

  if (value === "dry") {
    return "Epicerie";
  }

  return "Autres";
}

function formatQuantityLabel(quantity: number | null, unit: string | null) {
  if (!quantity || quantity <= 0) {
    return "A definir";
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
