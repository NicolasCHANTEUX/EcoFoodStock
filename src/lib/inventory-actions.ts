type BatchWithQuantity = {
  quantity_remaining: number | string | null;
};

export type InventoryConsumptionStep<TBatch extends BatchWithQuantity> = {
  batch: TBatch;
  quantityBefore: number;
  quantityAfter: number;
  appliedQuantity: number;
};

export type InventoryConsumptionPlan<TBatch extends BatchWithQuantity> = {
  requestedQuantity: number;
  totalAvailable: number;
  remainingQuantity: number;
  steps: InventoryConsumptionStep<TBatch>[];
};

export function planInventoryBatchConsumption<TBatch extends BatchWithQuantity>(
  batches: TBatch[],
  requestedQuantity: number
): InventoryConsumptionPlan<TBatch> {
  const normalizedRequestedQuantity = roundQuantity(Math.max(0, requestedQuantity));
  let remainingQuantity = normalizedRequestedQuantity;
  const steps: InventoryConsumptionStep<TBatch>[] = [];
  const totalAvailable = roundQuantity(
    batches.reduce((sum, batch) => sum + readBatchQuantity(batch.quantity_remaining), 0)
  );

  for (const batch of batches) {
    if (remainingQuantity <= 0) {
      break;
    }

    const quantityBefore = readBatchQuantity(batch.quantity_remaining);
    const appliedQuantity = roundQuantity(Math.min(remainingQuantity, quantityBefore));

    if (appliedQuantity <= 0) {
      continue;
    }

    const quantityAfter = roundQuantity(quantityBefore - appliedQuantity);

    steps.push({
      batch,
      quantityBefore,
      quantityAfter,
      appliedQuantity
    });

    remainingQuantity = roundQuantity(remainingQuantity - appliedQuantity);
  }

  return {
    requestedQuantity: normalizedRequestedQuantity,
    totalAvailable,
    remainingQuantity,
    steps
  };
}

export function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function readBatchQuantity(value: number | string | null) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : 0;
}
