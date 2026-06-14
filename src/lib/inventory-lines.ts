import type { StorageArea } from "@/types/domain";
import { normalizeQuantityUnit } from "@/lib/units";

export function createInventoryLineId(productId: string, storageArea: unknown, unit: unknown) {
  return `${productId}:${normalizeStorageArea(storageArea)}:${normalizeQuantityUnit(unit)}`;
}

export function createIconLabel(name: string) {
  const compact = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  return compact || "PR";
}

export function normalizeStorageArea(value: unknown): StorageArea {
  if (value === "fresh" || value === "frozen" || value === "dry") {
    return value;
  }

  return "other";
}
