import { useState } from "react";
import type { Quarter, QuarterlySeries } from "@/types";

interface Props {
  series: QuarterlySeries | null;
  loading: boolean;
}

type MetricKey = "revenue" | "netIncome" | "netMargin" | "eps";

interface MetricDef {
  key: MetricKey;
  label: string;
  /** 棒グラフの高さに使う値 */
  value: (q: Quarter) => number | null;
  /** 棒の上に出す表示 */
  display: (q: Quarter) => string;
  /** 単位が % なら true（負値も扱う） */
  isPercent?: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: "revenue",
    label: "売上高",
    value: (q) => q.revenue,
    display: (q) => q.revenueDisplay,
  },
  {
    key: "netIncome",
    label: "純利益",
    value: (q) => q.netIncome,
    display: (q) => q.netIncomeDisplay,
  },
  {
    key: "netMargin",
    label: "純利益率",
    value: (q) => q.netMargin,
    display: (q) => (q.netMargin === null ? "—" : `${q.netMargin.toFixed(1)}%`),
    isPercent: true,
  },
  {
    key: "eps",
    label: "EPS",
    value: (q) => q.epsActual,
    display: (q) => (q.epsActual === null ? "—" : q.epsActual.toFixed(2)),
  },
];

/**
 * 直近 4 四半期の推移。TradingView のように指標を切り替えて見られる。
 *
 * 季節性のある企業では前四半期比が誤解を招くため、
 * 前年同期比を主役にし、加速 / 減速をバッジで示す。
 */
export default function QuarterlyTrend({ series, loading }: Props) {
  const [metricKey, setMetricKey] = useState<MetricKey>("revenue");

  if (loading) {
    return (
      <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
        <div className="mb-3 h-3 w-32 animate-pulse rounded bg-slate-800" />
        <div className="flex items-end gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex-1">
              <div
                className="animate-pulse rounded bg-slate-800"
                style={{ height: `${40 + i * 12}px` }}
              />
              <div className="mt-2 h-2 animate-pulse rounded bg-slate-800/70" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!series || series.quarters.length === 0) return null;

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const values = series.quarters.map(metric.value);
  const numeric = values.filter((v): v is number => v !== null);
  const max = numeric.length > 0 ? Math.max(...numeric, 0) : 1;
  const min = numeric.length > 0 ? Math.min(...numeric, 0) : 0;
  const span = Math.max(max - min, 1e-9);

  const { accelerating, latestYoy, previousYoy } = series.momentum;

  return (
    <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[12px] font-medium text-slate-300">四半期推移（直近4Q）</h2>

        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                m.key === metricKey
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <MomentumBadge
          accelerating={accelerating}
          latestYoy={latestYoy}
          previousYoy={previousYoy}
        />

        <span className="ml-auto text-[10px] text-slate-600">{series.source}</span>
      </div>

      <div className="flex items-stretch gap-3">
        {series.quarters.map((q) => {
          const v = metric.value(q);
          // 負値も扱えるよう、最小値からの相対高さにする
          const ratio = v === null ? 0 : (v - Math.min(min, 0)) / span;
          const height = Math.max(ratio * 72, v === null ? 0 : 4);

          return (
            <div key={q.endDate} className="flex min-w-0 flex-1 flex-col">
              <div className="mb-1 flex h-20 items-end">
                <div
                  className={`w-full rounded-t ${
                    v === null
                      ? "bg-slate-800"
                      : v < 0
                        ? "bg-red-600/70"
                        : "bg-emerald-600/70"
                  }`}
                  style={{ height: `${height}px` }}
                />
              </div>

              <div className="truncate text-center font-mono text-[11px] text-slate-200">
                {metric.display(q)}
              </div>
              <div className="truncate text-center text-[10px] text-slate-500">{q.label}</div>

              <div className="mt-1 flex justify-center gap-2 text-[10px]">
                <Delta label="QoQ" value={q.revenueQoq} muted />
                <Delta label="YoY" value={q.revenueYoy} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="selectable mt-3 border-t border-slate-800 pt-2 text-[11px] leading-relaxed text-slate-400">
        {series.momentum.summary}
      </p>
      {series.note && (
        <p className="selectable mt-1 text-[10px] leading-relaxed text-slate-600">
          ※ {series.note}
        </p>
      )}
    </div>
  );
}

function MomentumBadge({
  accelerating,
  latestYoy,
  previousYoy,
}: {
  accelerating: boolean | null;
  latestYoy: number | null;
  previousYoy: number | null;
}) {
  if (accelerating === null || latestYoy === null || previousYoy === null) {
    return (
      <span className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-500">
        モメンタム判定不能
      </span>
    );
  }

  return (
    <span
      title={`売上 YoY: ${previousYoy.toFixed(1)}% → ${latestYoy.toFixed(1)}%`}
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        accelerating
          ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
          : "border-amber-800 bg-amber-950/50 text-amber-300"
      }`}
    >
      {accelerating ? "⏫ 成長が加速" : "⏬ 成長が減速"}
      <span className="ml-1 font-mono opacity-80">
        {previousYoy.toFixed(1)}% → {latestYoy.toFixed(1)}%
      </span>
    </span>
  );
}

function Delta({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number | null;
  muted?: boolean;
}) {
  if (value === null) {
    return <span className="text-slate-700">{label} —</span>;
  }
  const tone = muted
    ? "text-slate-600"
    : value >= 0
      ? "text-emerald-500"
      : "text-red-400";
  return (
    <span className={`font-mono ${tone}`} title={`${label}: ${value.toFixed(2)}%`}>
      {label} {value >= 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
