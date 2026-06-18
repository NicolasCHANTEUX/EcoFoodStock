import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { proxiedOffImageUrl } from "@/lib/image-proxy";
import { lookupOpenFoodFactsProductStatus, type OpenFoodFactsLookupResult } from "@/lib/open-food-facts";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
import { resolveAccountContext } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ barcode: string }>;
};

type StorageArea = "fresh" | "frozen" | "dry" | "other";
type QuantityUnit = "g" | "ml" | "pieces";
type OffFetchStatus = "unknown" | "found" | "not_found" | "error";

type CatalogProductRow = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  source: string;
  default_storage_area: StorageArea | string;
  default_unit: string;
  off_last_fetched_at: string | null;
  off_fetch_status: OffFetchStatus | string | null;
  off_quantity_text: string | null;
  off_quantity_value: number | string | null;
  off_quantity_unit: QuantityUnit | string | null;
  off_storage_area: StorageArea | string | null;
};

type OffProductEnrichment = {
  brand?: string;
  category?: string;
  imageUrl?: string;
  quantityText?: string;
  quantityValue?: number;
  quantityUnit?: QuantityUnit;
  storageArea?: StorageArea;
};

const CATALOG_PRODUCT_SELECT = [
  "id",
  "barcode",
  "name",
  "brand",
  "category",
  "image_url",
  "source",
  "default_storage_area",
  "default_unit",
  "off_last_fetched_at",
  "off_fetch_status",
  "off_quantity_text",
  "off_quantity_value",
  "off_quantity_unit",
  "off_storage_area"
].join(", ");

const OFF_PERSISTED_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OFF_PERSISTED_NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const OFF_PERSISTED_ERROR_TTL_MS = 5 * 60 * 1000;

export async function GET(req: Request, { params }: RouteContext) {
  const { barcode: rawBarcode } = await params;
  const barcode = rawBarcode.trim();

  if (!isSupportedBarcode(barcode)) {
    return NextResponse.json({ ok: false, message: "Invalid barcode" }, { status: 400 });
  }

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimits([
    {
      scope: "product_lookup:ip",
      subject: rateLimitSubject(clientIp),
      limit: 120,
      windowSeconds: 10 * 60
    },
    {
      scope: "product_lookup:barcode",
      subject: rateLimitSubject(clientIp, barcode),
      limit: 30,
      windowSeconds: 10 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  const supabase = (() => {
    try {
      return createSupabaseServerClient();
    } catch {
      return null;
    }
  })();
  let canWriteCatalog = false;

  if (supabase) {
    const context = await resolveAccountContext(req, supabase);
    canWriteCatalog = Boolean(context.authenticated && context.appUserId);
  }

  if (supabase) {
    const { data: existingProduct, error: productError } = await supabase
      .from("products")
      .select(CATALOG_PRODUCT_SELECT)
      .eq("barcode", barcode)
      .maybeSingle<CatalogProductRow>();

    if (!productError && existingProduct) {
      const persistedOffProduct = getPersistedOffProduct(existingProduct);

      if (isPersistedOffCacheFresh(existingProduct)) {
        return NextResponse.json({
          ok: true,
          found: true,
          source: "supabase",
          product: buildCatalogProductResponse(existingProduct, barcode, persistedOffProduct)
        });
      }

      const offLookup = await lookupOpenFoodFactsProductStatus(barcode).catch(() => ({ status: "error" as const }));

      if (offLookup.status === "found") {
        if (canWriteCatalog) {
          await updateCatalogProductWithOffData(supabase, existingProduct, offLookup.product);
          await upsertProductNutrition(supabase, existingProduct.id, offLookup.product);
        }

        return NextResponse.json({
          ok: true,
          found: true,
          source: "supabase",
          product: buildCatalogProductResponse(existingProduct, barcode, offLookup.product)
        });
      }

      if (canWriteCatalog) {
        await updateCatalogProductOffStatus(supabase, existingProduct.id, offLookup.status);
      }

      return NextResponse.json({
        ok: true,
        found: true,
        source: "supabase",
        product: buildCatalogProductResponse(existingProduct, barcode, persistedOffProduct)
      });
    }
  }

  const offLookup = await lookupOpenFoodFactsProductStatus(barcode).catch(() => ({ status: "error" as const }));

  if (offLookup.status !== "found") {
    return NextResponse.json({ ok: false, barcode, found: false }, { status: 404 });
  }

  const product = offLookup.product;

  if (supabase && canWriteCatalog) {
    const { data: storedProduct, error: upsertError } = await supabase
      .from("products")
      .upsert(buildCatalogProductInsert(product, barcode), { onConflict: "barcode" })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!upsertError && storedProduct) {
      await upsertProductNutrition(supabase, storedProduct.id, product);
    }
  }

  return NextResponse.json({
    ok: true,
    found: true,
    product: {
      ...product,
      imageUrl: proxiedOffImageUrl(product.imageUrl)
    }
  });
}

function buildCatalogProductResponse(
  existingProduct: CatalogProductRow,
  barcode: string,
  offProduct?: OffProductEnrichment
) {
  const defaultStorageArea = toStorageArea(existingProduct.default_storage_area);
  const imageUrl = existingProduct.image_url ?? offProduct?.imageUrl ?? null;

  return {
    barcode: existingProduct.barcode ?? barcode,
    name: existingProduct.name,
    brand: existingProduct.brand ?? offProduct?.brand ?? undefined,
    category: existingProduct.category ?? offProduct?.category ?? undefined,
    imageUrl: proxiedOffImageUrl(imageUrl),
    source: "supabase" as const,
    quantityText: offProduct?.quantityText,
    quantityValue: offProduct?.quantityValue,
    quantityUnit: offProduct?.quantityUnit,
    storageArea: defaultStorageArea !== "other" ? defaultStorageArea : offProduct?.storageArea
  };
}

function buildCatalogProductInsert(product: OpenFoodFactsLookupResult, fallbackBarcode: string) {
  return {
    barcode: product.barcode || fallbackBarcode,
    name: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    image_url: product.imageUrl ?? null,
    source: "open_food_facts",
    default_storage_area: product.storageArea ?? "other",
    default_unit: "pieces",
    off_last_fetched_at: new Date().toISOString(),
    off_fetch_status: "found",
    off_quantity_text: product.quantityText ?? null,
    off_quantity_value: product.quantityValue ?? null,
    off_quantity_unit: product.quantityUnit ?? null,
    off_storage_area: product.storageArea ?? null
  };
}

async function updateCatalogProductWithOffData(
  supabase: SupabaseClient,
  existingProduct: CatalogProductRow,
  product: OpenFoodFactsLookupResult
) {
  const updatePayload: Record<string, string | number | null> = {
    off_last_fetched_at: new Date().toISOString(),
    off_fetch_status: "found",
    off_quantity_text: product.quantityText ?? null,
    off_quantity_value: product.quantityValue ?? null,
    off_quantity_unit: product.quantityUnit ?? null,
    off_storage_area: product.storageArea ?? null
  };

  if (!existingProduct.image_url && product.imageUrl) {
    updatePayload.image_url = product.imageUrl;
  }

  if (!existingProduct.brand && product.brand) {
    updatePayload.brand = product.brand;
  }

  if (!existingProduct.category && product.category) {
    updatePayload.category = product.category;
  }

  if (toStorageArea(existingProduct.default_storage_area) === "other" && product.storageArea) {
    updatePayload.default_storage_area = product.storageArea;
  }

  await supabase.from("products").update(updatePayload).eq("id", existingProduct.id);
}

async function updateCatalogProductOffStatus(
  supabase: SupabaseClient,
  productId: string,
  status: "not_found" | "error"
) {
  const updatePayload: Record<string, string | null> = {
    off_last_fetched_at: new Date().toISOString(),
    off_fetch_status: status
  };

  if (status === "not_found") {
    updatePayload.off_quantity_text = null;
    updatePayload.off_quantity_value = null;
    updatePayload.off_quantity_unit = null;
    updatePayload.off_storage_area = null;
  }

  await supabase.from("products").update(updatePayload).eq("id", productId);
}

async function upsertProductNutrition(
  supabase: SupabaseClient,
  productId: string,
  product: OpenFoodFactsLookupResult
) {
  if (product.caloriesKcal === undefined) {
    return;
  }

  await supabase.from("product_nutrition").upsert(
    {
      product_id: productId,
      per_unit: "100g",
      calories_kcal: product.caloriesKcal,
      protein_g: product.proteinG ?? null,
      carbs_g: product.carbsG ?? null,
      fat_g: product.fatG ?? null,
      fiber_g: product.fiberG ?? null,
      sugar_g: product.sugarG ?? null,
      salt_g: product.saltG ?? null
    },
    { onConflict: "product_id" }
  );
}

function getPersistedOffProduct(product: CatalogProductRow): OffProductEnrichment | undefined {
  const quantityValue = parsePersistedQuantityValue(product.off_quantity_value);
  const quantityUnit = toQuantityUnit(product.off_quantity_unit);
  const storageArea = toOptionalStorageArea(product.off_storage_area);

  if (!product.off_quantity_text && quantityValue === undefined && !quantityUnit && !storageArea) {
    return undefined;
  }

  return {
    quantityText: product.off_quantity_text ?? undefined,
    quantityValue,
    quantityUnit,
    storageArea
  };
}

function isPersistedOffCacheFresh(product: CatalogProductRow) {
  const status = toOffFetchStatus(product.off_fetch_status);
  const fetchedAt = product.off_last_fetched_at ? Date.parse(product.off_last_fetched_at) : Number.NaN;

  if (status === "unknown" || !Number.isFinite(fetchedAt)) {
    return false;
  }

  const cacheAgeMs = Date.now() - fetchedAt;
  const ttlMs = getPersistedOffTtlMs(status);
  return cacheAgeMs >= 0 && cacheAgeMs < ttlMs;
}

function getPersistedOffTtlMs(status: OffFetchStatus) {
  if (status === "found") {
    return OFF_PERSISTED_FOUND_TTL_MS;
  }

  if (status === "not_found") {
    return OFF_PERSISTED_NEGATIVE_TTL_MS;
  }

  if (status === "error") {
    return OFF_PERSISTED_ERROR_TTL_MS;
  }

  return 0;
}

function parsePersistedQuantityValue(value: CatalogProductRow["off_quantity_value"]) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
}

function toOffFetchStatus(value: CatalogProductRow["off_fetch_status"]): OffFetchStatus {
  if (value === "found" || value === "not_found" || value === "error") {
    return value;
  }

  return "unknown";
}

function toQuantityUnit(value: CatalogProductRow["off_quantity_unit"]): QuantityUnit | undefined {
  return value === "g" || value === "ml" || value === "pieces" ? value : undefined;
}

function toStorageArea(value: CatalogProductRow["default_storage_area"]): StorageArea {
  return value === "fresh" || value === "frozen" || value === "dry" || value === "other" ? value : "other";
}

function toOptionalStorageArea(value: CatalogProductRow["off_storage_area"]): StorageArea | undefined {
  return value === "fresh" || value === "frozen" || value === "dry" || value === "other" ? value : undefined;
}

function isSupportedBarcode(value: string) {
  return /^\d{6,18}$/.test(value);
}
