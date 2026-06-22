"use client";

export function SeasonalityCard({ score = 85 }: { score?: number }) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Score de Saisonnalité</h3>

      <div className="mt-6">
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
          <svg className="h-3 w-full text-slate-900" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
            <rect width={normalizedScore} height="12" rx="6" fill="currentColor" />
          </svg>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-slate-600">De saison: Tomates, courgettes, haricots verts</div>
          <div className="text-lg font-bold text-emerald-600">{normalizedScore}%</div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-md bg-emerald-50 p-3 text-sm">De saison<br/><span className="text-xs text-slate-600">Tomates, courgettes</span></div>
          <div className="rounded-md bg-sky-50 p-3 text-sm">Impact écologique<br/><span className="text-xs text-slate-600">Faible empreinte</span></div>
          <div className="rounded-md bg-amber-50 p-3 text-sm">Conseil<br/><span className="text-xs text-slate-600">Privilégiez les circuits courts</span></div>
        </div>
      </div>
    </div>
  );
}
