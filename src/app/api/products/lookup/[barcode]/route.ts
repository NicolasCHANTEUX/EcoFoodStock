import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupOpenFoodFactsProduct } from "@/lib/open-food-facts";
import { proxiedOffImageUrl } from "@/lib/image-proxy";
import { resolveAccountContext } from "@/lib/supabase/account-context";

type RouteContext = {
  params: Promise<{ barcode: string }>;
};

type CatalogProductRow = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  source: string;
  default_storage_area: string;
  default_unit: string;
};

export async function GET(req: Request, { params }: RouteContext) {
  const { barcode: rawBarcode } = await params;
  const barcode = rawBarcode.trim();

  if (!isSupportedBarcode(barcode)) {
    return NextResponse.json({ ok: false, message: "Invalid barcode" }, { status: 400 });
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
      .select("id, barcode, name, brand, category, image_url, source, default_storage_area, default_unit")
      .eq("barcode", barcode)
      .maybeSingle<CatalogProductRow>();

    if (!productError && existingProduct) {
      const offProduct = await lookupOpenFoodFactsProduct(barcode).catch(() => null);
      const imageUrl = existingProduct.image_url ?? offProduct?.imageUrl ?? null;

      if (!existingProduct.image_url && offProduct?.imageUrl && canWriteCatalog) {
        await supabase
          .from("products")
          .update({ image_url: offProduct.imageUrl })
          .eq("id", existingProduct.id);
      }

      return NextResponse.json({
        ok: true,
        found: true,
        source: "supabase",
        product: {
          barcode: existingProduct.barcode ?? barcode,
          name: existingProduct.name,
          brand: existingProduct.brand ?? undefined,
          category: existingProduct.category ?? undefined,
          imageUrl: proxiedOffImageUrl(imageUrl),
          source: "supabase" as const,
          quantityText: offProduct?.quantityText,
          quantityValue: offProduct?.quantityValue,
          quantityUnit: offProduct?.quantityUnit,
          storageArea: existingProduct.default_storage_area !== "other" ? existingProduct.default_storage_area : offProduct?.storageArea
        }
      });
    }
  }

  const product = await lookupOpenFoodFactsProduct(barcode);

  if (!product) {
    return NextResponse.json({ ok: false, barcode, found: false }, { status: 404 });
  }

  if (supabase && canWriteCatalog) {
    const { data: storedProduct, error: upsertError } = await supabase
      .from("products")
      .upsert(
        {
          barcode: product.barcode,
          name: product.name,
          brand: product.brand ?? null,
          category: product.category ?? null,
          image_url: product.imageUrl ?? null,
          source: "open_food_facts",
          default_storage_area: product.storageArea ?? "other",
          default_unit: "pieces"
        },
        { onConflict: "barcode" }
      )
      .select("id, barcode, name, brand, category, image_url")
      .maybeSingle();

    if (!upsertError && storedProduct && product.caloriesKcal !== undefined) {
      await supabase.from("product_nutrition").upsert(
        {
          product_id: storedProduct.id,
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

function isSupportedBarcode(value: string) {
  return /^\d{6,18}$/.test(value);
}
