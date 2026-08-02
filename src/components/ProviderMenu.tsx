import { useRef, useState } from "react";
import type { AppSettings, ProviderId } from "@/types";
import { BUILTIN_PROVIDERS, providerLabel, providerReadiness } from "@/lib/config/providers";
import { saveSettings } from "@/lib/config/settingsStore";
import { toastError } from "@/lib/ui/toastStore";
import { IconChevronDown, IconSettings } from "@/components/Icons";
import PortalMenu from "@/components/PortalMenu";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  settings: AppSettings | null;
  onOpenSettings: () => void;
}

/**
 * AI プロバイダの切り替え。
 *
 * 以前はプロバイダを横並びで全部出していたが、カスタムを追加すると
 * 際限なく横に伸びるため、1 つのボタンとドロップダウンにまとめた。
 */
export default function ProviderMenu({ settings, onOpenSettings }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!settings) {
    return <span className="text-slate-600">{t("provider.loading")}</span>;
  }

  const active = providerReadiness(settings, settings.provider);
  const entries: { id: ProviderId; label: string }[] = [
    ...BUILTIN_PROVIDERS.map((p) => ({ id: p.id as ProviderId, label: p.label })),
    ...settings.customProviders.map((c) => ({
      id: c.id,
      label: c.label || t("settings.provider.unnamed"),
    })),
  ];

  const select = async (id: ProviderId) => {
    setOpen(false);
    if (id === settings.provider) return;
    try {
      await saveSettings({ provider: id });
    } catch (e) {
      toastError(t("provider.switchFailed"), e);
    }
  };

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active.reason ?? t("settings.provider.ready")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex min-h-[30px] items-center gap-2 rounded-md border px-2.5 transition-colors ${
          active.ready
            ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600"
            : "border-amber-800 bg-amber-950/40 text-amber-300 hover:border-amber-700"
        }`}
      >
        <IconSettings className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="shrink-0">{t("command.aiSettings")}</span>
        <span className="text-slate-600">|</span>
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            active.ready ? "bg-emerald-400" : "bg-amber-500"
          }`}
        />
        <span className="max-w-40 truncate font-medium">
          {t("command.activeProvider")}: {providerLabel(settings, settings.provider)}
        </span>
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>

      <PortalMenu open={open} anchorRef={buttonRef} onClose={() => setOpen(false)} widthClass="w-72">
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {t("provider.select")}
          </div>

          {entries.map(({ id, label }) => {
            const state = providerReadiness(settings, id);
            const isActive = id === settings.provider;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => void select(id)}
                title={state.reason ?? t("settings.provider.ready")}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-700 ${
                  isActive ? "text-emerald-300" : "text-slate-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    state.ready ? "bg-emerald-400" : "bg-slate-600"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {!state.ready && (
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {state.reason?.replace(/。$/, "")}
                  </span>
                )}
                {isActive && <span className="shrink-0">✓</span>}
              </button>
            );
          })}

          <div className="my-1 border-t border-slate-700" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-slate-700"
          >
            <IconSettings className="h-3.5 w-3.5 text-slate-500" />
            {t("provider.openSettings")}
          </button>
      </PortalMenu>
    </div>
  );
}
