import {
  canStepFontSize,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  setFontSize,
  stepFontSize,
  useFontSize,
} from "@/lib/ui/fontStore";

/**
 * 文字サイズ（10〜28px を 1px 刻み）の調整コントロール。
 * 設定は全パネルに連動し、localStorage に自動保存される。
 *
 * **このコントロール自身のサイズは px で完全固定する。**
 * 文字サイズに連動させると、スライダーを掴んでいる最中に
 * つまみやボタンが太って**カーソルの下から逃げ、操作できなくなる**ため。
 */
export default function FontSizeControl() {
  const size = useFontSize();

  return (
    <div
      className="ui-fixed flex shrink-0 items-center gap-[6px]"
      title={`文字サイズ ${size}px（${MIN_FONT_SIZE}〜${MAX_FONT_SIZE}px）`}
    >
      <div className="flex items-center rounded border border-slate-700">
        <button
          type="button"
          onClick={() => stepFontSize(-1)}
          disabled={!canStepFontSize(-1)}
          aria-label="文字を小さく"
          className="h-[22px] w-[26px] shrink-0 text-[11px] leading-none text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
        >
          A−
        </button>
        <button
          type="button"
          onClick={() => stepFontSize(1)}
          disabled={!canStepFontSize(1)}
          aria-label="文字を大きく"
          className="h-[22px] w-[26px] shrink-0 text-[13px] leading-none text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
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
        className="h-[4px] w-[72px] shrink-0 cursor-pointer accent-emerald-500"
      />

      {/* 表示幅も固定。可変にすると桁が増えたときに横へ動いて押しにくい */}
      <span className="w-[34px] shrink-0 text-right font-mono text-[11px] text-slate-500">
        {size}px
      </span>
    </div>
  );
}
