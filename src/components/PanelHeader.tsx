import type { ReactNode } from "react";
import { IconChevronDown, IconChevronUp } from "@/components/Icons";

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
 * 下部ドックのパネル共通ヘッダー。
 * 折りたたみボタンを備え、畳んだ状態ではこのヘッダーだけが残る（タブのように使える）。
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
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? "展開する" : "折りたたむ"}
        aria-expanded={!collapsed}
        className="flex items-center gap-2 rounded px-1 py-0.5 text-[12.5px] font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
      >
        <span className="text-slate-600">{icon}</span>
        {title}
        {collapsed ? (
          <IconChevronUp className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <IconChevronDown className="h-3.5 w-3.5 text-slate-500" />
        )}
      </button>

      {subtitle && <span className="min-w-0 truncate text-[11.5px] text-slate-500">{subtitle}</span>}

      {!collapsed && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
