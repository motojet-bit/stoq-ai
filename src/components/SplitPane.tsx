import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  top: ReactNode;
  bottom: ReactNode;
  /** 下部パネルの初期高さ（px） */
  initialBottomHeight?: number;
  minTopHeight?: number;
  minBottomHeight?: number;
}

/**
 * 上下 2 分割のスプリットビュー。境界をドラッグして高さを変えられる。
 */
export default function SplitPane({
  top,
  bottom,
  initialBottomHeight = 260,
  minTopHeight = 120,
  minBottomHeight = 100,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bottomHeight, setBottomHeight] = useState(initialBottomHeight);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = rect.bottom - e.clientY;
      const max = rect.height - minTopHeight;
      setBottomHeight(Math.min(Math.max(next, minBottomHeight), Math.max(max, minBottomHeight)));
    },
    [minTopHeight, minBottomHeight],
  );

  useEffect(() => {
    if (!dragging) return;

    const stop = () => setDragging(false);
    document.body.classList.add("is-resizing");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stop);

    return () => {
      document.body.classList.remove("is-resizing");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stop);
    };
  }, [dragging, onPointerMove]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{top}</div>

      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={() => setDragging(true)}
        className={`group relative h-px shrink-0 cursor-row-resize bg-slate-800 ${
          dragging ? "bg-emerald-500" : "hover:bg-emerald-600"
        }`}
      >
        {/* 掴みやすいように当たり判定を広げる */}
        <div className="absolute inset-x-0 -top-1 h-3" />
      </div>

      <div
        style={{ height: bottomHeight }}
        className="min-h-0 shrink-0 overflow-hidden bg-slate-950"
      >
        {bottom}
      </div>
    </div>
  );
}
