import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clampSecondSize } from "@/lib/ui/splitMath";

export type SplitDirection = "vertical" | "horizontal";

interface Props {
  /** vertical = 上下に並べる / horizontal = 左右に並べる */
  direction: SplitDirection;
  first: ReactNode;
  second: ReactNode;
  /** 2 番目のパネルの初期サイズ（px） */
  initialSecondSize?: number;
  minFirstSize?: number;
  minSecondSize?: number;
  /** どちらかを畳んでいるときは境界を出さない */
  collapsed?: "first" | "second" | null;
}

/**
 * ドラッグでサイズを変えられる 2 分割ビュー。
 *
 * 縦並び（上下）と横並び（左右）の両方に対応し、実行中に切り替えられる。
 */
export default function ResizableSplit({
  direction,
  first,
  second,
  initialSecondSize = 300,
  minFirstSize = 120,
  minSecondSize = 120,
  collapsed = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [secondSize, setSecondSize] = useState(initialSecondSize);
  const [dragging, setDragging] = useState(false);

  const isVertical = direction === "vertical";

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setSecondSize(
        clampSecondSize({
          desired: isVertical ? rect.bottom - e.clientY : rect.right - e.clientX,
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

    return () => {
      document.body.classList.remove("is-resizing-v", "is-resizing-h");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stop);
    };
  }, [dragging, onPointerMove, isVertical]);

  // 畳んでいる側があるときは、もう片方を全面に出す
  if (collapsed === "first") {
    return (
      <div className={`flex min-h-0 min-w-0 flex-1 ${isVertical ? "flex-col" : "flex-row"}`}>
        <div className="shrink-0">{first}</div>
        <div className="min-h-0 min-w-0 flex-1">{second}</div>
      </div>
    );
  }
  if (collapsed === "second") {
    return (
      <div className={`flex min-h-0 min-w-0 flex-1 ${isVertical ? "flex-col" : "flex-row"}`}>
        <div className="min-h-0 min-w-0 flex-1">{first}</div>
        <div className="shrink-0">{second}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 flex-1 ${isVertical ? "flex-col" : "flex-row"}`}
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{first}</div>

      <div
        role="separator"
        aria-orientation={isVertical ? "horizontal" : "vertical"}
        onPointerDown={(e) => {
          // ドラッグ中にポインタを取りこぼさないよう捕捉する
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        className={`group relative z-10 shrink-0 bg-slate-800 ${
          isVertical ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize"
        } ${dragging ? "bg-emerald-500" : "hover:bg-emerald-600"}`}
      >
        {/* 掴みやすいように当たり判定を広げる */}
        <div
          className={`absolute ${
            isVertical ? "inset-x-0 -top-1.5 h-4" : "inset-y-0 -left-1.5 w-4"
          }`}
        />
      </div>

      <div
        style={isVertical ? { height: secondSize } : { width: secondSize }}
        className="min-h-0 min-w-0 shrink-0 overflow-hidden"
      >
        {second}
      </div>
    </div>
  );
}
