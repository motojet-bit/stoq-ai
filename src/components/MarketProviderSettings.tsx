import { useState } from "react";
import type { AppSettings, MarketProviderId } from "@/types";
import {
  marketHealthCheck,
  saveSettings,
  setMarketKey,
} from "@/lib/config/settingsStore";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  settings: AppSettings | null;
}

interface ProviderMeta {
  id: MarketProviderId;
  /** 注記。利用上の前提をここで必ず伝える */
  /** 注記の辞書キー。**定数に文面を焼かない**（言語を変えても古い訳が残るため） */
  noteKey: string;
  recommended?: boolean;
  keyPlaceholderKey?: string;
  /** キーの取得先 */
  signupUrl?: string;
}

const META: ProviderMeta[] = [
  {
    id: "yahoo",
    noteKey: "market.yahoo.note",
  },
  {
    id: "fmp",
    noteKey: "market.fmp.note",
    recommended: true,
    keyPlaceholderKey: "market.fmp.keyLabel",
    signupUrl: "https://site.financialmodelingprep.com/developer/docs",
  },
  {
    id: "alphavantage",
    noteKey: "market.alpha.note",
    keyPlaceholderKey: "market.alpha.keyLabel",
    signupUrl: "https://www.alphavantage.co/support/#api-key",
  },
];

/**
 * 市場データの取得元の選択と、取得元ごとの APIキー。
 *
 * **取得元ごとに利用規約と安定性が違う**ため、注記を必ず併記する。
 * キーは Rust 側に保存され、画面にはマスク済み文字列しか戻らない。
 */
export default function MarketProviderSettings({ settings }: Props) {
  const t = useT();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MarketProviderId | null>(null);

  if (!settings) {
    return <p className="t-body text-slate-400">{t("settings.loading")}</p>;
  }

  const statusOf = (id: MarketProviderId) =>
    settings.marketProviders.find((p) => p.id === id);

  const select = async (id: MarketProviderId) => {
    try {
      await saveSettings({ marketProvider: id });
    } catch (e) {
      toastError(t("market.switchFailed"), e);
    }
  };

  const saveKey = async (id: MarketProviderId) => {
    const value = (drafts[id] ?? "").trim();
    if (value === "") return;
    try {
      await setMarketKey(id, value);
      setDrafts((prev) => ({ ...prev, [id]: "" }));
      toastSuccess(t("market.keySaved"));
    } catch (e) {
      toastError(t("market.keySaveFailed"), e);
    }
  };

  const check = async (id: MarketProviderId) => {
    setChecking(id);
    try {
      toastSuccess(await marketHealthCheck(id));
    } catch (e) {
      toastError(t("market.checkFailed"), e);
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="t-label leading-relaxed text-slate-500">
        {t("market.intro")}
        <br />
        {t("market.quarterlyNote")}
      </p>

      {META.map((meta) => {
        const status = statusOf(meta.id);
        const active = settings.marketProvider === meta.id;
        const keyStatus = settings.keys.find((k) => k.provider === `market:${meta.id}`);

        return (
          <div
            key={meta.id}
            className={`rounded-lg border p-3 transition-colors ${
              active
                ? "border-emerald-600 bg-emerald-950/20"
                : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="market-provider"
                checked={active}
                onChange={() => void select(meta.id)}
                className="mt-1 shrink-0 accent-emerald-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="t-body font-medium text-slate-100">
                    {status?.label ?? meta.id}
                  </span>
                  {meta.recommended && (
                    <span className="shrink-0 rounded bg-emerald-600 px-1.5 t-label font-medium text-white">
                      {t("market.recommended")}
                    </span>
                  )}
                  {status?.requiresKey && (
                    <span
                      className={`shrink-0 rounded px-1.5 t-label ${
                        keyStatus?.configured
                          ? "bg-slate-700 text-emerald-300"
                          : "bg-amber-950/60 text-amber-300"
                      }`}
                    >
                      {keyStatus?.configured
                        ? t("market.keyConfigured", { masked: keyStatus.masked ?? "" })
                        : t("market.keyMissing")}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block t-label leading-relaxed text-slate-500">
                  {t(meta.noteKey)}
                </span>
              </span>
            </label>

            {status?.requiresKey && (
              <div className="mt-2.5 space-y-2 border-t border-slate-800 pt-2.5">
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block t-label text-slate-500">
                      {t("settings.market.apiKeyLabel", { provider: status.label })}
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={drafts[meta.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [meta.id]: e.target.value }))
                      }
                      placeholder={
                        keyStatus?.configured
                          ? t("settings.key.changeOnly")
                          : meta.keyPlaceholderKey && t(meta.keyPlaceholderKey)
                      }
                      className="selectable min-h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveKey(meta.id)}
                    disabled={(drafts[meta.id] ?? "").trim() === ""}
                    className="min-h-8 shrink-0 rounded-md bg-emerald-600 px-3 t-label font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                  >
                    {t("settings.save")}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void check(meta.id)}
                    disabled={!status.ready || checking !== null}
                    title={status.reason ?? t("market.testHint")}
                    className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {checking === meta.id ? t("market.testing") : t("market.test")}
                  </button>
                  {keyStatus?.configured && (
                    <button
                      type="button"
                      onClick={() => setDeleting(meta.id)}
                      className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-400 transition-colors hover:border-red-800 hover:text-red-300"
                    >
                      {t("market.deleteKey")}
                    </button>
                  )}
                  {meta.signupUrl && (
                    <span className="selectable t-label text-slate-600">
                      キーの取得: {meta.signupUrl}
                    </span>
                  )}
                </div>

                {!status.ready && (
                  <p className="rounded border border-amber-900/60 bg-amber-950/30 px-2.5 py-1.5 t-label text-amber-300">
                    {status.reason}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={deleting !== null}
        title={t("settings.key.deleteTitle")}
        message={t("settings.key.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void setMarketKey(target, "").catch((e) => toastError(t("market.deleteFailed"), e));
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
