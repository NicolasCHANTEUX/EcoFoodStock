"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { groupActivityEvents } from "@/lib/activity-events";
import { SETTINGS_PROFILE_STORAGE_KEY, writeStoredSettingsProfile } from "@/lib/settings-storage";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import type { SettingsProfile } from "@/lib/settings";
import type { ActivityEvent } from "@/types/domain";

const filters = ["Tout", "Entrées", "Consommés", "Jetés", "Paramètres"];
const SETTINGS_STORAGE_KEY = SETTINGS_PROFILE_STORAGE_KEY;

export function HistoryView({ embedded = false }: { embedded?: boolean } = {}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("Tout");
  const [undoingEventId, setUndoingEventId] = useState<string | null>(null);
  const [pendingUndoEvent, setPendingUndoEvent] = useState<ActivityEvent | null>(null);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/history", {
        cache: "no-store",
        headers: await getBrowserAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { events: ActivityEvent[] };
      setEvents(payload.events);
    } catch {
      setError("Impossible de charger l'historique depuis Supabase.");
    } finally {
      setLoading(false);
    }
  }

  async function undoEvent(event: ActivityEvent) {
    if (!event.canUndo || undoingEventId) {
      return;
    }

    setUndoingEventId(event.id);
    setError(null);

    try {
      const authHeaders = await getBrowserAuthHeaders();
      const response = await fetch("/api/history/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id })
      });

      const payload = (await response.json()) as {
        ok: boolean;
        message?: string;
        restoredSettingsProfile?: Record<string, unknown>;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? `HTTP ${response.status}`);
      }

      // If undo restored settings from server metadata, mirror that in local storage.
      if (payload.restoredSettingsProfile) {
        writeStoredSettingsProfile(window.localStorage, SETTINGS_STORAGE_KEY, payload.restoredSettingsProfile as SettingsProfile);
      }

      await loadHistory();
    } catch {
      setError("Impossible d'annuler cette action pour le moment.");
    } finally {
      setUndoingEventId(null);
    }
  }

  const visibleGroups = useMemo(() => {
    return groupActivityEvents(events)
      .map((group) => ({
        ...group,
        events: group.events.filter((event) => matchesActivityFilter(event, activeFilter))
      }))
      .filter((group) => group.events.length > 0);
  }, [activeFilter, events]);

  return (
    <div>
      {!embedded ? <PageHeader icon={History} title="Historique d'activité" /> : null}

      {error ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button key={filter} type="button" onClick={() => setActiveFilter(filter)}>
            <Badge tone={activeFilter === filter ? "blue" : "slate"}>
              {filter}
            </Badge>
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Chargement de l'historique depuis Supabase...
        </Card>
      ) : visibleGroups.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-semibold">Aucune activité pour ce filtre</p>
          <p className="mt-1 text-sm text-slate-500">
            Les actions sur l'inventaire apparaitront ici.
          </p>
        </Card>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {visibleGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:mb-2 sm:text-xs">
                {group.label}
              </h2>
              <Card className="space-y-1.5 p-1.5 sm:space-y-3 sm:p-3">
                {group.events.map((event, eventIndex) => (
                  <div
                    key={event.id}
                    className="stagger-item-enter grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 sm:gap-3 sm:p-2"
                    style={{ "--stagger-item-delay": `${Math.min(eventIndex * 32, 180)}ms` } as CSSProperties}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3 ${event.color}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-5 text-slate-900 sm:text-base" title={event.title}>{event.title}</p>
                      <p className="truncate text-xs leading-4 text-slate-500 sm:text-sm" title={`${event.description} - ${formatActivityDateTime(event.createdAt)}`}>
                        {event.description} - {formatActivityDateTime(event.createdAt)}
                      </p>
                    </div>
                    {event.canUndo ? (
                      <Button
                        variant="secondary"
                        className="h-7 shrink-0 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs"
                        onClick={() => setPendingUndoEvent(event)}
                        disabled={undoingEventId === event.id}
                      >
                        {undoingEventId === event.id ? "Annulation..." : "Annuler"}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingUndoEvent !== null}
        title="Annuler cette action ?"
        description={pendingUndoEvent ? `L'action "${pendingUndoEvent.title}" sera inversée si c'est encore possible.` : undefined}
        confirmLabel="Annuler l'action"
        onCancel={() => setPendingUndoEvent(null)}
        onConfirm={() => {
          const event = pendingUndoEvent;
          setPendingUndoEvent(null);
          if (event) {
            void undoEvent(event);
          }
        }}
      />
    </div>
  );
}

function matchesActivityFilter(event: ActivityEvent, filter: string) {
  const isSettingsEvent = event.metadata?.section === "settings";

  if (filter === "Tout") {
    return true;
  }

  if (filter === "Entrées") {
    return event.type === "product_added" && !isSettingsEvent;
  }

  if (filter === "Consommés") {
    return (event.type === "product_consumed" || event.type === "product_adjusted") && !isSettingsEvent;
  }

  if (filter === "Jetés") {
    return event.type === "product_wasted" && !isSettingsEvent;
  }

  if (filter === "Paramètres") {
    return isSettingsEvent;
  }

  return true;
}

function formatActivityDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
