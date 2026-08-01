import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { SlotId } from "@/lib/ui/layoutStore";
import {
  cancelPanelDrag,
  endPanelDrag,
  startPanelDrag,
  updatePanelDrag,
  usePanelDrag,
} from "@/lib/ui/panelDrag";
import { IconGrip, IconMinimize } from "@/components/Icons";

interface Props {
  icon: ReactNode;
  title: string;
  /** タイトル横に出す補足 */
  subtitle?: ReactNode;
  onToggleCollapse: () => void;
  /** 最小化できない場合の理由（最後の 1 枚は畳ませない） */
  collapseDisabledReason?: string | null;
  /** 右端に置く操作ボタン群 */
  actions?: ReactNode;
  /** このパネルが今どの枠にあるか。指定すると入れ替えドラッグが有効になる */
  slot?: SlotId;
}

/**
 * 各ペイン共通のヘッダー。
 *
 * - 右端の「_」で最小化する（畳んだパネルは最上部バーの復元ボタンに退避する）
 * - 左端のグリップを **Pointer Events で**ドラッグし、
 *   別のパネルの上で離すと配置が入れ替わる（`panelDrag.ts` を参照）
 */
export default function PanelHeader({
  icon,
  title,
  subtitle,
  onToggleCollapse,
  collapseDisabledReason = null,
  actions,
  slot,
}: Props) {
  const gripRef = useRef<HTMLButtonElement>(null);
  const drag = usePanelDrag();

  const dragging = drag !== null && drag.from === slot;
  const dropActive = drag !== null && drag.over === slot && drag.from !== slot;

  // ドラッグ中は Esc で中断できるようにする
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelPanelDrag();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dragging]);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!slot || e.button !== 0) return;
    // ポインタを捕捉しておくと、パネルの外へ出ても move / up を取りこぼさない
    e.currentTarget.setPointerCapture(e.pointerId);
    startPanelDrag(slot, e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    updatePanelDrag(e.clientX, e.clientY);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    // 離した瞬間の位置で判定する（move が来ないまま up になる場合がある）
    updatePanelDrag(e.clientX, e.clientY);
    endPanelDrag();
  };

  return (
    <header
      className={`flex min-h-9 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-2 py-1 ${
        dropActive ? "bg-emerald-950/60 ring-1 ring-inset ring-emerald-500" : ""
      } ${dragging ? "opacity-60" : ""}`}
    >
      {slot && (
        // グリップだけをドラッグ対象にする。ヘッダー全体を対象にすると
        // 中のボタンやスライダーが操作しづらくなるため。
        <button
          ref={gripRef}
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancelPanelDrag}
          aria-label={`${title} パネルを移動`}
          title="ドラッグして他のパネルと位置を入れ替え"
          className={`shrink-0 touch-none rounded px-0.5 py-1 hover:bg-slate-800 hover:text-emerald-400 ${
            dragging ? "cursor-grabbing text-emerald-400" : "cursor-grab text-slate-600"
          }`}
        >
          <IconGrip className="h-4 w-4" />
        </button>
      )}
      <span className="shrink-0 text-slate-600">{icon}</span>
      <span className="t-heading shrink-0 font-medium text-slate-300">{title}</span>

      {subtitle && <span className="t-label min-w-0 truncate text-slate-500">{subtitle}</span>}

      <div className="ml-auto flex items-center gap-2">
        {actions}

        <button
          type="button"
          onClick={onToggleCollapse}
          disabled={collapseDisabledReason !== null}
          title={collapseDisabledReason ?? "最小化"}
          aria-label="最小化"
          className="shrink-0 rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <IconMinimize className="h-3 w-3" />
        </button>
      </div>
    </header>
  );
}
