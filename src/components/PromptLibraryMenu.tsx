import { useRef, useState } from "react";
import {
  DEFAULT_SYSTEM_PROMPT,
  setActivePrompt,
  useActivePromptId,
  usePrompts,
} from "@/lib/prompts/promptLibrary";
import PromptLibraryModal from "@/components/PromptLibraryModal";
import { IconChevronDown, IconPersona, IconSettings } from "@/components/Icons";
import PortalMenu from "@/components/PortalMenu";
import Tooltip from "@/components/Tooltip";
import { tooltip } from "@/lib/ui/tooltipText";
import { useT } from "@/lib/i18n/i18n";

/**
 * 対話パネルのヘッダーに置く役割（システムプロンプト）の切り替え。
 * ストックした役割をワンタップで適用できる。
 */
export default function PromptLibraryMenu() {
  const t = useT();
  const prompts = usePrompts();
  const activeId = useActivePromptId();
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = prompts.find((p) => p.id === activeId) ?? null;

  const select = (id: string | null) => {
    setActivePrompt(id);
    setOpen(false);
  };

  return (
    <div className="ui-fixed shrink-0">
      <Tooltip content={tooltip("promptRole")} placement="bottom" widthClass="w-80">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex min-h-6 max-w-52 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 text-slate-300 hover:border-emerald-700 hover:text-emerald-300"
        >
          <IconPersona className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="min-w-0 truncate">{active ? active.title : t("role.currentDefault")}</span>
          <IconChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
        </button>
      </Tooltip>

      <PortalMenu open={open} anchorRef={buttonRef} onClose={() => setOpen(false)}>
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {t("role.pick")}
          </div>

          <PromptOption
            title={t("role.default")}
            body={DEFAULT_SYSTEM_PROMPT}
            active={activeId === null}
            onSelect={() => select(null)}
          />

          {prompts.map((prompt) => (
            <PromptOption
              key={prompt.id}
              title={prompt.title}
              body={prompt.body}
              active={prompt.id === activeId}
              onSelect={() => select(prompt.id)}
            />
          ))}

          <div className="my-1 border-t border-slate-700" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setManaging(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-slate-700"
          >
            <IconSettings className="h-3.5 w-3.5 text-slate-500" />
            {t("role.manage")}
          </button>
      </PortalMenu>

      <PromptLibraryModal open={managing} onClose={() => setManaging(false)} />
    </div>
  );
}

function PromptOption({
  title,
  body,
  active,
  onSelect,
}: {
  title: string;
  body: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      title={body}
      className={`block w-full px-3 py-1.5 text-left hover:bg-slate-700 ${
        active ? "text-emerald-300" : "text-slate-300"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className="w-3 shrink-0">{active ? "✓" : ""}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      </span>
      <span className="ml-4.5 block truncate text-[11px] text-slate-500">{body}</span>
    </button>
  );
}
