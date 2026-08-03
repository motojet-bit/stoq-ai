import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { measureOverflow, type OverflowState } from "@/lib/ui/overflow";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * 横に溢れたら、端にフェードと「▶」を出す入れ物。
 *
 * **入りきっていないことが見えないと、打つ手が分からない。**
 * 隠れているものがあると分かれば、窓を広げるか横へ送るかを選べる。
 *
 * 幅はウィンドウのリサイズだけでなく**文字サイズの変更（A+/A−）でも変わる**ので、
 * `ResizeObserver` で中身と枠の両方を見張る。
 */
export default function OverflowScroller({ children, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<OverflowState>({ left: false, right: false });
  const t = useT();

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setState(measureOverflow(el));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();

    // 枠の幅と中身の幅、どちらが変わっても測り直す
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update, children]);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={ref}
        onScroll={update}
        className={`flex min-w-0 items-center gap-2 overflow-x-auto ${className}`}
      >
        {children}
      </div>

      {/* 左へ戻せることを示す（横へ送ったあと） */}
      {state.left && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-slate-900 to-transparent"
        />
      )}

      {state.right && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-900 to-transparent"
          />
          {/*
            フェードだけだと「見切れている」と気づかない人がいるので、
            記号も添える。読み上げには文言で伝える。
          */}
          <span
            title={t("overflow.more")}
            className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] leading-none text-slate-500"
          >
            <span aria-hidden="true">▶</span>
            <span className="sr-only">{t("overflow.more")}</span>
          </span>
        </>
      )}
    </div>
  );
}
