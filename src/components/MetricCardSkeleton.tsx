/** 指標カードの読み込み中プレースホルダー。 */
export default function MetricCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
      <div className="mb-3 h-3 w-28 animate-pulse rounded bg-slate-800" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div
              className="h-2.5 animate-pulse rounded bg-slate-800/80"
              style={{ width: `${45 + ((i * 13) % 30)}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-slate-800/50"
              style={{ width: `${20 + ((i * 7) % 15)}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
