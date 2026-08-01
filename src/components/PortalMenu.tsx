import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeMenu, toRect, type MenuPlacement } from "@/lib/ui/menuPosition";
import { closeMenu, openMenu } from "@/lib/ui/overlayStore";

interface Props {
  open: boolean;
  /** 位置の基準にする要素（ボタン） */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** メニューの幅（Tailwind クラス） */
  widthClass?: string;
  children: ReactNode;
}

/**
 * ドロップダウンを `document.body` 直下へ出す枠。
 *
 * **親パネルの `overflow: hidden` に切られないようにするのが目的。**
 * パネル内に置いたままだと、はみ出したメニューが途切れてしまう。
 * そのぶん位置は自前で計算する（`menuPosition.ts`）。
 *
 * 開いている間は `overlayStore` に登録し、**ツールチップを抑止**する。
 * 吹き出しがメニューに重なるとどちらも読めなくなるため。
 */
export default function PortalMenu({
  open,
  anchorRef,
  onClose,
  widthClass = "w-80",
  children,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MenuPlacement>({
    left: 0,
    top: 0,
    flipped: false,
    maxHeight: null,
  });

  // 開いている間だけツールチップを止める
  useEffect(() => {
    if (!open) return;
    openMenu();
    return () => closeMenu();
  }, [open]);

  // 実寸が決まってから位置を合わせる（描画前に測ると 0 になる）
  useLayoutEffect(() => {
    if (!open) return;

    const reposition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;

      setPlacement(
        placeMenu(
          toRect(anchor),
          { width: menu.width, height: menu.height },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };

    reposition();
    window.addEventListener("resize", reposition);
    // スクロールでアンカーが動いたら追従する（capture でどの階層でも拾う）
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        left: placement.left,
        top: placement.top,
        maxHeight: placement.maxHeight ?? undefined,
        // パネルやモーダルより必ず前に出す
        zIndex: 9999,
      }}
      className={`ui-fixed fixed ${widthClass} overflow-y-auto rounded-md border border-slate-700 bg-slate-800 py-1 shadow-2xl shadow-black/60 ring-1 ring-white/10`}
    >
      {children}
    </div>,
    document.body,
  );
}
