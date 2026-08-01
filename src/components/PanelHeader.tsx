import { useState, type DragEvent, type ReactNode } from "react";
import { movePanel, type SlotId } from "@/lib/ui/layoutStore";
import { IconGrip, IconMinimize, IconRestore } from "@/components/Icons";

interface Props {
  icon: ReactNode;
  title: string;
  /** タイトル横に出す補足 */
  subtitle?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** 右端に置く操作ボタン群 */
  actions?: ReactNode;
  /** このパネルが今どの枠にあるか。指定すると入れ替えドラッグが有効になる */
  slot?: SlotId;
}

const DRAG_TYPE = "application/x-stoq-panel";

/**
 * 各ペイン共通のヘッダー。
 *
 * - 右端の「_」で最小化し、畳んだ状態ではこのヘッダーだけが残る
 * - ヘッダーをドラッグして別のパネルのヘッダーに落とすと、配置が入れ替わる
 */
export default function PanelHeader({
  icon,
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  actions,
  slot,
}: Props) {
  const [dropActive, setDropActive] = useState(false);

  const onDragStart = (e: DragEvent<HTMLElement>) => {
    if (!slot) return;
    e.dataTransfer.setData(DRAG_TYPE, slot);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!slot || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropActive(true);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!slot) return;
    const from = e.dataTransfer.getData(DRAG_TYPE) as SlotId;
    e.preventDefault();
    setDropActive(false);
    if (from && from !== slot) movePanel(from, slot);
  };

  return (
    <header
      draggable={Boolean(slot)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
      title={slot ? "ヘッダーをドラッグすると、他のパネルと配置を入れ替えられます" : undefined}
      className={`flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-3 ${
        slot ? "cursor-grab active:cursor-grabbing" : ""
      } ${dropActive ? "bg-emerald-950/50 ring-1 ring-inset ring-emerald-500" : ""}`}
    >
      {slot && <IconGrip className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
      <span className="shrink-0 text-slate-600">{icon}</span>
      <span className="t-heading shrink-0 font-medium text-slate-300">{title}</span>

      {subtitle && <span className="t-label min-w-0 truncate text-slate-500">{subtitle}</span>}

      <div className="ml-auto flex items-center gap-2">
        {!collapsed && actions}

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "元に戻す" : "最小化"}
          aria-label={collapsed ? "元に戻す" : "最小化"}
          aria-expanded={!collapsed}
          className="shrink-0 rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100"
        >
          {collapsed ? (
            <IconRestore className="h-3 w-3" />
          ) : (
            <IconMinimize className="h-3 w-3" />
          )}
        </button>
      </div>
    </header>
  );
}
