"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, RotateCcw, ShoppingCart, Trash2, X } from "lucide-react";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/shared/PageHeader";
import { getClientApiCacheScope, getPendingClientJsonRequest, readClientJsonCache, writeClientJsonCache } from "@/lib/client-api-cache";
import { readStoredSettingsProfile, SETTINGS_PROFILE_STORAGE_KEY } from "@/lib/settings-storage";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import type { DietType } from "@/lib/settings";
import type { ShoppingGroup, ShoppingSuggestion } from "@/types/domain";

const SETTINGS_STORAGE_KEY = SETTINGS_PROFILE_STORAGE_KEY;
const SHOPPING_SUGGESTIONS_STORAGE_KEY = "ecofoodstock:shopping-suggestions-hidden";
const SHOPPING_ITEM_IMAGES_STORAGE_KEY = "ecofoodstock:shopping-item-images";
const SHOPPING_COMPLETION_DISMISSALS_STORAGE_KEY = "ecofoodstock:shopping-completion-dismissals";
const SHOPPING_STATE_CACHE_KEY = "shopping-state:v1";
const COMPLETED_SESSION_VISIBLE_MS = 24 * 60 * 60 * 1000;

type ShoppingItemImageMap = Record<string, string>;

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

export function ShoppingView() {
  const [groups, setGroups] = useState<ShoppingGroup[]>([]);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestion[]>([]);
  const [hiddenSuggestionIds, setHiddenSuggestionIds] = useState<string[]>([]);
  const [shoppingItemImages, setShoppingItemImages] = useState<ShoppingItemImageMap>(() => loadStoredShoppingItemImages());
  const [dismissedCompletionKeys, setDismissedCompletionKeys] = useState<string[]>(() => loadStoredCompletionDismissals());
  const [completedSession, setCompletedSession] = useState<ShoppingCompletionSession | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [submittingItem, setSubmittingItem] = useState(false);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const [completingList, setCompletingList] = useState(false);
  const [shoppingError, setShoppingError] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const shoppingItemImagesRef = useRef(shoppingItemImages);
  const dismissedCompletionKeysRef = useRef(dismissedCompletionKeys);

  const applyShoppingPayload = useCallback((payload: ShoppingPayload, imageMap: ShoppingItemImageMap) => {
    setGroups(withShoppingImages(payload.groups ?? [], imageMap));
    const nextCompletedSession = payload.completedSession ? withCompletedShoppingImages(payload.completedSession, imageMap) : null;
    setCompletedSession(shouldShowCompletedSession(nextCompletedSession, dismissedCompletionKeysRef.current) ? nextCompletedSession : null);
  }, []);

  const loadShoppingState = useCallback(async () => {
    let hasCachedPayload = false;

    setLoadingList(true);
    setShoppingError(null);

    try {
      const authHeaders = await getBrowserAuthHeaders();
      const cacheScope = await getClientApiCacheScope(authHeaders);
      const cachedPayload = readClientJsonCache<ShoppingPayload>(SHOPPING_STATE_CACHE_KEY, cacheScope);

      if (cachedPayload) {
        hasCachedPayload = true;
        applyShoppingPayload(cachedPayload, shoppingItemImagesRef.current);
        setLoadingList(false);
      }

      const payload = await getPendingClientJsonRequest<ShoppingPayload>(
        `GET:/api/shopping:${cacheScope}`,
        async () => {
          const response = await fetch("/api/shopping", {
            cache: "no-store",
            headers: authHeaders
          });

          const nextPayload = (await response.json()) as ShoppingPayload;

          if (!response.ok || !nextPayload.ok) {
            throw new Error(nextPayload.message ?? `HTTP ${response.status}`);
          }

          return nextPayload;
        }
      );

      writeClientJsonCache(SHOPPING_STATE_CACHE_KEY, cacheScope, payload);
      applyShoppingPayload(payload, shoppingItemImagesRef.current);
    } catch {
      if (!hasCachedPayload) {
        setShoppingError("Impossible de charger la liste de courses.");
        setGroups([]);
        setCompletedSession(null);
      }
    } finally {
      setLoadingList(false);
    }
  }, [applyShoppingPayload]);

  const loadSuggestions = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingSuggestions(true);
      const currentDiet = readStoredDiet();
      const params = new URLSearchParams();

      if (currentDiet) {
        params.set("diet", currentDiet);
      }

      if (forceRefresh) {
        params.set("refresh", "1");
      }

      const query = params.toString() ? `?${params.toString()}` : "";

      const response = await fetch(`/api/shopping/suggestions${query}`, {
        cache: "no-store",
        headers: await getBrowserAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { suggestions: ShoppingSuggestion[] };
      setSuggestions(payload.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    let storedHiddenIds: string[] = [];

    try {
      const storedHidden = window.localStorage.getItem(SHOPPING_SUGGESTIONS_STORAGE_KEY);
      if (storedHidden) {
        storedHiddenIds = JSON.parse(storedHidden) as string[];
        setHiddenSuggestionIds(storedHiddenIds);
      }
    } catch {
      setHiddenSuggestionIds([]);
    }

    void loadShoppingState();
    void loadSuggestions();
  }, [loadShoppingState, loadSuggestions]);

  useEffect(() => {
    window.localStorage.setItem(SHOPPING_SUGGESTIONS_STORAGE_KEY, JSON.stringify(hiddenSuggestionIds));
  }, [hiddenSuggestionIds]);

  useEffect(() => {
    shoppingItemImagesRef.current = shoppingItemImages;
    window.localStorage.setItem(SHOPPING_ITEM_IMAGES_STORAGE_KEY, JSON.stringify(shoppingItemImages));
  }, [shoppingItemImages]);

  useEffect(() => {
    dismissedCompletionKeysRef.current = dismissedCompletionKeys;
    window.localStorage.setItem(SHOPPING_COMPLETION_DISMISSALS_STORAGE_KEY, JSON.stringify(dismissedCompletionKeys.slice(-20)));
  }, [dismissedCompletionKeys]);

  const totalItems = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);
  const completedItems = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.filter((item) => item.checked).length, 0),
    [groups]
  );
  const visibleSuggestions = useMemo(
    () => suggestions.filter((item) => !hiddenSuggestionIds.includes(item.id)).slice(0, 8),
    [hiddenSuggestionIds, suggestions]
  );

  async function mutateShopping(actionPayload: Record<string, unknown>, imageMap = shoppingItemImages) {
    const authHeaders = await getBrowserAuthHeaders();
    const cacheScope = await getClientApiCacheScope(authHeaders);
    const response = await fetch("/api/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(actionPayload)
    });

    const payload = (await response.json()) as ShoppingPayload;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message ?? `HTTP ${response.status}`);
    }

    writeClientJsonCache(SHOPPING_STATE_CACHE_KEY, cacheScope, payload);
    applyShoppingPayload(payload, imageMap);
  }

  async function addManualItem() {
    const label = newItemLabel.trim();
    const quantity = Number(newItemQuantity.replace(",", "."));

    if (!label || !Number.isFinite(quantity) || quantity <= 0) {
      setShoppingError("Renseigne un nom d'article et une quantité valide.");
      return;
    }

    setSubmittingItem(true);
    setShoppingError(null);

    try {
      await mutateShopping({
        action: "add_item",
        label,
        quantity,
        unit: "pieces",
        category: "other"
      });
      setNewItemLabel("");
      setNewItemQuantity("");
    } catch {
      setShoppingError("Impossible d'ajouter cet article.");
    } finally {
      setSubmittingItem(false);
    }
  }

  async function toggleChecked(itemId: string, checked: boolean) {
    try {
      await mutateShopping({ action: "toggle_item", itemId, checked });
      setShoppingError(null);
    } catch {
      setShoppingError("Impossible de mettre à jour cet article.");
    }
  }

  async function checkAllItems() {
    if (totalItems === 0 || completedItems === totalItems) {
      return;
    }

    try {
      await mutateShopping({ action: "toggle_all", checked: true });
      setShoppingError(null);
    } catch {
      setShoppingError("Impossible de cocher toute la liste.");
    }
  }

  async function removeItem(itemId: string) {
    try {
      await mutateShopping({ action: "delete_item", itemId });
      setShoppingError(null);
    } catch {
      setShoppingError("Impossible de supprimer cet article.");
    }
  }

  async function addSuggestionToList(suggestion: ShoppingSuggestion) {
    const label = suggestion.label.trim();

    if (!label) {
      return;
    }

    setAddingSuggestionId(suggestion.id);
    setShoppingError(null);

    const nextImageMap = rememberSuggestionImage(suggestion);

    try {
      await mutateShopping(
        {
          action: "add_item",
          label,
          quantity: 1,
          unit: "pieces",
          category: "other"
        },
        nextImageMap
      );
      setHiddenSuggestionIds((current) => (current.includes(suggestion.id) ? current : [...current, suggestion.id]));
    } catch {
      setShoppingError("Impossible d'ajouter cette suggestion.");
    } finally {
      setAddingSuggestionId(null);
    }
  }

  function rememberSuggestionImage(suggestion: ShoppingSuggestion) {
    if (!suggestion.imageUrl) {
      return shoppingItemImages;
    }

    const key = shoppingItemImageKey(suggestion.label);

    if (!key) {
      return shoppingItemImages;
    }

    const nextImageMap = {
      ...shoppingItemImages,
      [key]: suggestion.imageUrl
    };

    setShoppingItemImages(nextImageMap);
    return nextImageMap;
  }

  function hideSuggestion(itemId: string) {
    setHiddenSuggestionIds((current) => (current.includes(itemId) ? current : [...current, itemId]));
  }

  function clearSuggestions() {
    setHiddenSuggestionIds((current) => {
      const merged = new Set([...current, ...visibleSuggestions.map((item) => item.id)]);
      return Array.from(merged);
    });
  }

  function resetSuggestions() {
    setLoadingSuggestions(true);
    window.localStorage.removeItem(SHOPPING_SUGGESTIONS_STORAGE_KEY);
    setHiddenSuggestionIds([]);
    void loadSuggestions(true);
  }

  async function completeShopping() {
    if (completedItems === 0) {
      return;
    }

    setCompletingList(true);
    setShoppingError(null);

    try {
      await mutateShopping({ action: "complete_list" });
    } catch {
      setShoppingError("Impossible de terminer la liste de courses.");
    } finally {
      setCompletingList(false);
    }
  }

  function dismissCompletedSession() {
    if (!completedSession) {
      return;
    }

    const completionKey = completedSessionKey(completedSession);
    setCompletedSession(null);
    setDismissedCompletionKeys((current) => (current.includes(completionKey) ? current : [...current, completionKey]));
  }

  async function restoreInitialState() {
    setCompletingList(true);
    setShoppingError(null);

    try {
      await mutateShopping({ action: "archive_list" });
      await loadShoppingState();
    } catch {
      setShoppingError("Impossible de réinitialiser la liste.");
    } finally {
      setCompletingList(false);
    }
  }

  return (
    <div>
      <PageHeader icon={ShoppingCart} title="Courses" description="Liste partagée et synchronisée pour tout le foyer." />

      {shoppingError ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{shoppingError}</div>
      ) : null}

      {completedSession ? (
        <Card className="mb-5 border-brand-200 bg-brand-50/80">
          <div className="flex flex-col gap-4 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-brand-600/10 p-2 text-brand-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Courses terminées</p>
                <p className="text-sm text-slate-600">
                  Il ne reste plus qu&apos;à scanner les articles achetés pour les ajouter au stock.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Rappel enregistré le {new Date(completedSession.completedAt).toLocaleString("fr-FR")}
                </p>
              </div>
              <Button
                variant="ghost"
                className="h-9 w-9 shrink-0 px-0 text-slate-500 hover:text-slate-900"
                aria-label="Masquer le rappel de courses terminées"
                onClick={dismissCompletedSession}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border border-brand-100 bg-white/80 p-4">
              {completedSession.groups.map((group) => (
                <section key={group.category}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.category}</h3>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                        <ProductThumbnail
                          name={item.label}
                          fallbackLabel={item.icon}
                          imageUrl={item.imageUrl}
                          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600"
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="truncate text-sm font-medium text-slate-900" title={item.label}>{item.label}</p>
                          <p className="truncate text-xs text-slate-500">{item.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">Ma liste</h2>
              <p className="text-sm text-slate-500">
                {totalItems} article{totalItems > 1 ? "s" : ""} · {completedItems} cochés
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="h-9 gap-2 px-3"
                onClick={() => void checkAllItems()}
                disabled={loadingList || totalItems === 0 || completedItems === totalItems}
              >
                <CheckCircle2 className="h-4 w-4" />
                Tout cocher
              </Button>
              <Button variant="secondary" className="h-9 gap-2 px-3" onClick={() => void restoreInitialState()} disabled={completingList}>
                <RotateCcw className="h-4 w-4" />
                Réinitialiser
              </Button>
            </div>
          </div>

          <div className="mb-5 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
            <input
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 outline-none focus:border-brand-500"
              value={newItemLabel}
              onChange={(event) => setNewItemLabel(event.target.value)}
              placeholder="Ajouter un article manuel"
            />
            <input
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 outline-none focus:border-brand-500"
              value={newItemQuantity}
              onChange={(event) => setNewItemQuantity(event.target.value)}
              inputMode="decimal"
              placeholder="Quantité"
            />
            <Button className="h-11 gap-2" onClick={() => void addManualItem()} disabled={submittingItem}>
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>

          {loadingList ? <p className="mb-4 text-sm text-slate-500">Chargement de la liste...</p> : null}

          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.category}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.category}</h3>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-3 py-4 last:border-b-0">
                      <input
                        className="h-5 w-5 shrink-0 rounded border-slate-300"
                        type="checkbox"
                        checked={item.checked ?? false}
                        onChange={() => void toggleChecked(item.id, !(item.checked ?? false))}
                      />
                      <ProductThumbnail
                        name={item.label}
                        fallbackLabel={item.icon}
                        imageUrl={item.imageUrl}
                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600"
                      />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className={item.checked ? "truncate text-slate-400 line-through" : "truncate"} title={item.label}>{item.label}</p>
                        <p className="truncate text-sm text-slate-500">{item.quantity}</p>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 shrink-0 px-0 text-slate-400 hover:text-rose-600"
                        aria-label={`Supprimer ${item.label}`}
                        onClick={() => void removeItem(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {!loadingList && groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                La liste est vide. Ajoute un article ou utilise les suggestions.
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-24 mt-6 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-brand-600 bg-white p-4 shadow-soft lg:bottom-6">
            <div className="flex min-w-0 items-center gap-3">
              <CheckCircle2 className="h-7 w-7 shrink-0 text-brand-600" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{totalItems} article{totalItems > 1 ? "s" : ""} dans le panier</p>
                <p className="truncate text-sm text-slate-500">Prêt à finaliser vos courses ?</p>
              </div>
            </div>
            <Button className="shrink-0 px-3 sm:px-4" onClick={() => void completeShopping()} disabled={completedItems === 0 || completingList}>
              {completingList ? "En cours..." : "Terminer"}
            </Button>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex min-w-0 flex-col items-start gap-3">
            <h2 className="font-bold">Suggestions Open Food Facts</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="h-9 gap-2 px-3" onClick={resetSuggestions}>
                <RotateCcw className="h-4 w-4" />
                Rafraîchir
              </Button>
              <Button variant="ghost" className="h-9 gap-2 px-3 text-rose-600" onClick={clearSuggestions} disabled={visibleSuggestions.length === 0}>
                <Trash2 className="h-4 w-4" />
                Vider
              </Button>
            </div>
          </div>

          {loadingSuggestions ? <p className="text-sm text-slate-500">Chargement des suggestions Open Food Facts...</p> : null}

          <div className="space-y-3">
            {visibleSuggestions.map((item, index) => (
              <div
                key={item.id}
                className={`stagger-item-enter stagger-delay-${Math.min(index, 7)} flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3`}
              >
                <ProductThumbnail
                  name={item.label}
                  fallbackLabel={item.icon}
                  imageUrl={item.imageUrl}
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600"
                />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate font-medium" title={item.label}>{item.label}</p>
                  <p className="truncate text-sm text-slate-500">{item.reason}</p>
                </div>
                <Button
                  className="h-9 w-9 shrink-0 px-0"
                  aria-label={`Ajouter ${item.label} à la liste`}
                  onClick={() => void addSuggestionToList(item)}
                  disabled={addingSuggestionId === item.id}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="h-9 w-9 shrink-0 px-0" aria-label={`Masquer ${item.label}`} onClick={() => hideSuggestion(item.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {!loadingSuggestions && visibleSuggestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Plus de suggestions visibles. Rafraîchis la liste pour en récupérer depuis Open Food Facts.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function loadStoredShoppingItemImages(): ShoppingItemImageMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedImages = window.localStorage.getItem(SHOPPING_ITEM_IMAGES_STORAGE_KEY);
    if (!storedImages) {
      return {};
    }

    const parsed = JSON.parse(storedImages) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

function loadStoredCompletionDismissals() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedDismissals = window.localStorage.getItem(SHOPPING_COMPLETION_DISMISSALS_STORAGE_KEY);
    if (!storedDismissals) {
      return [];
    }

    const parsed = JSON.parse(storedDismissals) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function readStoredDiet(): DietType | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedProfile = readStoredSettingsProfile(window.localStorage, [SETTINGS_STORAGE_KEY]);
    if (!storedProfile) {
      return null;
    }

    return isDiet(storedProfile.diet) ? storedProfile.diet : null;
  } catch {
    return null;
  }
}

function isDiet(value: unknown): value is DietType {
  return value === "omnivore" || value === "vegetarian" || value === "vegan" || value === "pescatarian";
}

function shouldShowCompletedSession(session: ShoppingCompletionSession | null, dismissedKeys: string[]) {
  if (!session || isCompletedSessionExpired(session)) {
    return false;
  }

  return !dismissedKeys.includes(completedSessionKey(session));
}

function isCompletedSessionExpired(session: ShoppingCompletionSession) {
  const completedTime = Date.parse(session.completedAt);

  if (!Number.isFinite(completedTime)) {
    return true;
  }

  return Date.now() - completedTime >= COMPLETED_SESSION_VISIBLE_MS;
}

function completedSessionKey(session: ShoppingCompletionSession) {
  return session.completedAt;
}

function withCompletedShoppingImages(session: ShoppingCompletionSession, imageMap: ShoppingItemImageMap): ShoppingCompletionSession {
  return {
    ...session,
    groups: withShoppingImages(session.groups, imageMap)
  };
}

function withShoppingImages(groups: ShoppingGroup[], imageMap: ShoppingItemImageMap): ShoppingGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      imageUrl: item.imageUrl ?? imageMap[shoppingItemImageKey(item.label)]
    }))
  }));
}

function shoppingItemImageKey(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
