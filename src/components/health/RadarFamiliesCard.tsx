"use client";

import { useMemo, useEffect, useState } from "react";

export function RadarFamiliesCard({ radar }: { radar?: Record<string, number> }) {
  const categories = useMemo(
    () => [
      { key: "fruits", label: "Fruits" },
      { key: "vegetables", label: "Légumes" },
      { key: "starches", label: "Féculents" },
      { key: "dairy", label: "Laitages" },
      { key: "proteins", label: "Protéines" },
    ],
    []
  );

  const values = categories.map((c) => (radar && typeof radar[c.key] === "number" ? radar[c.key] : 65));

  const [animated, setAnimated] = useState(false);
  const [tooltip, setTooltip] = useState<null | { x: number; y: number; label: string; value: number }>(null);
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    setAnimated(true);
    const onResize = () => setIsSmall(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const size = isSmall ? 180 : 220;
  const padding = isSmall ? 20 : 28; // extra space to avoid label clipping
  const width = size + padding * 2;
  const cx = width / 2;
  const cy = isSmall ? 90 : 100;
  const maxRadius = isSmall ? 48 : 60;

  const pointsFor = (ratio: number, i: number) => {
    const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
    const r = (ratio / 100) * maxRadius;
    const x = Math.round(Math.cos(angle) * r + cx);
    const y = Math.round(Math.sin(angle) * r + cy);
    return `${x},${y}`;
  };

  const dataPoints = values.map((v, i) => pointsFor(v, i)).join(" ");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold">Radar des Familles d'Aliments</h3>
        <div className="text-sm text-slate-500">Répartition</div>
      </div>

      <div className="mt-4 flex flex-col items-center">
        <div className="relative">
        <svg className="overflow-visible" width={width} height={isSmall ? 170 : 200} viewBox={`0 0 ${width} ${isSmall ? 170 : 200}`}>
          <defs>
            <linearGradient id="radarGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* concentric grids */}
          {[0.2, 0.4, 0.6, 0.8, 1].map((r, idx) => {
            const pts = categories
              .map((_, i) => {
                const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
                const x = Math.cos(angle) * maxRadius * r + cx;
                const y = Math.sin(angle) * maxRadius * r + cy;
                return `${x},${y}`;
              })
              .join(" ");
            return <polygon key={idx} points={pts} fill={idx % 2 === 0 ? "#F8FAFC" : "transparent"} stroke="#E6E7EA" />;
          })}

          {/* axes */}
          {categories.map((_, i) => {
            const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
            const x = Math.cos(angle) * (maxRadius + 6) + cx;
            const y = Math.sin(angle) * (maxRadius + 6) + cy;
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E6E7EA" strokeWidth={1} />;
          })}

          {/* data polygon */}
          <polygon
            points={dataPoints}
            fill="url(#radarGrad)"
            stroke="#059669"
            strokeWidth={2}
            fillOpacity={0.6}
            className={`eco-radar-polygon ${animated ? "eco-radar-polygon-visible" : ""}`}
          />

          {/* points with tooltip handlers */}
          {values.map((v, i) => {
            const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
            const r = (v / 100) * maxRadius;
            const x = Math.cos(angle) * r + cx;
            const y = Math.sin(angle) * r + cy;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  fill="#10B981"
                  stroke="#fff"
                  strokeWidth={1.5}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => {
                    setTooltip({ x: x + 8, y: y - 36, label: categories[i].label, value: Math.round(v) });
                  }}
                  onMouseMove={(e) => {
                    const rect = (e.target as Element).closest("svg")?.getBoundingClientRect();
                    const offsetX = rect ? rect.left : 0;
                    const offsetY = rect ? rect.top : 0;
                    setTooltip({ x: e.clientX - offsetX + 8, y: e.clientY - offsetY - 36, label: categories[i].label, value: Math.round(v) });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            );
          })}

          {/* labels */}
          {categories.map((c, i) => {
            const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
            const x = Math.cos(angle) * (maxRadius + 22) + cx;
            const y = Math.sin(angle) * (maxRadius + 22) + cy;
            const anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
            // ensure labels stay inside visible area by clamping x/y within padding limits
            const clampedX = Math.max(padding / 2, Math.min(width - padding / 2, x));
            const clampedY = Math.max(12, Math.min(200 - 12, y));
            return (
              <g key={c.key}>
                <text x={clampedX} y={clampedY} textAnchor={anchor} fontSize={12} fill="#475569">
                  {c.label}
                </text>
                <text x={clampedX} y={clampedY + 14} textAnchor={anchor} fontSize={11} fill="#94A3B8">
                  {Math.round(values[i])}%
                </text>
              </g>
            );
          })}

          {tooltip ? (
            <g transform={`translate(${tooltip.x} ${tooltip.y})`} pointerEvents="none">
              <rect width="112" height="38" rx="6" fill="#0f172a" />
              <text x="8" y="15" fontSize="12" fontWeight="600" fill="#ffffff">
                {tooltip.label}
              </text>
              <text x="8" y="30" fontSize="11" fill="#cbd5e1">
                {tooltip.value}%
              </text>
            </g>
          ) : null}
        </svg>
        </div>

        <div className="mt-3 flex gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-400 inline-block" />
            <span>Votre profil</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-200 inline-block" />
            <span>Base 100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
