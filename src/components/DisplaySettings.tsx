import { setShowTooltips, useShowTooltips } from "@/lib/ui/displayPrefs";
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  setFontSize,
  useFontSize,
} from "@/lib/ui/fontStore";
import { resetSlots } from "@/lib/ui/layoutStore";

/** 表示まわりの設定。端末ごとの好みなので即時保存する。 */
export default function DisplaySettings() {
  const showTooltips = useShowTooltips();
  const fontSize = useFontSize();

  return (
    <div className="space-y-3">
      <p className="t-label leading-relaxed text-slate-500">
        表示に関する設定です。変更は即座に画面へ反映され、この端末に保存されます。
      </p>

      <Row
        title="ツールチップ（ホバー案内）を表示する"
        description="ボタンにマウスを重ねたとき、使い方の吹き出しを出します。慣れてきたら OFF にできます。"
      >
        <Toggle
          checked={showTooltips}
          onChange={setShowTooltips}
          label="ツールチップ（ホバー案内）を表示する"
        />
      </Row>

      <Row
        title="文字サイズ"
        description={`本文・パネル・サイドバーの文字サイズ（${MIN_FONT_SIZE}〜${MAX_FONT_SIZE}px）。メニューバー右端でも変更できます。`}
      >
        <span className="flex shrink-0 items-center gap-2">
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            aria-label="文字サイズ"
            className="h-1 w-40 cursor-pointer accent-emerald-500"
          />
          <span className="w-12 shrink-0 text-right font-mono t-label text-slate-400">
            {fontSize}px
          </span>
        </span>
      </Row>

      <Row
        title="パネル配置を初期状態に戻す"
        description="市場データ・分析結果・対話の配置を、既定の並びに戻します。"
      >
        <button
          type="button"
          onClick={() => resetSlots()}
          className="min-h-8 shrink-0 whitespace-nowrap rounded-md border border-slate-600 px-3 t-body text-slate-200 transition-colors hover:border-emerald-700 hover:bg-slate-800 hover:text-emerald-300"
        >
          配置を初期化
        </button>
      </Row>
    </div>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block t-body font-medium text-slate-200">{title}</span>
        <span className="mt-0.5 block t-label leading-relaxed text-slate-500">
          {description}
        </span>
      </span>
      {children}
    </div>
  );
}

/** 見た目だけのトグルスイッチ。中身は checkbox なのでキーボードでも操作できる。 */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/70 ${
          checked ? "bg-emerald-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-4.5" : "left-0.5"
          }`}
        />
      </span>
      <span className="t-body text-slate-300">{checked ? "ON" : "OFF"}</span>
    </label>
  );
}
