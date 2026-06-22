"use client";

type Macronutrients = { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };

export function TrendChart({ stats }: { stats?: Macronutrients }) {
  // If stats provided, show macronutrient breakdown as three bars
  const protein = stats?.protein_g ?? 0;
  const carbs = stats?.carbs_g ?? 0;
  const fat = stats?.fat_g ?? 0;

  const data = protein || carbs || fat ? [protein, carbs, fat] : [120, 150, 110, 160, 140, 150, 145];
  const isSeries = data.length === 7;

  const max = Math.max(...data, 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Tendance / Répartition</h3>
      <div className="mt-4">
        {isSeries ? (
          <div className="flex items-end gap-3 h-40">
            {data.map((v: number, i: number) => {
              const height = Math.max(0, Math.min(100, (v / max) * 100));

              return (
              <div key={i} className="flex-1 text-center">
                <svg className="mx-auto h-40 w-10 text-amber-500" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <rect x="0" y={100 - height} width="100" height={height} rx="5" fill="currentColor" />
                </svg>
                <div className="mt-2 text-xs text-slate-600">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][i]}</div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-end gap-6 h-40">
            {[
              { label: "Protéines", value: protein, color: "bg-emerald-500" },
              { label: "Glucides", value: carbs, color: "bg-amber-400" },
              { label: "Lipides", value: fat, color: "bg-amber-600" }
            ].map((b, i) => (
              <div key={i} className="flex-1 text-center">
                <svg className="mx-auto h-40 w-12 text-amber-500" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <rect
                    x="0"
                    y={100 - Math.max(0, Math.min(100, (b.value / max) * 100))}
                    width="100"
                    height={Math.max(0, Math.min(100, (b.value / max) * 100))}
                    rx="5"
                    fill="currentColor"
                  />
                </svg>
                <div className="mt-2 text-sm font-medium">{b.label}</div>
                <div className="text-xs text-slate-600">{b.value ?? "—"}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <div />
          <div className="text-xs text-slate-400">Objectif : {stats?.calories ? `${stats.calories} kcal` : "—"}</div>
        </div>
      </div>
    </div>
  );
}
