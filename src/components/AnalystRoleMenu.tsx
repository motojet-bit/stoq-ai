import { useRef, useState } from "react";
import {
  setActiveRole,
  useActiveRoleId,
  useAnalystRoles,
} from "@/lib/prompts/analystRoleStore";
import { IconChevronDown, IconPersona } from "@/components/Icons";
import PortalMenu from "@/components/PortalMenu";

/**
 * 20項目分析の「役割」を切り替える。
 *
 * **表示するのは役割名と一行説明・重点項目だけ。**
 * 実際の分析指示は Rust 側の秘匿プロンプトにあり、フロントには渡ってこない。
 */
export default function AnalystRoleMenu() {
  const roles = useAnalystRoles();
  const activeId = useActiveRoleId();
  const [open, setOpen] = useState(false);
  // 開閉と位置合わせは PortalMenu に任せる（親パネルの overflow に切られないため）
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = roles.find((r) => r.id === activeId) ?? roles[0] ?? null;

  if (roles.length === 0) return null;

  return (
    <div className="ui-fixed shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active?.summary ?? "分析の役割を選ぶ"}
        className="flex min-h-6 max-w-56 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
      >
        <IconPersona className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="min-w-0 truncate">{active?.label ?? "役割"}</span>
        <IconChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
      </button>

      <PortalMenu
        open={open}
        anchorRef={buttonRef}
        onClose={() => setOpen(false)}
        widthClass="w-96"
      >
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            分析の役割（企業タイプに合わせて選ぶ）
          </div>

          {roles.map((role) => {
            const isActive = role.id === activeId;
            return (
              <button
                key={role.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setActiveRole(role.id);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left transition-colors hover:bg-slate-700 ${
                  isActive ? "text-emerald-300" : "text-slate-300"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-3 shrink-0">{isActive ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{role.label}</span>
                </span>
                <span className="ml-4.5 block text-[11px] leading-relaxed text-slate-500">
                  {role.summary}
                </span>
                <span className="ml-4.5 mt-1 flex flex-wrap gap-1">
                  {role.focus.map((item) => (
                    <span
                      key={item}
                      className="rounded bg-slate-900/80 px-1.5 text-[10px] text-slate-400"
                    >
                      {item}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
      </PortalMenu>
    </div>
  );
}
