import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  /** 破壊的な操作なら true（赤くなる） */
  destructive?: boolean;
  onSelect: () => void;
}

interface Props {
  /** 画面座標。null なら表示しない */
  position: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * 右クリックで開くコンテキストメニュー。
 *
 * 画面端で切れないように、描画後の実寸から位置を補正する。
 */
export default function ContextMenu({ position, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!position || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setOffset({
      x: Math.min(0, window.innerWidth - (position.x + rect.width) - 4),
      y: Math.min(0, window.innerHeight - (position.y + rect.height) - 4),
    });
  }, [position]);

  useEffect(() => {
    if (!position) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onClose);
    };
  }, [position, onClose]);

  if (!position) return null;

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: position.x + offset.x, top: position.y + offset.y }}
      className="ui-fixed fixed z-200 min-w-40 rounded-md border border-slate-700 bg-slate-800 py-1 shadow-xl shadow-black/50"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-700 ${
            item.destructive ? "text-red-300 hover:bg-red-950/60" : "text-slate-200"
          }`}
        >
          {item.icon && <span className="shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
