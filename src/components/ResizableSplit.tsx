import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clampFirstSize, desiredFirstSize } from "@/lib/ui/splitMath";

export type SplitDirection = "vertical" | "horizontal";

interface Props {
  /** vertical = 上下に並べる / horizontal = 左右に並べる */
  direction: SplitDirection;
  first: ReactNode;
  second: ReactNode;
  /** 1 番目のペインの初期サイズ（px） */
  initialFirstSize?: number;
  minFirstSize?: number;
  minSecondSize?: number;
  /** どちらかを畳んでいるときは境界を出さない */
  collapsed?: "first" | "second" | null;
}

/**
 * ドラッグでサイズを変えられる 2 分割ビュー。
 *
 * **1 番目のペインに明示サイズを与え、2 番目に残りを割り当てる。**
 * 2 番目を固定にすると、中身が空のとき 1 番目が 0 まで潰れて
 * 仕切り線を掴めなくなるため（`splitMath.ts` の説明を参照）。
 */
export default function ResizableSplit({
  direction,
  first,
  second,
  initialFirstSize = 320,
  minFirstSize = 120,
  minSecondSize = 120,
  collapsed = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [firstSize, setFirstSize] = useState(initialFirstSize);
  const [dragging, setDragging] = useState(false);

  const isVertical = direction === "vertical";

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setFirstSize(
        clampFirstSize({
          desired: desiredFirstSize({
            vertical: isVertical,
            pointer: { x: e.clientX, y: e.clientY },
            rect,
          }),
          total: isVertical ? rect.height : rect.width,
          minFirst: minFirstSize,
          minSecond: minSecondSize,
        }),
      );
    },
    [isVertical, minFirstSize, minSecondSize],
  );

  useEffect(() => {
    if (!dragging) return;

    const stop = () => setDragging(false);
    document.body.classList.add(isVertical ? "is-resizing-v" : "is-resizing-h");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);

    return () => {
      document.body.classList.remove("is-resizing-v", "is-resizing-h");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
  }, [dragging, onPointerMove, isVertical]);

  /*
   * ウィンドウを縮めたとき、1 番目のペインが固定 px のままだと
   * 2 番目が押し出されて中身が見えなくなる。コンテナのサイズ変化を監視して
   * 常に「両方が最小サイズを満たす」範囲へ入れ直す。
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const total = isVertical ? rect.height : rect.width;
      if (total <= 0) return;
      setFirstSize((current) =>
        clampFirstSize({
          desired: current,
          total,
          minFirst: minFirstSize,
          minSecond: minSecondSize,
        }),
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVertical, minFirstSize, minSecondSize]);

  const axis = isVertical ? "flex-col" : "flex-row";

  // 畳んでいる側があるときは、もう片方を全面に出す
  if (collapsed === "first" || collapsed === "second") {
    const collapsedPane = collapsed === "first" ? first : second;
    const openPane = collapsed === "first" ? second : first;
    return (
      <div className={`flex min-h-0 min-w-0 flex-1 ${axis}`}>
        {collapsed === "first" && <div className="flex shrink-0 flex-col">{collapsedPane}</div>}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{openPane}</div>
        {collapsed === "second" && <div className="flex shrink-0 flex-col">{collapsedPane}</div>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex min-h-0 min-w-0 flex-1 ${axis}`}>
      <div
        style={isVertical ? { height: firstSize } : { width: firstSize }}
        className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden"
      >
        {first}
      </div>

      <div
        role="separator"
        aria-orientation={isVertical ? "horizontal" : "vertical"}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        className={`group relative z-10 shrink-0 ${
          isVertical ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize"
        } ${dragging ? "bg-emerald-500" : "bg-slate-800 hover:bg-emerald-600"}`}
      >
        {/* 掴みやすいように当たり判定を広げる */}
        <div
          className={`absolute ${
            isVertical ? "inset-x-0 -top-2 h-5" : "inset-y-0 -left-2 w-5"
          }`}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{second}</div>
    </div>
  );
}
