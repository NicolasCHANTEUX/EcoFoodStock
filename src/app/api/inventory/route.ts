import { NextResponse } from "next/server";
import { canUseDemoMode } from "@/lib/supabase/account-context";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { mockInventory } from "@/lib/mock-data";
import { proxiedOffImageUrl } from "@/lib/image-proxy";
import { formatExpirationLabel, getExpirationStatus } from "@/lib/expiration";
import { createIconLabel, createInventoryLineId, normalizeStorageArea } from "@/lib/inventory-lines";
import { normalizeQuantityUnit } from "@/lib/units";

type InventorySummaryRow = {
  household_id: string;
  product_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode?: string | null;
  image_url: string | null;
  storage_area: string;
  nearest_expiration_date: string | null;
  total_quantity_remaining: number;
  unit: string;
};

export async function GET(req: Request) {
  const access = await requireHouseholdAccess(req, { allowDemo: true, requireAuth: false });

  if (!access.ok) {
    if (canUseDemoMode()) {
      return NextResponse.json({ ok: true, inventory: mockInventory });
    }
    return access.response;
  }

  const { supabase } = access;

  const { data, error } = await supabase
    .from("active_inventory_summary")
    .select("household_id, product_id, name, brand, category, image_url, storage_area, nearest_expiration_date, total_quantity_remaining, unit")
    .eq("household_id", access.householdId)
    .order("nearest_expiration_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error || !data) {
    if (canUseDemoMode()) {
      return NextResponse.json({ ok: true, inventory: mockInventory, warning: error?.message ?? "inventory_view_fallback" });
    }
    return NextResponse.json({ ok: false, message: "Unable to load inventory", error: error?.message }, { status: 500 });
  }

  const rows = data as InventorySummaryRow[];

  const inventory = rows.map((row) => ({
    id: createInventoryLineId(row.product_id, row.storage_area, row.unit),
    productId: row.product_id,
    name: row.name,
    icon: createIconLabel(row.name),
    imageUrl: proxiedOffImageUrl(row.image_url ?? undefined),
    quantity: Number(row.total_quantity_remaining),
    unit: normalizeQuantityUnit(row.unit),
    storageArea: normalizeStorageArea(row.storage_area),
    expirationDate: row.nearest_expiration_date ?? undefined,
    expirationLabel: formatExpirationLabel(row.nearest_expiration_date ?? undefined),
    dlcStatus: getExpirationStatus(row.nearest_expiration_date ?? undefined)
  }));

  return NextResponse.json({ ok: true, inventory });
}
