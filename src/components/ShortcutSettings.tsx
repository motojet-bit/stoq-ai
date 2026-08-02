import { useEffect, useState } from "react";
import {
  bindingFromEvent,
  displayBinding,
  findConflicts,
  isMac,
  isModifierOnly,
} from "@/lib/ui/shortcutKeys";
import {
  isCustomized,
  resetShortcuts,
  setShortcut,
  SHORTCUTS,
  useBindings,
  type ShortcutAction,
} from "@/lib/ui/shortcutStore";
import { IconClose, IconHelp } from "@/components/Icons";
import Tooltip from "@/components/Tooltip";
import { tooltip } from "@/lib/ui/tooltipText";
import { useT } from "@/lib/i18n/i18n";

/**
 * ショートカットキーの一覧と変更。
 *
 * 「変更」を押すとキー入力待ちになり、次に押した組み合わせを割り当てる。
 * 修飾キー単体では確定しない（`Ctrl` だけでは割り当てにならないため）。
 */
export default function ShortcutSettings() {
  const t = useT();
  const bindings = useBindings();
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const mac = isMac();

  const conflicts = findConflicts(bindings);

  useEffect(() => {
    if (capturing === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      // 修飾キーを押している途中は確定しない
      if (isModifierOnly(e.key)) return;

      const binding = bindingFromEvent(e);
      if (binding === "") return;

      void setShortcut(capturing, binding);
      setCapturing(null);
    };

    // capture: true で他のハンドラより先に受け取る
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [capturing]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="t-label leading-relaxed text-slate-500">
          {t("shortcut.intro")}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <Tooltip content={tooltip("shortcuts")} placement="left" widthClass="w-72">
            <span className="text-slate-600">
              <IconHelp className="h-4 w-4" />
            </span>
          </Tooltip>
          <button
            type="button"
            onClick={() => void resetShortcuts()}
            className="min-h-7 whitespace-nowrap rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            {t("shortcut.resetAll")}
          </button>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        {SHORTCUTS.map((def) => {
          const binding = bindings[def.action];
          const conflicted = binding !== "" && (conflicts[binding]?.length ?? 0) > 1;
          const capturingThis = capturing === def.action;

          return (
            <div
              key={def.action}
              className="flex items-center gap-3 border-b border-slate-800/80 px-3 py-2 last:border-0 odd:bg-slate-900/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="t-body font-medium text-slate-200">{t(def.labelKey)}</span>
                  {def.handledLocally && (
                    <span className="shrink-0 rounded bg-slate-800 px-1 t-label text-slate-500">
                      {t("shortcut.inInput")}
                    </span>
                  )}
                </div>
                <p className="t-label text-slate-500">{t(def.hintKey)}</p>
              </div>

              <kbd
                className={`min-w-24 shrink-0 rounded-md border px-2 py-1 text-center font-mono t-label ${
                  capturingThis
                    ? "animate-pulse border-emerald-500 bg-emerald-950/60 text-emerald-300"
                    : conflicted
                      ? "border-amber-700 bg-amber-950/40 text-amber-300"
                      : "border-slate-700 bg-slate-950 text-slate-200"
                }`}
              >
                {capturingThis ? t("shortcut.press") : displayBinding(binding, mac)}
              </kbd>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCapturing(capturingThis ? null : def.action)}
                  className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
                >
                  {capturingThis ? t("shortcut.cancel") : t("shortcut.change")}
                </button>
                <button
                  type="button"
                  onClick={() => void setShortcut(def.action, null)}
                  disabled={!isCustomized(def.action)}
                  aria-label={t("shortcut.resetOneAria", { label: t(def.labelKey) })}
                  title={t("shortcut.resetOne")}
                  className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(conflicts).length > 0 && (
        <p className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 t-label text-amber-300">
          {t("shortcut.conflict")}
        </p>
      )}
    </div>
  );
}
