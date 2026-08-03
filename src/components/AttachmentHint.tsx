import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/i18n";

/**
 * 「何を添付すれば精度が上がるか」の案内。
 *
 * **普段は小さなバッジに留める。** ドロップ領域の隣は常に見えている場所なので、
 * 案内を出しっぱなしにすると、肝心の「ここに落とす」が埋もれる。
 *
 * ホバーでもクリックでも開く。**クリックでも開けるようにするのが要点**で、
 * ホバーだけだと、読んでいる途中にポインタが外れて消える。
 */
export default function AttachmentHint() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 外側をクリックしたら閉じる（開きっぱなしで画面を覆わない）
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const items = [
    t("attachHint.item1"),
    t("attachHint.item2"),
    t("attachHint.item3"),
    t("attachHint.item4"),
  ];

  return (
    <div ref={ref} className="ui-fixed relative shrink-0">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onClick={() => {
          setPinned((v) => !v);
          setOpen(true);
        }}
        aria-expanded={open}
        className={`flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] transition-colors ${
          open
            ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
            : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-300"
        }`}
      >
        <span aria-hidden="true">💡</span>
        {t("attachHint.badge")}
      </button>

      {open && (
        <div
          role="tooltip"
          /*
            下方向へ出す。ドロップ領域は画面の上部にあるので、
            上へ出すとメニューバーに隠れる。
          */
          className="absolute right-0 top-full z-50 mt-1.5 w-96 max-w-[90vw] rounded-lg border border-slate-700 bg-slate-900 p-3 text-[11px] leading-relaxed shadow-2xl shadow-black/60"
        >
          <p className="font-semibold text-emerald-300">{t("attachHint.title")}</p>

          {/* 何が自動で入るかを先に言う。重複した資料を集める手間を省く */}
          <p className="mt-1.5 text-slate-400">{t("attachHint.autoNote")}</p>

          <p className="mt-2 text-slate-300">{t("attachHint.lead")}</p>
          <ul className="mt-1.5 space-y-1">
            {items.map((item) => (
              <li key={item} className="flex gap-1.5 text-slate-300">
                <span className="shrink-0 text-emerald-400" aria-hidden="true">
                  •
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
