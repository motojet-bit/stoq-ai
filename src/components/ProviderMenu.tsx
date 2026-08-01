import { useEffect, useRef, useState } from "react";
import type { AppSettings, ProviderId } from "@/types";
import { BUILTIN_PROVIDERS, providerLabel, providerReadiness } from "@/lib/config/providers";
import { saveSettings } from "@/lib/config/settingsStore";
import { toastError } from "@/lib/ui/toastStore";
import { IconChevronDown, IconSettings } from "@/components/Icons";

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!settings) {
    return <span className="t-label text-slate-600">設定を読み込み中…</span>;
  }

  const active = providerReadiness(settings, settings.provider);
  const entries: { id: ProviderId; label: string }[] = [
    ...BUILTIN_PROVIDERS.map((p) => ({ id: p.id as ProviderId, label: p.label })),
    ...settings.customProviders.map((c) => ({
      id: c.id,
      label: c.label || "（名称未設定）",
    })),
  ];

  const select = async (id: ProviderId) => {
    setOpen(false);
    if (id === settings.provider) return;
    try {
      await saveSettings({ provider: id });
    } catch (e) {
      toastError("プロバイダを切り替えられませんでした", e);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active.reason ?? "送信可能"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex min-h-8 items-center gap-2 rounded-md border px-2.5 t-label transition-colors ${
          active.ready
            ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600"
            : "border-amber-800 bg-amber-950/40 text-amber-300 hover:border-amber-700"
        }`}
      >
        <IconSettings className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="shrink-0">AI設定</span>
        <span className="text-slate-600">|</span>
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            active.ready ? "bg-emerald-400" : "bg-amber-500"
          }`}
        />
        <span className="max-w-40 truncate font-medium">
          稼働中: {providerLabel(settings, settings.provider)}
        </span>
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-100 mt-1 min-w-72 rounded-md border border-slate-700 bg-slate-800 py-1 shadow-xl shadow-black/40"
        >
          <div className="px-3 py-1.5 t-label font-medium uppercase tracking-wider text-slate-500">
            プロバイダを選択
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
                title={state.reason ?? "送信可能"}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left t-body hover:bg-slate-700 ${
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
                  <span className="shrink-0 t-label text-slate-500">
                    {state.reason?.replace(/。$/, "")}
                  </span>
                )}
                {isActive && <span className="shrink-0 t-label">✓</span>}
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left t-body text-slate-300 hover:bg-slate-700"
          >
            <IconSettings className="h-3.5 w-3.5 text-slate-500" />
            APIキー・モデルの設定を開く…
          </button>
        </div>
      )}
    </div>
  );
}
