export type OpenFoodFactsLookupResult = {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  quantityText?: string;
  quantityValue?: number;
  quantityUnit?: "g" | "ml" | "pieces";
  storageArea?: "fresh" | "frozen" | "dry" | "other";
  nutriscore?: string;
  caloriesKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  saltG?: number;
  source: "open_food_facts";
};

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  categories?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_front_thumb_url?: string;
  image_url?: string;
  image_small_url?: string;
  image_thumb_url?: string;
  selected_images?: {
    front?: {
      display?: { en?: string; fr?: string; ar?: string };
      small?: { en?: string; fr?: string; ar?: string };
      thumb?: { en?: string; fr?: string; ar?: string };
    };
  };
  images?: Record<string, OpenFoodFactsImageEntry>;
  quantity?: string;
  nutriscore_grade?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    salt_100g?: number;
  };
};

type OpenFoodFactsImageEntry = {
  rev?: number | string;
  sizes?: Record<string, unknown>;
};

type OpenFoodFactsApiResponse = {
  status: number;
  product?: OpenFoodFactsProduct;
  products?: OpenFoodFactsProduct[];
};

type SearchOpenFoodFactsOptions = {
  image?: boolean;
  sortBy?: "unique_scans_n" | "product_name";
};

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

type CachedValueOptions<T> = {
  cacheTtlMs: (value: T) => number;
  fallbackValue: T;
  errorTtlMs: number;
  logContext: string;
};

const OFF_PRODUCT_FIELDS = [
  "code",
  "product_name",
  "brands",
  "categories",
  "image_front_url",
  "image_front_small_url",
  "image_front_thumb_url",
  "image_url",
  "image_small_url",
  "image_thumb_url",
  "selected_images",
  "images",
  "quantity",
  "nutriscore_grade",
  "nutriments"
].join(",");

const OFF_FETCH_TIMEOUT_MS = 8_000;
const OFF_CACHE_MAX_ENTRIES = 300;
const OFF_PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OFF_SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const OFF_NEGATIVE_CACHE_TTL_MS = 30 * 60 * 1000;
const OFF_ERROR_CACHE_TTL_MS = 2 * 60 * 1000;

const offCache = new Map<string, CacheEntry<unknown>>();

export async function lookupOpenFoodFactsProduct(barcode: string): Promise<OpenFoodFactsLookupResult | null> {
  const cleanBarcode = barcode.trim();

  if (!cleanBarcode) {
    return null;
  }

  return getCachedOpenFoodFactsValue(`product:${cleanBarcode}`, () => fetchOpenFoodFactsProduct(cleanBarcode), {
    cacheTtlMs: (value) => (value ? OFF_PRODUCT_CACHE_TTL_MS : OFF_NEGATIVE_CACHE_TTL_MS),
    fallbackValue: null,
    errorTtlMs: OFF_ERROR_CACHE_TTL_MS,
    logContext: "Open Food Facts product lookup failed"
  });
}

export async function searchOpenFoodFactsProducts(
  query: string,
  pageSize = 1,
  options: SearchOpenFoodFactsOptions = {}
): Promise<OpenFoodFactsLookupResult[]> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return [];
  }

  const params = new URLSearchParams({
    search_terms: cleanQuery,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(pageSize),
    fields: OFF_PRODUCT_FIELDS
  });

  if (options.image !== undefined) {
    params.set("image", options.image ? "1" : "0");
  }

  if (options.sortBy) {
    params.set("sort_by", options.sortBy);
  }

  return getCachedOpenFoodFactsValue(`search:${params.toString()}`, () => fetchOpenFoodFactsSearch(params, pageSize), {
    cacheTtlMs: (value) => (value.length > 0 ? OFF_SEARCH_CACHE_TTL_MS : OFF_NEGATIVE_CACHE_TTL_MS),
    fallbackValue: [],
    errorTtlMs: OFF_ERROR_CACHE_TTL_MS,
    logContext: "Open Food Facts search failed"
  });
}

export function clearOpenFoodFactsCache() {
  offCache.clear();
}

async function fetchOpenFoodFactsProduct(cleanBarcode: string) {
  const response = await fetchWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json?fields=${encodeURIComponent(OFF_PRODUCT_FIELDS)}`, {
    headers: {
      "User-Agent": "EcoFoodStock/0.1.0"
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as OpenFoodFactsApiResponse;

  if (payload.status !== 1 || !payload.product) {
    return null;
  }

  return mapOffProduct(payload.product, cleanBarcode);
}

async function fetchOpenFoodFactsSearch(params: URLSearchParams, pageSize: number) {
  const response = await fetchWithTimeout(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`, {
    headers: {
      "User-Agent": "EcoFoodStock/0.1.0"
    }
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as OpenFoodFactsApiResponse;

  if (!Array.isArray(payload.products)) {
    return [];
  }

  return payload.products.filter(Boolean).slice(0, pageSize).map((product) => mapOffProduct(product));
}

function getCachedOpenFoodFactsValue<T>(key: string, loadValue: () => Promise<T>, options: CachedValueOptions<T>) {
  const now = Date.now();
  const cachedEntry = offCache.get(key) as CacheEntry<T> | undefined;

  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.promise;
  }

  const entry: CacheEntry<T> = {
    expiresAt: now + options.errorTtlMs,
    promise: Promise.resolve()
      .then(loadValue)
      .then((value) => {
        entry.expiresAt = Date.now() + options.cacheTtlMs(value);
        return value;
      })
      .catch((error) => {
        entry.expiresAt = Date.now() + options.errorTtlMs;
        console.warn(options.logContext, error instanceof Error ? error.message : String(error));
        return options.fallbackValue;
      })
  };

  offCache.delete(key);
  offCache.set(key, entry);
  pruneOpenFoodFactsCache(now);
  return entry.promise;
}

function pruneOpenFoodFactsCache(now: number) {
  if (offCache.size <= OFF_CACHE_MAX_ENTRIES) {
    return;
  }

  for (const [key, entry] of offCache.entries()) {
    if (entry.expiresAt <= now) {
      offCache.delete(key);
    }

    if (offCache.size <= OFF_CACHE_MAX_ENTRIES) {
      return;
    }
  }

  while (offCache.size > OFF_CACHE_MAX_ENTRIES) {
    const oldestKey = offCache.keys().next().value;

    if (!oldestKey) {
      return;
    }

    offCache.delete(oldestKey);
  }
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OFF_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapOffProduct(product: OpenFoodFactsProduct, fallbackBarcode?: string): OpenFoodFactsLookupResult {
  const parsedQuantity = parseQuantityText(product.quantity?.trim());
  const inferredStorageArea = inferStorageArea(product.categories, product.product_name, product.quantity);

  return {
    barcode: product.code ?? fallbackBarcode ?? "",
    name: product.product_name?.trim() || "Produit sans nom",
    brand: product.brands?.split(",").map((value) => value.trim()).filter(Boolean)[0],
    category: product.categories?.split(",").map((value) => value.trim()).filter(Boolean)[0],
    imageUrl: extractImageUrl(product, product.code ?? fallbackBarcode),
    quantityText: product.quantity?.trim(),
    quantityValue: parsedQuantity?.value,
    quantityUnit: parsedQuantity?.unit,
    storageArea: inferredStorageArea,
    nutriscore: product.nutriscore_grade?.toUpperCase(),
    caloriesKcal: product.nutriments?.["energy-kcal_100g"],
    proteinG: product.nutriments?.proteins_100g,
    carbsG: product.nutriments?.carbohydrates_100g,
    fatG: product.nutriments?.fat_100g,
    fiberG: product.nutriments?.fiber_100g,
    sugarG: product.nutriments?.sugars_100g,
    saltG: product.nutriments?.salt_100g,
    source: "open_food_facts"
  };
}

function parseQuantityText(quantityText?: string) {
  if (!quantityText) {
    return null;
  }

  const normalized = quantityText.toLowerCase().replace(/,/g, ".").trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl|mg|pcs?|pi[eè]ces?|unit[eé]s?)/i);

  if (!match) {
    return null;
  }

  const rawValue = Number(match[1]);
  const rawUnit = match[2].toLowerCase();

  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return null;
  }

  if (rawUnit === "kg") {
    return { value: roundQuantity(rawValue * 1000), unit: "g" as const };
  }

  if (rawUnit === "g" || rawUnit === "mg") {
    return { value: rawUnit === "mg" ? roundQuantity(rawValue / 1000) : roundQuantity(rawValue), unit: "g" as const };
  }

  if (rawUnit === "l") {
    return { value: roundQuantity(rawValue * 1000), unit: "ml" as const };
  }

  if (rawUnit === "cl") {
    return { value: roundQuantity(rawValue * 10), unit: "ml" as const };
  }

  if (rawUnit === "ml") {
    return { value: roundQuantity(rawValue), unit: "ml" as const };
  }

  return { value: roundQuantity(rawValue), unit: "pieces" as const };
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function inferStorageArea(categories?: string, name?: string, quantity?: string) {
  const haystack = [categories, name, quantity].filter(Boolean).join(" ").toLowerCase();

  if (!haystack) {
    return undefined;
  }

  if (containsAny(haystack, ["surgel", "congel", "frozen", "ice cream", "glace", "sorbet", "freezer"])) {
    return "frozen";
  }

  if (containsAny(haystack, ["yaourt", "yogurt", "lait", "milk", "fromage", "cheese", "viande", "meat", "poisson", "fish", "fruit", "vegetable", "legume", "salade", "salad", "fresh", "frais"])) {
    return "fresh";
  }

  if (containsAny(haystack, ["pate a tartiner", "spread", "pates", "pasta", "riz", "rice", "cereale", "cereal", "biscuit", "cookie", "chocolat", "flour", "farine", "sugar", "sucre", "huile", "oil", "conserve", "canne", "sauce", "condiment", "breakfast", "snack", "epicerie", "grocery", "pantry"])) {
    return "dry";
  }

  return undefined;
}

function containsAny(haystack: string, keywords: string[]) {
  return keywords.some((keyword) => haystack.includes(keyword));
}

function extractImageUrl(product: OpenFoodFactsProduct, barcode?: string) {
  return (
    product.image_front_url ||
    product.image_front_small_url ||
    product.image_front_thumb_url ||
    product.image_url ||
    product.image_small_url ||
    product.image_thumb_url ||
    product.selected_images?.front?.display?.fr ||
    product.selected_images?.front?.display?.en ||
    product.selected_images?.front?.display?.ar ||
    product.selected_images?.front?.small?.fr ||
    product.selected_images?.front?.small?.en ||
    product.selected_images?.front?.small?.ar ||
    product.selected_images?.front?.thumb?.fr ||
    product.selected_images?.front?.thumb?.en ||
    product.selected_images?.front?.thumb?.ar ||
    buildImageUrlFromImages(product.images, barcode)
  );
}

function buildImageUrlFromImages(images?: OpenFoodFactsProduct["images"], barcode?: string) {
  const imageFolder = buildProductImageFolder(barcode);

  if (!images || !imageFolder) {
    return undefined;
  }

  const selectedFrontKey = pickSelectedFrontImageKey(images);
  if (selectedFrontKey) {
    const image = images[selectedFrontKey];
    const revision = image?.rev;
    const resolution = pickImageResolution(image?.sizes);

    if (revision && resolution) {
      return `${imageFolder}/${selectedFrontKey}.${revision}.${resolution}.jpg`;
    }
  }

  const rawImageKey = Object.keys(images)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right))[0];

  if (!rawImageKey) {
    return undefined;
  }

  const resolution = pickImageResolution(images[rawImageKey]?.sizes);
  const suffix = resolution && resolution !== "full" ? `.${resolution}` : "";
  return `${imageFolder}/${rawImageKey}${suffix}.jpg`;
}

function pickSelectedFrontImageKey(images: NonNullable<OpenFoodFactsProduct["images"]>) {
  const preferredKeys = ["front_fr", "front_en", "front_es", "front_de", "front_it", "front"];
  const matchingPreferredKey = preferredKeys.find((key) => images[key]?.rev);

  if (matchingPreferredKey) {
    return matchingPreferredKey;
  }

  return Object.keys(images)
    .filter((key) => key.startsWith("front_") && images[key]?.rev)
    .sort()[0];
}

function pickImageResolution(sizes?: OpenFoodFactsImageEntry["sizes"]) {
  if (!sizes) {
    return "400";
  }

  for (const resolution of ["400", "200", "100", "full"]) {
    if (Object.prototype.hasOwnProperty.call(sizes, resolution)) {
      return resolution;
    }
  }

  return "400";
}

function buildProductImageFolder(barcode?: string) {
  const cleanBarcode = barcode?.replace(/\D/g, "");

  if (!cleanBarcode) {
    return undefined;
  }

  const normalizedBarcode = cleanBarcode.length < 13 ? cleanBarcode.padStart(13, "0") : cleanBarcode;
  const match = normalizedBarcode.match(/^(\d{3})(\d{3})(\d{3})(.*)$/);

  if (!match) {
    return undefined;
  }

  return `https://images.openfoodfacts.org/images/products/${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
}
