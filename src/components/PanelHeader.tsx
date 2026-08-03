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
import OverflowScroller from "@/components/OverflowScroller";
import { useT } from "@/lib/i18n/i18n";

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
  const t = useT();
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
          aria-label={t("panel.moveAria", { title })}
          title={t("panel.moveHint")}
          className={`shrink-0 touch-none rounded px-0.5 py-1 hover:bg-slate-800 hover:text-emerald-400 ${
            dragging ? "cursor-grabbing text-emerald-400" : "cursor-grab text-slate-600"
          }`}
        >
          <IconGrip className="h-4 w-4" />
        </button>
      )}
      <span className="shrink-0 text-slate-600">{icon}</span>
      <span className="t-heading shrink-0 font-medium text-slate-300">{title}</span>

      {/*
        **操作ボタンより先に、こちらを縮める。**
        押せなくなるボタンより、読めなくなる補足のほうが被害が小さい。
        入りきらなければ横スクロールし、端にフェードと ▶ を出す。
      */}
      {subtitle && (
        <OverflowScroller>
          <span className="t-label whitespace-nowrap text-slate-500">{subtitle}</span>
        </OverflowScroller>
      )}

      {/*
        **操作ボタン群は絶対に縮めない（shrink-0）。**
        窓を狭めたり文字を大きくしたりしたときに、
        「再分析」「保存」が画面外へ押し出されると操作そのものができなくなる。
      */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}

        <button
          type="button"
          onClick={onToggleCollapse}
          disabled={collapseDisabledReason !== null}
          title={collapseDisabledReason ?? t("panel.minimize")}
          aria-label={t("panel.minimize")}
          className="shrink-0 rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <IconMinimize className="h-3 w-3" />
        </button>
      </div>
    </header>
  );
}
