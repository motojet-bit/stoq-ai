import type { ReactNode } from "react";
import { toggleSection, useCollapsed } from "@/lib/ui/collapsedSections";
import { IconChevronDown, IconChevronUp } from "@/components/Icons";

interface Props {
  /** 保存キー。**変えると畳んだ状態が引き継がれない** */
  id: string;
  title: string;
  /** 見出しの色（既定は薄いグレー） */
  toneClass?: string;
  /** 見出しの右に出す補足（件数など） */
  meta?: ReactNode;
  children: ReactNode;
}

/**
 * 見出しをクリックして開閉できるブロック。
 *
 * **畳んだ状態は端末に残す。** 毎回同じところを畳み直させるのは手間で、
 * 「読みたいところだけ開いておく」使い方ができない。
 *
 * **中身は畳んだときに描画ごと外す。** `hidden` で隠すだけだと、
 * 長い本文が Ctrl+A の選択範囲に入り、コピーすると見えていない部分まで付いてくる。
 */
export default function CollapsibleSection({
  id,
  title,
  toneClass = "text-slate-500",
  meta,
  children,
}: Props) {
  const collapsed = useCollapsed(id);

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => toggleSection(id)}
        aria-expanded={!collapsed}
        className="mb-2 flex w-full items-baseline gap-2 text-left"
      >
        <span className={`t-heading font-medium uppercase tracking-wider ${toneClass}`}>
          {title}
        </span>
        {meta}
        <span className="ml-auto shrink-0 self-center text-slate-600">
          {collapsed ? (
            <IconChevronDown className="h-3.5 w-3.5" />
          ) : (
            <IconChevronUp className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {!collapsed && children}
    </div>
  );
}
