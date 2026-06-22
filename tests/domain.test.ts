import { strict as assert } from "node:assert";
import test from "node:test";
import { daysUntilExpiration, formatExpirationLabel, getExpirationStatus } from "@/lib/expiration";
import { proxiedOffImageUrl } from "@/lib/image-proxy";
import { planInventoryBatchConsumption } from "@/lib/inventory-actions";
import { createInventoryLineId, normalizeStorageArea } from "@/lib/inventory-lines";
import { clearOpenFoodFactsCache, lookupOpenFoodFactsProduct, searchOpenFoodFactsProducts } from "@/lib/open-food-facts";
import { getClientIp } from "@/lib/rate-limit";
import { createLogRecord, getOrCreateRequestId, sanitizeLogContext } from "@/lib/observability/logger";
import { buildStrictContentSecurityPolicy, isStrictCspEnabled } from "@/lib/security/csp";
import { assertServerOnlySupabaseServiceRoleConfig } from "@/lib/security/secrets";
import {
  SETTINGS_PROFILE_STORAGE_KEY,
  readStoredSettingsProfile,
  toLocalSettingsProfile,
  writeStoredSettingsProfile
} from "@/lib/settings-storage";
import { defaultSettingsProfile, normalizeDailyCaloriesAdjustment } from "@/lib/settings";
import { formatQuantity, normalizeQuantityUnit, quantityUnitLabel } from "@/lib/units";

test("quantity units are normalized and displayed with French labels", () => {
  assert.equal(normalizeQuantityUnit("unités"), "pieces");
  assert.equal(normalizeQuantityUnit("grammes"), "g");
  assert.equal(formatQuantity(1500, "g"), "1,5 kg");
  assert.equal(formatQuantity(1, "pieces"), "1 pièce");
  assert.equal(quantityUnitLabel("pieces", 2), "pièces");
});

test("expiration helpers return stable DLC labels and statuses", () => {
  const now = new Date(2026, 5, 14, 12);

  assert.equal(daysUntilExpiration("2026-06-14", now), 0);
  assert.equal(formatExpirationLabel("2026-06-14", now), "Expire aujourd'hui");
  assert.deepEqual(getExpirationStatus("2026-06-14", now), { label: "DLC aujourd'hui", tone: "red" });
  assert.equal(formatExpirationLabel("2026-06-15", now), "Expire demain");
  assert.deepEqual(getExpirationStatus("2026-06-17", now), { label: "DLC proche", tone: "orange" });
  assert.equal(formatExpirationLabel("2026-06-20", now), "Expire le 20/06/2026");
  assert.equal(formatExpirationLabel("not-a-date", now), undefined);
});

test("inventory line ids include product, storage area and normalized unit", () => {
  assert.equal(createInventoryLineId("product-1", "fresh", "unités"), "product-1:fresh:pieces");
  assert.equal(createInventoryLineId("product-1", "unknown", "g"), "product-1:other:g");
  assert.equal(normalizeStorageArea("frozen"), "frozen");
  assert.equal(normalizeStorageArea("cupboard"), "other");
});

test("multi-batch consumption is planned across batches in order", () => {
  const batches = [
    { id: "batch-1", quantity_remaining: 3 },
    { id: "batch-2", quantity_remaining: "2" },
    { id: "batch-3", quantity_remaining: 10 }
  ];

  const plan = planInventoryBatchConsumption(batches, 4.5);

  assert.equal(plan.totalAvailable, 15);
  assert.equal(plan.remainingQuantity, 0);
  assert.deepEqual(
    plan.steps.map((step) => ({
      id: step.batch.id,
      appliedQuantity: step.appliedQuantity,
      quantityAfter: step.quantityAfter
    })),
    [
      { id: "batch-1", appliedQuantity: 3, quantityAfter: 0 },
      { id: "batch-2", appliedQuantity: 1.5, quantityAfter: 0.5 }
    ]
  );

  const impossiblePlan = planInventoryBatchConsumption(batches, 20);
  assert.equal(impossiblePlan.remainingQuantity, 5);
});

test("settings local storage keeps only non-sensitive preferences", () => {
  const storage = new MemoryStorage();
  const fullProfile = {
    ...defaultSettingsProfile,
    appMode: "athlete" as const,
    diet: "vegan" as const,
    householdSize: 5,
    age: 42,
    heightCm: 190,
    weightKg: 95,
    sex: "male" as const
  };

  writeStoredSettingsProfile(storage as Storage, SETTINGS_PROFILE_STORAGE_KEY, fullProfile);

  const raw = storage.getItem(SETTINGS_PROFILE_STORAGE_KEY);
  assert.ok(raw);
  assert.equal(raw.includes("weightKg"), false);
  assert.equal(raw.includes("heightCm"), false);
  assert.equal(raw.includes("sex"), false);
  assert.deepEqual(readStoredSettingsProfile(storage as Storage, [SETTINGS_PROFILE_STORAGE_KEY]), {
    appMode: "athlete",
    diet: "vegan",
    householdSize: 5
  });

  assert.deepEqual(
    toLocalSettingsProfile({ appMode: "athlete", diet: "unknown" as never, householdSize: 50 }),
    {
      appMode: "athlete",
      diet: defaultSettingsProfile.diet,
      householdSize: 12
    }
  );
});

test("daily calorie adjustment is rounded and bounded", () => {
  assert.equal(normalizeDailyCaloriesAdjustment(5000), 2000);
  assert.equal(normalizeDailyCaloriesAdjustment(-5000), -2000);
  assert.equal(normalizeDailyCaloriesAdjustment("349.6"), 350);
  assert.equal(normalizeDailyCaloriesAdjustment("not-a-number", 125), 125);
});

test("strict CSP uses script nonces and service-role secrets fail closed", () => {
  const csp = buildStrictContentSecurityPolicy("nonce-test");

  assert.match(csp, /script-src 'self' 'nonce-nonce-test'/);
  assert.match(csp, /style-src 'self' 'nonce-nonce-test'/);
  assert.equal(csp.includes("unsafe-inline"), false);
  assert.ok(csp.includes("frame-ancestors 'none'"));

  assert.throws(
    () =>
      assertServerOnlySupabaseServiceRoleConfig({
        NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "leaked-service-role",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      }),
    /NEXT_PUBLIC_/
  );
  assert.throws(
    () =>
      assertServerOnlySupabaseServiceRoleConfig({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "same-key",
        SUPABASE_SERVICE_ROLE_KEY: "same-key"
      }),
    /different/
  );
});

test("strict CSP is enabled by default in production", () => {
  const originalCsp = process.env.ECOFOODSTOCK_STRICT_CSP;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  try {
    delete process.env.ECOFOODSTOCK_STRICT_CSP;
    delete process.env.VERCEL_ENV;
    restoreEnvValue("NODE_ENV", "production");
    assert.equal(isStrictCspEnabled(), true);

    restoreEnvValue("NODE_ENV", "development");
    assert.equal(isStrictCspEnabled(), false);

    restoreEnvValue("NODE_ENV", "production");
    process.env.ECOFOODSTOCK_STRICT_CSP = "false";
    assert.equal(isStrictCspEnabled(), false);
  } finally {
    restoreEnvValue("ECOFOODSTOCK_STRICT_CSP", originalCsp);
    restoreEnvValue("NODE_ENV", originalNodeEnv);
    restoreEnvValue("VERCEL_ENV", originalVercelEnv);
  }
});

test("Open Food Facts cache deduplicates concurrent lookups and repeated searches", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  clearOpenFoodFactsCache();
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetchCount += 1;
    const url = String(input);

    if (url.includes("/api/v2/product/")) {
      return createJsonResponse({
        status: 1,
        product: {
          code: "1234567890123",
          product_name: "Produit test",
          brands: "EcoFoodStock",
          quantity: "500 g"
        }
      });
    }

    return createJsonResponse({
      products: [
        {
          code: "9876543210000",
          product_name: "Riz test",
          quantity: "1 kg"
        }
      ]
    });
  }) as typeof fetch;

  try {
    const [firstLookup, secondLookup] = await Promise.all([
      lookupOpenFoodFactsProduct("1234567890123"),
      lookupOpenFoodFactsProduct("1234567890123")
    ]);

    assert.equal(firstLookup?.name, "Produit test");
    assert.equal(secondLookup?.name, "Produit test");
    assert.equal(fetchCount, 1);

    const thirdLookup = await lookupOpenFoodFactsProduct("1234567890123");
    assert.equal(thirdLookup?.quantityValue, 500);
    assert.equal(fetchCount, 1);

    const [firstSearch, secondSearch] = await Promise.all([
      searchOpenFoodFactsProducts("riz test", 2, { sortBy: "unique_scans_n" }),
      searchOpenFoodFactsProducts("riz test", 2, { sortBy: "unique_scans_n" })
    ]);

    assert.equal(firstSearch[0]?.name, "Riz test");
    assert.equal(secondSearch[0]?.name, "Riz test");
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearOpenFoodFactsCache();
  }
});

test("rate limit client IP strategy only trusts configured proxy headers", () => {
  const originalStrategy = process.env.ECOFOODSTOCK_CLIENT_IP_STRATEGY;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercel = process.env.VERCEL;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const request = new Request("http://localhost/test", {
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.7, 198.51.100.8",
      "x-real-ip": "192.0.2.20"
    }
  });

  try {
    restoreEnvValue("NODE_ENV", "production");
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;

    process.env.ECOFOODSTOCK_CLIENT_IP_STRATEGY = "cloudflare";
    assert.equal(getClientIp(request), "203.0.113.10");

    process.env.ECOFOODSTOCK_CLIENT_IP_STRATEGY = "vercel";
    assert.equal(getClientIp(request), "198.51.100.7");

    process.env.ECOFOODSTOCK_CLIENT_IP_STRATEGY = "none";
    assert.equal(getClientIp(request), "unknown:untrusted");

    delete process.env.ECOFOODSTOCK_CLIENT_IP_STRATEGY;
    assert.equal(getClientIp(request), "unknown:untrusted");

    process.env.VERCEL = "1";
    assert.equal(getClientIp(request), "198.51.100.7");
  } finally {
    restoreEnvValue("ECOFOODSTOCK_CLIENT_IP_STRATEGY", originalStrategy);
    restoreEnvValue("NODE_ENV", originalNodeEnv);
    restoreEnvValue("VERCEL", originalVercel);
    restoreEnvValue("VERCEL_ENV", originalVercelEnv);
  }
});

test("Open Food Facts image proxy refuses non-allowlisted image hosts", () => {
  assert.equal(proxiedOffImageUrl("https://images.openfoodfacts.org/images/products/123/front.400.jpg"), "/api/images?src=https%3A%2F%2Fimages.openfoodfacts.org%2Fimages%2Fproducts%2F123%2Ffront.200.jpg");
  assert.equal(proxiedOffImageUrl("https://example.com/image.jpg"), undefined);
  assert.equal(proxiedOffImageUrl("not-a-url"), undefined);
});

test("structured logs redact sensitive fields and keep correlation metadata", () => {
  const circular: Record<string, unknown> = { value: "safe" };
  circular.self = circular;

  const sanitized = sanitizeLogContext({
    requestId: "request_12345678",
    route: "/api/settings",
    userId: "user-123",
    password: "not-for-logs",
    nested: {
      authorization: "Bearer secret",
      circular
    }
  });

  assert.equal(sanitized.password, "[REDACTED]");
  assert.deepEqual(sanitized.nested, {
    authorization: "[REDACTED]",
    circular: { value: "safe", self: "[CIRCULAR]" }
  });

  const record = createLogRecord({
    level: "error",
    event: "Settings Save Failed",
    message: "Database unavailable",
    context: sanitized,
    error: new Error("connection refused"),
    now: new Date("2026-06-18T12:00:00.000Z")
  });

  assert.equal(record.event, "settings_save_failed");
  assert.equal(record.requestId, "request_12345678");
  assert.equal(record.timestamp, "2026-06-18T12:00:00.000Z");
  assert.equal(record.error?.message, "connection refused");
  assert.equal(
    createLogRecord({
      level: "error",
      event: "auth.failure",
      message: "Failure for person@example.com with Bearer abc.def.ghi"
    }).message,
    "Failure for [REDACTED_EMAIL] with Bearer [REDACTED]"
  );
  assert.equal(getOrCreateRequestId("request_abcdefgh"), "request_abcdefgh");
  assert.match(getOrCreateRequestId("invalid id"), /^[0-9a-f-]{36}$/);
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function createJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
