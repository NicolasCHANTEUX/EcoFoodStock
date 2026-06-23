"use client";

import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { PageHeader } from "@/components/shared/PageHeader";
import { getClientApiCacheScope, getPendingClientJsonRequest, readClientJsonCache, writeClientJsonCache } from "@/lib/client-api-cache";
import type { DashboardPayload } from "@/lib/dashboard-data";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import { formatQuantity } from "@/lib/units";

const DASHBOARD_CACHE_KEY = "dashboard:v1";

export function DashboardView() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      let hasCachedPayload = false;

      try {
        setLoading(true);
        setError(null);

        const authHeaders = await getBrowserAuthHeaders();
        const cacheScope = await getClientApiCacheScope(authHeaders);
        const cachedPayload = readClientJsonCache<DashboardPayload>(DASHBOARD_CACHE_KEY, cacheScope);

        if (cachedPayload && active) {
          hasCachedPayload = true;
          setData(cachedPayload);
          setLoading(false);
        }

        const payload = await getPendingClientJsonRequest<DashboardPayload>(
          `GET:/api/dashboard:${cacheScope}`,
          async () => {
            const response = await fetch("/api/dashboard", {
              cache: "no-store",
              headers: authHeaders
            });

            if (!response.ok) {
              throw new Error(`API error ${response.status}`);
            }

            return (await response.json()) as DashboardPayload;
          }
        );

        writeClientJsonCache(DASHBOARD_CACHE_KEY, cacheScope, payload);

        if (active) {
          setData(payload);
        }
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError" && !hasCachedPayload && active) {
          setError("Impossible de charger les données depuis l'API.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  const inventory = data?.inventory ?? [];

  return (
    <div>
      <PageHeader
        icon={PackageSearch}
        title="Tableau de bord"
        description="Vue rapide du stock, des DLC et des prochaines actions, alimentée par l'API."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <Card className="shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase text-slate-600">Mon inventaire</h2>
              <p className="mt-1 text-sm text-slate-500">
                {loading && !data ? "Récupération en cours..." : `${data?.summary.inventoryCount ?? 0} produits`}
              </p>
            </div>
            <Badge tone="green" className="bg-emerald-100 text-emerald-900">
              {data?.summary.expiringCount ?? 0} DLC proches
            </Badge>
          </div>

          {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

          <div className="min-h-[296px] space-y-2">
            {loading && !data
              ? Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3"
                    aria-hidden="true"
                  >
                    <div className="h-10 w-10 rounded-lg bg-slate-100" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-slate-100" />
                      <div className="h-3 w-1/2 rounded bg-slate-100" />
                    </div>
                    <div className="h-6 w-20 rounded-full bg-slate-100" />
                  </div>
                ))
              : null}

            {!loading && inventory.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                Votre inventaire est vide pour le moment.
              </p>
            ) : null}

            {inventory.slice(0, 8).map((item, index) => (
              <div
                key={item.id}
                className={`stagger-item-enter stagger-delay-${Math.min(index, 7)} flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3`}
              >
                <div className="flex items-center gap-3">
                  <ProductThumbnail name={item.name} imageUrl={item.imageUrl} fallbackLabel={item.icon} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="truncate text-sm text-slate-500">
                      {formatQuantity(item.quantity, item.unit)} {item.expirationLabel ? `· ${item.expirationLabel}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.dlcStatus ? <Badge tone={item.dlcStatus.tone}>{item.dlcStatus.label}</Badge> : <span />}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-bold uppercase text-slate-600">Bientôt disponible</h3>
          <p className="mt-2 text-sm text-slate-600">
            Les modules recettes, santé avancée, notifications et suggestions avancées arrivent en MVP 2.
          </p>
        </Card>
      </div>
    </div>
  );
}
