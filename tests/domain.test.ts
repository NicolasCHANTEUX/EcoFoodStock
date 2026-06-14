import { strict as assert } from "node:assert";
import test from "node:test";
import { daysUntilExpiration, formatExpirationLabel, getExpirationStatus } from "@/lib/expiration";
import { planInventoryBatchConsumption } from "@/lib/inventory-actions";
import { createInventoryLineId, normalizeStorageArea } from "@/lib/inventory-lines";
import {
  SETTINGS_PROFILE_STORAGE_KEY,
  readStoredSettingsProfile,
  toLocalSettingsProfile,
  writeStoredSettingsProfile
} from "@/lib/settings-storage";
import { defaultSettingsProfile } from "@/lib/settings";
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
