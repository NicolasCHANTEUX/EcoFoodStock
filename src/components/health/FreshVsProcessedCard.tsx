"use client";

import { useEffect, useState } from "react";
import { PieChart } from "lucide-react";

export function FreshVsProcessedCard({ ratio }: { ratio?: { fresh: number; processed: number } }) {
  const fresh = ratio?.fresh ?? 0;
  const processed = ratio?.processed ?? 100 - fresh;
  const size = 120;
  const center = size / 2;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const freshStroke = (fresh / 100) * circumference;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Frais vs Transformé</h3>
        <PieChart className="h-5 w-5 text-amber-500" />
      </div>

      <div className="mt-6 flex flex-col lg:flex-row items-center gap-6">
        <div className="flex-shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <defs>
              <linearGradient id="freshGrad" x1="0" x2="1">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            <g transform={`translate(${center},${center})`}>
              <circle r={radius} fill="#F8FAFC" />
              {/* background ring */}
              <circle r={radius} fill="transparent" stroke="#E6E7EA" strokeWidth={12} />

              {/* fresh arc */}
              <circle
                r={radius}
                fill="transparent"
                stroke="url(#freshGrad)"
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={`${freshStroke} ${circumference - freshStroke}`}
                strokeDashoffset={animated ? 0 : circumference}
                transform={`rotate(-90)`}
                className="eco-fresh-ring"
              />

              {/* center label */}
              <text textAnchor="middle" dy="-6" fontSize={18} fill="#0F172A" className="font-semibold">
                {Math.round(fresh)}%
              </text>
              <text textAnchor="middle" dy="12" fontSize={11} fill="#475569">
                Produits frais
              </text>
            </g>
          </svg>
        </div>

        <div className="flex-1 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />
              <div className="text-sm text-slate-600">Frais / Brut</div>
            </div>
            <div className="text-sm font-semibold text-slate-800">{Math.round(fresh)}%</div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
              <div className="text-sm text-slate-600">Transformé</div>
            </div>
            <div className="text-sm font-semibold text-slate-800">{Math.round(processed)}%</div>
          </div>

          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <svg className="h-2 w-full text-emerald-400" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                <rect width={Math.max(0, Math.min(100, fresh))} height="8" rx="4" fill="currentColor" />
              </svg>
            </div>
            <div className="mt-3 text-sm text-slate-600">{fresh >= 60 ? "Bon équilibre — continuez ainsi !" : "Augmentez les produits frais dans vos repas."}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
