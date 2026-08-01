import {
  canStepFontSize,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  setFontSize,
  stepFontSize,
  useFontSize,
} from "@/lib/ui/fontStore";

/**
 * 文字サイズ（10〜20px を 1px 刻み）の調整コントロール。
 * 設定は全パネルに連動し、localStorage に自動保存される。
 */
export default function FontSizeControl() {
  const size = useFontSize();

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      title={`文字サイズ ${size}px（${MIN_FONT_SIZE}〜${MAX_FONT_SIZE}px）`}
    >
      <div className="flex items-center rounded border border-slate-700">
        <button
          type="button"
          onClick={() => stepFontSize(-1)}
          disabled={!canStepFontSize(-1)}
          aria-label="文字を小さく"
          className="px-1.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
        >
          A−
        </button>
        <button
          type="button"
          onClick={() => stepFontSize(1)}
          disabled={!canStepFontSize(1)}
          aria-label="文字を大きく"
          className="px-1.5 text-[13px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
        >
          A+
        </button>
      </div>

      <input
        type="range"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        value={size}
        onChange={(e) => setFontSize(Number(e.target.value))}
        aria-label="文字サイズ"
        className="h-1 w-16 cursor-pointer accent-emerald-500"
      />

      {/* サイズ表示自体は固定 px。可変にすると操作中に幅が動いて押しにくい */}
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-500">
        {size}px
      </span>
    </div>
  );
}
