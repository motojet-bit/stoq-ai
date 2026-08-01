import type { ReactNode } from "react";
import { IconMinimize, IconRestore } from "@/components/Icons";

interface Props {
  icon: ReactNode;
  title: string;
  /** タイトル横に出す補足 */
  subtitle?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** 右端に置く操作ボタン群 */
  actions?: ReactNode;
}

/**
 * 各ペイン共通のヘッダー。
 *
 * 右端の「_」で最小化し、畳んだ状態ではこのヘッダーだけが残る（タブのように使える）。
 */
export default function PanelHeader({
  icon,
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  actions,
}: Props) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-3">
      <span className="shrink-0 text-slate-600">{icon}</span>
      <span className="shrink-0 text-[12.5px] font-medium text-slate-300">{title}</span>

      {subtitle && (
        <span className="min-w-0 truncate text-[11.5px] text-slate-500">{subtitle}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!collapsed && actions}

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "元に戻す" : "最小化"}
          aria-label={collapsed ? "元に戻す" : "最小化"}
          aria-expanded={!collapsed}
          className="rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100"
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
