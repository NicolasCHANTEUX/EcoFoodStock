"use client";

import { getClientApiCacheScope, getPendingClientJsonRequest, writeClientJsonCache } from "@/lib/client-api-cache";
import type { DashboardPayload } from "@/lib/dashboard-data";
import type { InventoryItem, ShoppingGroup } from "@/types/domain";

type ShoppingCompletionSession = {
  completedAt: string;
  groups: ShoppingGroup[];
};

type ShoppingPayload = {
  ok: boolean;
  groups: ShoppingGroup[];
  completedSession: ShoppingCompletionSession | null;
  message?: string;
};

export function prefetchCoreAppData(accessToken: string) {
  const prefetch = () => {
    void prefetchCoreAppDataNow(accessToken);
  };
  const browserWindow = window as Window &
    typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };

  if (typeof browserWindow.requestIdleCallback === "function") {
    browserWindow.requestIdleCallback(prefetch, { timeout: 2_000 });
    return;
  }

  browserWindow.setTimeout(prefetch, 750);
}

async function prefetchCoreAppDataNow(accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const cacheScope = await getClientApiCacheScope(headers);

  await Promise.allSettled([
    prefetchJson<DashboardPayload>("/api/dashboard", "dashboard:v1", cacheScope, headers),
    prefetchJson<{ inventory: InventoryItem[] }>("/api/inventory", "inventory:v1", cacheScope, headers),
    prefetchJson<ShoppingPayload>("/api/shopping", "shopping-state:v1", cacheScope, headers)
  ]);
}

async function prefetchJson<T>(url: string, cacheKey: string, cacheScope: string, headers: Record<string, string>) {
  const payload = await getPendingClientJsonRequest<T>(`GET:${url}:${cacheScope}`, async () => {
    const response = await fetch(url, {
      cache: "no-store",
      headers
    });

    if (!response.ok) {
      throw new Error(`Unable to prefetch ${url} (${response.status})`);
    }

    return (await response.json()) as T;
  });

  writeClientJsonCache(cacheKey, cacheScope, payload);
}
