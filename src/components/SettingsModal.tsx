import { useEffect, useState } from "react";
import type { AppSettings, CustomProvider, ProviderId } from "@/types";
import { BUILTIN_PROVIDERS, providerReadiness } from "@/lib/config/providers";
import { modelSuggestions } from "@/lib/config/modelCatalog";
import {
  addCustomProvider,
  removeCustomProvider,
  saveSettings,
  setApiKey,
  updateCustomProvider,
} from "@/lib/config/settingsStore";
import { IconClose, IconKey, IconPlus } from "@/components/Icons";
import ModelCombo from "@/components/ModelCombo";
import ConfirmDialog from "@/components/ConfirmDialog";
import ShortcutSettings from "@/components/ShortcutSettings";
import MarketProviderSettings from "@/components/MarketProviderSettings";
import ThresholdSettings from "@/components/ThresholdSettings";
import DisplaySettings from "@/components/DisplaySettings";
import LicenseSettings from "@/components/LicenseSettings";
import CloudSyncSettings from "@/components/CloudSyncSettings";
import ModalShell from "@/components/ModalShell";
import { useT } from "@/lib/i18n/i18n";
import { errorMessage } from "@/lib/errors/errorMessage";

export type SettingsTab =
  | "providers"
  | "market"
  | "thresholds"
  | "display"
  | "shortcuts"
  | "cloud"
  | "license";

interface Props {
  open: boolean;
  settings: AppSettings | null;
  /** 開いたときに選ぶタブ。省略すると「APIキー・モデル」 */
  initialTab?: SettingsTab;
  onClose: () => void;
}

/** カスタム枠 1 件分の未保存入力値 */
interface CustomDraft {
  label: string;
  baseUrl: string;
  model: string;
}

/**
 * APIキー・モデル・SEC User-Agent の設定モーダル。
 *
 * 入力された APIキーは Rust 側へ渡してディスクに保存し、
 * 画面にはマスク済み文字列だけが戻ってくる。
 */
export default function SettingsModal({
  open,
  settings,
  initialTab = "providers",
  onClose,
}: Props) {
  // 未保存の入力値。プロバイダ ID をキーにする。
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [customDrafts, setCustomDrafts] = useState<Record<string, CustomDraft>>({});
  const [secUserAgent, setSecUserAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // 誤操作防止。削除対象のプロバイダ ID を持つ
  const [deletingKeyOf, setDeletingKeyOf] = useState<ProviderId | null>(null);
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  // モーダルを開いた時点の設定値を入力欄の初期値にする
  useEffect(() => {
    if (!open || !settings) return;
    setKeyDrafts({});
    setModelDrafts({ ...settings.models });
    setCustomDrafts(toDrafts(settings.customProviders));
    setSecUserAgent(settings.secUserAgent);
    setError(null);
    setSavedAt(null);
    setDeletingKeyOf(null);
    setTab(initialTab);
    // open の切り替わり時のみ初期化する（入力中に settings が更新されても上書きしない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 枠の追加・削除で構成が変わったら、増減分だけ下書きに反映する
  useEffect(() => {
    if (!open || !settings) return;
    setCustomDrafts((prev) => {
      const next: Record<string, CustomDraft> = {};
      for (const c of settings.customProviders) {
        next[c.id] = prev[c.id] ?? { label: c.label, baseUrl: c.baseUrl, model: c.model };
      }
      return next;
    });
  }, [open, settings]);

  const patchCustomDraft = (id: string, patch: Partial<CustomDraft>) => {
    setCustomDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      // 入力されたキーだけを個別に保存する
      for (const [provider, value] of Object.entries(keyDrafts)) {
        if (value.trim().length > 0) {
          await setApiKey(provider, value);
        }
      }
      // カスタム枠のラベル / Base URL / モデル名
      for (const [id, draft] of Object.entries(customDrafts)) {
        await updateCustomProvider(id, draft);
      }
      await saveSettings({ models: modelDrafts, secUserAgent });
      setKeyDrafts({});
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const keyStatus = (id: ProviderId) => settings?.keys.find((k) => k.provider === id);

  /** APIキー入力欄と、設定済みバッジ */
  const renderKeyRow = (id: ProviderId, placeholder: string, source?: string) => {
    const status = keyStatus(id);
    return (
      <label className="block">
        {/*
          「未設定」「sk-…3f9a」が縦に折り返されないようにする。
          flex の子は既定で縮むため、min-w-0 と shrink-0 を明示的に分ける。
        */}
        <span className="mb-1 flex items-center justify-between gap-2 t-label text-slate-500">
          <span className="min-w-0 truncate">
            {source ? t("settings.key.labelWithSource", { source }) : t("settings.key.label")}
          </span>
          {status?.configured ? (
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-emerald-400">
              <span className="font-mono">{status.masked}</span>
              <button
                type="button"
                onClick={() => setDeletingKeyOf(id)}
                className="shrink-0 whitespace-nowrap rounded border border-slate-700 px-1.5 text-slate-400 hover:border-red-800 hover:text-red-300"
              >
                {t("settings.key.delete")}
              </button>
            </span>
          ) : (
            <span className="shrink-0 whitespace-nowrap text-slate-600">
              {t("settings.key.unset")}
            </span>
          )}
        </span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={keyDrafts[id] ?? ""}
          onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
          placeholder={status?.configured ? t("settings.key.changeOnly") : placeholder}
          className="selectable min-h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
      </label>
    );
  };

  return (
    <ModalShell
      open={open}
      title={t("settings.title")}
      icon={<IconKey className="h-4 w-4 text-emerald-400" />}
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="t-label text-slate-600">
            {tab === "license"
              ? t("settings.footer.license")
              : tab === "cloud"
                ? t("settings.footer.cloud")
              : tab === "shortcuts" || tab === "display"
                ? t("settings.footer.autosaved")
              : tab === "thresholds"
                ? t("settings.footer.thresholds")
                : tab === "market"
                ? t("settings.footer.market")
                : savedAt
                  ? t("settings.footer.savedAt", { time: savedAt })
                  : t("settings.footer.keys")}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              {t("settings.close")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !settings || tab !== "providers"}
              className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              {busy ? t("settings.saving") : t("settings.save")}
            </button>
          </div>
        </footer>
      }
    >
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900 px-4">
        {(
          [
            ["providers", t("settings.tab.providers")],
            ["market", t("settings.tab.market")],
            ["thresholds", t("settings.tab.thresholds")],
            ["display", t("settings.tab.general")],
            ["shortcuts", t("settings.tab.shortcuts")],
            ["cloud", t("settings.tab.cloud")],
            ["license", t("settings.tab.license")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`-mb-px border-b-2 px-3 py-2 t-body transition-colors ${
              tab === id
                ? "border-emerald-500 font-medium text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
          {tab === "license" ? (
            <LicenseSettings />
          ) : tab === "cloud" ? (
            <CloudSyncSettings />
          ) : tab === "shortcuts" ? (
            <ShortcutSettings />
          ) : tab === "display" ? (
            <DisplaySettings />
          ) : tab === "thresholds" ? (
            <ThresholdSettings settings={settings} />
          ) : tab === "market" ? (
            <MarketProviderSettings settings={settings} />
          ) : !settings ? (
            <p className="t-body text-slate-400">{t("common.loading")}</p>
          ) : (
            <>
              {/* ------------------------------------------------ プロバイダ選択 */}
              <section className="mb-5">
                <h3 className="mb-2 t-label font-medium uppercase tracking-wider text-slate-500">
                  {t("settings.section.provider")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...BUILTIN_PROVIDERS.map((p) => ({ id: p.id as ProviderId, label: p.label })),
                    ...settings.customProviders.map((c) => ({
                      id: c.id,
                      label: c.label || t("settings.provider.unnamed"),
                    })),
                  ].map(({ id, label }) => {
                    const active = settings.provider === id;
                    const { ready, reason } = providerReadiness(settings, id);
                    return (
                      <button
                        key={id}
                        type="button"
                        title={reason ?? t("settings.provider.ready")}
                        onClick={() => void run(() => saveSettings({ provider: id }))}
                        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 t-body transition-colors ${
                          active
                            ? "border-emerald-500 bg-emerald-950/60 text-emerald-200"
                            : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            ready ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                        />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ------------------------------------------------ 組み込みプロバイダ */}
              <section className="mb-5 space-y-3">
                <h3 className="t-label font-medium uppercase tracking-wider text-slate-500">
                  {t("settings.section.keysModels")}
                </h3>

                {BUILTIN_PROVIDERS.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                  >
                    <div className="mb-2 t-body font-medium text-slate-200">{p.label}</div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {renderKeyRow(p.id, p.keyPlaceholder, p.keySource)}

                      <div>
                        <span className="mb-1 block t-label text-slate-500">
                          {t("settings.model.label")}
                        </span>
                        <ModelCombo
                          ariaLabel={t("settings.model.aria", { label: p.label })}
                          value={modelDrafts[p.id] ?? ""}
                          onChange={(v) =>
                            setModelDrafts((prev) => ({ ...prev, [p.id]: v }))
                          }
                          suggestions={modelSuggestions(p.id)}
                          placeholder={p.modelHint}
                        />
                      </div>
                    </div>

                    {p.id === "anthropic" && (
                      <p className="mt-2 t-label leading-relaxed text-slate-500">
                        {t("settings.anthropicNote")}
                      </p>
                    )}
                  </div>
                ))}
              </section>

              {/* ------------------------------------------------ OpenAI互換（可変長） */}
              <section className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="t-label font-medium uppercase tracking-wider text-slate-500">
                    {t("settings.section.compatible")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void run(() => addCustomProvider())}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    {t("settings.provider.add")}
                  </button>
                </div>

                {settings.customProviders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center t-label text-slate-600">
                    {t("settings.provider.empty")}
                    <br />
                    {t("settings.provider.emptyHint")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {settings.customProviders.map((c) => {
                      const draft = customDrafts[c.id] ?? {
                        label: c.label,
                        baseUrl: c.baseUrl,
                        model: c.model,
                      };
                      return (
                        <div
                          key={c.id}
                          className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <input
                              type="text"
                              autoComplete="off"
                              spellCheck={false}
                              value={draft.label}
                              onChange={(e) => patchCustomDraft(c.id, { label: e.target.value })}
                              placeholder={t("settings.provider.labelPlaceholder")}
                              aria-label={t("settings.provider.label")}
                              className="selectable h-7 flex-1 rounded-md border border-transparent bg-transparent px-1.5 t-body font-medium text-slate-200 placeholder:text-slate-600 hover:border-slate-700 focus:border-emerald-500 focus:bg-slate-950 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void run(() => removeCustomProvider(c.id))}
                              aria-label={t("settings.provider.remove", { label: c.label })}
                              title={t("settings.provider.removeHint")}
                              className="rounded p-1 text-slate-500 hover:bg-red-950/60 hover:text-red-300"
                            >
                              <IconClose className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {renderKeyRow(c.id, "sk-…")}

                            <div>
                              <span className="mb-1 block t-label text-slate-500">
                                {t("settings.model.label")}
                              </span>
                              <ModelCombo
                                ariaLabel={t("settings.model.aria", { label: draft.label })}
                                value={draft.model}
                                onChange={(v) => patchCustomDraft(c.id, { model: v })}
                                // Base URL から提供元を推測して候補を切り替える
                                suggestions={modelSuggestions(c.id, draft.baseUrl)}
                                placeholder={t("settings.model.placeholder")}
                              />
                            </div>
                          </div>

                          <label className="mt-2 block">
                            <span className="mb-1 block t-label text-slate-500">
                              {t("settings.baseUrl.label")}
                            </span>
                            <input
                              type="text"
                              autoComplete="off"
                              spellCheck={false}
                              value={draft.baseUrl}
                              onChange={(e) => patchCustomDraft(c.id, { baseUrl: e.target.value })}
                              placeholder="https://api.deepseek.com/v1"
                              className="selectable min-h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ------------------------------------------------ SEC */}
              <section className="mb-2">
                <h3 className="mb-2 t-label font-medium uppercase tracking-wider text-slate-500">
                  SEC EDGAR
                </h3>
                <label className="block">
                  <span className="mb-1 block t-label text-slate-500">
                    {t("settings.sec.userAgent")}
                  </span>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={secUserAgent}
                    onChange={(e) => setSecUserAgent(e.target.value)}
                    placeholder="StockAnalyzer you@example.com"
                    className="selectable min-h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                </label>
              </section>

              {error && (
                <p className="selectable mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 t-label leading-relaxed text-red-300">
                  {error}
                </p>
              )}
            </>
          )}
      </div>

      {/* APIキーの削除は取り消せないので確認を挟む */}
      <ConfirmDialog
          open={deletingKeyOf !== null}
          title={t("settings.key.deleteTitle")}
          message={t("settings.key.deleteMessage")}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          destructive
          onConfirm={() => {
            const target = deletingKeyOf;
            setDeletingKeyOf(null);
            if (target) void run(() => setApiKey(target, ""));
          }}
          onCancel={() => setDeletingKeyOf(null)}
        />
    </ModalShell>
  );
}

function toDrafts(list: CustomProvider[]): Record<string, CustomDraft> {
  return Object.fromEntries(
    list.map((c) => [c.id, { label: c.label, baseUrl: c.baseUrl, model: c.model }]),
  );
}
