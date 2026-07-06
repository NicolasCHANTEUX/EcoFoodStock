"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, MinusCircle, Plus, Trash2, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { QuantityPromptModal } from "@/components/shared/QuantityPromptModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { AddProductDialog } from "@/features/inventory/AddProductDialog";
import { getClientApiCacheScope, getPendingClientJsonRequest, readClientJsonCache, writeClientJsonCache } from "@/lib/client-api-cache";
import { formatQuantity } from "@/lib/units";
import { routes } from "@/lib/routes";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import type { InventoryItem } from "@/types/domain";

const filters = ["Tous", "Frais", "Surgelés", "Sec", "DLC Proche"];
const inventoryActionButtonClass = "h-8 min-w-0 gap-1 px-1.5 text-[11px] sm:h-9 sm:gap-2 sm:px-3 sm:text-sm";
const inventoryActionIconClass = "h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4";
const INVENTORY_CACHE_KEY = "inventory:v1";

export function InventoryView() {
  const router = useRouter();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("Tous");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogMode, setAddDialogMode] = useState<"choice" | "manual" | "scan">("choice");
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [quantityPrompt, setQuantityPrompt] = useState<{
    title: string;
    description: string;
    value: string;
  } | null>(null);
  const quantityPromptResolveRef = useRef<((value: string | null) => void) | null>(null);

  async function loadInventory() {
    let hasCachedPayload = false;

    setLoading(true);
    setError(null);

    try {
      const authHeaders = await getBrowserAuthHeaders();
      const cacheScope = await getClientApiCacheScope(authHeaders);
      const cachedPayload = readClientJsonCache<{ inventory: InventoryItem[] }>(INVENTORY_CACHE_KEY, cacheScope);

      if (cachedPayload) {
        hasCachedPayload = true;
        setInventory(cachedPayload.inventory);
        setLoading(false);
      }

      const payload = await getPendingClientJsonRequest<{ inventory: InventoryItem[] }>(
        `GET:/api/inventory:${cacheScope}`,
        async () => {
          const response = await fetch("/api/inventory", {
            cache: "no-store",
            headers: authHeaders
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return (await response.json()) as { inventory: InventoryItem[] };
        }
      );

      writeClientJsonCache(INVENTORY_CACHE_KEY, cacheScope, payload);
      setInventory(payload.inventory);
    } catch {
      if (!hasCachedPayload) {
        setError("Impossible de charger l'inventaire depuis Supabase.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  useEffect(() => {
    const addMode = new URLSearchParams(window.location.search).get("add");

    if (addMode === "scan" || addMode === "manual") {
      setAddDialogMode(addMode);
      setAddDialogOpen(true);
      router.replace(routes.inventory, { scroll: false });
    }

    function openFromSidebar(event: Event) {
      const mode = (event as CustomEvent<{ mode?: "manual" | "scan" }>).detail?.mode;

      if (mode !== "scan" && mode !== "manual") {
        return;
      }

      setAddDialogMode(mode);
      setAddDialogOpen(true);
    }

    window.addEventListener("ecofoodstock:open-add-product", openFromSidebar);
    return () => window.removeEventListener("ecofoodstock:open-add-product", openFromSidebar);
  }, [router]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = matchesInventoryFilter(item, activeFilter);
      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, inventory, search]);

  function openQuantityPrompt(options: { title: string; description: string; defaultValue: string }) {
    return new Promise<string | null>((resolve) => {
      quantityPromptResolveRef.current = resolve;
      setQuantityPrompt({
        title: options.title,
        description: options.description,
        value: options.defaultValue
      });
    });
  }

  function closeQuantityPrompt(nextValue: string | null) {
    quantityPromptResolveRef.current?.(nextValue);
    quantityPromptResolveRef.current = null;
    setQuantityPrompt(null);
  }

  async function mutateInventory(item: InventoryItem, action: "consume" | "waste" | "adjust", quantity: number) {
    setMutatingId(item.id);

    try {
      const authHeaders = await getBrowserAuthHeaders();
      const response = await fetch("/api/inventory/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          productId: item.productId ?? item.id,
          action,
          quantity,
          storageArea: item.storageArea,
          unit: item.unit
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await loadInventory();
    } catch {
      setError("Impossible de modifier le stock pour le moment.");
    } finally {
      setMutatingId(null);
    }
  }

  async function askDecrease(item: InventoryItem, action: "consume" | "waste" | "adjust") {
    const defaultAmount = action === "waste" ? item.quantity : Math.min(item.quantity, getDefaultDecreaseAmount(item));
    const value = await openQuantityPrompt({
      title: action === "waste" ? `Quelle quantité de "${item.name}" voulez-vous jeter ?` : `Quelle quantité de "${item.name}" voulez-vous consommer ?`,
      description: "Saisissez la quantité à retirer du stock.",
      defaultValue: String(defaultAmount)
    });

    if (!value) {
      return;
    }

    const amount = Number(value.replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    void mutateInventory(item, action, amount);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={Box}
          title="Mon inventaire"
          description={loading ? "Chargement des produits..." : `${inventory.length} produits en stock`}
        />
        <Button
          className="gap-2"
          onClick={() => {
            setAddDialogMode("choice");
            setAddDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      <Card className="mx-auto max-w-4xl p-3 sm:p-5">
        {error ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <input
          className="mb-3 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 sm:mb-4 sm:h-12"
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="mb-4 flex flex-wrap gap-1.5 sm:mb-5 sm:gap-2">
          {filters.map((filter) => (
            <button key={filter} type="button" onClick={() => setActiveFilter(filter)}>
              <Badge tone={activeFilter === filter ? "green" : "slate"}>
                {filter}
              </Badge>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Chargement des stocks depuis Supabase...
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <p className="font-semibold">Aucun produit trouvé</p>
            <p className="mt-1 text-sm text-slate-500">
              Modifiez la recherche ou ajoutez un produit au stock.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 sm:space-y-2">
            {filteredInventory.map((item, index) => (
              <div
                key={item.id}
                className={`stagger-item-enter stagger-delay-${Math.min(index, 7)} rounded-lg border border-slate-200 px-3 py-2 sm:grid sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-3 sm:py-3`}
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 sm:contents">
                  <ProductThumbnail name={item.name} imageUrl={item.imageUrl} fallbackLabel={item.icon} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950 sm:text-base sm:font-medium">{item.name}</p>
                    <p className="truncate text-xs text-slate-500 sm:text-sm">
                      {formatQuantity(item.quantity, item.unit)}
                      {item.expirationLabel ? ` - ${item.expirationLabel}` : ""}
                    </p>
                  </div>

                  {item.dlcStatus ? (
                    <Badge className="justify-self-end px-2 py-0.5 text-[11px] sm:px-2.5 sm:py-1 sm:text-xs" tone={item.dlcStatus.tone}>
                      {item.dlcStatus.label}
                    </Badge>
                  ) : (
                    <span className="hidden sm:block" />
                  )}

                  <div className="col-span-3 grid grid-cols-3 gap-1.5 sm:col-auto sm:flex sm:flex-wrap sm:items-center sm:gap-1">
                    <Button
                      variant="secondary"
                      className={inventoryActionButtonClass}
                      disabled={mutatingId === item.id}
                      onClick={() => askDecrease(item, "adjust")}
                    >
                      <MinusCircle className={inventoryActionIconClass} />
                      Réduire
                    </Button>
                    <Button
                      variant="secondary"
                      className={inventoryActionButtonClass}
                      disabled={mutatingId === item.id}
                      onClick={() => askDecrease(item, "consume")}
                    >
                      <Utensils className={inventoryActionIconClass} />
                      Consommé
                    </Button>
                    <Button
                      variant="ghost"
                      className={`${inventoryActionButtonClass} text-rose-600`}
                      disabled={mutatingId === item.id}
                      onClick={() => askDecrease(item, "waste")}
                    >
                      <Trash2 className={inventoryActionIconClass} />
                      Jeté
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddProductDialog
        open={addDialogOpen}
        initialMode={addDialogMode}
        onClose={() => setAddDialogOpen(false)}
        onPersisted={() => {
          setAddDialogOpen(false);
          void loadInventory();
        }}
      />

      <QuantityPromptModal
        open={quantityPrompt !== null}
        title={quantityPrompt?.title ?? ""}
        description={quantityPrompt?.description}
        value={quantityPrompt?.value ?? ""}
        onValueChange={(nextValue) => {
          setQuantityPrompt((current) => (current ? { ...current, value: nextValue } : current));
        }}
        onConfirm={() => {
          closeQuantityPrompt(quantityPrompt?.value ?? null);
        }}
        onCancel={() => {
          closeQuantityPrompt(null);
        }}
      />
    </div>
  );
}

function getDefaultDecreaseAmount(item: InventoryItem) {
  if (item.unit === "g" || item.unit === "ml") {
    return Math.min(100, item.quantity);
  }

  return 1;
}

function matchesInventoryFilter(item: InventoryItem, filter: string) {
  if (filter === "Tous") {
    return true;
  }

  if (filter === "Frais") {
    return item.storageArea === "fresh";
  }

  if (filter === "Surgelés") {
    return item.storageArea === "frozen";
  }

  if (filter === "Sec") {
    return item.storageArea === "dry";
  }

  return Boolean(item.dlcStatus);
}
