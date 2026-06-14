import { NextResponse } from "next/server";
import { proxiedOffImageUrl } from "@/lib/image-proxy";
import { lookupOpenFoodFactsProduct, searchOpenFoodFactsProducts, type OpenFoodFactsLookupResult } from "@/lib/open-food-facts";
import { defaultSettingsProfile, type DietType } from "@/lib/settings";
import { resolveAccountContext } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ShoppingSuggestionResponse = {
  id: string;
  label: string;
  reason: string;
  icon: string;
  imageUrl?: string;
};

type CuratedSuggestionEntry = {
  id: string;
  queries: string[];
  reason: string;
  diets: DietType[];
};

const allDiets: DietType[] = ["omnivore", "vegetarian", "vegan", "pescatarian"];
const dairyAndEggDiets: DietType[] = ["omnivore", "vegetarian", "pescatarian"];

const curatedQueries = [
  { id: "milk", queries: ["lactel", "lait lactel"], reason: "Basique du quotidien", diets: dairyAndEggDiets },
  { id: "yogurt", queries: ["yaourt nature danone", "danone nature"], reason: "Petit-déjeuner rapide", diets: dairyAndEggDiets },
  { id: "eggs", queries: ["oeufs fermiers", "oeufs frais", "oeufs"], reason: "Protéines faciles", diets: dairyAndEggDiets },
  { id: "pasta", queries: ["pates barilla", "barilla spaghetti"], reason: "Repas rapide", diets: allDiets },
  { id: "rice", queries: ["riz basmati", "taureau aile basmati"], reason: "Base polyvalente", diets: allDiets },
  { id: "tomatoes", queries: ["tomates cerise", "tomates cerises"], reason: "Cuisine fraîche", diets: allDiets },
  { id: "bananas", queries: ["bananes", "banane"], reason: "Collation classique", diets: allDiets },
  { id: "chicken", queries: ["poulet fermier label rouge", "poulet fermier"], reason: "Plat principal simple", diets: ["omnivore"] },
  { id: "salmon", queries: ["saumon frais", "filet saumon"], reason: "Source d'oméga 3", diets: ["omnivore", "pescatarian"] },
  { id: "tuna", queries: ["thon naturel", "thon albacore"], reason: "Protéines rapides", diets: ["omnivore", "pescatarian"] },
  { id: "tofu", queries: ["tofu nature", "tofu bio"], reason: "Protéines végétales", diets: allDiets },
  { id: "lentils", queries: ["lentilles vertes", "lentilles corail"], reason: "Base végétale rassasiante", diets: allDiets },
  { id: "chickpeas", queries: ["pois chiches", "pois chiche"], reason: "Protéines végétales", diets: allDiets },
  { id: "oats", queries: ["flocons avoine", "flocons d'avoine"], reason: "Fibres et petit-déjeuner", diets: allDiets },
  { id: "quinoa", queries: ["quinoa", "quinoa bio"], reason: "Base complète", diets: allDiets },
  { id: "avocado", queries: ["avocat", "avocat bio"], reason: "Bon pour les repas froids", diets: allDiets },
  { id: "carrots", queries: ["carottes", "carottes bio"], reason: "Légume facile", diets: allDiets },
  { id: "green_beans", queries: ["haricots verts", "haricots verts extra fins"], reason: "Accompagnement simple", diets: allDiets },
  { id: "almonds", queries: ["amandes", "amandes entières"], reason: "Collation riche", diets: allDiets },
  { id: "oat_milk", queries: ["boisson avoine", "lait avoine"], reason: "Alternative végétale", diets: ["vegan"] },
  { id: "soy_yogurt", queries: ["yaourt soja nature", "dessert soja nature"], reason: "Alternative végétale", diets: ["vegan"] }
] satisfies CuratedSuggestionEntry[];

const preferredSuggestionBarcodes: Record<string, string> = {
  milk: "3428273980046",
  yogurt: "6111032002925",
  eggs: "3251320080617",
  pasta: "8076800195057",
  rice: "3760341070472",
  tomatoes: "3276558775128"
};

const SUGGESTION_CACHE_TTL_MS = 5 * 60 * 1000;

type SuggestionCacheEntry = {
  expiresAt: number;
  promise: Promise<ShoppingSuggestionResponse[]>;
};

const suggestionCache = new Map<DietType, SuggestionCacheEntry>();

export async function GET(req: Request) {
  const diet = await resolveSuggestionDiet(req);
  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
  const suggestions = await loadSuggestionsForDiet(diet, forceRefresh);

  return NextResponse.json(
    { ok: true, diet, suggestions },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300"
      }
    }
  );
}

async function loadSuggestionsForDiet(diet: DietType, forceRefresh: boolean) {
  const now = Date.now();
  const cached = suggestionCache.get(diet);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = buildSuggestionsForDiet(diet).catch((error) => {
    suggestionCache.delete(diet);
    throw error;
  });

  suggestionCache.set(diet, {
    expiresAt: now + SUGGESTION_CACHE_TTL_MS,
    promise
  });

  return promise;
}

async function buildSuggestionsForDiet(diet: DietType) {
  const compatibleQueries = curatedQueries.filter((entry) => entry.diets.includes(diet)).slice(0, 16);

  return Promise.all(
    compatibleQueries.map(async (entry) => {
      const product = await pickSuggestionProduct(entry);
      const label = product?.name ?? titleCase(entry.queries[0]);
      const icon = createIconLabel(product?.name ?? entry.queries[0]);

      return {
        id: entry.id,
        label,
        reason: entry.reason,
        icon,
        imageUrl: proxiedOffImageUrl(product?.imageUrl, { proxy: false, size: "200" })
      } satisfies ShoppingSuggestionResponse;
    })
  );
}

async function resolveSuggestionDiet(req: Request): Promise<DietType> {
  const requestDiet = new URL(req.url).searchParams.get("diet");
  if (isDiet(requestDiet)) {
    return requestDiet;
  }

  try {
    const supabase = createSupabaseServerClient();
    const context = await resolveAccountContext(req, supabase);

    if (!context.appUserId) {
      return defaultSettingsProfile.diet;
    }

    const { data } = await supabase
      .from("user_preferences")
      .select("diet")
      .eq("user_id", context.appUserId)
      .limit(1)
      .maybeSingle<{ diet: string | null }>();

    return isDiet(data?.diet) ? data.diet : defaultSettingsProfile.diet;
  } catch {
    return defaultSettingsProfile.diet;
  }
}

function isDiet(value: unknown): value is DietType {
  return value === "omnivore" || value === "vegetarian" || value === "vegan" || value === "pescatarian";
}

async function pickSuggestionProduct(entry: CuratedSuggestionEntry) {
  let fallbackProduct: OpenFoodFactsLookupResult | undefined;
  const preferredBarcode = preferredSuggestionBarcodes[entry.id];

  if (preferredBarcode) {
    const preferredProduct = await lookupOpenFoodFactsProduct(preferredBarcode).catch(() => null);

    if (preferredProduct?.imageUrl) {
      return preferredProduct;
    }
  }

  for (const query of entry.queries) {
    const results = await searchOpenFoodFactsProducts(query, 24, { sortBy: "unique_scans_n" }).catch(() => []);
    const candidateWithImage = await findCandidateWithImage(results);

    if (candidateWithImage) {
      return candidateWithImage;
    }

    if (results[0]) {
      fallbackProduct = fallbackProduct ?? results[0];
    }
  }

  for (const query of entry.queries) {
    const imageResults = await searchOpenFoodFactsProducts(query, 24, { image: true, sortBy: "unique_scans_n" }).catch(() => []);
    const candidateWithImage = await findCandidateWithImage(imageResults);

    if (candidateWithImage) {
      return candidateWithImage;
    }
  }

  return fallbackProduct;
}

async function findCandidateWithImage(results: OpenFoodFactsLookupResult[]) {
  const directImageCandidate = results.find((candidate) => Boolean(candidate.imageUrl));

  if (directImageCandidate) {
    return directImageCandidate;
  }

  for (const candidate of results.slice(0, 8)) {
    if (!candidate.barcode) {
      continue;
    }

    const hydratedCandidate = await lookupOpenFoodFactsProduct(candidate.barcode).catch(() => null);

    if (hydratedCandidate?.imageUrl) {
      return {
        ...candidate,
        ...hydratedCandidate,
        name: candidate.name || hydratedCandidate.name,
        storageArea: candidate.storageArea ?? hydratedCandidate.storageArea
      };
    }
  }

  return undefined;
}

function createIconLabel(name: string) {
  const compact = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  return compact || "PR";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
