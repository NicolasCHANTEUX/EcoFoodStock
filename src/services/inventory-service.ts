import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiResult, isMissingRpcError, isRecord, type ApiResult } from "@/lib/api/responses";
import { logError } from "@/lib/observability/logger";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export type InventoryAction = "consume" | "waste" | "adjust";

export type InventoryProductInput = {
  id?: string;
  barcode?: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  source?: string;
  default_storage_area?: string;
  default_unit?: string;
};

export type CreateInventoryBatchInput = {
  householdId: string;
  userId?: string | null;
  product: InventoryProductInput;
  quantity: number;
  unit: string;
  storageArea: string;
  expirationDate?: string | null;
  notes?: string | null;
};

export type ApplyInventoryActionInput = {
  householdId: string;
  userId?: string | null;
  productId: string;
  action: InventoryAction;
  quantity: number;
  storageArea?: string;
  unit?: string;
};

type InventoryRpcBody = {
  ok?: boolean;
  status?: number;
  message?: string;
  [key: string]: unknown;
};

export async function createInventoryBatch(
  supabase: SupabaseServerClient,
  payload: CreateInventoryBatchInput
): Promise<ApiResult<InventoryRpcBody>> {
  const productId = await resolveInventoryProductId(supabase, payload.product).catch((error) => {
    logError("inventory.product_upsert_failed", error, { operation: "resolve_inventory_product" });
    return undefined;
  });

  if (!productId) {
    return apiResult({ ok: false, message: "Unable to save product before stock update" }, 500);
  }

  const source = payload.product.barcode ? "scan" : "manual";
  const { data, error } = await supabase.rpc("create_inventory_batch_with_activity", {
    p_household_id: payload.householdId,
    p_user_id: payload.userId ?? null,
    p_product_id: productId,
    p_product_name: payload.product.name,
    p_quantity: payload.quantity,
    p_unit: payload.unit,
    p_storage_area: payload.storageArea,
    p_expiration_date: payload.expirationDate ?? null,
    p_notes: payload.notes ?? null,
    p_source: source
  });

  if (error) {
    logError("inventory.create_batch_rpc_failed", new Error(error.message), {
      operation: "create_inventory_batch_with_activity",
      code: error.code
    });

    return apiResult(
      {
        ok: false,
        message: isMissingRpcError(error.message, error.code, "create_inventory_batch_with_activity")
          ? "Inventory transaction RPC is not installed"
          : "Unable to create inventory batch in database transaction"
      },
      isMissingRpcError(error.message, error.code, "create_inventory_batch_with_activity") ? 503 : 500
    );
  }

  if (!isRecord<InventoryRpcBody>(data)) {
    logError("inventory.create_batch_invalid_payload", new Error("Inventory RPC returned an invalid payload"), {
      operation: "create_inventory_batch_with_activity",
      payloadType: typeof data
    });
    return apiResult({ ok: false, message: "Inventory transaction returned an invalid response" }, 500);
  }

  return apiResult(data);
}

export async function applyInventoryAction(
  supabase: SupabaseServerClient,
  payload: ApplyInventoryActionInput
): Promise<ApiResult<InventoryRpcBody>> {
  const { data, error } = await supabase.rpc("apply_inventory_action", {
    p_household_id: payload.householdId,
    p_user_id: payload.userId ?? null,
    p_product_id: extractProductId(payload.productId),
    p_action: payload.action,
    p_quantity: payload.quantity,
    p_storage_area: payload.storageArea ?? null,
    p_unit: payload.unit ?? null
  });

  if (error) {
    logError("inventory.action_rpc_failed", new Error(error.message), {
      operation: "apply_inventory_action",
      code: error.code
    });

    return apiResult(
      {
        ok: false,
        message: isMissingRpcError(error.message, error.code, "apply_inventory_action")
          ? "Inventory action transaction RPC is not installed"
          : "Unable to apply inventory action in database transaction"
      },
      isMissingRpcError(error.message, error.code, "apply_inventory_action") ? 503 : 500
    );
  }

  if (!isRecord<InventoryRpcBody>(data)) {
    logError("inventory.action_invalid_payload", new Error("Inventory action RPC returned an invalid payload"), {
      operation: "apply_inventory_action",
      payloadType: typeof data
    });
    return apiResult({ ok: false, message: "Inventory action transaction returned an invalid response" }, 500);
  }

  return apiResult(data);
}

async function resolveInventoryProductId(supabase: SupabaseServerClient, product: InventoryProductInput) {
  if (product.id) {
    return product.id;
  }

  const upsertPayload: Record<string, unknown> = {
    name: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    image_url: product.imageUrl ?? null,
    source: product.source ?? "manual",
    default_storage_area: product.default_storage_area ?? "other",
    default_unit: product.default_unit ?? "pieces"
  };

  if (product.barcode) {
    upsertPayload.barcode = product.barcode;
  }

  const { data: storedProduct, error: upsertError } = await supabase
    .from("products")
    .upsert(upsertPayload, product.barcode ? { onConflict: "barcode" } : undefined)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (upsertError) {
    throw upsertError;
  }

  return storedProduct?.id;
}

function extractProductId(value: string) {
  return value.includes(":") ? value.split(":")[0] : value;
}
