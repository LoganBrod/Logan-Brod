"use client";

import { useMemo, useRef, useState } from "react";
import { SeriesPoint, fmtDate, fmtMoney } from "../types";

const W = 720;
const H = 260;
const PAD = { top: 16, right: 72, bottom: 28, left: 56 };

const SERIES = "#3987e5"; // validated vs #141428 surface
const GRID = "#1E1E3A";
const AXIS_TEXT = "#898781";

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ??
    10 * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }
  return ticks;
}

export default function ProfitChart({ series }: { series: SeriesPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (series.length === 0) return null;
    const values = series.map((p) => p.value);
    let vMin = Math.min(0, ...values);
    let vMax = Math.max(0, ...values);
    if (vMin === vMax) vMax = vMin + 1;
    const ticks = niceTicks(vMin, vMax);
    vMin = Math.min(vMin, ticks[0]);
    vMax = Math.max(vMax, ticks[ticks.length - 1]);

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - ((v - vMin) / (vMax - vMin)) * plotH;

    const pts = series.map((p, i) => ({ px: x(i), py: y(p.value), ...p }));
    const linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`)
      .join(" ");
    const zeroY = y(0);
    const areaPath =
      pts.length > 1
        ? `${linePath} L${pts[pts.length - 1].px.toFixed(1)},${zeroY.toFixed(1)} L${pts[0].px.toFixed(1)},${zeroY.toFixed(1)} Z`
        : "";
    return { pts, linePath, areaPath, ticks, y, zeroY };
  }, [series]);

  if (!geom || series.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        Log daily entries to see your profit curve.
      </div>
    );
  }

  const { pts, linePath, areaPath, ticks, y, zeroY } = geom;
  const hover = hoverIdx !== null ? pts[hoverIdx] : null;
  const last = pts[pts.length - 1];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.px - mx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIdx(best);
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Cumulative net profit over time"
      >
        {/* gridlines + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize={11}
              fill={AXIS_TEXT}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t === 0
                ? "$0"
                : `${t < 0 ? "-" : ""}$${Math.abs(t).toLocaleString("en-US")}`}
            </text>
          </g>
        ))}
        {/* zero baseline emphasized */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={zeroY}
          y2={zeroY}
          stroke="#383855"
          strokeWidth={1}
        />

        {/* area wash + line */}
        {areaPath && <path d={areaPath} fill={SERIES} opacity={0.1} />}
        <path
          d={linePath}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* end marker with surface ring + direct end label */}
        <circle cx={last.px} cy={last.py} r={6} fill="#141428" />
        <circle cx={last.px} cy={last.py} r={4} fill={SERIES} />
        <text
          x={last.px + 10}
          y={last.py + 4}
          fontSize={12}
          fontWeight={600}
          fill="#ffffff"
        >
          {fmtMoney(last.value)}
        </text>

        {/* first/last x labels */}
        <text x={pts[0].px} y={H - 8} fontSize={11} fill={AXIS_TEXT} textAnchor="start">
          {fmtDate(pts[0].date)}
        </text>
        {pts.length > 1 && (
          <text
            x={last.px}
            y={H - 8}
            fontSize={11}
            fill={AXIS_TEXT}
            textAnchor="end"
          >
            {fmtDate(last.date)}
          </text>
        )}

        {/* hover crosshair + point */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.px}
              x2={hover.px}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#52516e"
              strokeWidth={1}
            />
            <circle cx={hover.px} cy={hover.py} r={6} fill="#141428" />
            <circle cx={hover.px} cy={hover.py} r={4} fill={SERIES} />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="absolute pointer-events-none bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hover.px / W) * 100}%`,
            top: 0,
            transform: hover.px > W * 0.7 ? "translateX(-110%)" : "translateX(12px)",
          }}
        >
          <p className="text-gray-400">{fmtDate(hover.date)}</p>
          <p className="text-white font-semibold mt-0.5">
            {fmtMoney(hover.value)}{" "}
            <span className="text-gray-500 font-normal">net profit</span>
          </p>
        </div>
      )}
    </div>
  );
}
